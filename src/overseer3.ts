import { NS } from "@ns";
import { CustomLogger } from "./utils/customLogger";
import { copyScriptToServer, readFile } from "./utils/file";
import { formatCurrency, formatMilliseconds, formatPct, formatRAM } from "./utils/utils";
import { ITableHeader, formatTable } from "./utils/tableUtils";
import { getServerMoneyString, getServerSecurityLevelString } from "./utils/dashboard";

const HACK_TARGETS_FILE = 'db/spider/hack_targets.txt';
const HOSTS_FILE = 'db/spider/hosts.txt';

enum AttackPhase {
    Weaken = `Weaken`,
    Grow = `Grow`,
    Pending = `Pending`,
    Hack = `Hack`,
    Done = `Done`,
}

interface ITargetData {
    id: number;
    name: string;
    phase: AttackPhase;
    sleepMs: number;
    pids: number[];

    weakenThreadAllocPct: number;
    growThreadAllocPct: number;
    hackThreadAllocPct: number;
}

interface IOverseerOptions {
    excludedHosts: string[];
    killAll: boolean;
    growthTargetPct: number;
    hackTargetPct: number;
    [key: string]: unknown;
}

export class Overseer {
    readonly targets: string[] = [];
    readonly hosts: string[] = [];

    readonly weakenFile = 'hacks/weaken.js';
    readonly growFile = 'hacks/grow.js';
    readonly hackFile = 'hacks/flexihack.js';

    readonly weakenScriptRam: number;
    readonly growRam: number;
    readonly hackRam: number;
    readonly maxScriptRam: number;

    availableRam: number = 0;
    get hostsWithAvailableRam(): string[] {
        return this.hosts.filter(host => {
            const hostRam = (this.ns.getServerMaxRam(host) - this.ns.getServerUsedRam(host));
            return hostRam > this.maxScriptRam;
        });
    }
    
    targetData: ITargetData[] = [];
    set targetsToAttack(targets: string[]) {
        this.targetData = targets.map((t, i) => ({
            id: i,
            name: t,
            phase: AttackPhase.Weaken,
            sleepMs: this.ns.getWeakenTime(t),
            pids: [],

            weakenThreadAllocPct: 0,
            growThreadAllocPct: 0,
            hackThreadAllocPct: 0,
        }));
    }
    get targetsUnderAttack(): ITargetData[] {
        return this.targetData.filter(t => t.phase !== AttackPhase.Done);
    }
    get targetsToWeaken(): ITargetData[] {
        return this.targetData.filter(t => t.phase === AttackPhase.Weaken);
    }
    get targetsToGrow(): ITargetData[] {
        return this.targetData.filter(t => t.phase === AttackPhase.Grow);
    }
    get targetsToHack(): ITargetData[] {
        return this.targetData.filter(t => t.phase === AttackPhase.Hack);
    }
    moveTargetToGrow(target: ITargetData): void {
        this.logger.info(`Moving target ${target.name} from Weaken to Grow`);
        target.phase = AttackPhase.Grow;
        target.pids.forEach(pid => this.ns.kill(pid));
        target.weakenThreadAllocPct = 0;
    }
    moveTargetToHack(target: ITargetData): void {
        this.logger.info(`Moving target ${target.name} from Grow to Hack`);
        
        target.phase = AttackPhase.Hack;
        target.pids.forEach(pid => this.ns.kill(pid));
        target.weakenThreadAllocPct = 0;
        target.growThreadAllocPct = 0;
    }
    moveTargetToDone(target: ITargetData): void {
        this.logger.info(`Moving target ${target.name} from Hack to Done`);
        target.phase = AttackPhase.Done;
    }

