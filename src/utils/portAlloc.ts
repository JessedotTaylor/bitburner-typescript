import { NS } from "@ns";
import { readFile, writeFile } from "utils/file";

const PORT_FILE = 'db/portAlloc/ports.txt';

const FILE_DELIMITER = ',';


export function getNextAvailablePort(ns: NS, requestorPid: number): number {
    // Open File
    // Data: port, pid of script who requested port
    const data = readFile(ns, PORT_FILE).map(line => line.split(FILE_DELIMITER).map(entry => !!entry ? parseInt(entry) : 0));

    // Filter data by scripts that are still running
    const filteredData = data.filter(([port, pid]) => ns.isRunning(pid));

    const allocatedPort = filteredData.length ? filteredData[filteredData.length - 1][0] + 1 : 1;
    if (typeof allocatedPort !== 'number' || isNaN(allocatedPort)) {
        throw new Error(`Port allocation returned non-number: ${allocatedPort}. Something's likely wrong with the db file: ${PORT_FILE}`);
    }
   
    // Write back filtered data + new port allocation to file
    filteredData.push([allocatedPort, requestorPid]);
    writeFile(ns, PORT_FILE, filteredData.map(line => line.map(entry => entry.toFixed(0)).join(FILE_DELIMITER)));

    // return either next in sequence, or first gap
    return allocatedPort;
}