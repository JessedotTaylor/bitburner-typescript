import { NS } from '@ns';
import { getInformationOnHackTargets, getServerHackLevelString, getServerMoneyString, getServerSecurityLevelString } from 'utils/dashboard';
import { formatCurrency, validateArg, formatMilliseconds, formatRAM } from 'utils/utils';
import { Dialog } from 'utils/Dialog';

/**
* Objective: Show 'live' operating stats of the 'target' server
* 
* Stats:
* - Name
* - Hack Level
* - Ports
* - Weaken
* - Flexihack
* - Heal? (If happening)
* - $ total
* - $ / sec
* - xp / sec
* - Security Lvl / Min Security Level
* - Hack / Grow / Weaken Timings
*/
export async function main(ns:NS) {
  const target = validateArg<string>(ns, ns.args[0], 'string');
  
  const dialog = new Dialog(ns);
  
  dialog.start();
  
  while (true) {
    // Render UI
    ns.clearLog();
    
    const targets = getInformationOnHackTargets(ns);
    const targetData = targets[target];
    
    dialog.addRow('Name:', target);
    dialog.addRow('Hack Level:', getServerHackLevelString(ns, target));
    dialog.addRow('Ports:', ns.getServerNumPortsRequired(target).toFixed(0));
    dialog.addRow('');
    dialog.addRow('Weaken Threads:', targetData?.weakenThreads.toFixed(0));
    dialog.addRow('Hack Threads:', targetData?.hackThreads.toFixed(0));
    if (targetData?.growThreads) dialog.addRow('Grow Threads:', targetData?.growThreads.toFixed(0));
    dialog.addRow('Attack RAM:', targetData ? formatRAM(targetData.totalRam): '');
    dialog.addRow('');
    dialog.addRow('$', getServerMoneyString(ns, target));
    dialog.addRow('$ / sec:', formatCurrency(targetData?.dollarPerSec || 0));
    dialog.addRow('xp / sec:', targetData?.expPerSec.toFixed(0));
    dialog.addRow('');
    dialog.addRow('Security: ', getServerSecurityLevelString(ns, target));
    dialog.addRow('Hack Time: ', formatMilliseconds(ns.getHackTime(target)));
    dialog.addRow('Grow Time: ', formatMilliseconds(ns.getGrowTime(target)));
    dialog.addRow('Weaken Time: ', formatMilliseconds(ns.getWeakenTime(target)));
    dialog.addRow('');
    dialog.addRow('Last Updated:', new Date().toLocaleTimeString())
    
    
    await ns.sleep(1000);
  }
}



