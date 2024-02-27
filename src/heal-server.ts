import { NS } from '@ns';
import { formatPct, formatRAM, validateArg } from 'utils/utils';

export async function main(ns:NS) {
    const host = 'home';
    const target = validateArg<string>(ns, ns.args[0], 'string');
    let targets: string[] = [];
    if (target.includes(',')) {
        targets = target.split(',');
    } else {
        targets = [target];
    }

    const totalvailableRam = (ns.getServerMaxRam(host) - ns.getServerUsedRam(host)) * 0.75;
    let availableRam = totalvailableRam / targets.length;

    const weakenFile = "hacks/weaken.js";
    const weakenScriptRam = ns.getScriptRam(weakenFile, "home");
  
    const growFile = "hacks/grow.js";
    const growScriptRam = ns.getScriptRam(growFile, "home");

    const pids: {[key:string]: number[]} = {};
    const healDurations: number[] = [];

    for (const target of targets) {
        const growthPct = 1 - (ns.getServerMoneyAvailable(target) / ns.getServerMaxMoney(target));
        const growThreads = Math.ceil(ns.growthAnalyze(target, 1 + growthPct));
        const weakenThreads = Math.ceil(ns.growthAnalyzeSecurity(growThreads, target));

        const growRam = growThreads * growScriptRam;
        const weakenRam = weakenThreads * weakenScriptRam;

        if (growRam + weakenRam > availableRam) {
            ns.tprint(`Not enough ram to start heal on ${target}, skipping`);
            break; // Not enough ram to start heal on this server, skip it. 
        }

        ns.tprint(`Starting heal on ${target}, with ${weakenThreads} weaken threads (${formatRAM(weakenRam)}) and ${growThreads} grow threads (${formatRAM(growRam)}). Target: ${formatPct(1 + growthPct)}`);

        pids[target] =  [
            ns.exec(weakenFile, host, weakenThreads, target),
            ns.exec(growFile, host, growThreads, target),
        ];

        // Weaken is the longer time
        healDurations.push(ns.getWeakenTime(target));
    }

    while (Object.keys(pids).length) {
        for (const [target, localPids] of Object.entries(pids)) {
            if (ns.getServerMoneyAvailable(target) > (ns.getServerMaxMoney(target) * .75)) {
                // Successfully healed
                localPids.map(pid => ns.kill(pid));

                delete pids[target];

                ns.tprint(`Heal on ${target} complete`);
            }
        }

        await ns.sleep(Math.min(...healDurations));
    }
}