export function makeStringWidth(width: number, start: string, finish?: string ): string {
    const parsedFinish = finish || '';
    const padding = width - (start.length + parsedFinish.length);
    if (padding <= 0)
      return start + parsedFinish;

    return start + ' '.repeat(padding) + parsedFinish;
  }
