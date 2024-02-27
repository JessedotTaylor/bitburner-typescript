import { NS } from '@ns';

/**
* Recursively searches for all servers connected to the provided host, through any connection level
* 
* @param {NS} ns
* @param {string} host Current host to scan
* @param {string[]} servers Found list of servers
* @param {number} depth The current depth of the search
* @param {number | undefined} maxDepth An optional limiter on the depth of the search
* @returns {string[]} Complete list of found servers
*/
export function discoverServers(
  ns: NS, 
  host: string | undefined = undefined, 
  servers: string[] | undefined = [], 
  depth: number = 0, 
  maxDepth: number | undefined = undefined
): string[] {
  if (maxDepth && depth > (maxDepth  + 1)) {
    return servers;
  }
  const localServers = ns.scan(host);
  for (const server of localServers) {
    if (!servers.includes(server)) {
      servers.push(server);
      discoverServers(ns, server, servers, depth + 1, maxDepth);
    }
  }
  return servers;
}

/**
* Gets the maximum number of threads that the provided script can run with on the provided server
* 
* @param {NS} ns
* @param {string} server The target server to calculate the threads for
* @param {string} file The script to calculate the threads for. Must exist on the home server
* @returns {number} The number of threads
*/
export function calculateThreads(ns: NS, server: string, file: string): number {
  const maxRam = ns.getServerMaxRam(server);
  const usedRam = ns.getServerUsedRam(server);
  return Math.floor((maxRam - usedRam) / ns.getScriptRam(file, "home"));
}

/**
* @param {number} value
* @returns {string}
*/
export function formatCurrency(value: number): string {
  const increments = {
    't': 1e12,
    'b': 1e9,
    'm': 1e6,
    'k': 1e3,
    '': 1
  }
  for (let [power, divisor] of Object.entries(increments)) {
    // const divisor = increments[i];
    let remainder = Math.abs(value) / divisor;
    if (remainder > 1) {
      return `\$${remainder.toFixed(1)}${power}`;
    }
  }
  return value.toFixed(1);
}

export function validateArg<T extends string | number | boolean | undefined>(ns: NS, value: unknown, expectedType: 'string' | 'number' | 'boolean' | 'undefined'): T {
  if (typeof value != expectedType) {
    ns.tprint(`!Unexpected arg0 type: ${typeof value}`);
    throw new UnexpectedArgTypeError(value, expectedType);
  }
  return value as T;
}

export class UnexpectedArgTypeError extends Error {
  constructor(
    val: unknown,
    type: 'string' | 'number' | 'boolean' | 'undefined'
  ) {
    super(`Argument: ${val} does not match expected type: ${type}`)
  }
}

export function formatMilliseconds(milliseconds: number, printMs: boolean = false): string {
  let seconds = milliseconds / 1000;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const millisecs = Math.floor(milliseconds % 1000);

  let outStr = '';
  if (hours > 0)
    outStr += `${hours}h `;
  if (minutes > 0)
    outStr += `${minutes}m `;
  if (secs > 0) 
    outStr += `${secs}s`;
  if (printMs)
   outStr += `:${millisecs.toPrecision(3)}ms`;

  return outStr;
}

export function formatRAM(ramGB: number): string {
  const increments = {
    'ZB': 1e12,
    'EB': 1e9,
    'PB': 1e6,
    'TB': 1e3,
    'GB': 1
  }
  for (let [power, divisor] of Object.entries(increments)) {
    let remainder = ramGB / divisor;
    if (remainder >= 1) {
      return `${remainder.toFixed(1)}${power}`;
    }
  }
  return ramGB.toFixed(0);
}
/**
 * Format an imput number as a percentage. 0 = 0%; 1 = 100%
 * @param pct 
 * @param precision 
 * @returns 
 */
export function formatPct(pct: number, precision: number = 3): string {
  return `${(pct * 100).toPrecision(precision)}%`
}
