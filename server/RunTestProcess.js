import { TemperatureUp } from './TemperatureUp.js';
import { TemperatureDown } from './TemperatureDown.js';
import { GetData } from './GetData.js';
import { RelayAllOff, SelectDeviceOn, SelectDeviceOff } from './SelectDevice.js';
import { SendVoltCommand } from './SetVolt.js';
import { ReadVolt } from './ReadVolt.js';
import { loadGetTableOption } from './loadGetTableOption.js';
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
function saveTotaReportTableToFile(data, channelVoltages = [5.0, 15.0, -15.0, 24.0]) {
  try {
    const filename = `${getFormattedDateTime()}.csv`;
    const filePath = path.join(process.cwd(), '..', 'Data', filename);
    
    let csvContent = '';
    const reportData = data.reportTable[0];
    
    // 첫 번째 라인: Model Name, Product Number, Test Date, Test Time, Test Temperature
    csvContent += `Model Name,${data.modelName || ''}\n`;
    csvContent += `Product Number,${data.ProductNumber.join(';') || ''}\n`;
    csvContent += `Test Date,${reportData.TestDate || ''}\n`;
    csvContent += `Test Time,${reportData.TestTime || ''}\n`;
    csvContent += `Test Temperature,${reportData.TestTemperature || ''}\n`;
    
    // 채널 전압 설정 정보 추가
    csvContent += `Channel 1 설정 전압,${channelVoltages[0]}V\n`;
    csvContent += `Channel 2 설정 전압,${channelVoltages[1]}V\n`;
    csvContent += `Channel 3 설정 전압,${channelVoltages[2]}V\n`;
    csvContent += `Channel 4 설정 전압,${channelVoltages[3]}V\n`;
    csvContent += `허용 오차,±5%\n`;
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
      
      // 비교 결과 요약 테이블 추가
      csvContent += '\n비교 결과 요약 (G=Good, N=Not Good)\n';
      csvContent += 'Channel,';
      for (let i = 0; i < 10; i++) {
        csvContent += `Device ${i+1},`;
      }
      csvContent = csvContent.slice(0, -1) + '\n'; // 마지막 쉼표 제거하고 줄바꿈
      
      for (let j = 0; j < 4; j++) {
        csvContent += `Channel ${j+1},`;
        for (let i = 0; i < 10; i++) {
          const voltageValue = reportData.voltagTable[k][i][j] || '';
          // "5.2V|G" 형식에서 "G" 부분만 추출
          const comparisonResult = voltageValue.includes('|') ? voltageValue.split('|')[1] : '';
          csvContent += `${comparisonResult},`;
        }
        csvContent = csvContent.slice(0, -1) + '\n'; // 마지막 쉼표 제거하고 줄바꿈
      }
      
      csvContent += '\n'; // 전압 테이블 간 빈 줄 추가
    }
    
    // 전체 통계 계산
    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;
    
    for (let k = 0; k < 3; k++) {
      for (let i = 0; i < 10; i++) {
        for (let j = 0; j < 4; j++) {
          const voltageValue = reportData.voltagTable[k][i][j] || '';
          if (voltageValue && voltageValue !== "-.-") {
            totalTests++;
            if (voltageValue.includes('|G')) {
              passedTests++;
            } else if (voltageValue.includes('|N')) {
              failedTests++;
            }
          }
        }
      }
    }
    
    // 통계 정보 추가
    csvContent += '\n=== 테스트 통계 ===\n';
    csvContent += `총 테스트 수,${totalTests}\n`;
    csvContent += `통과 테스트 수,${passedTests}\n`;
    csvContent += `실패 테스트 수,${failedTests}\n`;
    csvContent += `통과율,${totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(2) : 0}%\n`;
    
    // 파일에 저장
    fs.writeFileSync(filePath, csvContent, 'utf8');
    
    console.log(`[SaveData] CSV 파일 저장 완료: ${filename}`);
    console.log(`[SaveData] 파일 경로: ${filePath}`);
    console.log(`[SaveData] Excel에서 import 가능한 형식으로 저장됨`);
    console.log(`[SaveData] 테스트 통계: 총 ${totalTests}개, 통과 ${passedTests}개, 실패 ${failedTests}개`);
    
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

/**
 * 전압값을 설정값과 비교하여 ±5% 범위 내에 있는지 확인
 * @param {number} readVoltage - 읽은 전압값
 * @param {number} expectedVoltage - 설정된 전압값
 * @returns {string} "G" (Good) 또는 "N" (Not Good)
 */
function compareVoltage(readVoltage, expectedVoltage) {
  // 읽은 전압이 숫자가 아니거나 에러인 경우
  if (typeof readVoltage !== 'number' || isNaN(readVoltage)) {
    return "N";
  }
  
  // ±5% 허용 오차 계산
  const tolerance = expectedVoltage * 0.05;
  const minVoltage = expectedVoltage - tolerance;
  const maxVoltage = expectedVoltage + tolerance;
  
  // 범위 내에 있는지 확인
  if (readVoltage >= minVoltage && readVoltage <= maxVoltage) {
    return "G";
  } else {
    return "N";
  }
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

    // 채널 전압 설정 로그 출력
    console.log('[SinglePageProcess] 채널 전압 설정:', getTableOption.channelVoltages);

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
              const expectedVoltage = getTableOption.channelVoltages[j] || 0;
              const comparisonResult = compareVoltage(voltData, expectedVoltage);
              
              // 전압값과 비교 결과를 함께 저장 (예: "5.2V|G" 또는 "5.2V|N")
              const voltageWithComparison = `${voltData}V|${comparisonResult}`;
              TotaReportTable.reportTable[0].voltagTable[k][i][j] = voltageWithComparison;
              
              // 로그 출력
              console.log(`[SinglePageProcess] Device ${i+1}, Channel ${j+1}: 읽은값=${voltData}V, 설정값=${expectedVoltage}V, 결과=${comparisonResult}`);
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
    const saveResult = saveTotaReportTableToFile(TotaReportTable, getTableOption.channelVoltages);
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

