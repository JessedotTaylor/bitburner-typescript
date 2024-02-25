import { discoverServers, formatCurrency, validateArg } from 'utils/utils';
import { ITableHeader, formatTable } from 'utils/tableUtils';
import { NS } from '@ns';
import { getServerRank } from 'utils/getServerRank';
import { getServerHackLevelString, getServerMoney, getServerMoneyString } from '/utils/dashboard';

interface IDashboardTableData {
    name: string;
    root: string;
    ports: string;
    ram: string;
    sLevel: string;
    hLevel: string;
    money: string;
    rank: string;
    growthRate: string;
}

/** @param {NS} ns */
export async function main(ns: NS) {
  const excludedServerSet = new Set(['home', 'darkweb',].concat(Array(25).fill('').map((_, i) => 'pserv-' + i)))

  // let servers = ['the-hub', 'omega-net']
  let servers = discoverServers(ns, undefined, [], 0, validateArg<number>(ns, ns.args[0] ?? 1, 'number'))
  servers = servers.filter(s => !excludedServerSet.has(s));

  let headers: ITableHeader<IDashboardTableData>[] = [
    {key: 'name', cellWidth: 20, name: 'Name'}, 
    {key: 'root', cellWidth: 6, name: 'Root'},
    {key: 'ports', cellWidth: 6, name: 'Ports'}, 
    {key: 'ram', cellWidth: 5, name: 'RAM'}, 
    {key: 'sLevel', cellWidth: 16, name: 'Sec Lvl'},
    // {key: 'sLevelMin', cellWidth: 6, name: 'SL Min'}, 
    {key: 'hLevel', cellWidth: 16, name: 'Hack Lvl'}, 
    {key: 'money', cellWidth: 24, name: '$'},
    {key: 'growthRate', cellWidth: 16, name: 'Growth Rate'},
    {key: 'rank', cellWidth: 16, name: 'Rank', sort: 'desc'},
    // {key: 'rank', cellWidth: 24, name: 'Rank'},

    ];
  let data: IDashboardTableData[] = [];

  for (const server of servers) {
    data.push({
      name: getServerName(ns, server),
      root: getServerRoot(ns, server),
      ports: ns.getServerNumPortsRequired(server).toFixed(),
      ram: getServerRam(ns, server),
      sLevel: getServerSecurity(ns, server),
      hLevel: getServerHackLevelString(ns, server),
      money: getServerMoneyString(ns, server),
      rank: getServerRank(ns, server).toFixed(0),
      growthRate: ns.getServerGrowth(server).toFixed(0)
    });
  }

  formatTable(ns, data, headers, {printToConsole: true});
}


function getServerName(ns: NS, server: string) {
  return server
}

/**
 * @param {NS} ns
 */
function getServerRoot(ns: NS, server: string) {
  return ns.hasRootAccess(server) ? 'Y' : 'N';
}
/**
 * @param {NS} ns
 */
function getServerRam(ns: NS, server: string) {
  return ns.getServerMaxRam(server).toFixed(0);
}
/**
 * @param {NS} ns
 */
function getServerSecurity(ns: NS, server: string) {
  return `${ns.getServerSecurityLevel(server).toFixed(1)} / ${ns.getServerMinSecurityLevel(server).toFixed(1)}`
}