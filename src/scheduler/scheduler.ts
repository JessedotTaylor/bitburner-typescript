import { NS, RunningScript } from '@ns';
import { formatCurrency, validateArg, formatMilliseconds, formatRAM } from 'utils/utils';
import { getServerMoneyString, getServerSecurityLevelString } from '/utils/dashboard';
import { Dialog } from '/utils/Dialog';
import { copyScriptToServer } from '/utils/file';
import { Averager } from 'utils/Averager';
import { getNextAvailablePort } from '/utils/portAlloc';
import { CustomLogger } from '../utils/customLogger';

interface ITimestampedMessage<T extends string | number> {
  message: T;
  time: number;
};

interface IPortData {
  [key: number]: ITimestampedMessage<number>;
}

interface IKeyedObject<T> {
  [key: string]: T;
}


const WEAKEN_FILE = 'scheduler/hacks/weaken.js';
const GROW_FILE = 'scheduler/hacks/grow.js';
const HACK_FILE = 'scheduler/hacks/hack.js';

/**
 * TODO:
 * - Create Allocator / executor class, to allow for starting scripts over multiple servers (Shared with executor)
 * - Use attack scripts with loops, and try detect when to kill / maintain a script
 * - Get Act. $ + xp / sec working
 */
class Scheduler {
  logger: CustomLogger;
  // Ports
  portData: IPortData = {};
  
  // Scripts
  scriptRam: IKeyedObject<number> = {};
  scriptPids: IKeyedObject<number[]> = {};
  
  // Timer
  timer = 0;
  timeAtLastAdjust = 0;
  
  // Constants
  readonly RAM_LIMIT: number;
  
  readonly ESTIMATION_LOWER_BOUND = 0.70;
  readonly ESTIMATION_UPPER_BOUND = 0.90;

  readonly WEAKEN_PORT: number;
  readonly GROW_PORT: number;
  readonly HACK_PORT: number;
  
  /* The % of money to hack from the target server (Ideally) */
  hackTargetPerc = 0.01;
  /**
  * Multiplies how long a hack will take against a target.
  * Increasing this value will slow down the hack, decreasing will speed up
  */ 
  hackDurationMultiplier = 1;
  
  // Target details
  readonly timeS: IKeyedObject<number> = {};
  get hackTimeS(): number {
    return this.ns.getHackTime(this.target) / 1000;
  }
  get growTimeS(): number {
    return this.ns.getGrowTime(this.target) / 1000;
  }
  get weakenTimeS(): number {
    return this.ns.getWeakenTime(this.target) / 1000;
  }

  readonly maxMoneyThresh: number;
  currMoney: number;
  

  // The amount of money we are aiming to hack out of the target this loop
  hackTargetDollars: number = 0;
  // The % of growth we are aiming for this loop
  growthTarget: number = 0;
  // The amount of security added this loop
  securityAdded: number = 0;
  
  
  secondsPerIt: IKeyedObject<number> = {};
  get secondsPerHack(): number {
    return this.secondsPerIt[HACK_FILE]
  };
  set secondsPerHack(val: number) {
    this.secondsPerIt[HACK_FILE] = val;
  };
  get secondsPerGrow(): number {
    return this.secondsPerIt[GROW_FILE];
  };
  set secondsPerGrow(val: number) {
    this.secondsPerIt[GROW_FILE] = val;
  };
  get secondsPerWeaken(): number {
    return this.secondsPerIt[WEAKEN_FILE];
  };
  set secondsPerWeaken(val: number) {
    this.secondsPerIt[WEAKEN_FILE] = val;
  };
  
  loopThreads: IKeyedObject<Averager> = {
    [HACK_FILE]: new Averager(),
    [GROW_FILE]: new Averager(),
    [WEAKEN_FILE]: new Averager(),
  };
  get hackThreads(): Averager {
    return this.loopThreads[HACK_FILE];
  };
  set hackThreads(val: Averager) {
    this.loopThreads[HACK_FILE] = val;
  };
  get growThreads(): Averager {
    return this.loopThreads[GROW_FILE];
  };
  set growThreads(val: Averager) {
    this.loopThreads[GROW_FILE] = val;
  };
  get weakenThreads(): Averager {
    return this.loopThreads[WEAKEN_FILE];
  };
  set weakenThreads(val: Averager) {
    this.loopThreads[WEAKEN_FILE] = val;
  };



