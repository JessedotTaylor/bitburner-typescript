import { NS } from "@ns";

export interface ITableHeader<T extends object> { 
  key: keyof T; 
  cellWidth?: number | undefined; 
  sort?: string | undefined; 
  /* Optional formatting for the `toFixed` conversion. Only applies if the value is a number*/
  format?: number | undefined;
  name: string; 
}

export function KeyValueAsTable(ns: NS, object: object): void {
  interface IData {
    key: string;
    value: any
  }
  const data: IData[] = [];
  const headers: ITableHeader<IData>[] = [
    {key: 'key', name: 'Key'},
    {key: 'value', name: 'Value'},
  ];

  for (const [key, value] of Object.entries(object)) {
    data.push({key, value});
  };

  formatTable(ns, data, headers, {});
}

interface IFormatTableOpts {
  printToConsole?: boolean;
}

/**
 * Format a table onto the terminal
 * 
 * TODO:
 * - Add auto column formatting for max width
 * 
 */
export function formatTable<T extends object>(
  ns: NS, 
  data: T[], 
  headers: ITableHeader<T>[], 
  {
    printToConsole = false
  }: IFormatTableOpts 
): string {
  const outStr = ['']
    // ns.tprint(''); // Print empty spacer line
  
    // Generate Headers + Header divider line
    const headerObj: T = {} as T;
    const dividerObj: T = {} as T;
    for (const header of headers) {
      headerObj[header.key] = header.name + getSortIndicator(header) as unknown as T[keyof T];
      dividerObj[header.key] = '-'.repeat(64) as unknown as T[keyof T];
    }
  
    const sortHeader = headers.find(h => !!h.sort);
    if (sortHeader) {
      data = data.sort((a, b) => {
        const multi = sortHeader.sort === 'asc' ? 1 : -1;
        let val = 0;
  
        // All values 'should' be strings, so try to re-parse as ints / floats
        const aVal = typeof a[sortHeader.key] == 'string' && isNumeric(a[sortHeader.key] as unknown as string) ? parseFloat(a[sortHeader.key] as unknown as string) : a[sortHeader.key];
        const bVal = typeof b[sortHeader.key] == 'string' && isNumeric(b[sortHeader.key] as unknown as string) ? parseFloat(b[sortHeader.key] as unknown as string) : b[sortHeader.key];
  
        if (aVal > bVal) {
          val = 1
        } else if (aVal < bVal) {
          val = -1
        }
  
        return val * multi;
      });
    }
  
    data.unshift(dividerObj);
    data.unshift(headerObj);
  
    data.forEach(d => {
      outStr.push(formatRow(d, headers));
    });
  
    outStr.push('') // Print empty footer spacer line

    if (printToConsole) {
      ns.tprint(outStr.join('\n'));
    }
    return outStr.join('\n');
  }
  
  /**
   * 
   * @param {object} header The header object
   * @returns {string} The string to be appended the header name
   */
  function getSortIndicator<T extends object>(header: ITableHeader<T>): string {
    if (header.sort) {
      const padLength = (header.cellWidth ?? 16) - header.name.length;
      if (header.sort === 'asc') {
        return ' ' + '^'
      } else if (header.sort === 'desc') {
        return ' ' + 'v'
      }
    }
    return ''
  }
  
  /**
   * Format a row for the table
   * 
   * @param {object} data Object containing the data to render. Should be in format {[key]: value}
   * @param {object[]} headers Array of headers to render.
   * @returns {string} The string to be rendered to the terminal
   */
  function formatRow<T extends object>(data: T, headers: ITableHeader<T>[]): string {
    let str =  '|';
    for (let header of headers) {
      const value = data[header.key];
      if (value !== undefined) {
        if (typeof value == 'string' ) {
          str += formatCell(value, {cellWidth: header.cellWidth});
        } else if (typeof value == 'number') {
          str += formatCell(value.toFixed(header.format ?? 2), {cellWidth: header.cellWidth});
        }
      } else {
        str += formatCell(`! (${header.name})`, {cellWidth: header.cellWidth});
      }
      str += '|'
    }
    return str
  }
  
  /**
   * Format a cell in the table
   * 
   * TODO: 
   * - Cell Alignment
   * 
   * @param {string} content The content to be rendered
   * @param {object} options
   * @param {number} options.cellWidth The width of a cell (Not including spacer characters). Defaults to 16
   * @returns {string} The string to be rendered to the terminal
   */
  function formatCell(content: string, options: { cellWidth: number | undefined; } | undefined): string {
    const cellWidth = options?.cellWidth ?? 16;
  
    const paddedString = ' '.repeat(cellWidth) + content.toString() + ' '.repeat(cellWidth);
  
    const halfPaddedStr = (paddedString.length / 2);
    const halfWidth = (cellWidth / 2)
    const leftStart = Math.round(halfPaddedStr - halfWidth);
    const rightEnd = Math.round(halfPaddedStr + halfWidth);
  
    return paddedString.slice(leftStart, rightEnd); // 
  }
  
  function isNumeric(str: string) {
    if (typeof str != "string") return false // we only process strings!  
    return !isNaN(str as unknown as number) && // use type coercion to parse the _entirety_ of the string (`parseFloat` alone does not do this)...
           !isNaN(parseFloat(str)) // ...and ensure strings of whitespace fail
  }