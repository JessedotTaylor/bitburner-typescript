import { NS } from "@ns";

export async function main(ns: NS) {
    const target = ns.args[0];
    if (typeof target != 'string') {
        ns.tprint(`Unexpected type for arg0: ${typeof target}`);
        return
    }

    const moneyThresh = ns.args[1];
    if (typeof moneyThresh != 'number') {
        ns.tprint(`Unexpected type for arg1: ${typeof target}`);
        return
    }

    while (true) {
      if(ns.getServerMoneyAvailable(target) < moneyThresh) {
        await ns.grow(target)
      } else {
        await ns.hack(target);
      }
    }
  
  }