import { NS } from '@ns';

export async function main(ns: NS) {
    const target = ns.args[0] as string;
    const port = ns.args[1] as number;

    const growMultiplier = await ns.grow(target);

    ns.tryWritePort(port, growMultiplier);
}