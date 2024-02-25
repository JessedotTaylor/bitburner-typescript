import { NS } from '@ns'
import { isServerBelowSecurityThresh } from '/utils/hack';
import { KeyValueAsTable } from '/utils/tableUtils';

export async function main(ns:NS) {
    // const dets = ns.getHackingMultipliers();

    // KeyValueAsTable(ns, dets)
    // ns.tprint(dets)
    // ns.tprint(isServerBelowSecurityThresh(ns, 'the-hub'))
    // ns.tprint(ns.weakenAnalyze(1));

    // let i = 0;
    // let values: number[] = [];
    // const valuesCap = 100;

    // ns.disableLog('sleep');

    // while(true) {
    //     // ns.print(ns.getPlayer().money)

    //     const x = Math.sin(i) + 1;
    //     ns.print('i:', i);
    //     ns.print('x:', x);
    //     values.push(x);
    //     if (values.length > valuesCap) {
    //         values = values.slice(values.length - valuesCap);
    //     }
    //     const sumValues = values.reduce((a, b) => a + b, 0);
    //     const totalValues = values.length;
    //     const avg = sumValues / totalValues;
    //     ns.print(`Sum: ${sumValues.toFixed(2)} Total: ${totalValues.toFixed(2)}`);
    //     ns.print(`Avg: ${avg.toFixed(2)}`);
    //     ns.print('\n\n');
    //     i += 0.1;

    //     await ns.sleep(1000);
    // }

    ns.tprint(`INFO: ${ns.growthAnalyze('computek', 1.001)}`);
}