    constructor(
        protected ns: NS,
        protected opts: Partial<IOverseerOptions>,
        protected logger: CustomLogger = new CustomLogger(ns, 'WARN'),
    ) {
        this.logger.debug(`Overseer - Options: ${JSON.stringify(opts)}`);
        this.targets = readFile(ns, HACK_TARGETS_FILE);
        this.logger.debug(`Overseer - Targets: ${this.targets} (${this.targets.length})`);
        this.hosts = readFile(ns, HOSTS_FILE);
        if (opts.excludedHosts) {
            this.logger.debug(`Overseer - Reserved Hosts: ${opts.excludedHosts}`);
            this.hosts = this.hosts.filter(h => !opts.excludedHosts!.includes(h));
        }
        this.logger.debug(`Overseer - Hosts: ${this.hosts} (${this.hosts.length})`);

        this.weakenScriptRam = ns.getScriptRam(this.weakenFile, 'home');
        this.growRam = ns.getScriptRam(this.growFile, 'home');
        this.hackRam = ns.getScriptRam(this.hackFile, 'home');
        this.maxScriptRam = Math.max(this.weakenScriptRam, this.growRam, this.hackRam);

        this.targetsToAttack = this.targets;
    }

    async run(): Promise<void> {
        if (this.opts.killAll) {
            this.killAllScripts();
        }
        
        this.disableLogs();
        while (true) {
            this.execLoop();

            this.renderDashboard();

            await this.sleep();
        }
    }

    execLoop(): void {
        this.logger.debug(`Overseer - Exec Loop Starting`);
        // Check there are still targets to do something with
        if (this.targetsUnderAttack.length <= 0) {
            this.logger.info(`Overseer - No more targets to attack! Quitting`);
            this.ns.exit();
        }

        // Get available ram from all hosts
        this.availableRam = this.getAvailableRamFromHosts();
        this.logger.debug(`Overseer - Available RAM: ${formatRAM(this.availableRam)}`);
        
        // Hack Targets
        // This is first, as we want to try earning money from our existing grown targets before growing a new target
        this.hackTargets();
        if (this.getAvailableRamFromHosts() <= this.maxScriptRam) {
            return;
        }

        // Grow Targets
        // This is second, as we want to try growing our existing targets before starting the weaken phase on a new target
        this.growTargets();
        if (this.getAvailableRamFromHosts() <= this.maxScriptRam) {
            return;
        }

        // Weaken Targets
        // This is last, as we want to pick up a new target only when there are no other available operations (And we have spare ram)
        this.weakenTargets();
    }

    getAvailableRamFromHosts(): number {
        let availableRam = 0;
        for (const host of this.hostsWithAvailableRam) {
            let hostRam = (this.ns.getServerMaxRam(host) - this.ns.getServerUsedRam(host));

            if (hostRam < this.maxScriptRam) {
                hostRam = 0; // This host doesn't have enough ram free to do anything with
            }
            availableRam += hostRam;
            
        }
        this.availableRam = availableRam;
        return availableRam;
    }

    weakenTargets(): void {
        this.logger.debug(`Overseer - Weakening Targets (${this.targetsToWeaken.length})`);

        // For each target
        for (const target of this.targetsToWeaken) {
            // - Calculate amount of weaken threads required
            const weakenTarget = this.ns.getServerSecurityLevel(target.name) - this.ns.getServerMinSecurityLevel(target.name);
            if (weakenTarget <= 5) {
                this.moveTargetToGrow(target);
                continue;
            }
            let weakenThreads = Math.ceil(weakenTarget / this.ns.weakenAnalyze(1));
            let weakenRam = weakenThreads * this.weakenScriptRam;
            let assignedWeakenPct = 1;
            this.logger.debug(`Overseer - Target ${target.name} requires ${weakenThreads} weaken threads (${formatRAM(weakenRam)}) to weaken by ${weakenTarget.toFixed(2)} points | Current Alloc % h: ${formatPct(target.hackThreadAllocPct)} g: ${formatPct(target.growThreadAllocPct)} w: ${formatPct(target.weakenThreadAllocPct)}`);

            // Check target hasn't already been allocated threads
            if (target.weakenThreadAllocPct > 0) {
                weakenThreads = Math.ceil(weakenThreads * (1 - target.weakenThreadAllocPct));
                assignedWeakenPct = (1 - target.weakenThreadAllocPct);
                this.logger.debug(`Overseer - Target ${target.name} already has ${formatPct(target.weakenThreadAllocPct)} weaken allocated. Adding ${formatPct(assignedWeakenPct)} more (${weakenThreads} threads)`);
            }

            // - Compare threads against the available RAM
            if (weakenRam > this.availableRam) {
                weakenThreads = Math.floor(this.availableRam / this.weakenScriptRam);
                assignedWeakenPct = (this.availableRam / weakenRam);
            }

            // - Assign scripts upto available ram
            const pids = this.execScript(this.weakenFile, weakenThreads, target);

            // - Update ITargetData entry 
            target.pids = target.pids.concat(pids);
            target.weakenThreadAllocPct += assignedWeakenPct; 
            target.sleepMs = this.ns.getWeakenTime(target.name);
        }
    }

