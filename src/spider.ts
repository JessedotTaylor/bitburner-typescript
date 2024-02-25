import { NS } from '@ns';
import { getServerRank } from './utils/getServerRank';
import { formatTable, ITableHeader } from './utils/tableUtils';
import { formatCurrency as cF, validateArg } from './utils/utils';
 
interface IServerData {
    name: string;
    root: boolean,
    ram: number,
    security: {
        min: number,
        curr: number
    },
    money: {
        max: number,
        curr: number
    },
    hackLvl: number,
    ports: number,
    rank: number,
}
/**
 * Objective: To get a list of hackable servers, sorted by 'rank', and a list of hacked servers we can use as hosts
 */
export async function main(ns: NS) {
    const maxDepth = validateArg<number>(ns, ns.args[0] || 1, 'number');

    const discoveredServers: Set<string> = new Set(['darkweb', 'home']);
    const exploreQueue: {host: string; depth: number}[] = [{host: 'home', depth: 0}];

    const servers:IServerData[] = [
        {
            name: 'home',
            root: true,
            ram: ns.getServerMaxRam('home'),
            security: {
                min: 999,
                curr: 999
            },
            money: {
                max: 0,
                curr: 0
            },
            hackLvl: 1,
            ports: 99,
            rank: 0
        }
    ];

    // Discover all servers, try to hack them, and store their info
    while (exploreQueue.length) {
        const host = exploreQueue.shift()!;
        const scanServers = ns.scan(host.host);

        for (const server of scanServers) {
            if (!discoveredServers.has(server) && host.depth < maxDepth) {
                discoveredServers.add(server);
                exploreQueue.push({host: server, depth: host.depth + 1});

                const serverData = {
                    name: server,
                    root: ns.hasRootAccess(server),
                    ram: ns.getServerMaxRam(server),
                    security: {
                        min: ns.getServerMinSecurityLevel(server),
                        curr: ns.getServerSecurityLevel(server)
                    },
                    money: {
                        max: ns.getServerMaxMoney(server),
                        curr: ns.getServerMoneyAvailable(server)
                    },
                    hackLvl: ns.getServerRequiredHackingLevel(server),
                    ports: ns.getServerNumPortsRequired(server),
                    rank: getServerRank(ns, server)
                }

                if (hackServer(ns, server)) {
                    serverData.root = ns.hasRootAccess(server);
                }

                servers.push(serverData);
            }
        }
    }

    // Sort in desc order
    const hackTargets: string[] = servers.filter(s => s.rank > 0).sort((a,b) => b.rank - a.rank).map(s => s.name);
    ns.write('db/spider/hack_targets.txt', hackTargets.join('\n'), 'w'); 

    // Sort to use servers with lowest ram first (Avoid using pserv and home too early)
    ns.print(servers);

    const hosts: string[] = servers.filter(s => s.root).sort((a,b) => a.ram - b.ram).map(s => s.name);
    ns.write('db/spider/hosts.txt', hosts.join('\n'), 'w');

    const headers: ITableHeader<IServerData & {category: string, formattedMoney: string;}>[] = [
        {key: 'name', cellWidth: 24, name: 'Name'},
        { key: 'ram', cellWidth: 7, name: 'RAM', format: 0 },
        {key: 'formattedMoney', cellWidth: 24, name: '$'},
        {key: 'rank', cellWidth: 24, name: 'Rank', sort: 'desc', format: 0},
        {key: 'category', cellWidth: 24, name: 'Category'},
    ];

    formatTable(
        ns,
        servers.map(s => {
            return {
                ... s,
                category: hackTargets.includes(s.name) ? 'Target' : hosts.includes(s.name) ? 'Host' : '--',
                formattedMoney: formatMoney(s),
            }
        }),
        headers,
        {printToConsole: true}
    )

}

function hackServer(ns: NS, server: string): boolean {
    if (ns.hasRootAccess(server)) { // If we already have root, don't bother re-hacking
        return true;
    }
    if (ns.getServerRequiredHackingLevel(server) > ns.getHackingLevel()) {
        return false;
    }
    let crackablePorts = 0;
    if (ns.fileExists("FTPCrack.exe", "home")) crackablePorts++;
    if (ns.fileExists("bruteSSH.exe", "home")) crackablePorts++;
    if (ns.fileExists("relaySMTP.exe", "home")) crackablePorts++;
    if (ns.fileExists("HTTPWorm.exe", "home")) crackablePorts++;
    if (ns.fileExists("SQLInject.exe", "home")) crackablePorts++;

    if (ns.getServerNumPortsRequired(server) > crackablePorts) {
        return false;
    }

    if (ns.fileExists('SQLInject.exe', 'home')) {
        ns.sqlinject(server);
    }
    if (ns.fileExists('HTTPWorm.exe', 'home')) {
        ns.httpworm(server);
    }
    if (ns.fileExists('relaySMTP.exe', 'home')) {
        ns.relaysmtp(server);
    }
    if (ns.fileExists('FTPCrack.exe', 'home')) {
        ns.ftpcrack(server);
    }
    if (ns.fileExists('bruteSSH.exe', 'home')) {
        ns.brutessh(server);
    }

    ns.nuke(server);

    return true;
}

function formatMoney(s: IServerData): string {
    if (s.money.max === 0) {
        return '--';
    }
    const perc = (s.money.curr / s.money.max) * 100
    return `${cF(s.money.max)} (${perc.toFixed(2)} %)`
}