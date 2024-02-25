import { NS } from '@ns';

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
    return this.ns.print(this.makeStringWidth(start, finish));
  }

  private makeStringWidth(start: string, finish?: string): string {
    const parsedFinish = finish || '';
    const padding = this.width - (start.length + parsedFinish.length);
    if (padding <= 0)
      return start + finish;

    return ' ' + start + ' '.repeat(padding) + parsedFinish;
  }
}