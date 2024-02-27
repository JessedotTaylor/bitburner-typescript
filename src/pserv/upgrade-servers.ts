import { NS } from '@ns';
import { calculateThreads, formatCurrency, validateArg } from 'utils/utils';

/** @param {NS} ns */
export async function main(ns: NS) {
  let ram = validateArg<number>(ns, ns.args[0] || 128, 'number');

  let canUpgrade = true;
  if (ram >= 1048576) {
    canUpgrade = false;
    ram = 1048576;
  }

  const file = "basic-hack.js";

  const serverCost = ns.getPurchasedServerUpgradeCost('pserv-24', ram)
  const result = await ns.prompt(
    `Servers will cost ${formatCurrency(serverCost)} ea. (${formatCurrency(serverCost * ns.getPurchasedServerLimit())} total)`,
    {
      type: 'boolean'
    }
  );
  if(!result) {
    return;
  }



  const playerServers = Array(25).fill(0).map((_, i) => 'pserv-'+ i);

  let i = 0;

  while (i < ns.getPurchasedServerLimit()) {
    const server = playerServers[i];

    if (ns.getServerMoneyAvailable('home') > ns.getPurchasedServerUpgradeCost(server, ram)) {
      ns.upgradePurchasedServer(server, ram);
      ++i;
    }

    await ns.sleep(1000);
  }

  // Automatically start the process of upgrading the pserv's to the next ram threshold
  ns.exec('pserv/upgrade-servers.js', 'home', 1, ram * 4);
}