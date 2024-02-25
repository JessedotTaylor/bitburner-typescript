import { NS } from '@ns';
import { readFile } from 'utils/file';
import { formatCurrency } from 'utils/utils';

export function getServerHackingLevel(ns: NS, server: string): { serverHackLvl: number; perc: number} {
  const serverHackLvl = ns.getServerRequiredHackingLevel(server);
  const currHackLvl = ns.getHackingLevel();
  
  const perc = serverHackLvl / currHackLvl;
  return {
    perc,
    serverHackLvl
  }
}

export function getServerHackLevelString(ns: NS, server: string) {
  const {perc, serverHackLvl } = getServerHackingLevel(ns, server);
  return `${serverHackLvl.toFixed()} (${(perc * 100).toFixed()} %)`
}

export function getServerSecurityLevel(ns: NS, server: string): { curr: number; min: number; delta: number} {
  const curr = ns.getServerSecurityLevel(server);
  const min = ns.getServerMinSecurityLevel(server);
  
  const delta = curr - min;
  return { curr, min, delta}
}

export function getServerSecurityLevelString(ns: NS, server: string): string {
  const { curr, min, delta } = getServerSecurityLevel(ns, server);
  
  const deltaStr = delta > 0 ? `(+${delta.toFixed(2)})` : '';
  return `${curr.toFixed(2)} / ${min.toFixed(0)} ${deltaStr}`
}

export function getServerMoney(ns: NS, server: string): { curr: number; max: number; perc: number} {
  const max = ns.getServerMaxMoney(server);
  const curr = ns.getServerMoneyAvailable(server);
  const perc = curr / max;

  return { curr, max, perc }
}

export function getServerMoneyString(ns: NS, server: string) {
  const { max, curr, perc } = getServerMoney(ns, server);

  if (!max || !curr) {
    return '--';
  }

  return `${formatCurrency(curr)} / ${formatCurrency(max)} (${(perc * 100).toFixed()} %)`;
}





export interface ITargetData {
  name: string;
  weakenThreads: number;
  weakenRam: number;
  hackThreads: number;
  hackRam: number;
  growThreads: number;
  growRam: number;
  totalRam: number;
  dollarPerSec: number;
  expPerSec: number;
}


interface ITargetDataObj {
  [key: string]: ITargetData;
};

export function getInformationOnHackTargets(ns: NS): ITargetDataObj {
  const targets: ITargetDataObj = {};
  const hosts = readFile(ns, 'db/spider/hosts.txt');
  
  for (const host of hosts) {
    const scripts = ns.ps(host);
    for (const script of scripts) {
      const runningScript = ns.getRunningScript(script.pid)!;
      if (script.filename.includes('weaken')) {
        const target = getTarget(targets, script.args[0] as string);
        target.weakenThreads += script.threads;
        const ram = script.threads * runningScript.ramUsage
        target.weakenRam += ram;
        target.totalRam += ram;
        target.expPerSec += ns.getScriptExpGain(script.filename, host, ...script.args);
      } else if (script.filename.includes('hack.')) { // Use trailing . to filter for scripts in the 'hacks' directory
        const target = getTarget(targets, script.args[0] as string);
        target.hackThreads += script.threads;
        const ram = script.threads * runningScript.ramUsage;
        target.hackRam += ram;
        target.totalRam += ram;
        target.dollarPerSec += ns.getScriptIncome(script.filename, host, ...script.args);
        target.expPerSec += ns.getScriptExpGain(script.filename, host, ...script.args);
      } else if (script.filename.includes('grow')) {
        const target = getTarget(targets, script.args[0] as string);

        // ns.print(`INFO: Found grow script on host: ${host} targeting ${target.name}\n${script.filename} ${script.args}`)

        target.growThreads += script.threads;
        const ram = script.threads * runningScript.ramUsage;
        target.growRam += ram;
        target.totalRam += ram;
        target.expPerSec += ns.getScriptExpGain(script.filename, host, ...script.args);
      }
    }
  }

  return targets;
}

function getTarget(targets: ITargetDataObj, host: string): ITargetData {
  if (!targets[host]) {
    targets[host] = {
      name: host,
      weakenThreads: 0,
      weakenRam: 0,
      hackThreads: 0,
      hackRam: 0,
      growThreads: 0,
      growRam: 0,
      totalRam: 0,
      dollarPerSec: 0,
      expPerSec: 0,
    };
  }
  return targets[host];
}