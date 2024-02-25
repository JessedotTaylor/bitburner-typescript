import { NS } from "@ns";

/** @param {NS} ns */
export async function main(ns: NS) {
    const target = ns.args[0];
    if (typeof target != 'string') {
        ns.tprint(`Unexpected type for arg0: ${typeof target}`);
        return
    }
    while (true) {
      await ns.weaken(target);
    }
  }