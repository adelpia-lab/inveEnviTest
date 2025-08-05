import { TemperatureUp } from './TemperatureUp.js';
import { TemperatureDown } from './TemperatureDown.js';
import { GetData } from './GetData.js';
import { RelayAllOff, SelectDeviceOn, SelectDeviceOff } from './SelectDevice.js';
import { SendVoltCommand } from './SetVolt.js';
import { ReadVolt } from './ReadVolt.js';
import { loadGetTableOption } from './loadGetTableOption.js';
import { ReadChamber } from './ReadChamber.js'; 
import { getProcessStopRequested, setMachineRunningStatus } from './backend-websocket-server.js';
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

// 사이클별 결과를 저장할 전역 변수
let cycleResults = [];
  
/**
 * 밀리초 단위 대기 함수
 * @param {number} ms - 대기할 밀리초
 * @returns {Promise} 대기 완료 후 resolve되는 Promise
 */
function sleep(ms) {   
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 분 단위 대기 함수 (최대 999분까지 지원)
 * @param {number} minutes - 대기할 분 (1-999)
 * @returns {Promise} 대기 완료 후 resolve되는 Promise
 */
function sleepMinutes(minutes) {
  // 입력값 검증
  if (typeof minutes !== 'number' || minutes < 1 || minutes > 999) {
    console.warn(`[sleepMinutes] 잘못된 분 값: ${minutes}. 1-999 범위의 값이어야 합니다.`);
    return Promise.resolve();
  }
  
  const milliseconds = minutes * 60 * 1000; // 분을 밀리초로 변환
  console.log(`[sleepMinutes] ${minutes}분 대기 시작 (${milliseconds}ms)`);
  
  return new Promise(resolve => {
    setTimeout(() => {
      console.log(`[sleepMinutes] ${minutes}분 대기 완료`);
      resolve();
    }, milliseconds);
  });
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
function saveTotaReportTableToFile(data, channelVoltages = [5.0, 15.0, -15.0, 24.0], cycleNumber = 1, testType = '') {
  try {
    const filename = `${getFormattedDateTime()}_Cycle${cycleNumber}_${testType}.csv`;
    const filePath = path.join(process.cwd(), '..', 'Data', filename);
    
    let csvContent = '';
    const reportData = data.reportTable[0];
    
    // 첫 번째 라인: Model Name, Product Number, Test Date, Test Time, Test Temperature
    csvContent += `Model Name,${data.modelName || ''}\n`;
    csvContent += `Product Number,${data.ProductNumber.join(';') || ''}\n`;
    csvContent += `Test Date,${reportData.TestDate || ''}\n`;
    csvContent += `Test Time,${reportData.TestTime || ''}\n`;
    csvContent += `Test Temperature,${reportData.TestTemperature || ''}\n`;
    csvContent += `Cycle Number,${cycleNumber}\n`;
    csvContent += `Test Type,${testType}\n`;
    
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

/**
 * 여러 테스트 결과를 하나로 결합
 * @param {Array} testResults - 테스트 결과 배열
 * @returns {Object} 결합된 테스트 데이터
 */
function combineTestResults(testResults) {
  if (!testResults || testResults.length === 0) {
    return null;
  }
  
  // 첫 번째 결과를 기본으로 사용
  const combinedData = {
    modelName: testResults[0].modelName,
    ProductNumber: testResults[0].ProductNumber,
    inputVolt: testResults[0].inputVolt,
    reportTable: [{
      TestDate: testResults[0].reportTable[0].TestDate,
      TestTime: testResults[0].reportTable[0].TestTime,
      TestTemperature: testResults[0].reportTable[0].TestTemperature,
      voltagTable: JSON.parse(JSON.stringify(RawVoltTable)) // 깊은 복사
    }]
  };
  
  // 모든 결과의 전압 데이터를 평균 계산
  for (let k = 0; k < 3; k++) {
    for (let i = 0; i < 10; i++) {
      for (let j = 0; j < 4; j++) {
        let totalVoltage = 0;
        let validCount = 0;
        let totalGood = 0;
        let totalTests = 0;
        
        // 모든 테스트 결과에서 해당 위치의 데이터 수집
        testResults.forEach(result => {
          const voltageValue = result.reportTable[0].voltagTable[k][i][j];
          if (voltageValue && voltageValue !== "-.-") {
            const voltagePart = voltageValue.split('|')[0];
            const comparisonPart = voltageValue.split('|')[1];
            
            // 전압값 추출 (V 제거)
            const voltage = parseFloat(voltagePart.replace('V', ''));
            if (!isNaN(voltage)) {
              totalVoltage += voltage;
              validCount++;
              totalTests++;
              
              if (comparisonPart === 'G') {
                totalGood++;
              }
            }
          }
        });
        
        // 평균 계산 및 결과 저장
        if (validCount > 0) {
          const averageVoltage = (totalVoltage / validCount).toFixed(2);
          const averageGood = totalGood / totalTests;
          const comparisonResult = averageGood >= 0.5 ? 'G' : 'N'; // 50% 이상이 Good이면 Good
          
          combinedData.reportTable[0].voltagTable[k][i][j] = `${averageVoltage}V|${comparisonResult}`;
        } else {
          combinedData.reportTable[0].voltagTable[k][i][j] = "-.-";
        }
      }
    }
  }
  
  return combinedData;
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

    // 새로운 테이블 인스턴스 생성 (누적을 위해)
    const currentTable = {
      modelName: getTableOption.productInput.modelName,
      ProductNumber: getTableOption.productInput.productNames,
      inputVolt: getTableOption.outVoltSettings,
      reportTable: [{
        TestDate: '',
        TestTime: '',
        TestTemperature: '',
        voltagTable: JSON.parse(JSON.stringify(RawVoltTable)) // 깊은 복사
      }]
    };

    // 채널 전압 설정 로그 출력
    console.log('[SinglePageProcess] 채널 전압 설정:', getTableOption.channelVoltages);

    // recode Date Time Temperature
    const dateTime = getDateTimeSeparated();
    currentTable.reportTable[0].TestDate = dateTime.date;
    currentTable.reportTable[0].TestTime = dateTime.time;
    
    const chamberTemp = await ReadChamber();
    if (chamberTemp === false) {
      console.error('[SinglePageProcess] 🛑 챔버 온도 읽기 실패');
      return { 
        status: 'error', 
        message: '챔버 온도 읽기 실패 - 장비 연결 상태를 확인하세요',
        errorType: 'chamber_read_failed'
      };
    }
    currentTable.reportTable[0].TestTemperature = chamberTemp;

    await RelayAllOff();
    
    for(let k=0; k<3; k++) {
      // 중지 요청 확인
      if (getProcessStopRequested()) {
        console.log(`[SinglePageProcess] 🛑 중지 요청 감지 - 전압 테스트 ${k+1}/3에서 중단`);
        return { status: 'stopped', message: '사용자에 의해 중지됨', stoppedAtVoltageTest: k+1 };
      }
      
      // 전압을 설정 한다. 
      const inputVolt = getTableOption.outVoltSettings[k];
      console.log('[SinglePageProcess] 1. 전압 설정:', inputVolt);  
      
      // 전압 설정 재시도 로직
      let voltSetSuccess = false;
      let retryCount = 0;
      const maxRetries = 3;
      
      while (!voltSetSuccess && retryCount < maxRetries) {
        try {
          await SendVoltCommand(inputVolt);
          voltSetSuccess = true;
        } catch (error) {
          retryCount++;
          console.warn(`[SinglePageProcess] 전압 설정 실패 (${retryCount}/${maxRetries}): ${error}`);
          if (retryCount < maxRetries) {
            console.log(`[SinglePageProcess] 3초 후 재시도...`);
            await sleep(3000);
          } else {
            throw new Error(`전압 설정 실패: ${error}`);
          }
        }
      }
      
      for ( let i = 0; i < 10; i++) {
          // 중지 요청 확인
          if (getProcessStopRequested()) {
            console.log(`[SinglePageProcess] 🛑 중지 요청 감지 - 디바이스 ${i+1}/10에서 중단`);
            return { status: 'stopped', message: '사용자에 의해 중단됨', stoppedAtVoltageTest: k+1, stoppedAtDevice: i+1 };
          }
          
          if (getTableOption.deviceStates[i] === false) {
            for ( let j = 0; j < 4 ; j++) {  // 입력 전압 18, 24, 30V default
              currentTable.reportTable[0].voltagTable[k][i][j] = "-.-";
            }
          } else {
            // 디바이스 선택 재시도 로직
            let deviceSelectSuccess = false;
            retryCount = 0;
            
            while (!deviceSelectSuccess && retryCount < maxRetries) {
              try {
                await SelectDeviceOn(i+1);  // 1 부터 시작 함
                deviceSelectSuccess = true;
              } catch (error) {
                retryCount++;
                console.warn(`[SinglePageProcess] 디바이스 ${i+1} 선택 실패 (${retryCount}/${maxRetries}): ${error}`);
                if (retryCount < maxRetries) {
                  console.log(`[SinglePageProcess] 2초 후 재시도...`);
                  await sleep(2000);
                } else {
                  console.error(`[SinglePageProcess] 디바이스 ${i+1} 선택 최종 실패`);
                  // 실패 시에도 계속 진행
                  break;
                }
              }
            }
            
            if (deviceSelectSuccess) {
              await sleep(onDelay);
            }
            
            for ( let j = 0; j < 4 ; j++) {  // 입력 전압 18, 24, 30V default
              // 중지 요청 확인
              if (getProcessStopRequested()) {
                console.log(`[SinglePageProcess] 🛑 중지 요청 감지 - 채널 ${j+1}/4에서 중단`);
                await SelectDeviceOff(i+1); // 안전을 위해 디바이스 끄기
                return { status: 'stopped', message: '사용자에 의해 중단됨', stoppedAtVoltageTest: k+1, stoppedAtDevice: i+1, stoppedAtChannel: j+1 };
              }
              
              // 전압 읽기 재시도 로직
              let voltReadSuccess = false;
              retryCount = 0;
              let voltData = null;
              
              while (!voltReadSuccess && retryCount < maxRetries) {
                try {
                  voltData = await ReadVolt(j+1);
                  voltReadSuccess = true;
                } catch (error) {
                  retryCount++;
                  console.warn(`[SinglePageProcess] Device ${i+1}, Channel ${j+1} 전압 읽기 실패 (${retryCount}/${maxRetries}): ${error}`);
                  if (retryCount < maxRetries) {
                    console.log(`[SinglePageProcess] 1초 후 재시도...`);
                    await sleep(1000);
                  } else {
                    console.error(`[SinglePageProcess] Device ${i+1}, Channel ${j+1} 전압 읽기 최종 실패`);
                    voltData = 'error';
                    break;
                  }
                }
              }
              
              const expectedVoltage = getTableOption.channelVoltages[j] || 0;
              const comparisonResult = voltData === 'error' ? 'N' : compareVoltage(voltData, expectedVoltage);
              
              // 전압값과 비교 결과를 함께 저장 (예: "5.2V|G" 또는 "5.2V|N")
              const voltageWithComparison = voltData === 'error' ? 'error|N' : `${voltData}V|${comparisonResult}`;
              currentTable.reportTable[0].voltagTable[k][i][j] = voltageWithComparison;
              
              // 로그 출력
              console.log(`[SinglePageProcess] Device ${i+1}, Channel ${j+1}: 읽은값=${voltData}V, 설정값=${expectedVoltage}V, 결과=${comparisonResult}`);
            }
            
            // 디바이스 해제 재시도 로직
            retryCount = 0;
            while (retryCount < maxRetries) {
              try {
                await SelectDeviceOff(i+1); // 1 부터 시작 함
                break;
              } catch (error) {
                retryCount++;
                console.warn(`[SinglePageProcess] 디바이스 ${i+1} 해제 실패 (${retryCount}/${maxRetries}): ${error}`);
                if (retryCount < maxRetries) {
                  await sleep(1000);
                } else {
                  console.error(`[SinglePageProcess] 디바이스 ${i+1} 해제 최종 실패`);
                  break;
                }
              }
            }
            
            await sleep(offDelay);
          }
        }
    }  
    console.log('[SinglePageProcess] 프로세스 완료');
    console.log('[SinglePageProcess] 테이블 출력:', currentTable);
    console.log('[SinglePageProcess] 테이블 출력:', currentTable.reportTable[0].voltagTable);
    
    return { 
      status: 'completed', 
      message: '단일 페이지 프로세스 완료',
      data: currentTable
    };
    
  } catch (error) {
    console.error('[SinglePageProcess] 예외 발생:', error);
    throw error;
  }
}

export async function runNextTankEnviTestProcess() {
  try {
    // 설정을 강제로 다시 로드
    console.log('[NextTankEnviTestProcess] 🔄 강제로 설정 다시 로드 중...');
    const { loadGetTableOption } = await import('./backend-websocket-server.js');
    await loadGetTableOption();
    console.log('[NextTankEnviTestProcess] ✅ 설정 다시 로드 완료');
    
    // sole.log('[NextTankEnviTestProcess] 0. getTableOption 로드');
    const getTableOption = await loadGetTableOption();
    console.log('[NextTankEnviTestProcess] getTableOption:', getTableOption);
    
    // 저온 설정 상세 로깅
    console.log('[NextTankEnviTestProcess] 📊 Low temp settings details:');
    console.log('[NextTankEnviTestProcess] - lowTemp:', getTableOption.lowTempSettings.lowTemp);
    console.log('[NextTankEnviTestProcess] - targetTemp:', getTableOption.lowTempSettings.targetTemp);
    console.log('[NextTankEnviTestProcess] - waitTime:', getTableOption.lowTempSettings.waitTime);
    console.log('[NextTankEnviTestProcess] - readCount:', getTableOption.lowTempSettings.readCount);
    
    // cycleNumber 횟수만큼 반복
    const cycleNumber = getTableOption.delaySettings.cycleNumber || 1; // 기본값 1
    console.log(`[NextTankEnviTestProcess] 총 ${cycleNumber}회 사이클 실행 예정`);
    
    for (let cycle = 1; cycle <= cycleNumber; cycle++) {
      // 중지 요청 확인
      if (getProcessStopRequested()) {
        console.log(`[NextTankEnviTestProcess] 🛑 중지 요청 감지 - 사이클 ${cycle}에서 프로세스 중단`);
        
        // 중지 시에도 PowerSwitch 상태를 off로 설정
        setMachineRunningStatus(false);
        console.log(`[NextTankEnviTestProcess] 🔌 중지로 인한 PowerSwitch 상태 OFF 설정`);
        
        return { status: 'stopped', message: '사용자에 의해 중지됨', stoppedAtCycle: cycle };
      }
      
      console.log(`[NextTankEnviTestProcess] === 사이클 ${cycle}/${cycleNumber} 시작 ===`);
      
      // 사이클별 결과 저장용 변수
      let highTempResults = [];
      let lowTempResults = [];
      
      // high temp test
      const highTemp = getTableOption.highTempSettings.targetTemp;
      const waitTime = getTableOption.highTempSettings.waitTime; // 분 단위로 저장된 값
      const highTempTest = getTableOption.highTempSettings.highTemp;
      const readCount = getTableOption.highTempSettings.readCount;
      console.log(`[NextTankEnviTestProcess] highTemp: ${highTemp}`);
      console.log(`[NextTankEnviTestProcess] waitTime: ${waitTime}분`);
      console.log(`[NextTankEnviTestProcess] readCount: ${readCount}`); 
      console.log(`[NextTankEnviTestProcess] highTempTest: ${highTempTest}`);

      if(highTempTest === true) {
        console.log(`[NextTankEnviTestProcess] 사이클 ${cycle}: 1. 고온 테스트 시작`);
        // 챔버 온도를 읽어서 비교하여 도달하면 테스트 시작
        // 아니면 온도가 도달 할때 까지 대기
        while(true) {
          // 중지 요청 확인
          if (getProcessStopRequested()) {
            console.log(`[NextTankEnviTestProcess] 🛑 중지 요청 감지 - 고온 테스트 대기 중 중단`);
            return { status: 'stopped', message: '사용자에 의해 중지됨', stoppedAtCycle: cycle, stoppedAtPhase: 'high_temp_waiting' };
          }
          
          const chamberTemp = await ReadChamber();
          
          // ReadChamber 실패 시 처리
          if (chamberTemp === false) {
            console.error(`[NextTankEnviTestProcess] 🛑 챔버 온도 읽기 실패 - 사이클 ${cycle}에서 프로세스 중단`);
            
            // PowerSwitch 상태를 off로 설정
            setMachineRunningStatus(false);
            console.log(`[NextTankEnviTestProcess] 🔌 챔버 오류로 인한 PowerSwitch 상태 OFF 설정`);
            
            return { 
              status: 'error', 
              message: '챔버 온도 읽기 실패 - 장비 연결 상태를 확인하세요', 
              stoppedAtCycle: cycle, 
              errorType: 'chamber_read_failed' 
            };
          }
          
          if(chamberTemp >= highTemp) {
            console.log(`[NextTankEnviTestProcess] 사이클 ${cycle}: 고온 테스트 시작`);
            // waitTime 분 만큼 대기
            await sleepMinutes(waitTime);
            // runSinglePageProcess 를 readCount 만큼 실행
            for(let i = 0; i < readCount; i++) {
              // 중지 요청 확인
              if (getProcessStopRequested()) {
                console.log(`[NextTankEnviTestProcess] 🛑 중지 요청 감지 - 고온 테스트 실행 중 중단 (${i+1}/${readCount})`);
                return { status: 'stopped', message: '사용자에 의해 중지됨', stoppedAtCycle: cycle, stoppedAtPhase: 'high_temp_test', stoppedAtTest: i+1 };
              }
              
              console.log(`[NextTankEnviTestProcess] 사이클 ${cycle}: 고온 테스트 ${i+1}/${readCount} 실행`);
              const singlePageResult = await runSinglePageProcess();
              if (singlePageResult && singlePageResult.status === 'stopped') {
                console.log(`[NextTankEnviTestProcess] 🛑 SinglePageProcess 중지됨: ${singlePageResult.message}`);
                return singlePageResult;
              }
              
              // 결과 누적
              if (singlePageResult && singlePageResult.status === 'completed' && singlePageResult.data) {
                highTempResults.push(singlePageResult.data);
              }
            }
            console.log(`[NextTankEnviTestProcess] 사이클 ${cycle}: 고온 테스트 완료 (${highTempResults.length}개 결과 누적)`);
            
            // 고온 테스트 결과를 하나의 파일로 저장 (readCount만큼 누적)
            if (highTempResults.length > 0) {
              console.log(`[NextTankEnviTestProcess] 사이클 ${cycle} 고온 테스트 결과 저장 시작 (${highTempResults.length}개 세트)`);
              const combinedHighTempData = combineTestResults(highTempResults);
              const saveResult = saveTotaReportTableToFile(
                combinedHighTempData, 
                getTableOption.channelVoltages, 
                cycle, 
                'HighTemp'
              );
              if (saveResult.success) {
                console.log(`[NextTankEnviTestProcess] 사이클 ${cycle} 고온 테스트 결과 저장 완료: ${saveResult.filename}`);
              } else {
                console.error(`[NextTankEnviTestProcess] 사이클 ${cycle} 고온 테스트 결과 저장 실패: ${saveResult.error}`);
              }
            }
            
            // 실행완료 하면 빠져 나감
            break;
          } else {
            await sleep(60000);
          }
        }
      }
      
      // low temp test
      const lowTemp = getTableOption.lowTempSettings.targetTemp;
      const lowWaitTime = getTableOption.lowTempSettings.waitTime; // 분 단위로 저장된 값
      const lowTempTest = getTableOption.lowTempSettings.lowTemp;
      const lowReadCount = getTableOption.lowTempSettings.readCount;
      console.log(`[NextTankEnviTestProcess] lowTemp: ${lowTemp}`);
      console.log(`[NextTankEnviTestProcess] lowWaitTime: ${lowWaitTime}분`);
      console.log(`[NextTankEnviTestProcess] lowReadCount: ${lowReadCount}`); 
      console.log(`[NextTankEnviTestProcess] lowTempTest: ${lowTempTest}`);
      
      if(lowTempTest === true) {
        console.log(`[NextTankEnviTestProcess] 사이클 ${cycle}: 2. 저온 테스트 시작`); 
        // 챔버 온도를 읽어서 비교하여 도달하면 테스트 시작
        // 아니면 온도가 도달 할때 까지 대기
        while(true) {
          // 중지 요청 확인
          if (getProcessStopRequested()) {
            console.log(`[NextTankEnviTestProcess] 🛑 중지 요청 감지 - 저온 테스트 대기 중 중단`);
            return { status: 'stopped', message: '사용자에 의해 중지됨', stoppedAtCycle: cycle, stoppedAtPhase: 'low_temp_waiting' };
          }
          
          console.log(`[NextTankEnviTestProcess] 사이클 ${cycle}: 저온 테스트 대기 중 목표 온도: ${lowTemp}℃`);

          const chamberTemp = await ReadChamber();
          console.log(`[NextTankEnviTestProcess] 사이클 ${cycle}: 저온 테스트 대기 중 온도: ${chamberTemp}℃`);
          
          // ReadChamber 실패 시 처리
          if (chamberTemp === false) {
            console.error(`[NextTankEnviTestProcess] 🛑 챔버 온도 읽기 실패 - 사이클 ${cycle}에서 프로세스 중단`);
            
            // PowerSwitch 상태를 off로 설정
            setMachineRunningStatus(false);
            console.log(`[NextTankEnviTestProcess] 🔌 챔버 오류로 인한 PowerSwitch 상태 OFF 설정`);
            
            return { 
              status: 'error', 
              message: '챔버 온도 읽기 실패 - 장비 연결 상태를 확인하세요', 
              stoppedAtCycle: cycle, 
              errorType: 'chamber_read_failed' 
            };
          }
          
          if(chamberTemp <= lowTemp) {
            console.log(`[NextTankEnviTestProcess] 사이클 ${cycle}: 저온 테스트 시작`);
            console.log(`[NextTankEnviTestProcess] 저온테스트 전 ${lowWaitTime}분 대기`);
            // lowWaitTime 분 만큼 대기
            await sleepMinutes(lowWaitTime);
            // runSinglePageProcess 를 readCount 만큼 실행
            for(let i = 0; i < lowReadCount; i++) {
              // 중지 요청 확인
              if (getProcessStopRequested()) {
                console.log(`[NextTankEnviTestProcess] 🛑 중지 요청 감지 - 저온 테스트 실행 중 중단 (${i+1}/${lowReadCount})`);
                return { status: 'stopped', message: '사용자에 의해 중지됨', stoppedAtCycle: cycle, stoppedAtPhase: 'low_temp_test', stoppedAtTest: i+1 };
              }
              
              console.log(`[NextTankEnviTestProcess] 사이클 ${cycle}: 저온 테스트 ${i+1}/${lowReadCount} 실행`);
              const singlePageResult = await runSinglePageProcess();
              if (singlePageResult && singlePageResult.status === 'stopped') {
                console.log(`[NextTankEnviTestProcess] 🛑 SinglePageProcess 중지됨: ${singlePageResult.message}`);
                return singlePageResult;
              }
              
              // 결과 누적
              if (singlePageResult && singlePageResult.status === 'completed' && singlePageResult.data) {
                lowTempResults.push(singlePageResult.data);
              }
            }
            console.log(`[NextTankEnviTestProcess] 사이클 ${cycle}: 저온 테스트 완료 (${lowTempResults.length}개 결과 누적)`);
            
            // 저온 테스트 결과를 하나의 파일로 저장 (lowReadCount만큼 누적)
            if (lowTempResults.length > 0) {
              console.log(`[NextTankEnviTestProcess] 사이클 ${cycle} 저온 테스트 결과 저장 시작 (${lowTempResults.length}개 세트)`);
              const combinedLowTempData = combineTestResults(lowTempResults);
              const saveResult = saveTotaReportTableToFile(
                combinedLowTempData, 
                getTableOption.channelVoltages, 
                cycle, 
                'LowTemp'
              );
              if (saveResult.success) {
                console.log(`[NextTankEnviTestProcess] 사이클 ${cycle} 저온 테스트 결과 저장 완료: ${saveResult.filename}`);
              } else {
                console.error(`[NextTankEnviTestProcess] 사이클 ${cycle} 저온 테스트 결과 저장 실패: ${saveResult.error}`);
              }
            }
            
            // 실행완료 하면 빠져 나감
            break;
          } else {
            await sleep(60000);
          }
        }
      }
      

      
      console.log(`[NextTankEnviTestProcess] === 사이클 ${cycle}/${cycleNumber} 완료 ===`);
      
      // 마지막 사이클이 아니면 다음 사이클을 위한 대기 시간 추가
      if (cycle < cycleNumber) {
        console.log(`[NextTankEnviTestProcess] 다음 사이클을 위한 대기 중...`);
        await sleep(5000); // 5초 대기 (필요에 따라 조정 가능)
      }
    }
    
    console.log(`[NextTankEnviTestProcess] 모든 사이클(${cycleNumber}회) 완료`);
    
    // 프로세스 완료 시 PowerSwitch 상태를 off로 설정
    setMachineRunningStatus(false);
    console.log(`[NextTankEnviTestProcess] 🔌 PowerSwitch 상태를 OFF로 설정`);
    
    return { status: 'completed', message: '모든 사이클 완료' };
    
  } catch (error) {
    console.error('[NextTankEnviTestProcess] 예외 발생:', error);
    
    // 에러 발생 시에도 PowerSwitch 상태를 off로 설정
    setMachineRunningStatus(false);
    console.log(`[NextTankEnviTestProcess] 🔌 에러 발생으로 인한 PowerSwitch 상태 OFF 설정`);
    
    throw error;
  }
}


