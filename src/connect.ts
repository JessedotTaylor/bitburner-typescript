import { NS } from '@ns';
import { discoverServers, validateArg } from './utils/utils';

/** @param {NS} ns */
export async function main(ns: NS) {


  // const target = ns.args[0];
  // const servers = [target];

  const maxDepth = validateArg<number>(ns, ns.args[0], 'number');
  
  const servers = discoverServers(ns, undefined, [], 0, maxDepth);
  servers.filter(s => !s.includes('pserv'));
  ns.print(`Found targets: ${servers}`);

  let crackablePorts = 0;
  if(ns.fileExists("FTPCrack.exe", "home")) crackablePorts++;
  if (ns.fileExists("bruteSSH.exe", "home")) crackablePorts++;

  for (const target of servers) {
    const serverHackLevel = ns.getServerRequiredHackingLevel(target);
    const requiredPorts = ns.getServerNumPortsRequired(target);

    if (serverHackLevel > ns.getHackingLevel() || requiredPorts > crackablePorts) {
      ns.tprint(`Skipping setup on target: ${target} (Hack Level: ${serverHackLevel} Ports: ${requiredPorts})`)
      continue;
    }
    
    ns.print(`Attempting setup to target: ${target} (${serverHackLevel})`);

    const file = "hacks/basic-hack.js"
    ns.scp(file, target, "home");
    ns.print(`Copied 'basic-hack.js' to ${target}`);

    if(ns.fileExists("FTPCrack.exe", "home")) {
      ns.ftpcrack(target);
    }

    if (ns.fileExists("bruteSSH.exe", "home")) {
     ns.brutessh(target);
    }

    ns.nuke(target)
    ns.print(`Nuked ${target}`);

    // Don't kill existing instances, to avoid reseting progress on servers
    if (!ns.scriptRunning(file, target)) {

      const maxRam = ns.getServerMaxRam(target);
      const usedRam = ns.getServerUsedRam(target);
      const threads = Math.floor((maxRam - usedRam) / ns.getScriptRam(file, "home"));
      ns.print(`Can start ${threads} threads on ${target}. (Max: ${maxRam}GB; Used: ${usedRam}GB)`);


      ns.exec(file, target, threads, "joesguns");
      ns.tprint(`Started ${file} on ${target} with ${threads} threads`);
    }
  }
}
