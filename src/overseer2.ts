import { NS } from '@ns';
import { getServerHackingLevel } from './utils/dashboard';
import { copyScriptToServer, readFile } from './utils/file';
import { isServerBelowSecurityThresh } from './utils/hack';
import { calculateThreads, formatCurrency, discoverServers, validateArg, formatMilliseconds } from './utils/utils';

const THREAD_LIMIT = 100;


/** @param {NS} ns */
export async function main(ns: NS) {

  ns.disableLog('ALL');

  const hackTargetsFile = 'db/spider/hack_targets.txt';
  const targets = readFile(ns, hackTargetsFile);
  ns.print('Targets: ', targets);
  let totalTargetMoney = targets.map(t => ns.getServerMaxMoney(t)).reduce((a, b) => a + b, 0);

  const hostsFile = 'db/spider/hosts.txt';
  const hosts = readFile(ns, hostsFile);
  ns.print('Hosts: ', hosts);
  // User will need to manually kill any running home scripts
  hosts.filter(h => h != 'home').forEach(h => ns.killall(h));

  const weakenFile = "hacks/weaken.js";
  const weakenScriptRam = ns.getScriptRam(weakenFile, "home");

  const hackFile = "hacks/flexihack.js";
  const hackScriptRam = ns.getScriptRam(hackFile, "home");

  const maxScriptRam = Math.max(weakenScriptRam, hackScriptRam)



  const totalAvailableRam = hosts.map(s => ns.getServerMaxRam(s)).reduce((a, b) => a + b, 0);

  // const pidMap = weakenTargets(ns, targets, hosts, )

  for (const target of targets) {
    if (!ns.hasRootAccess(target)) { // Dunno how we got here. Either the spider is broken, or manual data entry was incorrect
      ns.tprint(`!Don't have root access to target: ${target}`);
      totalTargetMoney -= ns.getServerMaxMoney(target);
      continue;
    }

    const moneyPercentageOfTotal = ns.getServerMaxMoney(target) / totalTargetMoney; // Get the amount of money this server represents, and use that to allocate ram
    /* The amount of RAM the attackers are allowed access to (Based on a % of the total money this server represents) */
    let availableRam = Math.floor(totalAvailableRam * moneyPercentageOfTotal);

    if (availableRam < 7 * maxScriptRam) {
      ns.tprint(`WARN: Target: ${target} doesn't have a large enough ram allocation to effectivly hack. Skipping`);
      totalTargetMoney -= ns.getServerMaxMoney(target);
      continue;
    }

    const serverThreadLimit = getThreadLimitForServer(ns, target);
    if ((availableRam / maxScriptRam) > serverThreadLimit) {
      ns.tprint(`WARN: Target: ${target} allocated more ram then limit\n(Limit: ${serverThreadLimit} threads, tried allocating ${(availableRam / maxScriptRam)} threads).\nCapping (Recommend adding more targets)`);
      availableRam = maxScriptRam * serverThreadLimit;
    }
    ns.print(`Allocating ${availableRam} GB RAM to ${target} (${(moneyPercentageOfTotal * 100).toFixed(2)})%`);


    // Weaken Phase
    ns.tprint(`Starting weaken phase against ${target} (Current: ${ns.getServerSecurityLevel(target)}; Min: ${ns.getServerMinSecurityLevel(target)})`);
    const weakenScriptPIDs: number[] = [];
    const targetWeaken = ns.getServerBaseSecurityLevel(target) - ns.getServerMinSecurityLevel(target);
    let weakenThreadAlloc = 1;
    let weakenResult = ns.weakenAnalyze(1);
    let its = 0;
    while (weakenResult < targetWeaken) {
      if (its > 50) {
        ns.print(`WARN: Weakening ${target} solver failed to reach target security level. (Current threads ${weakenThreadAlloc}; Current weaken result: ${weakenResult}`);
        break;
      }
      weakenThreadAlloc *= 2;
      weakenResult = ns.weakenAnalyze(weakenThreadAlloc);
      its++;
    }
    const weakenTime = ns.getWeakenTime(target);
    const weakenAllocStart = Date.now();
    ns.print(`INFO: Allocating ${weakenThreadAlloc} threads to weaken (${formatMilliseconds(weakenTime)})`)

    for (const server of hosts) {
      // Check that target hasn't already been weakend enough
      if (isServerBelowSecurityThresh(ns, target)) {
        break
      }
      if (weakenThreadAlloc < 0) {
        break;
      }
      killExistingScripts(ns, server, target);

      copyScriptToServer(ns, server, weakenFile);

      const ram = getServerRam(ns, server);
      const threads = Math.floor(ram / weakenScriptRam);
      weakenThreadAlloc -= threads;

      ns.print(`INFO: Starting weaken on ${server} with ${threads} threads (${weakenThreadAlloc} remaining)`)

      const pid = await executeAndSleep(ns, weakenFile, server, threads, 0, target);
      pid && weakenScriptPIDs.push(pid);
    }

    ns.print(`INFO: Allocated all weaken threads`)

    // Wait for server to be sufficently weakened
    const weakenAllocTime = (Date.now() - weakenAllocStart);

    while (!isServerBelowSecurityThresh(ns, target)) {
      ns.print(`DEBUG: ${target} not under threshold. Sleeping (Sleep Time: ${formatMilliseconds((weakenTime - weakenAllocTime) / 2)})`);
      await ns.sleep((weakenTime - weakenAllocTime) / 1.9);
    }

    // Cleanup weaken scripts
    weakenScriptPIDs.map(pid => ns.kill(pid));

    // Attack Phase
    ns.tprint(`Starting attack phase against ${target} (${formatCurrency(ns.getServerMoneyAvailable(target))} / ${formatCurrency(ns.getServerMaxMoney(target))})`);

    const ramDivisions = Math.floor(availableRam / 7); // Assuming a 1:6 ratio of weaken to flexihack
    let weakenRam = ramDivisions * 1;
    let weakenThreads = Math.floor(weakenRam / weakenScriptRam);
    let flexihackRam = ramDivisions * 6;
    let flexihackThreads = Math.floor(flexihackRam / hackScriptRam);
    ns.print(`${target} - Allocated ${weakenThreads} threads to weaken, ${flexihackThreads} threads to flexihack`);
    for (const server of hosts) {

      killExistingScripts(ns, server, target);

      let remainingRam = getServerRam(ns, server);

      if (weakenRam > 0 && remainingRam > weakenScriptRam) {
        const threads = Math.floor(Math.min(weakenRam, remainingRam) / weakenScriptRam);

        weakenThreads -= threads;
        weakenRam -= threads * weakenScriptRam;
        remainingRam -= threads * weakenScriptRam;

        ns.print(`Adding ${threads} weaken threads (${weakenThreads} threads remaining) (${server} has ${remainingRam.toFixed(0)}GB remaining ram)`)
        await executeAndSleep(ns, weakenFile, server, threads, 1000*15, target);
      } 
      if (flexihackRam > 0 && remainingRam > hackScriptRam) { // Deploy hackers
        const threads = Math.floor(Math.min(flexihackRam, remainingRam) / hackScriptRam);
        const moneyThresh = ns.getServerMaxMoney(target) * 0.95;

        flexihackThreads -= threads;
        flexihackRam -= (threads * hackScriptRam);
        remainingRam -= threads * hackScriptRam;

        ns.print(`Adding ${threads} flexihack threads (${flexihackThreads} threads remaining) (${server} has ${remainingRam.toFixed(0)}GB remaining ram)`)

        copyScriptToServer(ns, server, hackFile);
        await executeAndSleep(ns, hackFile, server, threads, 1000*15, target, moneyThresh);
      }

    }
  }
}