  totalThreads: IKeyedObject<number> = {};
  get totalHackThreads(): number {
    return this.totalThreads[HACK_FILE];
  };
  get totalGrowThreads(): number {
    return this.totalThreads[GROW_FILE];
  };
  get totalWeakenThreads(): number {
    return this.totalThreads[WEAKEN_FILE];
  };

  
  loopRam: IKeyedObject<number> = {};
  totalRam: IKeyedObject<number> = {};
  get totalHackRam(): number {
    return this.totalRam[HACK_FILE];
  };
  get totalGrowRam(): number {
    return this.totalRam[GROW_FILE];
  };
  get totalWeakenRam(): number {
    return this.totalRam[WEAKEN_FILE];
  };

  loopRamSum!: number; 
  totalRamSum!: number;
  
  // The instances created this calculation loop
  loopInstances: IKeyedObject<number> = {};
  get hackInstances(): number {
    return this.loopInstances[HACK_FILE];
  };
  get growInstances(): number {
    return this.loopInstances[GROW_FILE];
  };
  get weakenInstances(): number {
    return this.loopInstances[WEAKEN_FILE];
  };


  // The difference between the target, and the actual script results, as %
  hackDelta: number = -1;
  growDelta: number = -1;
  weakenDelta: number = -1;
  
  get hostAvailableRam(): number {
    return this.ns.getServerMaxRam(this.host) - this.ns.getServerUsedRam(this.host)
  }
  
  get hostAvailableRamPct(): number {
    return this.hostAvailableRam / this.ns.getServerMaxRam(this.host);
  }

  get utilizationLowerBound(): number {
    return this.RAM_LIMIT * this.ESTIMATION_LOWER_BOUND;
  }

  get utilizationUpperBound(): number {
    return this.RAM_LIMIT * this.ESTIMATION_UPPER_BOUND;
  }
  
  
  
  
  constructor(
    protected ns: NS,
    protected target: string,
    protected host: string,
    protected dialog: Dialog
  ) {
    this.logger = new CustomLogger(ns, 'INFO', ns.tprint);

    const selfScript = ns.getRunningScript();
    this.HACK_PORT = getNextAvailablePort(ns, selfScript!.pid);
    this.GROW_PORT = getNextAvailablePort(ns, selfScript!.pid);
    this.WEAKEN_PORT = getNextAvailablePort(ns, selfScript!.pid);

    this.logger.debug(`Hack Port: ${this.HACK_PORT} | Grow Port: ${this.GROW_PORT} | Weaken Port: ${this.WEAKEN_PORT}`);

    this.loopOverPorts((port) => {
      this.portData[port] = {message: 0, time: Date.now()};
      // Clear ports of any leftover data
      ns.clearPort(port);
    });
    
    
    loopOverScriptFiles((script) => {
      this.scriptRam[script] = ns.getScriptRam(script, "home");
      copyScriptToServer(ns, host, script);
      this.scriptPids[script] = [];
    });
    
    this.RAM_LIMIT = ns.getServerMaxRam(host) - ns.getServerUsedRam(host);
    
    this.timeS[HACK_FILE] = this.hackTimeS;
    this.timeS[GROW_FILE] = this.growTimeS;
    this.timeS[WEAKEN_FILE] = this.weakenTimeS;

    this.maxMoneyThresh = this.ns.getServerMaxMoney(target) * 0.95;
    this.currMoney = ns.getServerMoneyAvailable(target);
    
    this.getSecondsPerIts();
  }

