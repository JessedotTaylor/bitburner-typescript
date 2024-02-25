import { NS } from "@ns";

export async function main(ns: NS) {
    // const wrongServers = Array(4).fill('').map((_, i) => 'pserv-' + (i + 4) );

    for (let i = 0; i < 4; i++) {
        ns.renamePurchasedServer('pserv-' + (i + 4), 'pserv-' + i)
    }
}