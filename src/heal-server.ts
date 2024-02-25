import { NS } from '@ns';
import { validateArg } from './utils/utils';

export async function main(ns:NS) {
    const target = validateArg<string>(ns, ns.args[0], 'string');
    const targets = [target];
    // const targets = ['the-hub', 'computek', 'crush-fitness', 'johnson-ortho'];

    const totalvailableRam = (ns.getServerMaxRam('home') - ns.getServerUsedRam('home')) * 0.75;
    const availableRam = totalvailableRam / targets.length;

    const weakenFile = "hacks/weaken.js";
    const weakenScriptRam = ns.getScriptRam(weakenFile, "home");
  
    const growFile = "hacks/grow.js";
    const growScriptRam = ns.getScriptRam(growFile, "home");

    const ramDivisions = Math.floor(availableRam / 7);

    const weakenThreads = Math.floor(ramDivisions / weakenScriptRam);
    const growThreads = Math.floor((ramDivisions * 6) / growScriptRam);

    const pids: {[key:string]: number[]} = {};
    const healDurations: number[] = [];

    for (const target of targets) {
        ns.tprint(`Starting heal on ${target}, with ${weakenThreads} weaken threads and ${growThreads} grow threads`);

        pids[target] =  [
            ns.exec(weakenFile, "home", weakenThreads, target),
            ns.exec(growFile, "home", growThreads, target),
        ];

        healDurations.push(ns.getGrowTime(target));
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