  async main() {
    // Adjust threads + timings to fill host ram limit
    this.getSecondsPerIts();
  
    this.getHackThreads();
    this.getGrowthThreads();
    this.getWeakenThreads(); 
  
    this.calculateRamUsage();
    let loopLimiter = 0;
    while (this.totalRamSum < this.utilizationLowerBound || this.totalRamSum > this.utilizationUpperBound) {
      if (loopLimiter > 100) {
        this.logger.error(`Memory solver couldn't find solution in 100 iterations. Quitting solver!`);
        // ns.exit();
        break;
      } else {
        loopLimiter++;
      }
      
      this.logger.debug(`RAM estimation (${formatRAM(this.totalRamSum)}) not in bounds (${formatRAM(this.utilizationLowerBound)} - ${formatRAM(this.utilizationUpperBound)}). Tweaking Hack Duration Multi (Currently: ${this.hackDurationMultiplier.toPrecision(2)}x)`);
      
      this.adjustMultipliers();
      
      this.getSecondsPerIts();
    
      loopOverScriptFiles(script => this.loopThreads[script].reset())
      this.getHackThreads();
      this.getGrowthThreads();
      this.getWeakenThreads(); 
    
      this.calculateRamUsage();
    }
    
    this.logger.debug(`threads on start: hack: ${this.hackThreads.average} grow: ${this.growThreads.average} weaken: ${this.weakenThreads.average} RAM: ${formatRAM(this.totalRamSum)} ${formatPct(this.totalRamSum / this.RAM_LIMIT)}`);
    
    let lastMessage: ITimestampedMessage<string> = {
      message: '',
      time: 0
    };
    
    this.dialog.start();
    
    // let i = 0;
    while (true) {
      // Setup
      const start = Date.now();
      this.ns.clearLog();
      
      // Calculate threads required for a 5-10% hack
      this.getHackThreads();
      
      // Estimate grow threads required for 5-10% growth
      this.getGrowthThreads();
      
      // Calculate security impact, and determine weaken threads required
      this.getWeakenThreads();
      
      // Read data from port (if it exists)
      this.loopOverPorts((port) => {
        const data = this.readFromPort(port);
        if (data) {
          this.portData[port] = { message: data, time: Date.now() };
        }
      });
      
      // Calculate current hack / grow / weaken rates
      this.weakenDelta = (this.portData[this.WEAKEN_PORT].message - this.securityAdded) / this.securityAdded;
      this.growDelta = this.portData[this.GROW_PORT].message - this.growthTarget;
      this.hackDelta = (this.portData[this.HACK_PORT].message - this.hackTargetDollars) / this.hackTargetDollars;
      
      
      // Start threads (Check against available memory (Downscale?))
      
      
      // ns.tprint(`DEBUG ${timer} threads: hack: ${hackThreads} grow: ${growThreads} weaken: ${weakenThreads}`);
      
      // Start hack threads
      // Allow the first round of grow's to resolve, before starting hack threads
      // this.logger.debug(`${this.timer} Hack Launch: timer ${this.timer % Math.floor(this.secondsPerHack) == 0} | startup ${this.timer > this.growTimeS} | has threads ${this.hackThreads.average > 0}`)
      if (this.timer % Math.floor(this.secondsPerHack) == 0 && this.timer > this.growTimeS && this.hackThreads.average > 0) {
        const pid = this.ns.exec(HACK_FILE, this.host, Math.ceil(this.hackThreads.average), this.target, this.HACK_PORT);
        if (pid == 0) {
          this.logger.warn(`Hack file with ${this.hackThreads} threads failed to start (Host: ${formatRAM(this.hostAvailableRamPct)} ; script: ${this.hackThreads.average * this.scriptRam[HACK_FILE]})`);
        }
        this.scriptPids[HACK_FILE].push(pid);
        lastMessage = { message: `Executing Hack with ${this.hackThreads} threads`, time: Date.now()};
      }
      
      // Start Grow threads
      const growResult = this.startScript(this.secondsPerGrow, GROW_FILE, this.GROW_PORT, this.growThreads);
      if (growResult) {
        this.growThreads = growResult.threads;
        lastMessage = growResult.msg;
      }
      
      // Start Weaken Threads
      const weakenResult = this.startScript(this.secondsPerWeaken, WEAKEN_FILE, this.WEAKEN_PORT, this.weakenThreads);
      if (weakenResult) {
        this.weakenThreads = weakenResult.threads;
        lastMessage = weakenResult.msg;
      }
      
      this.calculateRamUsage();
      // this.logger.debug(`Est. Ram Usage: ${formatPct(this.totalRamSum / this.RAM_LIMIT)} ${(this.totalRamSum / this.RAM_LIMIT) < this.ESTIMATION_LOWER_BOUND} | Act. Available Ram: ${formatPct(this.hostAvailableRamPct)} ${this.hostAvailableRamPct > this.ESTIMATION_LOWER_BOUND} | timer: ${(this.timer - this.timeAtLastAdjust)} ${(this.timer - this.timeAtLastAdjust) > this.secondsPerGrow} `)
      this.checkIfShouldAdjustMultiplers();
      
      
      this.renderDialog();
      
      // Calculate processing time, and sleep up to a second
      this.timer++;
      
      this.dialog.addRow('Last Updated', new Date().toLocaleTimeString());
      this.dialog.addRow('Running for:', formatMilliseconds(this.timer * 1000));
      const time = Date.now() - start;
        await this.ns.sleep(1000 - time);
    }
  }
    
