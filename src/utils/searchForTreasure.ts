import { NS } from "@ns";
import { discoverServers, validateArg } from "utils/utils";
import { CustomLogger } from "utils/customLogger";

export async function main(ns:NS) {
    const logger = new CustomLogger(ns, 'INFO', 'tprint');
    
    const maxDepth = validateArg<number>(ns, ns.args[0], 'number');

    const servers = discoverServers(ns, undefined, [], 0, maxDepth);

    for (const server of servers) {
        if (server == 'home') {
            continue
        }
        const files = ns.ls(server);
        logger.debug(`Found ${files.length} files on ${server}`);

        for (const file of files) {
            if (file.includes('hacks') || file.includes('.js')) {
                logger.debug(`Found ${file} on ${server}, skipping`);
                continue; // Do nothing, this is overseer or scheduler
            } else if (file.includes('.lit') || file.includes('cct')) {
                logger.info(`Found ${file} on ${server}!`);
                ns.exec('utils/pathToTarget.js', 'home', 1, server);
            } else {
                logger.warn(`Found unsupported file ${file} on ${server}! No action taken`);
            }
        }
    }
}