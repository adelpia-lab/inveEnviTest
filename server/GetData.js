import { ReadChamber } from './ReadChamber.js';
import { RelayAllOff, SelectDeviceOn, SelectDeviceOff } from './SelectDevice.js';
import { SendVoltCommand } from './SetVolt.js';
import { ReadAllVoltages } from './ReadVolt.js';
import { sleep } from './utils/common.js';

/**
 * 10회 측정, 10개 제품, 3전압(18V/24V/30V)별, 시간/온도/전압 데이터 기록
 * @returns {Promise<Array>} 측정 데이터 배열
 */
export async function GetData() {
    const NUM_MEASUREMENTS = 10;
    const NUM_DEVICES = 10;
    const VOLTAGES = ["DC+18V", "DC+24V", "DC+30V"];
    const results = [];

    for (let measureIdx = 0; measureIdx < NUM_MEASUREMENTS; measureIdx++) {
        const timestamp = new Date().toISOString();
        const temperature = await ReadChamber();
        await RelayAllOff();

        const measurement = {
            timestamp,
            temperature,
            voltages: {}, // { 'DC+18V': [...], 'DC+24V': [...], ... }
        };

        for (const voltage of VOLTAGES) {
            await SendVoltCommand(voltage);
            measurement.voltages[voltage] = [];
            for (let deviceIdx = 1; deviceIdx <= NUM_DEVICES; deviceIdx++) {
                await SelectDeviceOn(deviceIdx);
                await sleep(1000);
                const voltData = await ReadAllVoltages();
                measurement.voltages[voltage].push({
                    device: deviceIdx,
                    voltages: voltData,
                });
                await SelectDeviceOff(deviceIdx);
            }
        }
        results.push(measurement);
    }
    return results;
}