    growTargets(): void {
        this.logger.debug(`Overseer - Growing Targets (${this.targetsToGrow.length})`);

        // For each target
        for (const target of this.targetsToGrow) {
            if (this.ns.getServerMoneyAvailable(target.name) > (this.ns.getServerMaxMoney(target.name) * 0.95)) {
                this.moveTargetToHack(target);
                continue;
            }
            // - Set target growth % to 125%
            const growthTargetPct = this.opts.growthTargetPct ?? 1.25;

            // - Calculate amount of grow threads required
            let growThreads = Math.ceil(this.ns.growthAnalyze(target.name, growthTargetPct));
            let growRam = growThreads * this.growRam;
            let assignedGrowPct = 1;
            this.logger.debug(`Overseer - Target ${target.name} needs ${growThreads} threads (${formatRAM(growRam)}) to grow ${formatPct(growthTargetPct)} | Current Alloc % h: ${formatPct(target.hackThreadAllocPct)} g: ${formatPct(target.growThreadAllocPct)} w: ${formatPct(target.weakenThreadAllocPct)}`);

            // Check target hasn't already been allocated threads
            if (target.growThreadAllocPct > 0) {
                growThreads = Math.ceil(growThreads * (1 - target.growThreadAllocPct));
                assignedGrowPct = (1 - target.growThreadAllocPct);
                this.logger.debug(`Overseer - Target ${target.name} already has ${formatPct(target.growThreadAllocPct)} growth allocated. Adding ${formatPct(assignedGrowPct)} more (${growThreads} threads)`);
            }

            // - Calculate required weaken threads to compensate for security growth
            let weakenThreads = Math.ceil(this.ns.growthAnalyzeSecurity(growThreads) / this.ns.weakenAnalyze(1));
            let weakenRam = weakenThreads * this.weakenScriptRam;
            let assignedWeakenPct = 1;
            this.logger.debug(`Overseer - Target ${target.name} needs ${weakenThreads} threads (${formatRAM(weakenRam)}) to compensate for security growth`);

            // - Check target hasn't already been allocated threads
            if (target.weakenThreadAllocPct > 0) {
                weakenThreads = Math.ceil(weakenThreads * (1 - target.weakenThreadAllocPct));
                assignedWeakenPct = (1 - target.weakenThreadAllocPct);
                this.logger.debug(`Overseer - Target ${target.name} already has ${formatPct(target.weakenThreadAllocPct)} weaken allocated. Adding ${formatPct(assignedWeakenPct)} more (${weakenThreads} threads)`);
            }

            // - Compare threads against the available RAM
            if ((growRam + weakenRam) > this.availableRam) {

                const growRatio = growThreads / (growThreads + weakenThreads);
                const weakenRatio = weakenThreads / (growThreads + weakenThreads);

                growThreads = Math.floor((this.availableRam * growRatio) / this.growRam);
                weakenThreads = Math.floor((this.availableRam * weakenRatio) / this.weakenScriptRam);

                assignedGrowPct = ((this.availableRam * growRatio) / growRam);
                assignedGrowPct = ((this.availableRam * weakenRatio) / weakenRam);
            }

            // - Assign scripts upto available ram
            const weakenPids = this.execScript(this.weakenFile, weakenThreads, target);
            const growPids = this.execScript(this.growFile, growThreads, target);

            // - Update ITargetData entry
            target.pids = target.pids.concat(weakenPids.concat(growPids));
            target.growThreadAllocPct += assignedGrowPct;
            target.weakenThreadAllocPct += assignedWeakenPct;
            target.sleepMs = this.ns.getWeakenTime(target.name); // Use weaken, as it's the slower operation, but update, as it will have decreased post weaken
        }
    }

