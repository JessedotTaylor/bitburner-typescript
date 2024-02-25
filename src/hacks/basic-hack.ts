import { NS } from "@ns";

export async function main(ns: NS) {
    const target = ns.args[0];
    if (typeof target != 'string') {
        ns.tprint(`Unexpected type for arg0: ${typeof target}`);
        return
    }
  
    const moneyThresh = ns.getServerMaxMoney(target);
  
    const securityThresh = ns.getServerMinSecurityLevel(target);
  
    while (true) {
      if (ns.getServerSecurityLevel(target) > (securityThresh * 2)) {
        await ns.weaken(target);
      } else if (ns.getServerMoneyAvailable(target) < (moneyThresh * 0.9)) {
        await ns.grow(target);
      } else {
        await ns.hack(target);
      }
    }
  
  }