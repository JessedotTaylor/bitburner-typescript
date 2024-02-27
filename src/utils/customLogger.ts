import { NS } from "@ns";

export class CustomLogger {
  
  constructor(
    protected ns: NS,
    protected logLevel: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' = 'DEBUG',
    protected printFnName: 'print' | 'tprint' = 'print'
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

  private get printFn(): (...args:any[]) => void {
    switch (this.printFnName) {
      case 'print':
        return this.ns.print;
      case 'tprint':
        return this.ns.tprint;
    }
  }

  private isLevelAboveLogLevel(level: string): boolean {
    switch (level) {
      case 'DEBUG': 
        return this.logLevel == 'DEBUG';
      case 'INFO': 
        return this.logLevel == 'DEBUG' || this.logLevel == 'INFO';
      case 'WARN': 
        return  this.logLevel == 'DEBUG' || this.logLevel == 'INFO' || this.logLevel == 'WARN';
      case 'ERROR': 
        return  this.logLevel == 'DEBUG' || this.logLevel == 'INFO' || this.logLevel == 'WARN' || this.logLevel == 'ERROR';
      default:
        return this.logLevel == 'DEBUG' || this.logLevel == 'INFO' ;
    }
  }
}