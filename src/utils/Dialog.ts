import { NS } from '@ns';
import { makeStringWidth } from 'utils/string';

export class Dialog {
  constructor(
    protected ns: NS,
    public width: number = 50
  ) {
  }

  start() {
    this.ns.disableLog('ALL');
    this.ns.tail();
  }

  addRow(start: string, finish?: string) {
    return this.ns.print(' ' + makeStringWidth(this.width, start, finish));
  }

}