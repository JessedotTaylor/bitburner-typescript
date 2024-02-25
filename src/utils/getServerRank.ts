import { NS } from '@ns';

export function getServerRank(ns: NS, server: string): number {
  // Calculate the 'rank' of a server, based on how close to 1/2 hack lvl + max money
  const serverHackLvl = ns.getServerRequiredHackingLevel(server);
  const currHackLvl = ns.getHackingLevel();
  if (serverHackLvl > currHackLvl) {
    return 0;
  }

  const perc = serverHackLvl / currHackLvl;

  const hackDiff = Math.abs(perc - 0.5) || 0.0001;

  const maxMoney = ns.getServerMaxMoney(server) / 1e6;
  // const growthRate = ns.getServerGrowth(server) / 100;
  // const formula = ((maxMoney / hackDiff) * growthRate);
  const formula = (maxMoney / hackDiff);

  return formula;
}