  private checkIfShouldAdjustMultiplers() {
    const scriptRamLessThanAllocated = (this.totalRamSum / this.RAM_LIMIT) < this.ESTIMATION_LOWER_BOUND;
    const hostHasRamAvailable = this.hostAvailableRamPct > this.ESTIMATION_LOWER_BOUND;

    const longEnoughSinceLastAdjustment = (this.timer - this.timeAtLastAdjust) > this.growTimeS;

    const scriptRamOverAllocation = (this.totalRamSum / this.RAM_LIMIT) > this.ESTIMATION_UPPER_BOUND;
    const hostOutOfRam = this.hostAvailableRamPct < .1;

    if (
      (
        (scriptRamLessThanAllocated && hostHasRamAvailable) 
        || (scriptRamOverAllocation && hostOutOfRam)
      )
      && longEnoughSinceLastAdjustment
    ) {
      // Try adjust scaling if running outside of limits
      this.adjustMultipliers();

      this.timeAtLastAdjust = this.timer;
      this.logger.info(`${this.host} - Adjusting hack multipliers on ${this.target}`);

      this.getSecondsPerIts();
      loopOverScriptFiles(script => this.loopThreads[script].reset());
    }
  }

  private adjustMultipliers() {
    const multi = this.totalRamSum < this.RAM_LIMIT ? 1 : -1;

    if (this.secondsPerGrow > 2 && this.secondsPerWeaken > 2 || this.hackDurationMultiplier > 1) {
      this.hackDurationMultiplier += this.hackDurationMultiplier * ((this.totalRamSum - (this.utilizationUpperBound / 2)) / this.totalRamSum) * 0.01 ;
    } else {
      this.logger.debug(`Can't lower secondsPerGrow or secondsPerWeaken. Tweaking Hack % (Currently: ${formatPct(this.hackTargetPerc)})`);

      this.hackTargetPerc += 0.0015 * multi;

      if (this.hackTargetPerc < 0.001) {
        this.logger.error(`Hack target % below 0.1%. Quitting`);
        this.ns.exit();
      }
    }
  }

