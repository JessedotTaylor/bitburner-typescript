import { NS } from '@ns'
import { validateArg } from 'utils/utils';

export async function main(ns: NS) {
    const target = validateArg<string>(ns, ns.args[0], 'string');

    const path = findTarget(ns, target);
    if (path) {
        ns.tprint(path);
    } else {
        ns.tprint(`!No path to target: ${target} found`);
    }
    
}

function findTarget(ns: NS, target: string): string | undefined {
    const discoveredServers:string[] = [];
    const exploreQueue = ['home'];

    while (exploreQueue.length) {
        const path = exploreQueue.shift()!;
        const host = path.split(' > ').reverse()[0];
        const servers = ns.scan(host);
    
        for (const server of servers) {
            if (!discoveredServers.includes(server)) {
                discoveredServers.push(server);
                exploreQueue.push(`${path} > ${server}`);
            }

            if (server === target) {
                return `${path} > ${server}`;
            }
        }
    }

    return;
}