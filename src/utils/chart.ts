import { NS } from "@ns";
import { CustomLogger } from "utils/customLogger";
import { makeStringWidth } from "utils/string";
import { flattenDeep } from "utils/loadash";

interface IChartOptions {
    width: number;
    height: number;

    dataMax: number;
    dataMin: number;
}

const RESET = "\u001b[0m"; 
export enum Colours {
    RED = "\u001b[31m",
    GREEN = "\u001b[32m",
    YELLOW = "\u001b[33m",
    BLUE = "\u001b[34m",
    MAGENTA = "\u001b[35m",
    CYAN = "\u001b[36m",
    WHITE = "\u001b[37m",
    GRAY = "\u001b[90m",
    // BLACK = "\u001b[30m"
    BRIGHT_RED = "\u001b[91m",
    BRIGHT_GREEN = "\u001b[92m",
    BRIGHT_YELLOW = "\u001b[93m",
    BRIGHT_BLUE = "\u001b[94m",
    BRIGHT_MAGENTA = "\u001b[95m",
    BRIGHT_CYAN = "\u001b[96m",
    BRIGHT_WHITE = "\u001b[97m",
    BRIGHT_GRAY = "\u001b[100m",
    // BRIGHT_BLACK = "\u001b[40m"
    DEFAULT = ""
}

interface IChartData {
    name?: string;
    colour?: Colours;
    points: number[];
    indicator?: string;
}

export class Chart {
    readonly width: number;
    axisWidth: number;

    readonly height: number;
    axisHeight: number;

    get dataHeight(): number {
        return this.height - this.axisHeight;
    }

    get dataWidth(): number {
        return this.width - this.axisWidth - 2;
    }

    constructor(
        protected ns: NS,
        protected logger: CustomLogger = new CustomLogger(ns, 'WARN'),
        protected options: Partial<IChartOptions> = {}
    ) {
        this.width = options?.width ?? 51;
        this.height = options?.height ?? 12;

        this.axisHeight = 2;
        /** The width of the labels for the y axis, not including the | seperator */
        this.axisWidth = 4;
    }

    plot(data: IChartData[]): string {

        // 1. Work out min / max of data scale

        const dataPointsMaximum = Math.max(...flattenDeep(data.map(d => d.points)));
        const dataPointsMinimum = Math.min(...flattenDeep(data.map(d => d.points)));

        const dataMax = this.options?.dataMax ?? dataPointsMaximum + dataPointsMaximum * 0.1;
        const dataMin = this.options?.dataMin ?? dataPointsMinimum - dataPointsMinimum * 0.1;

        const dataMaxLabel = dataMax.toPrecision(2);
        const dataMinLabel = dataMin.toPrecision(2);

        const timeMinLabel = `${' '.repeat(this.axisWidth + 1)}|t=-${this.dataWidth.toFixed(0)}`;
        const timeMaxLabel = 't=0';

        // Manually calculate, as colour strings shouldn't be included
        var { legendStringLength, legend } = this.getChardLegend(data); 

        let xAxisLabels = makeStringWidth(this.width, timeMinLabel, timeMaxLabel);
        // Check if we can put the legend in the x axis
        if (timeMinLabel.length + legendStringLength + timeMaxLabel.length + 2 < this.width) {
            
            const paddingLen =  this.width - (timeMinLabel.length + legendStringLength + 1 + timeMaxLabel.length)
            xAxisLabels = timeMinLabel + ' ' + legend + ' '.repeat(paddingLen) + timeMaxLabel;
            // this.logger.debug(`minLabel: ${timeMinLabel.length} | legend: ${legendStringLength} | maxLabel: ${timeMaxLabel.length} | width: ${this.width} | padding: ${paddingLen} | xAxisLabels: ${xAxisLabels.length}`);
        } else {
            // Otherwise put it at the top of the chart
            this.axisHeight += 1;
        }

        this.axisWidth = Math.max(dataMaxLabel.length, dataMinLabel.length) + 1;
    
        // 2. Scale position on chart height
        const scaledData: IChartData[] = data.map((d, i) => { 
            if ((d.indicator ?? '-').length != 1) {
                throw new Error(`!Chart - plot - Indicator for ${d.name ?? i} must have length 1 (Was: ${d.indicator}:${d.indicator?.length})`)
            }
            return {
                name: d.name,
                colour: d.colour ?? Colours.DEFAULT,
                points: d.points.map(value => Math.round(scaleNumberWithinRange(value, dataMin, dataMax) * this.dataHeight)),
                indicator: d.indicator ?? '-'
            }
        });

        // this.logger.debug(`Scaled data: ${JSON.stringify(scaledData)}`);
    
        // 3. Create arrays for each row
        const output: string[][] = new Array(this.height).fill([]).map((_, i) => new Array(this.width).fill(' '));

        for (let row = 0; row < this.dataHeight; row++) {
            for (let col = 0; col < this.dataWidth; col++) {
                for (const range of scaledData) {
                    // Find data entry matching index
                    // TODO:
                    // - Gradient
                    const value = range.points[col] == row ? `${range.colour}${range.indicator ?? '-'}${RESET}` : ' ';
                    // if (value != ' ') {
                    //     this.logger.debug(`Plotting ${value} at ${row},${col},${range.name}`)
                    // }
        
                    // Insert character
                    // Plot chart with most recent data on right
                    // TODO: Combine data somehow?
                    output[this.dataHeight - row][col] = output[this.dataHeight - row][col] == ' ' ? value : output[this.dataHeight - row][col];
                }
            }
        }
    
        // 4. Add axis data
        // Y Axis
        for (let i = 0; i < output.length; i++) {
            const row = output[i];
            if (i === 0) {
                row.unshift(' ' + makeStringWidth(this.axisWidth, '', dataMaxLabel + ' ') + '|')
            } else if (i === (output.length - 1)) {
                row.unshift(' ' + makeStringWidth(this.axisWidth, '', dataMinLabel + ' ') + '|')
            } else {
                row.unshift(' ' + ' '.repeat(this.axisWidth) + '|')
            }
        }


        // X Axis
        output.push(new Array(this.width).fill('-')); // X-axis divider
        if (!xAxisLabels.includes(legend)) {
            output.unshift(makeStringWidth(this.width, '', legend).split(''))
        }
        output.push(xAxisLabels.split(''));
    
        // 5. Combine row arrays, combine col arrays
        return output.map(row => row.join('')).join('\n');
    
    }

    private getChardLegend(data: IChartData[]) {
        let legendStringLength = 3;
        const legend = data.map((d, i) => {
            const indicator = d.indicator ?? '-';
            const colour = d.colour ?? Colours.DEFAULT;
            const name = d.name ?? i.toFixed(0);
            legendStringLength += indicator.length + name.length + 3;
            return `${colour}${indicator}${RESET} ${name}`;
        }).reduce((a, b) => a + ' | ' + b, '');
        return { legendStringLength, legend };
    }
}

function scaleNumberWithinRange(value: number, min: number, max: number): number {
    return Math.abs((value - min) / (max - min));
}