  private renderDialog() {
    // Render calculations
    const runningScripts: IKeyedObject<RunningScript[]> = {};
    const actualScriptRam: IKeyedObject<number> = {};
    let scriptsFailedToStart: number = 0;
    loopOverScriptFiles((script) => {
      runningScripts[script] = this.scriptPids[script]
        .filter(pid => {
          if (pid == 0) {
            scriptsFailedToStart++;
            return false;
          }
          return true;
        }
        )
        .map(pid => this.ns.getRunningScript(pid))
        .filter(script => !!script) as RunningScript[];
      actualScriptRam[script] = runningScripts[script].map(script => script.ramUsage * script.threads).reduce((a, b) => a + b, 0);
      this.scriptPids[script] = runningScripts[script].map(s => s.pid);
    });
    // May need to change to get recently killed scripts?
    // const dollarPerSec = runningScripts[HACK_FILE].map(script => ns.getScriptIncome(script.filename, host)).reduce((a, b) => a + b, 0);
    // const expPerSec = runningScripts[HACK_FILE].map(script => ns.getScriptExpGain(script.filename, host)).reduce((a, b) => a + b, 0);

    // Render information to a dialog
    this.dialog.addRow('Target:', `${this.target} (Hack: ${formatPct(this.hackTargetPerc)} Duration: ${this.hackDurationMultiplier.toPrecision(2)}x)`);
    this.dialog.addRow('Host:', `${this.host} (${formatRAM(this.ns.getServerUsedRam(this.host))} / ${formatRAM(this.ns.getServerMaxRam(this.host))})`);
    this.dialog.addRow('Security: ', getServerSecurityLevelString(this.ns, this.target));
    this.dialog.addRow('$:', getServerMoneyString(this.ns, this.target));
    this.dialog.addRow('');

    this.dialog.addRow('Hack:', this.formatHack());
    this.dialog.addRow('Grow:', this.formatGrow());
    this.dialog.addRow('Weaken:', this.formatWeaken());
    this.dialog.addRow('');

    this.dialog.addRow('Hack Δ:', this.formatHackDelta(this.hackDelta));
    this.dialog.addRow('Grow Δ:', this.formatGrowDelta(this.growDelta));
    this.dialog.addRow('Weaken Δ:', this.formatWeakenDelta(this.weakenDelta));
    this.dialog.addRow('');

    this.dialog.addRow('Trigger Times:', `h: ${formatMilliseconds(this.secondsPerHack * 1000)} / g: ${formatMilliseconds(this.secondsPerGrow * 1000)} / w: ${formatMilliseconds(this.secondsPerWeaken * 1000)}`);
    this.dialog.addRow('Act. Times:', `h: ${formatMilliseconds(this.ns.getHackTime(this.target))} / g: ${formatMilliseconds(this.ns.getGrowTime(this.target))} / w: ${formatMilliseconds(this.ns.getWeakenTime(this.target))}`);
    this.dialog.addRow('Est. $ / sec:', `${formatCurrency(this.hackTargetDollars / this.secondsPerHack)}`);
    this.dialog.addRow('Est Threads:', `h: ${this.totalHackThreads.toFixed(0)} (${this.hackInstances.toFixed(0)}) / g: ${this.totalGrowThreads.toFixed(0)} (${this.growInstances.toFixed(0)}) / w: ${this.totalWeakenThreads.toFixed(0)} (${this.weakenInstances.toFixed(0)})`);
    this.dialog.addRow('Est RAM:', `h: ${formatRAM(this.totalHackRam)}/g: ${formatRAM(this.totalGrowRam)}/w: ${formatRAM(this.totalWeakenRam)} [${formatPct(this.totalRamSum / this.RAM_LIMIT, 3)}]`);
    this.dialog.addRow('');
    this.dialog.addRow('Act. Threads:', this.formatActualThreads(runningScripts));
    this.dialog.addRow('Act. RAM:', this.formatActualRam(actualScriptRam));
    // this.dialog.addRow('Act. $ / s', formatCurrency(dollarPerSec));
    // this.dialog.addRow('Act. xp / sec', `${expPerSec.toFixed(2)}`);
    this.dialog.addRow('');
  }


  getSecondsPerIts() {
    const hackTimeS = this.hackTimeS * this.hackDurationMultiplier;
    this.secondsPerHack = Math.max(hackTimeS, 1); // Minium of hack every second
    if (this.secondsPerHack === 1) {
      this.logger.warn(`secondsPerHack for ${this.target} has been capped to lowest possible value (1s)`);
    }
    this.secondsPerGrow = Math.max(this.secondsPerHack / (this.growTimeS / this.secondsPerHack), 1);
    this.secondsPerWeaken = Math.max(this.secondsPerHack / (this.weakenTimeS / this.secondsPerHack), 1);

    this.logger.debug(`Timing: Hack: ${formatMilliseconds(this.secondsPerHack * 1000, true)} Grow: ${formatMilliseconds(this.secondsPerGrow * 1000, true)} Weaken: ${formatMilliseconds(this.secondsPerWeaken * 1000, true)} multi: ${this.hackDurationMultiplier.toPrecision(2)}x`);
  }

