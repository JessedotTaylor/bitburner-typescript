
import { NS } from "@ns";
import { readFile } from "utils/file";
import { isServerBelowSecurityThresh } from "utils/hack";
import { formatTable, ITableHeader } from "utils/tableUtils";
import { formatCurrency, discoverServers } from "utils/utils";
import { getInformationOnHackTargets, getServerMoneyString, ITargetData } from "/utils/dashboard";

/**
 * Objectives:
 * 1. Get summary of all active targets (Weaken Threads, Hack Threads, $ / sec, exp / sec)
 */
export async function main(ns: NS) {

    ns.disableLog('getServerMaxMoney');
    ns.disableLog('sleep');
    ns.disableLog('getServerMoneyAvailable');
    ns.disableLog('getServerSecurityLevel');
    ns.disableLog('getServerMinSecurityLevel');

    ns.tail();

    while (true) {
        ns.clearLog();

        const targets = getInformationOnHackTargets(ns);

        const headers: ITableHeader<{
            name: string; 
            action: string; 
            fDollarPerSec: string;
            fWeakenRatio: string;
            expPerSec: number;
            money: string;
        }>[] = [
            {key:'name', name: 'Target', cellWidth: 20},
            {key: 'fWeakenRatio', name: 'Weaken Ratio', cellWidth: 18 },
            {key: 'money', name: '$', cellWidth: 32},
            {key: 'fDollarPerSec', name: '$ / s', cellWidth: 12, format: 0},
            {key: 'expPerSec', name: 'xp / s', cellWidth: 8, format: 0},
            {key: 'action', name: 'Action', cellWidth: 20}
        ];

        const data = Object.values(targets).map(t => {
            return {
                ...t,
                fDollarPerSec: formatCurrency(t.dollarPerSec),
                fWeakenRatio: `${t.weakenThreads}:${t.hackThreads} (${(t.weakenThreads/t.weakenThreads).toFixed(0)}:${(t.hackThreads/t.weakenThreads).toFixed(0)})`,
                action: getAction(ns, t),
                money: getServerMoneyString(ns, t.name),
            }
        });
        // Add spacer row for bottom footer
        data.push({
            fDollarPerSec: '',
            fWeakenRatio: '',
            action: '',
            money: '',
            name: '',
            weakenThreads: 0,
            weakenRam: 0,
            hackThreads: 0,
            hackRam: 0,
            totalRam: 0,
            dollarPerSec: 0,
            expPerSec: 0,
            growThreads: 0,
            growRam: 0
        });
        const totalHackThreads =  data.reduce((acc, t) => acc + t.hackThreads, 0);
        const totalWeakenThreads = data.reduce((acc, t) => acc + t.weakenThreads, 0);
        data.push({
            name: 'Totals',
            fDollarPerSec: formatCurrency(data.reduce((acc, t) => acc + t.dollarPerSec, 0)),
            fWeakenRatio: `${totalWeakenThreads}:${ totalHackThreads} (${(totalWeakenThreads/totalWeakenThreads).toFixed(0)}:${( totalHackThreads/totalWeakenThreads).toFixed(0)})`,
            action: '',
            money: formatCurrency(data.filter(t => !!t.name).reduce((acc, t) => acc + ns.getServerMaxMoney(t.name), 0)),
            weakenThreads: totalWeakenThreads,
            hackThreads: totalHackThreads,
            growThreads: data.reduce((acc, t) => acc + t.growThreads, 0),
            expPerSec: data.reduce((acc, t) => acc + t.expPerSec, 0),
            dollarPerSec: data.reduce((acc, t) => acc + t.dollarPerSec, 0),
            weakenRam: data.reduce((acc, t) => acc + t.weakenRam, 0),
            hackRam: data.reduce((acc, t) => acc + t.hackRam, 0),
            growRam: data.reduce((acc, t) => acc + t.growRam, 0),
            totalRam: data.reduce((acc, t) => acc + t.totalRam, 0),
        })

        ns.print(formatTable(ns, data, headers, {}));

        await ns.sleep(1000);
    }
}


function getAction(ns: NS, t: ITargetData): string {
    const server = t.name;
    if (!t.hackThreads && !t.weakenThreads && !t.growThreads) {
        return '--';
    }
    if (t.growThreads && !t.hackThreads) {
        return 'Healing';
    }
    if (t.growThreads && t.hackThreads && t.hackThreads) {
        return 'Scheduler cont.'
    }
    if (!isServerBelowSecurityThresh(ns, server)) {
        return 'Weaken';
    }
    if (ns.getServerMoneyAvailable(server) < (ns.getServerMaxMoney(server) * 0.01)) {
        return 'Recommend Healing';
    }
    if (ns.getServerMoneyAvailable(server) < (ns.getServerMaxMoney(server) * 0.80)) {
        return 'Grow';
    }
    if (ns.getServerMoneyAvailable(server) < (ns.getServerMaxMoney(server) * 0.95)) {
        return 'Hack / Grow';
    }

    return 'Hack';
}