    hackTargets():void {
        this.logger.debug(`Overseer - Hacking Targets (${this.targetsToHack.length})`);

        // For each target
        for (const target of this.targetsToHack) {
            // - Set hack target %
            const hackTargetPct = this.opts.hackTargetPct ?? 0.1;
            const hackTargetDollars = this.ns.getServerMaxMoney(target.name) * hackTargetPct;

            // - Calculate amount of hack threads required
            let hackThreads = Math.ceil(this.ns.hackAnalyzeThreads(target.name, hackTargetDollars));
            let hackRam = hackThreads * this.hackRam;
            let hackThreadAlloc = 1;
            this.logger.debug(`Overseer - Target ${target.name} needs ${hackThreads} threads (${formatRAM(hackRam)}) to hack ${formatCurrency(hackTargetDollars)} (${formatPct(hackTargetPct)}) | Current Alloc % h: ${formatPct(target.hackThreadAllocPct)} g: ${formatPct(target.growThreadAllocPct)} w: ${formatPct(target.weakenThreadAllocPct)}`);

            if (target.hackThreadAllocPct > 0) {
                hackThreads = Math.ceil(hackThreads * (1 - target.hackThreadAllocPct));
                hackThreadAlloc = (1 - target.hackThreadAllocPct);
                this.logger.debug(`Overseer - Target ${target.name} already has ${formatPct(target.hackThreadAllocPct)} hack allocated. Adding ${formatPct(1 - target.hackThreadAllocPct)} more (${hackThreads} threads)`);
            }

            // - Start a ratio of 1:6 weaken to flexihack
            let weakenThreads = Math.ceil(hackThreads / 6);
            let weakenRam = weakenThreads * this.weakenScriptRam;
            let weakenThreadAlloc = 1;
            this.logger.debug(`Overseer - Target ${target.name} needs ${weakenThreads} threads (${formatRAM(weakenRam)}) to compensate for security growth`);

            if (target.weakenThreadAllocPct > 0) {
                weakenThreads = Math.ceil(weakenThreads * (1 - target.weakenThreadAllocPct));
                weakenThreadAlloc = (1 - target.weakenThreadAllocPct);
                this.logger.debug(`Overseer - Target ${target.name} already has ${formatPct(target.weakenThreadAllocPct)} weaken allocated. Adding ${formatPct(1 - target.weakenThreadAllocPct)} more (${weakenThreads} threads)`);
            }

            if ((hackRam + weakenRam) > this.availableRam) {
                const hackRatio = hackThreads / (hackThreads + weakenThreads);
                const weakenRatio = weakenThreads / (hackThreads + weakenThreads);

                hackThreads = Math.floor((this.availableRam * hackRatio) / this.hackRam);
                weakenThreads = Math.floor((this.availableRam * weakenRatio) / this.weakenScriptRam);

                hackThreadAlloc = ((this.availableRam * hackRatio) / hackRam);
                weakenThreadAlloc = ((this.availableRam * weakenRatio) / weakenRam);
            }

            // - Assign scripts upto available ram
            const weakenPids = this.execScript(this.weakenFile, weakenThreads, target);
            const hackPids = this.execScript(this.hackFile, hackThreads, target, this.ns.getServerMaxMoney(target.name) * 0.95);


            // - Update ITargetData entry
            target.pids = target.pids.concat(weakenPids.concat(hackPids));
            target.hackThreadAllocPct += hackThreadAlloc;
            target.weakenThreadAllocPct += weakenThreadAlloc;
            
            if (target.hackThreadAllocPct >= 1 && target.weakenThreadAllocPct >= 1) {
                this.moveTargetToDone(target);
            }
        }
    }

