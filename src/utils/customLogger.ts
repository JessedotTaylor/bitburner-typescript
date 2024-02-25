import { NS } from "@ns";

export class CustomLogger {
  
  constructor(
    protected ns: NS,
    protected logLevel: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' = 'DEBUG',
    protected printFn: (... args: any[]) => void = ns.print
  ) {
      
  }
  
  warn(message: string, ...args: any[]) {
    if (this.isLevelAboveLogLevel('WARN')) {
      this.printFn(`WARN: ${message} ${args}`);
    }
  }
  
  info(message: string, ...args: any[]){
    if (this.isLevelAboveLogLevel('INFO')) {
      this.printFn(`INFO: ${message} ${args}`);
    }
  }
  
  error(message: string, ...args: any[]) {
    if (this.isLevelAboveLogLevel('ERROR')) {
      this.printFn(`ERROR: ${message} ${args}`);
    }
  }
  
  debug(message: string, ...args: any[]) {
    if (this.isLevelAboveLogLevel('DEBUG')) {
      this.printFn(`DEBUG: ${message} ${args}`);
    }
  }

  private isLevelAboveLogLevel(level: string): boolean {
    switch (level) {
      case 'DEBUG': 
        return this.logLevel == 'DEBUG' || this.logLevel == 'INFO' || this.logLevel == 'WARN' || this.logLevel == 'ERROR';
      case 'INFO': 
        return this.logLevel == 'INFO' || this.logLevel == 'WARN' || this.logLevel == 'ERROR';
      case 'WARN': 
        return this.logLevel == 'WARN' || this.logLevel == 'ERROR';
      case 'ERROR': 
        return this.logLevel == 'ERROR';
      default:
        return this.logLevel == 'INFO' || this.logLevel == 'WARN' || this.logLevel == 'ERROR';
    }
  }
}