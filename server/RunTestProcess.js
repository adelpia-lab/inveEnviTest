import { TemperatureUp } from './TemperatureUp.js';
import { TemperatureDown } from './TemperatureDown.js';
import { GetData } from './GetData.js';
import { RelayAllOff, SelectDeviceOn, SelectDeviceOff } from './SelectDevice.js';
import { SendVoltCommand } from './SetVolt.js';
import { ReadVolt } from './ReadVolt.js';
import { loadGetTableOption } from './backend-websocket-server.js';
import { ReadChamber } from './ReadChamber.js'; 
import fs from 'fs';
import path from 'path';
// import { listenerCount } from 'ws';

/**
 * 4시간(14400000ms) 대기 Promise
 */
function waitFourHours() {
  return new Promise(resolve => setTimeout(resolve, 4 * 60 * 60 * 1000));
}

function getDateTimeSeparated() {
  const now = new Date(); // 현재 날짜와 시간을 포함하는 Date 객체 생성

  // 날짜 부분만 로컬 형식으로 가져오기
  const dateOptions = {
    year: 'numeric',
    month: 'long', // 'numeric', '2-digit', 'short', 'long' 중 선택
    day: 'numeric'
  };
  const dateString = now.toLocaleDateString(undefined, dateOptions); // undefined는 현재 로케일을 사용하겠다는 의미

  // 시간 부분만 로컬 형식으로 가져오기
  const timeOptions = {
    hour: '2-digit',   // 'numeric', '2-digit' 중 선택
    minute: '2-digit', // 'numeric', '2-digit' 중 선택
    second: '2-digit', // 'numeric', '2-digit' 중 선택
    hourCycle: 'h23'   // 'h11', 'h12', 'h23', 'h24' 중 선택 (24시간제로 설정)
  };
  const timeString = now.toLocaleTimeString(undefined, timeOptions);

  return {
    date: dateString,
    time: timeString
  };
}

/**
 * 순차 테스트 프로세스 실행
 */
export async function runTestProcess() {
  try {
    console.log('[RunTestProcess] 1. 온도 70도 상승 시작');
    const upResult = await TemperatureUp();
    if (upResult?.error) {
      console.error('[RunTestProcess] 온도 상승 에러:', upResult.error);
      return;
    }
    console.log('[RunTestProcess] 2. 4시간 대기 시작');
    await waitFourHours();
    console.log('[RunTestProcess] 3. GetData 실행');
    const dataAfterUp = await GetData();
    console.log('[RunTestProcess] 4. -32도 하강 시작');
    const downResult = await TemperatureDown();
    if (downResult?.error) {
      console.error('[RunTestProcess] 온도 하강 에러:', downResult.error);
      return;
    }
    console.log('[RunTestProcess] 5. 4시간 대기 시작');
    await waitFourHours();
    console.log('[RunTestProcess] 6. GetData 실행');
    const dataAfterDown = await GetData();
    console.log('[RunTestProcess] 테스트 완료. 결과:', { dataAfterUp, dataAfterDown });
    return { dataAfterUp, dataAfterDown };
  } catch (error) {
    console.error('[RunTestProcess] 예외 발생:', error);
    return;
  }
}

const RawVoltTable = [];

// 첫 번째 차원 (3)
for (let i = 0; i < 3; i++) {
  RawVoltTable[i] = []; // 두 번째 차원을 위한 배열 초기화
  // 두 번째 차원 (10)
  for (let j = 0; j < 10; j++) {
    RawVoltTable[i][j] = []; // 세 번째 차원을 위한 배열 초기화
    // 세 번째 차원 (4)
    for (let k = 0; k < 4; k++) {
      RawVoltTable[i][j][k] = ""; // 초기값 ""으로 설정
    }
  }
}

let pageTable = {
  TestDate: '',
  TestTime: '',
  TestTemperature: '',
  voltagTable: RawVoltTable
}

let TotaReportTable = {
  modelName: '',
  ProductNumber: [],
  inputVolt: [],
  reportTable: [pageTable, pageTable, pageTable, pageTable, pageTable, 
    pageTable, pageTable, pageTable, pageTable, pageTable]
}
  
function sleep(ms) {   
  return new Promise(resolve => setTimeout(resolve, ms));
}

function Now() {
  const now = new Date();
  return now.toISOString();
}

/**
 * 현재 날짜와 시간을 yymmdd_hhmm 형식으로 반환
 */
function getFormattedDateTime() {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2); // 마지막 2자리만
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  
  return `${year}${month}${day}_${hour}${minute}`;
}

/**
 * TotaReportTable을 Excel에서 import할 수 있는 CSV 형식으로 저장
 * Model Name과 Product Number는 첫 번째 라인에, 각 전압 테이블은 별도 라인에 표시
 */
