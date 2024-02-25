import { NS } from '@ns';
import { calculateThreads, validateArg } from '../utils/utils';

/** @param {NS} ns */
export async function main(ns: NS) {
  const fileToCopy = validateArg<string>(ns, ns.args[0] || "basic-hack.js", "string");

  const playerServers = Array(25).fill('').map((_, i) => 'pserv-' + i);

  for (const server of playerServers) {
    ns.scriptKill(fileToCopy, server);

    ns.scp(fileToCopy, server, "home");

    const threads = calculateThreads(ns, server, fileToCopy);

    ns.exec(fileToCopy, server, threads, "omega-net");
  }
}