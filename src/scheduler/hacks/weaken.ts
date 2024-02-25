import { NS } from '@ns';

export async function main(ns: NS) {
    const target = ns.args[0] as string;
    const port = ns.args[1] as number;

    const weakenResult = await ns.weaken(target);

    ns.tryWritePort(port, weakenResult);
}