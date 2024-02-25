import { NS } from '@ns';
import { calculateThreads, formatCurrency, validateArg } from 'utils/utils';

/** @param {NS} ns */
export async function main(ns: NS) {
  // let ram = 16;
  // let i = 0;

  // while (ram < 1048576 && i < 100) {
  //   const cost = ns.getPurchasedServerUpgradeCost('pserv-0', ram);
  //   ns.upgradePurchasedServer('pserv-0', )
  //   ns.tprint(`${ram} GB: \$${cost / 1e6}m`);

  //   ram = ram * 2;
  //   ++i;
  // }

  const ram = validateArg<number>(ns, ns.args[0] || 128, 'number');

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
  // playerServers.push('pserv-1-0');
  // ns.print(playerServers);

  let i = 0;

  while (i < ns.getPurchasedServerLimit()) {
    const server = playerServers[i];

    if (ns.getServerMoneyAvailable('home') > ns.getPurchasedServerUpgradeCost(server, ram)) {
      ns.upgradePurchasedServer(server, ram);

      // ns.scp(file, server);

      // const threads = calculateThreads(ns, server, file);
      // ns.exec(file, server, threads, "joesguns");
      // // ns.exec("connect.js", server, undefined, "joesguns");
      ++i;
    }

    await ns.sleep(1000);
  }

}