  getWeakenThreads() {
    const securitySafteyAddition = (this.ns.getServerSecurityLevel(this.target) - this.ns.getServerMinSecurityLevel(this.target)) * 0.1;
    const hackSecurityAddedPerSec = (this.ns.hackAnalyzeSecurity(this.hackThreads.average) / this.secondsPerHack);
    const growSecurityAddedPerSec = (this.ns.growthAnalyzeSecurity(this.growThreads.average) / this.secondsPerGrow);
    this.securityAdded = hackSecurityAddedPerSec + growSecurityAddedPerSec + securitySafteyAddition;
    const weakenThreads = Math.ceil(this.securityAdded / this.ns.weakenAnalyze(1));
    this.weakenThreads.updateAverage(weakenThreads);
  }

  // TODO: Still seems to be growing more than needed. Maybe needs to account for mulitplicative effect? 
  getGrowthThreads() {
    const targetsMoneyPerc = this.ns.getServerMoneyAvailable(this.target) / this.ns.getServerMaxMoney(this.target);

    const growthSafteyAddition = 1 / Math.max(targetsMoneyPerc, 0.8);
    const adjustedHackPerc = (this.hackTargetDollars / this.ns.getServerMoneyAvailable(this.target)) / this.secondsPerGrow;
    this.growthTarget = growthSafteyAddition + adjustedHackPerc; // Get the percentage target that will be hacked away, so we can aim to replace it (+ some safety margin (0.01%))
    
    const growThreads = Math.ceil(this.ns.growthAnalyze(this.target, this.growthTarget));
    
    this.growThreads.updateAverage(growThreads);

    this.logger.debug(`Grow Threads: ${growThreads} Grow Threads Avg: ${Math.ceil(this.growThreads.average)} Growth Target: ${formatPct(this.growthTarget, 3)} adjustedHack: ${formatPct(adjustedHackPerc)} safety: ${formatPct(growthSafteyAddition, 3)} target money: ${formatPct(targetsMoneyPerc, 3)}`)
  }

  getHackThreads() {
    this.hackTargetDollars = this.maxMoneyThresh * this.hackTargetPerc;

    this.logger.debug(`Hack Threads:  tgt $:${formatCurrency(this.hackTargetDollars)} | thread result: ${this.ns.hackAnalyzeThreads(this.target, this.hackTargetDollars).toFixed(2)} | analyze result: ${formatPct(this.ns.hackAnalyze(this.target) * Math.ceil(this.ns.hackAnalyzeThreads(this.target, this.hackTargetDollars)))}`)
    const hackThreads = Math.ceil(this.ns.hackAnalyzeThreads(this.target, this.hackTargetDollars));

    // const hackThreads = Math.ceil(this.hackTargetPerc / this.ns.hackAnalyze(this.target));
    this.hackThreads.updateAverage(hackThreads);

    // this.logger.debug(`Hack Threads: tgt: ${formatPct(this.hackTargetPerc)} | 1 thread: ${formatPct(this.ns.hackAnalyze(this.target))} | threads: ${(this.hackTargetPerc / this.ns.hackAnalyze(this.target)).toPrecision(3)}`)
    
    this.currMoney = this.ns.getServerMoneyAvailable(this.target);
    if ((this.currMoney / this.maxMoneyThresh) < 0.60) {
      this.hackThreads.reset(); // Allow the server to grow
    } 
  }

  calculateRamUsage() {
    let totalRam = 0;
    let totalAdjustedRam = 0;
    loopOverScriptFiles(script => {
      // RAM usage
      const ram = Math.ceil(this.loopThreads[script].average) * this.scriptRam[script];
      this.loopRam[script] = ram;
      totalRam += ram;
      
      // Instance usage
      this.loopInstances[script] = this.timeS[script] / Math.floor(this.secondsPerIt[script]); 
      
      this.totalThreads[script] = this.loopInstances[script] * Math.ceil(this.loopThreads[script].average);
      
      const adjustedRam = this.totalThreads[script] * this.scriptRam[script]
      this.totalRam[script] = adjustedRam;
      totalAdjustedRam += adjustedRam;
    })
    this.loopRamSum = totalRam;
    this.totalRamSum = totalAdjustedRam;
  }