    execScript(script: string, threads: number, target: ITargetData, ...args: any[]): number[] {
        this.logger.debug(`Executing script ${script} with ${threads} threads against ${target.name} with ${this.hostsWithAvailableRam.length} available hosts`);
        const pids: number[] = [];
        for (const host of this.hostsWithAvailableRam) {
            if (threads <= 0) {
                // Done allocating
                break;
            }
            const ram = this.ns.getServerMaxRam(host) - this.ns.getServerUsedRam(host);
            
            const localThreads = Math.floor(ram / this.ns.getScriptRam(script));
            const threadsToAlloc = Math.min(threads, localThreads);

            copyScriptToServer(this.ns, host, script);
            this.logger.debug(`Overseer - Allocating ${threadsToAlloc} threads of ${script} to ${host} (${formatRAM(ram)} spare) | Remaining threads: ${threads - threadsToAlloc}`);
            const pid = this.ns.exec(script, host, threadsToAlloc, target.name, ...args);
            if (!pid) {
                this.logger.error(`Overseer - Could not execute ${script} on ${host} with ${formatRAM(ram)} spare, script tried allocating ${threadsToAlloc} threads (${formatRAM(threadsToAlloc * this.ns.getScriptRam(script))})`);
                throw new Error(`Overseer - Could not execute ${script} on ${host}`);
            }
            pids.push(pid);
            threads -= threadsToAlloc;
        }
        return pids;
    }

    sleep(): Promise<true> {
        let sleepMs = Math.min(...this.targetsUnderAttack.map(t => t.sleepMs));
        if (sleepMs < 1) {
            this.logger.info(`Overseer - Min sleep returned value < 1 (${sleepMs.toPrecision(2)}). Capping to 1`);
            sleepMs = 1;
        }
        this.logger.debug(`Overseer - Sleeping for ${formatMilliseconds(sleepMs)}`);
        return this.ns.sleep(sleepMs);
    }

