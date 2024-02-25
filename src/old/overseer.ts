import { NS } from '@ns';
import { calculateThreads, formatCurrency, validateArg } from '../utils/utils';
/** @param {NS} ns */
export async function main(ns: NS) {
    const target = validateArg<string>(ns, ns.args[0], 'string');
    // const availableServers = getAvailableServers();
    // const availableServers = ns.scan();
    // availableServers.filter(s => ns.hasRootAccess(s));
    const availableServers = ["home"];
    if (ns.hasRootAccess(target)) {
        ns.print(`!Don't have root access to target: ${target}`);
    }
    for (const server of availableServers) {
        ns.killall(server, true); // Kill any old deployments
    }
    // Weaken Phase
    ns.tprint(`Starting weaken phase against ${target} (Current: ${ns.getServerSecurityLevel(target)}; Min: ${ns.getServerMinSecurityLevel(target)})`);
    const weakenFile = "hacks/weaken.js";
    const weakenScriptRam = ns.getScriptRam(weakenFile, "home");
    for (const server of availableServers) {
        // Check that target hasn't already been broken
        if (!(ns.getServerSecurityLevel(target) > (ns.getServerMinSecurityLevel(target) + 5))) {
            break;
        }
        if (!ns.scriptRunning(weakenFile, server)) {
            ns.scp(weakenFile, server, "home");
            const threads = calculateThreads(ns, server, weakenFile);
            ns.exec(weakenFile, server, threads, target);
        }
        await ns.sleep(1000 * 30);
    }
    while (ns.getServerSecurityLevel(target) > (ns.getServerMinSecurityLevel(target) + 5)) {
        await ns.sleep(1000);
    }
    // Attack Phase
    ns.tprint(`Starting attack phase against ${target} (${formatCurrency(ns.getServerMoneyAvailable(target))} / ${formatCurrency(ns.getServerMaxMoney(target))})`);
    const hackFile = "hacks/flexihack.js";
    const hackScriptRam = ns.getScriptRam(hackFile, "home");
    const totalAvailableRam = availableServers.map(s => ns.getServerMaxRam(s)).reduce((a, b) => a + b, 0);
    const ramDivisions = Math.floor(totalAvailableRam / 7); // Assuming a 1:6 ratio of weaken to flexihack
    let weakenRam = ramDivisions * 1;
    let flexihackRam = ramDivisions * 6;
    for (const server of availableServers) {
        // Kill any running scripts (Previous weaken attacks)
        ns.killall(server, true);
        let remainingRam = ns.getServerMaxRam(server);
        if (server == 'home') {
            remainingRam -= ns.getServerUsedRam(server); // The overseer script is likely running
            remainingRam -= 100; // Leave some RAM spare for 'other' activities
        }
        if (weakenRam > 0) {
            let threads = 0;
            if (ns.getServerMaxRam(server) < weakenRam) { // Devote entire server to weaken
                threads = calculateThreads(ns, server, weakenFile);
                remainingRam = 0;
            }
            else { // Partial server given to weaken
                threads = Math.floor(weakenRam / weakenScriptRam);
                remainingRam -= weakenRam;
            }
            ns.exec(weakenFile, server, threads, target);
            weakenRam -= ns.getServerMaxRam(server);
        }
        if (flexihackRam > 0 && remainingRam > 0) { // Deploy hackers
            const threads = Math.floor(remainingRam / hackScriptRam);
            const moneyThresh = ns.getServerMaxMoney(target) * 0.95;
            ns.scp(hackFile, server, "home");
            ns.exec(hackFile, server, threads, target, moneyThresh);
        }
        // Stagger deployment (1 / min)
        await ns.sleep(1000 * 30);
    }
}
function getAvailableServers() {
    // Only use player servers for now
    return Array(25).fill('').map((_, i) => 'pserv-' + i);
}
