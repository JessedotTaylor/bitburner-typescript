import { NS } from "@ns";
import { formatCurrency, validateArg } from "utils/utils";

/** @param {NS} ns */
export async function main(ns: NS) {
    const ram = validateArg<number>(ns, ns.args[0] || 32, 'number');
    const serverCost = ns.getPurchasedServerCost(ram);
    const result = await ns.prompt(
      `Servers will cost ${formatCurrency(serverCost)} ea. (${formatCurrency(serverCost * ns.getPurchasedServerLimit())} total)`,
      {
        type: 'boolean'
      }
    );
    if (!result) {
      ns.exit()
    }
  
    let i = 0;
  
    while (i < ns.getPurchasedServerLimit()) {
      if (ns.getServerMoneyAvailable("home") > ns.getPurchasedServerCost(ram)) {
        let hostname = ns.purchaseServer("pserv-" + i, ram);
        // ns.scp("basic-hack.js", hostname);
        // ns.exec("basic-hack.js", hostname, 13, "joesguns");
        ++i;
      }
  
      await ns.sleep(1000);
    }
  }