export function flattenDeep(arr: any[]): any[] {
  return arr.reduce((acc, val) => {
    return acc.concat(Array.isArray(val) ? flattenDeep(val) : val)
  }, [] as any[]);
}