export class Averager {
    private rollingAvg = 0;
    get average(): number {
        return this.rollingAvg;
    }
    private n = 0;
    lastValue: number = 0;
    constructor() {

    }

    updateAverage(value: number) {
        this.lastValue = value;
        this.rollingAvg = (value + this.n * this.rollingAvg) / ++this.n;
        return this.rollingAvg;
    }

    reset() {
        this.rollingAvg = 0;
        this.n = 0;
        this.lastValue = 0;
    }
}