function saveTotaReportTableToFile(data) {
  try {
    const filename = `${getFormattedDateTime()}.csv`;
    const filePath = path.join(process.cwd(), filename);
    
    let csvContent = '';
    const reportData = data.reportTable[0];
    
    // 첫 번째 라인: Model Name, Product Number, Test Date, Test Time, Test Temperature
    csvContent += `Model Name,${data.modelName || ''}\n`;
    csvContent += `Product Number,${data.ProductNumber.join(';') || ''}\n`;
    csvContent += `Test Date,${reportData.TestDate || ''}\n`;
    csvContent += `Test Time,${reportData.TestTime || ''}\n`;
    csvContent += `Test Temperature,${reportData.TestTemperature || ''}\n`;
    csvContent += '\n'; // 빈 줄 추가
    
    // 각 전압 테이블을 별도 라인에 표시
    for (let k = 0; k < 3; k++) {
      const voltageName = data.inputVolt[k] || `Voltage ${k+1}`;
      csvContent += `${voltageName} 테이블\n`;
      
      // 헤더 라인: Device 1, Device 2, ..., Device 10
      csvContent += 'Channel,';
      for (let i = 0; i < 10; i++) {
        csvContent += `Device ${i+1},`;
      }
      csvContent = csvContent.slice(0, -1) + '\n'; // 마지막 쉼표 제거하고 줄바꿈
      
      // 4개 채널을 세로로 표시 (각 채널이 한 행)
      for (let j = 0; j < 4; j++) {
        csvContent += `Channel ${j+1},`;
        for (let i = 0; i < 10; i++) {
          const voltageValue = reportData.voltagTable[k][i][j] || '';
          csvContent += `${voltageValue},`;
        }
        csvContent = csvContent.slice(0, -1) + '\n'; // 마지막 쉼표 제거하고 줄바꿈
      }
      
      csvContent += '\n'; // 전압 테이블 간 빈 줄 추가
    }
    
    // 파일에 저장
    fs.writeFileSync(filePath, csvContent, 'utf8');
    
    console.log(`[SaveData] CSV 파일 저장 완료: ${filename}`);
    console.log(`[SaveData] 파일 경로: ${filePath}`);
    console.log(`[SaveData] Excel에서 import 가능한 형식으로 저장됨`);
    
    return { success: true, filename, filePath };
  } catch (error) {
    console.error('[SaveData] 파일 저장 실패:', error);
    return { success: false, error: error.message };
  }
}

export async function readVoltDataOneline() {
  const NUM_MEASUREMENTS = 10;
  const NUM_DEVICES = 10;
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

// 페이지 단위 테스트 프로세스 실행
export async function runSinglePageProcess() {
  try {
    console.log('[SinglePageProcess] 0. getTableOption 로드');
    const getTableOption = await loadGetTableOption();
    console.log('[SinglePageProcess] getTableOption:', getTableOption);
    
    const onDelay = getTableOption.delaySettings.onDelay *1000;
    const offDelay = getTableOption.delaySettings.offDelay *1000;
    console.log('[SinglePageProcess] onDelay:', onDelay);
    console.log('[SinglePageProcess] offDelay:', offDelay);

    TotaReportTable.modelName = getTableOption.productInput.modelName;
    TotaReportTable.ProductNumber = getTableOption.productInput.productNames;
    TotaReportTable.inputVolt = getTableOption.outVoltSettings;

    // recode Date Time Temperature
    const dateTime = getDateTimeSeparated();
    TotaReportTable.reportTable[0].TestDate = dateTime.date;
    TotaReportTable.reportTable[0].TestTime = dateTime.time;
    TotaReportTable.reportTable[0].TestTemperature = await ReadChamber();

    await RelayAllOff();
    
    for(let k=0; k<3; k++) {
      // 전압을 설정 한다. 
      const inputVolt = getTableOption.outVoltSettings[k];
      console.log('[SinglePageProcess] 1. 전압 설정:', inputVolt);  
      await SendVoltCommand(inputVolt);  
      
      for ( let i = 0; i < 10; i++) {
          if (getTableOption.deviceStates[i] === false) {
            for ( let j = 0; j < 4 ; j++) {  // 입력 전압 18, 24, 30V default
              TotaReportTable.reportTable[0].voltagTable[k][i][j] = "-.-";
            }
          } else {
            await SelectDeviceOn(i+1);  // 1 부터 시작 함
            await sleep(onDelay);
            for ( let j = 0; j < 4 ; j++) {  // 입력 전압 18, 24, 30V default
              const voltData = await ReadVolt(j+1);
              TotaReportTable.reportTable[0].voltagTable[k][i][j] = voltData;
            }
            await SelectDeviceOff(i+1); // 1 부터 시작 함
            await sleep(offDelay);
          }
        }
    }  
    console.log('[SinglePageProcess] 프로세스 완료');
    console.log('[SinglePageProcess] 테이블 출력:', TotaReportTable);
    console.log('[SinglePageProcess] 테이블 출력:', TotaReportTable.reportTable[0].voltagTable);
    
    // TotaReportTable을 파일로 저장
    const saveResult = saveTotaReportTableToFile(TotaReportTable);
    if (saveResult.success) {
      console.log(`[SinglePageProcess] 데이터 저장 완료: ${saveResult.filename}`);
    } else {
      console.error(`[SinglePageProcess] 데이터 저장 실패: ${saveResult.error}`);
    }
    
  } catch (error) {
    console.error('[RunTestProcess] 예외 발생:', error);
    throw error;
  }
}

export async function runNextTankEnviTestProcess() {
  try {
    console.log('[NextTankEnviTestProcess] 0. getTableOption 로드');
    const getTableOption = await loadGetTableOption();
    const onDelay = getTableOption.delaySettings.onDelay;
    const offDelay = getTableOption.delaySettings.offDelay;
    
    console.log('[MultiPageProcess] 1. 헤더 라인 작성');
    writeHeadLine();
   } catch (error) {
    console.error('[MultiPageProcess] 예외 발생:', error);
    throw error;
  }
}

