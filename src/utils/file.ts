import { NS } from '@ns';

export function readFile(ns: NS, filename: string): string[] {
  if (ns.fileExists(filename)) {
    return ns.read(filename).split('\n');
  }
  throw new FileNotFoundError(filename);
}

class FileNotFoundError extends Error {
  constructor(
    filename: string
  ) {
    super(`File not found at: ${filename}`);
  }
}

export function copyScriptToServer(ns: NS, server: string, file: string) {
  if (server != 'home' || !ns.fileExists(file, server)) {
    ns.scp(file, server, "home");
  }
}

export function writeFile(ns: NS, filename: string, data: string[], mode: 'w' | undefined = 'w') {
  ns.write(filename, data.join('\n'), mode);
}