  // Formatters
  formatActualThreads(runningScripts: IKeyedObject<RunningScript[]>): string {
    let outStr = '';
    loopOverScriptFiles(script => {
      const scriptName = script.split('/')[2][0];
      outStr += ` ${scriptName}: ${runningScripts[script].map(s => s.threads).reduce((a, b) => a + b, 0)} (${runningScripts[script].length.toFixed(0)})/`;
    });
    return outStr.slice(0, -1); // Remove the last trailing /
  }

  formatActualRam(actualScriptRam: IKeyedObject<number>) {
    let outStr = '';
    let totalRam = 0;
    loopOverScriptFiles(script => {
      const scriptName = script.split('/')[2][0];
      totalRam += actualScriptRam[script];
      outStr += `${scriptName}: ${formatRAM(actualScriptRam[script])}/`;
    });
    // return outStr.slice(0, -1) + ` [${formatRAM(totalRam)}]`; // Remove the last trailing /
    
    return outStr.slice(0, -1) + ` [${formatPct(1-this.hostAvailableRamPct, 3)}]`; // Remove the last trailing /
    
  }

  formatHackDelta(hackDelta: number): string {
    const lastPortMessage = this.formatLastMessage(this.portData[this.HACK_PORT], formatCurrency);
    return `${formatPct(hackDelta, 4)} (${lastPortMessage})`;
  }

  formatGrowDelta(growDelta: number): string {
    const lastPortMessage = this.formatLastMessage(this.portData[this.GROW_PORT], (v) => `${(v * 100).toPrecision(3)}%`);
    return `${formatPct(growDelta, 4)} (${lastPortMessage})`;
  }

  formatWeakenDelta(weakenDelta: number): string {
    const lastPortMessage = this.formatLastMessage(this.portData[this.WEAKEN_PORT], (v) => `${v.toPrecision(2)}`);
    return `${formatPct(weakenDelta, 4)} (${lastPortMessage})`;
  }

  formatLastMessage<T extends string | number>(
    lastMessage: ITimestampedMessage<T>,
    formatter: (value: T) => string = (value) => value.toString()
  ): string {
    let outStr = formatter(lastMessage.message);
    if (lastMessage.message) {
      const timeDelta = Math.round((lastMessage.time - Date.now()) / 1000);
      outStr += ` (${timeDelta.toFixed(0)})`
    }
    return outStr;
  }

  private formatWeaken(): string | undefined {
    const liveData = `${this.securityAdded.toPrecision(3)} - ${this.weakenThreads.lastValue.toFixed(0)} threads`;

    const averagedData = `${this.ns.weakenAnalyze(this.weakenThreads.average).toPrecision(3)} - ${Math.ceil(this.weakenThreads.average).toFixed(0)} threads`
    if (liveData === averagedData) {
      return averagedData;
    }
    return `${averagedData} ●:[${liveData}]`;
  }

  private formatGrow(): string | undefined {
    const liveData = `${formatPct(this.growthTarget, 3)} - ${this.growThreads.lastValue.toFixed(0)} threads`;

    // From threads, get estimated growth %
    let estGrowthTarget = this.growthTarget;
    let estThreads = Math.ceil(this.ns.growthAnalyze(this.target, estGrowthTarget));
    const avgThreads = Math.ceil(this.growThreads.average);
    let its = 0;
    while (estThreads != avgThreads && avgThreads > 0) {
      if (its > 100) {
        this.logger.warn(`Grow threads not converging, est: ${estThreads} threads | avg: ${avgThreads} threads | est ${formatPct(estGrowthTarget, 5)} | live: ${formatPct(this.growthTarget, 5)}`);
        break;
      }

      this.logger.debug(`Grow Estimator: pre: ${formatPct(estGrowthTarget, 3)} post:${formatPct(estGrowthTarget + 0.001 * (estThreads - avgThreads), 3)} tgt: ${formatPct(this.growthTarget, 3)} | est: ${estThreads} threads | avg: ${avgThreads} threads | i: ${its}`);

      estGrowthTarget += 0.001 * Math.max(Math.min(avgThreads - estThreads, 10), -10);
      if (estGrowthTarget < 1) {
        this.logger.warn(`Grow Estimator: Tried to calcaulate value less than 1 ${formatPct(estGrowthTarget, 3)} | i ${its} | est threads: ${estThreads} | avg threads: ${avgThreads}`);
        break;
      }
      estThreads = Math.ceil(this.ns.growthAnalyze(this.target, estGrowthTarget));
      its++;
    }

    
    const averagedData = `${formatPct(estGrowthTarget, 3)} - ${avgThreads.toFixed(0)} threads`;
    if (liveData === averagedData) {
      return averagedData;
    }

    return `${averagedData} ●:[${liveData}]`;
  }