function getServerRam(ns: NS, server: string) {
  // Host might already be running attacks for different targets
  let remainingRam = ns.getServerMaxRam(server) - ns.getServerUsedRam(server);
  if (server == 'home') {
    remainingRam -= 100; // Leave some RAM spare for 'other' activities
  }
  return remainingRam;
}

function killExistingScripts(ns: NS, host: string, target: string): void {
  const scripts = ns.ps(host);
  for (const script of scripts) {
    // ns.print(`Host: ${host} Script: ${script.filename} ${script.args} Target: ${target}`)
    if ( // Check if an attack script is already running against the target
      (script.filename.includes('weaken') || script.filename.includes('flexihack'))
      && script.args.includes(target)
    ) {
      ns.kill(script.pid);
    }
  }
}

async function executeAndSleep(ns: NS, file: string, server: string, threads: number, sleepMs: number, ...args: any[]): Promise<number | undefined> {
  let pid: number | undefined;
  if (threads > 0) {
    pid = ns.exec(file, server, threads, ...args);

    await ns.sleep(sleepMs);
  }
  return pid;
}

function getThreadLimitForServer(ns: NS, server: string): number {
  const { perc } = getServerHackingLevel(ns, server);
  const threadMulti = 1 + (perc - 0.5);

  // Scale the amount of available threads, based on how high level the server is (Floor @ THREAD_LIMIT)
  return Math.max(Math.round(THREAD_LIMIT * threadMulti), THREAD_LIMIT);
}