    renderDashboard() {
        this.ns.clearLog();
        let dollarsPerSec : number = 0;
        let xpPerSec : number = 0;

        function getDollarsPerSecForTarget(ns: NS, t: ITargetData): number {
            const scriptDollarsPerSec = t.pids.map(pid => ns.getRunningScript(pid)).map(script => script?.onlineMoneyMade ?? 0).reduce((a, b) => a + b, 0)
            dollarsPerSec += scriptDollarsPerSec;
            return scriptDollarsPerSec;
        }

        function getXpPerSecForTarget(ns: NS, t: ITargetData): number {
            const scriptXpPerSec = t.pids.map(pid => ns.getRunningScript(pid)).map(script => script?.onlineExpGained ?? 0).reduce((a, b) => a + b, 0)
            xpPerSec += scriptXpPerSec;
            return scriptXpPerSec;
        }

        interface ITableData extends ITargetData {
            weakenPctString: string;
            growPctString: string;
            hackPctString: string;

            security: string;
            money: string;
            growth: string;
            totalScripts: number;
            sleepTime: string;
            dollarPerSec: string;
            xpPerSec: string;
        }

        const headers: ITableHeader<ITableData>[] = [
            { key: 'name', name: 'Name' , cellWidth: 20},
            { key: 'phase', name: 'Phase', cellWidth: 10},
            { key: 'growth', name: 'Growth', cellWidth: 8},
            { key: 'security', name: 'Security', cellWidth: 20},
            { key: 'money', name: '$' , cellWidth: 30},
            { key: 'weakenPctString', name: 'W%', cellWidth: 8},
            { key: 'growPctString', name: 'G%', cellWidth: 8},
            { key: 'hackPctString', name: 'H%', cellWidth: 8},
            { key: 'dollarPerSec', name: '$/sec', cellWidth: 10},
            { key: 'xpPerSec', name: 'XP/sec', cellWidth: 10},
            { key: 'totalScripts', name: '#', cellWidth: 6, format: 0 },
            { key: 'sleepTime', name: 'Sleep', cellWidth: 10 },
        ];

        const tableData: ITableData[] = this.targetData.map(t => ({
            ...t,
            weakenPctString: formatPct(t.weakenThreadAllocPct),
            growPctString: t.phase == AttackPhase.Grow ? formatPct(t.growThreadAllocPct) : '--',
            hackPctString: t.phase == AttackPhase.Hack || t.phase == AttackPhase.Done ? formatPct(t.hackThreadAllocPct) : '--',
            security: getServerSecurityLevelString(this.ns, t.name),
            money: getServerMoneyString(this.ns, t.name),
            growth: this.ns.getServerGrowth(t.name).toFixed(0),
            totalScripts: t.pids.length,
            sleepTime: formatMilliseconds(t.sleepMs),
            dollarPerSec: formatCurrency(getDollarsPerSecForTarget(this.ns, t)),
            xpPerSec: getXpPerSecForTarget(this.ns, t).toFixed(0),
        }));
        tableData.push({ // Add empty row
            name: '',
            phase: '' as unknown as AttackPhase,
            security: '',
            growth: '',
            money: '',
            weakenThreadAllocPct: 0,
            hackThreadAllocPct: 0,
            growThreadAllocPct: 0,
            weakenPctString: '',
            hackPctString: '',
            growPctString: '',
            sleepMs: 0,
            pids: [],
            totalScripts: 0,
            id: -99,
            sleepTime: '',
            dollarPerSec: '',
            xpPerSec: '',
        });
        tableData.push({ // Add totals row
            name: `Total: ${this.targetData.length}`,
            phase: '' as unknown as AttackPhase,
            security: '',
            growth: '',
            money: formatCurrency(this.targetData.map(t => this.ns.getServerMaxMoney(t.name)).reduce((a, b) => a + b, 0)),
            weakenThreadAllocPct: 0,
            weakenPctString: '',
            hackPctString: '',
            hackThreadAllocPct: 0,
            growPctString: '',
            growThreadAllocPct: 0,
            sleepMs: 0,
            sleepTime: formatMilliseconds(Math.min(...this.targetsUnderAttack.map(t => t.sleepMs))),
            totalScripts: this.targetData.map(t => t.pids.length).reduce((a, b) => a + b, 0),
            pids: [],
            id: -99,
            dollarPerSec: formatCurrency(dollarsPerSec),
            xpPerSec: xpPerSec.toFixed(0),
        })

        const tableStr = formatTable(this.ns, tableData, headers, {printToConsole: false});
        this.ns.print(tableStr);

    }

    killAllScripts() {
        // const usedPservs = new Array(5).fill('').map((_, i) => `pserv-${i + 20}`);
        const reservedHostsSet = new Set(this.opts.excludedHosts ?? ['home']);
        this.hosts.forEach(host => {
            if (!reservedHostsSet.has(host)) {
                this.logger.info(`Overseer - Killing all scripts on ${host}`);
                this.ns.killall(host, true);
            } 
        })
    }

    disableLogs() {
        const logsToDisable = [
            'disableLog',
            'getServerUsedRam',
            'getServerMaxRam',
            'sleep',
            'getServerSecurityLevel',
            'getServerMinSecurityLevel',
            'getServerMaxMoney',
            'getServerGrowth',
            'getServerMoneyAvailable'
        ];

        logsToDisable.forEach(log => this.ns.disableLog(log));
    }

}

export async function main(ns:NS) {
    const opts = ns.flags([
        ['killAll', true],
        ['excludedHosts', ['home']],
        ['growthTargetPct', 1.25],
        ['hackTargetPct', 0.1],
    ]);

    if (opts.growthTargetPct && opts.growthTargetPct as number < 1) {
        throw new Error(`Growth target pct must be >= 1. Got ${opts.growthTargetPct}`);
    }
    if (opts.hackTargetPct && opts.hackTargetPct as number < 0) {
        throw new Error(`Hack target pct must be >= 0. Got ${opts.hackTargetPct}`);
    }
    // const logger = new CustomLogger(ns, 'DEBUG', 'tprint');
    // const overseer = new Overseer(ns, opts as IOverseerOptions, logger);
    
    const overseer = new Overseer(ns, opts as IOverseerOptions);

    
    await overseer.run();
}