  private formatHack(): string | undefined {
    const liveData = `${formatCurrency(this.hackTargetDollars)} - ${this.hackThreads.lastValue.toFixed(0)} threads`;

    this.logger.debug(`Hack Estimator: hack %: ${formatPct(this.ns.hackAnalyze(this.target) * Math.ceil(this.hackThreads.average), 3)} | MaxThresh: ${formatCurrency(this.maxMoneyThresh)} | out: ${formatCurrency((this.ns.hackAnalyze(this.target) * Math.ceil(this.hackThreads.average)) * this.maxMoneyThresh)} | 1 thread: ${formatPct(this.ns.hackAnalyze(this.target))}`);

    const averagedData = `${formatCurrency((this.ns.hackAnalyze(this.target) * Math.ceil(this.hackThreads.average)) * this.maxMoneyThresh)} - ${Math.ceil(this.hackThreads.average).toFixed(0)} threads`
    if (liveData === averagedData) {
      return averagedData;
    }

    return `${averagedData} ●:[${liveData}]`;
  }


  // Utilites
  readFromPort(port: number): number {
    const portValue = this.ns.readPort(port);
    // ns.print(`DEBUG port value: ${portValue.valueOf()} (${port})`);
    if (typeof portValue.valueOf() == 'number') {
      return portValue.valueOf() as number;
    }
    return 0;
  }

  startScript(secondsPerIt: number, script: string, port: number, threads: Averager) {
    this.logger.debug(`${this.timer} ${script} launch: timer: ${this.timer % Math.floor(secondsPerIt) == 0}`)
    if (this.timer % Math.floor(secondsPerIt) == 0) {
      const { pid, msg } = this.execScript(Math.ceil(threads.average), script, port);

      if (pid == 0) {
        this.logScriptFailedToStart(script, threads.average);
      }

      this.scriptPids[script].push(pid);
      return { threads, msg };
    }
    return;
  }
  
  execScript(threads: number, script: string, port: number) {
    this.logger.debug(`Executing script: ${script}`)
    const pid = this.ns.exec(script, this.host, threads, this.target, port);
    return {pid, msg: { message: `Executing ${script} with ${threads} threads`, time: Date.now() }};
  }

  loopOverPorts(func: (port: number) => void) {
    for (const port of [this.WEAKEN_PORT, this.GROW_PORT, this.HACK_PORT]) {
      func(port);
    }
  }
  
  
  // Loggers
  logScriptFailedToStart(script: string, threads: number) {
    threads = Math.ceil(threads);
    this.logger.warn(`Script ${script} with ${threads} threads failed to start (${this.host}: ${formatRAM(this.hostAvailableRam)}; script: ${formatRAM(threads * this.scriptRam[script])})`)
  }
}
    
    
function loopOverScriptFiles(func: (script: string) => void) {
  for (const script of [HACK_FILE, GROW_FILE, WEAKEN_FILE]) {
    func(script);
  }
} 


function formatPct(pct: number, precision: number = 3): string {
  return `${(pct * 100).toPrecision(precision)}%`
}


export async function main(ns:NS) {
  const {target, host } = validateArgs(ns);
  
  const dialog = new Dialog(ns);

  const scheduler = new Scheduler(ns, target, host, dialog);

  await scheduler.main();
}

function validateArgs(ns: NS): {target: string, host: string} {
  const target = validateArg<string>(ns, ns.args[0], 'string');
  const hostArg = ns.args[1];
  let host: string;
  if (typeof hostArg == 'string') {
    host = hostArg;
  } else if (typeof hostArg == 'number') {
    host = 'pserv-' + hostArg;
  } else {
    throw new Error(`Unsupported arg type for arg1: ${typeof hostArg}`);
  }
  return {
    target,
    host
  }
}
