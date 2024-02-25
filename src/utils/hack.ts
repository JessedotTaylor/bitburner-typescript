import { NS } from '@ns';

export function isServerBelowSecurityThresh(ns: NS, server: string): boolean {
    return ns.getServerSecurityLevel(server) < (ns.getServerMinSecurityLevel(server) + 5)
}