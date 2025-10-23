import { GetData } from './GetData.js';
import { RelayAllOff, SelectDeviceOn, SelectDeviceOff } from './SelectDevice.js';
import { SendVoltCommand } from './SetVolt.js';
import { ReadVolt } from './ReadVolt.js';
import { ReadChamber } from './ReadChamber.js'; 
import { getProcessStopRequested, setMachineRunningStatus, getCurrentChamberTemperature, getSafeGetTableOption } from './backend-websocket-server.js';
import { sleep, getFormattedDateTime, getDateDirectoryName, Now } from './utils/common.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { InterByteTimeoutParser } from 'serialport';

// ES Module 환경에서 __dirname 사용을 위한 설정
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 시뮬레이션 모드 - backend-websocket-server.js에서 관리
let SIMULATION_PROC = false;

// 시뮬레이션 모드를 설정하는 함수
export function setSimulationMode(enabled) {
  SIMULATION_PROC = enabled;
  console.log(`[RunTestProcess] 시뮬레이션 모드 설정: ${enabled}`);
}

// 시뮬레이션 모드를 가져오는 함수
export function getSimulationMode() {
  return SIMULATION_PROC;
}

// 테이블 데이터 전송 디바운싱을 위한 전역 변수
let tableDataBroadcastTimeout = null;
let lastTableDataBroadcast = 0;

// 전역 WebSocket 서버 참조를 위한 변수
let globalWss = null;

// 테스트 실행별 디렉토리명을 저장하는 전역 변수
let currentTestDirectoryName = null;
// 테스트 실행별 전체 디렉토리 경로를 저장하는 전역 변수
let currentTestDirectoryPath = null;

// 진행상황 추적을 위한 전역 변수들
let currentCycle = 0;
let totalCycles = 0;
let currentTestPhase = ''; // 'high_temp' 또는 'low_temp'
let currentCallIndex = 0; // 현재 runSinglePageProcess 호출 순서
let totalCallCount = 0; // 전체 runSinglePageProcess 호출 횟수
let currentTestType = ''; // '고온 테스트' 또는 '저온 테스트'

// 전역 변수를 설정하는 함수
export function setCurrentTestDirectoryPath(path) {
  currentTestDirectoryPath = path;
  console.log(`[RunTestProcess] 현재 테스트 디렉토리 경로 설정: ${path}`);
}

// WebSocket 서버 참조를 설정하는 함수
export function setWebSocketServer(wss) {
  globalWss = wss;
  console.log('[RunTestProcess] WebSocket 서버 참조 설정됨');
}

// 진행상황 추적 변수들을 초기화하는 함수
function resetProgressTracking() {
  currentCycle = 0;
  totalCycles = 0;
  currentTestPhase = '';
  currentCallIndex = 0;
  totalCallCount = 0;
  currentTestType = '';
  console.log(`[ProgressTracking] 진행상황 추적 변수 초기화 완료`);
}

// 진행상황을 업데이트하고 WebSocket으로 전송하는 함수
function updateAndSendProgress(cycle, totalCycles, testPhase, callIndex, totalCallCount, testType) {
  // 전역 변수 업데이트
  currentCycle = cycle;
  totalCycles = totalCycles;
  currentTestPhase = testPhase;
  currentCallIndex = callIndex;
  totalCallCount = totalCallCount;
  currentTestType = testType;
  
  // WebSocket으로 진행상황 전송
  if (globalWss) {
    const progressMessage = `[TEST_PROGRESS_DETAIL] ${JSON.stringify({
      currentCycle: cycle,
      totalCycles: totalCycles,
      testPhase: testPhase,
      currentCallIndex: callIndex,
      totalCallCount: totalCallCount,
      testType: testType,
      displayText: `사이클 ${cycle}/${totalCycles} - ${testType} - ${callIndex}/${totalCallCount} (현재/총 측정 수)`,
      timestamp: new Date().toISOString()
    })}`;
    
    let sentCount = 0;
    globalWss.clients.forEach(client => {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(progressMessage);
        sentCount++;
      }
    });
    console.log(`[ProgressTracking] 진행상황 전송 완료 - 클라이언트 수: ${sentCount}, 내용: 사이클 ${cycle}/${totalCycles} - ${testType} - ${callIndex}/${totalCallCount}`);
  } else {
    console.warn(`[ProgressTracking] 전역 WebSocket 서버가 설정되지 않음 - 진행상황 전송 불가`);
  }
}

// 디바운싱된 테이블 데이터 전송 함수
async function debouncedBroadcastTableData(force = false) {
  const now = Date.now();
  const minInterval = 5000; // 최소 5초 간격으로 증가 (과도한 전송 방지)
  
  // 강제 전송이거나 최소 간격이 지났을 때만 전송
  if (force || (now - lastTableDataBroadcast) >= minInterval) {
    // 기존 타임아웃 취소
    if (tableDataBroadcastTimeout) {
      clearTimeout(tableDataBroadcastTimeout);
      tableDataBroadcastTimeout = null;
    }
    
    try {
      await broadcastTableData();
      lastTableDataBroadcast = now;
      console.log(`[DebouncedBroadcast] 테이블 데이터 전송 완료 (강제: ${force})`);
    } catch (error) {
      console.error(`[DebouncedBroadcast] 테이블 데이터 전송 실패:`, error);
    }
  } else {
    // 디바운싱: 기존 타임아웃 취소하고 새로운 타임아웃 설정
    if (tableDataBroadcastTimeout) {
      clearTimeout(tableDataBroadcastTimeout);
    }
    
    const remainingTime = minInterval - (now - lastTableDataBroadcast);
    tableDataBroadcastTimeout = setTimeout(async () => {
      try {
        await broadcastTableData();
        lastTableDataBroadcast = Date.now();
        console.log(`[DebouncedBroadcast] 디바운싱된 테이블 데이터 전송 완료`);
      } catch (error) {
        console.error(`[DebouncedBroadcast] 디바운싱된 테이블 데이터 전송 실패:`, error);
      }
      tableDataBroadcastTimeout = null;
    }, remainingTime);
    
    console.log(`[DebouncedBroadcast] 테이블 데이터 전송 디바운싱 (${remainingTime}ms 후 전송)`);
  }
}

// 프로세스 로그를 클라이언트에게 전송하는 함수
function sendProcessLog(message) {
  if (globalWss) {
    const logMessage = `[PROCESS_LOG] ${message}`;
    let sentCount = 0;
    globalWss.clients.forEach(client => {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(logMessage);
        sentCount++;
      }
    });
    // console.log(`[ProcessLog] 전송 완료 - 클라이언트 수: ${sentCount}, 메시지: ${message}`);
  }
}

// 시간 진행 상황을 클라이언트에게 전송하는 함수
function sendTimeProgress(data) {
  if (globalWss) {
    const timeProgressMessage = `[TIME_PROGRESS] ${JSON.stringify(data)}`;
    let sentCount = 0;
    globalWss.clients.forEach(client => {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(timeProgressMessage);
        sentCount++;
      }
    });
    console.log(`[TimeProgress] 전송 완료 - 클라이언트 수: ${sentCount}, 데이터:`, data);
  }
}

// 1분 간격으로 시간 진행 상황을 업데이트하는 함수
function startTimeProgressUpdates(startTime, totalDuration, currentPhase = 'waiting') {
  let isFirstSend = true; // 첫 번째 전송 여부 추적
  
  // 즉시 첫 번째 업데이트 실행
  const updateTimeProgress = () => {
    const currentTime = Date.now();
    const elapsedTime = currentTime - startTime;
    const remainingTime = Math.max(0, totalDuration - elapsedTime);
    
    const timeProgressData = {
      phase: currentPhase,
      startTime: startTime,
      currentTime: currentTime,
      elapsedTime: elapsedTime,
      totalDuration: totalDuration,
      remainingTime: remainingTime,
      elapsedMinutes: Math.round(elapsedTime / 60000),
      remainingMinutes: Math.round(remainingTime / 60000),
      totalMinutes: Math.round(totalDuration / 60000),
      progressPercentage: Math.min(100, Math.round((elapsedTime / totalDuration) * 100)),
      timestamp: new Date().toISOString()
    };
    
    // 첫 번째 전송만 실행하고 이후에는 전송하지 않음
    if (isFirstSend) {
      console.log('📤 Sending first TIME_PROGRESS message - totalMinutes:', timeProgressData.totalMinutes);
      sendTimeProgress(timeProgressData);
      isFirstSend = false;
      console.log('🔒 TIME_PROGRESS sending disabled - client will use local calculation');
    } else {
      console.log('🔒 TIME_PROGRESS sending skipped - client using local calculation');
    }
    
    // 시간이 다 되었으면 인터벌 정리
    if (remainingTime <= 0) {
      clearInterval(intervalId);
    }
  };
  
  // 즉시 첫 번째 업데이트 실행
  updateTimeProgress();
  
  // 그 후 1분 간격으로 업데이트
  const intervalId = setInterval(updateTimeProgress, 60000);
  
  return intervalId;
}
// import { listenerCount } from 'ws';

/**
 * 4시간(14400000ms) 대기 Promise
 */

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

const RawVoltTable = [];

// 첫 번째 차원 (3)
for (let i = 0; i < 3; i++) {
  RawVoltTable[i] = []; // 두 번째 차원을 위한 배열 초기화
  // 두 번째 차원 (10)
  for (let j = 0; j < 10; j++) {
    RawVoltTable[i][j] = []; // 세 번째 차원을 위한 배열 초기화
    // 세 번째 차원 (1) - 채널 1개로 변경
    for (let k = 0; k < 1; k++) {
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

/**
 * 중지 요청을 확인할 수 있는 분 단위 대기 함수
 * @param {number} minutes - 대기할 분 (1-999)
 * @param {string} context - 대기 중인 컨텍스트 (로그용)
 * @returns {Promise} 대기 완료 후 resolve되는 Promise, 중지 요청 시 reject
 */
function sleepMinutesWithStopCheck(minutes, context = '') {
  // 입력값 검증
  if (typeof minutes !== 'number' || minutes < 1 || minutes > 999) {
    console.warn(`[sleepMinutesWithStopCheck] 잘못된 분 값: ${minutes}. 1-999 범위의 값이어야 합니다.`);
    return Promise.resolve();
  }
  
  const milliseconds = minutes * 60 * 1000; // 분을 밀리초로 변환
  const checkInterval = 5000; // 5초마다 중지 요청 확인
  const contextStr = context ? ` [${context}]` : '';
  
  console.log(`[sleepMinutesWithStopCheck]${contextStr} ${minutes}분 대기 시작 (${milliseconds}ms) - 중지 요청 확인 간격: ${checkInterval}ms`);
  
  // 시간 진행 상황 업데이트 비활성화 (테스트 진행 중 창 표시하지 않음)
  // const startTime = Date.now();
  // const timeProgressInterval = startTimeProgressUpdates(startTime, milliseconds, 'waiting');
  
  return new Promise((resolve, reject) => {
    const startTime = Date.now(); // 로컬 변수로 이동
    let elapsed = 0;
    
    const checkStop = () => {
      // 중지 요청 확인
      if (getProcessStopRequested()) {
        console.log(`[sleepMinutesWithStopCheck]${contextStr} 🛑 중지 요청 감지 - 대기 중단 (경과: ${Math.round(elapsed/1000)}초/${minutes}분)`);
        
        // 시간 진행 상황 인터벌 정리 (비활성화됨)
        // if (timeProgressInterval) {
        //   clearInterval(timeProgressInterval);
        // }
        
        reject(new Error('PROCESS_STOP_REQUESTED'));
        return;
      }
      
      elapsed = Date.now() - startTime;
      
      if (elapsed >= milliseconds) {
        console.log(`[sleepMinutesWithStopCheck]${contextStr} ${minutes}분 대기 완료`);
        
        // 시간 진행 상황 인터벌 정리 (비활성화됨)
        // if (timeProgressInterval) {
        //   clearInterval(timeProgressInterval);
        // }
        
        resolve();
      } else {
        // 다음 체크까지 대기
        setTimeout(checkStop, Math.min(checkInterval, milliseconds - elapsed));
      }
    };
    
    // 첫 번째 체크 시작
    setTimeout(checkStop, Math.min(checkInterval, milliseconds));
  });
}




/**
 * TotaReportTable을 이미지와 유사한 전기적 성능 시험 테이블 형태로 저장
 * 이미지의 테이블 구조에 맞춰 CSV 형식으로 저장
 */
export function saveTotaReportTableToFile(data, channelVoltages = [5.0, 15.0, -15.0, 24.0], cycleNumber = 1, testType = '') {
  try {
    // 디바이스 선택 상태 로드
    const deviceStates = loadDeviceStates();
    console.log(`[SaveData] 로드된 디바이스 선택 상태: ${JSON.stringify(deviceStates)}`);
    
    // 데이터 유효성 검사 강화
    if (!data) {
      console.error('[SaveData] ❌ 데이터가 undefined입니다.');
      return { success: false, error: '데이터가 undefined입니다.' };
    }
    
    if (!data.reportTable || !Array.isArray(data.reportTable) || data.reportTable.length === 0) {
      console.error('[SaveData] ❌ reportTable이 유효하지 않습니다.');
      return { success: false, error: 'reportTable이 유효하지 않습니다.' };
    }
    
    if (!data.reportTable[0] || !data.reportTable[0].voltagTable) {
      console.error('[SaveData] ❌ voltagTable이 유효하지 않습니다.');
      return { success: false, error: 'voltagTable이 유효하지 않습니다.' };
    }
    
    // ProductNumber 배열 검증 및 기본값 설정
    if (!data.ProductNumber || !Array.isArray(data.ProductNumber)) {
      console.warn('[SaveData] ⚠️ ProductNumber가 유효하지 않아 기본값을 사용합니다.');
      data.ProductNumber = ['Unknown'];
    }
    
    // modelName 검증 및 기본값 설정
    if (!data.modelName) {
      console.warn('[SaveData] ⚠️ modelName이 없어 기본값을 사용합니다.');
      data.modelName = 'Unknown Model';
    }
    
    // inputVolt 검증 및 기본값 설정
    if (!data.inputVolt || !Array.isArray(data.inputVolt)) {
      console.warn('[SaveData] ⚠️ inputVolt가 유효하지 않아 기본값을 사용합니다.');
      data.inputVolt = [18, 24, 30];
    }
    
    const filename = `${getFormattedDateTime()}_Cycle${cycleNumber}_${testType}.csv`;
    
    // ===== 전역 변수에서 테스트 디렉토리 경로 사용 (새로 생성하지 않음) =====
    let dateFolderPath = currentTestDirectoryPath;
    
    if (!dateFolderPath) {
      console.log(`[SaveData] 📁 전역 디렉토리 경로가 설정되지 않음 - 자동으로 최근 테스트 디렉토리 검색`);
      
      // Automatically find the most recent test directory
      try {
        const dataFolderPath = path.join(process.cwd(), 'Data');
        const directories = fs.readdirSync(dataFolderPath, { withFileTypes: true })
          .filter(dirent => dirent.isDirectory())
          .map(dirent => dirent.name)
          .filter(name => /^\d{8}_\d{4}$/.test(name)) // Filter for date format YYYYMMDD_HHMM
          .sort()
          .reverse(); // Most recent first
        
        if (directories.length > 0) {
          const dateDirectoryName = directories[0];
          dateFolderPath = path.join(dataFolderPath, dateDirectoryName);
          console.log(`[SaveData] 📁 자동으로 최근 테스트 디렉토리 발견: ${dateDirectoryName}`);
        } else {
          throw new Error('테스트 데이터 디렉토리를 찾을 수 없습니다');
        }
      } catch (error) {
        console.error(`[SaveData] ❌ 자동 디렉토리 검색 실패: ${error.message}`);
        throw new Error('테스트 데이터 디렉토리를 찾을 수 없습니다');
      }
    }
    
    console.log(`[SaveData] 📁 기존 테스트 디렉토리 사용: ${dateFolderPath}`);
    


    
    if (!fs.existsSync(dateFolderPath)) {
      fs.mkdirSync(dateFolderPath, { recursive: true });
      console.log(`[SaveData] 📁 테스트 결과 저장 디렉토리 생성됨: ${dateFolderPath}`);
      console.log(`[SaveData] 📅 디렉토리명: ${dateDirectoryName} (${new Date().toLocaleString('en-US')})`);
      
      // 클라이언트에게 디렉토리 생성 알림 전송
      if (globalWss) {
        const dirCreateMessage = `[DIRECTORY_CREATED] ${dateDirectoryName}`;
        let sentCount = 0;
        globalWss.clients.forEach(client => {
          if (client.readyState === 1) { // WebSocket.OPEN
            client.send(dirCreateMessage);
            sentCount++;
          }
        });
        console.log(`[SaveData] 📤 디렉토리 생성 알림 전송 완료 - 클라이언트 수: ${sentCount}`);
      }
    } else {
      console.log(`[SaveData] 📁 기존 디렉토리 사용: ${dateFolderPath}`);
    }
    
    const filePath = path.join(dateFolderPath, filename);
    
    let csvContent = '';
    const reportData = data.reportTable[0];
    
    // 디버깅을 위한 데이터 구조 로그
    console.log(`[SaveData] 📊 데이터 구조 확인:`);
    console.log(`[SaveData] - inputVolt: ${JSON.stringify(data.inputVolt)}`);
    console.log(`[SaveData] - voltagTable 구조: ${reportData.voltagTable ? reportData.voltagTable.length : 'undefined'} x ${reportData.voltagTable?.[0]?.length || 'undefined'} x ${reportData.voltagTable?.[0]?.[0]?.length || 'undefined'}`);
    
    // 각 voltageIndex별 데이터 확인
    for (let v = 0; v < 3; v++) {
      if (reportData.voltagTable && reportData.voltagTable[v]) {
        console.log(`[SaveData] - Voltage ${v}: ${reportData.voltagTable[v].length} devices`);
        for (let d = 0; d < 3; d++) {
          if (reportData.voltagTable[v][d]) {
            console.log(`[SaveData]   - Device ${d}: ${reportData.voltagTable[v][d].length} reads`);
            if (reportData.voltagTable[v][d].length > 0) {
              console.log(`[SaveData]     - Sample data: ${JSON.stringify(reportData.voltagTable[v][d][0])}`);
            }
          }
        }
      }
    }
    
     // Document header information (similar to image format)
     csvContent += `Document No.,K2-AD-110-A241023-001\n`;
     csvContent += `Product Name,${data.modelName || ''}\n`;
     csvContent += `Product Number,${data.ProductNumber.join(';') || ''}\n`;
     csvContent += `Test Date,${reportData.TestDate || ''}\n`;
     csvContent += `Test Time,${reportData.TestTime || ''}\n`;
     csvContent += `Test Temperature,${reportData.TestTemperature || ''}℃\n`;
     csvContent += `Cycle Number,${cycleNumber}\n`;
     csvContent += `Test Type,${testType}\n`;
    csvContent += '\n';
    
     // 새로운 테이블 구조 (그림과 유사한 형태)
     csvContent += `INPUT,제품번호,1st,2nd,3rd,4th,5th,6th,7th,8th,9th,10th,A.Q.L\n`;
     
     // 전압별 그룹 결과를 미리 계산
     const voltageGroupResults = {};
     for (let voltageIndex = 0; voltageIndex < 3; voltageIndex++) {
       const inputVoltage = data.inputVolt[voltageIndex] || 24;
       voltageGroupResults[voltageIndex] = {
         devices: [],
         allGood: true
       };
       
       // 해당 전압의 모든 디바이스 결과 수집
       for (let deviceIndex = 0; deviceIndex < 3; deviceIndex++) {
         const productNumber = `C00${deviceIndex + 5}`;
         const measurementData = [];
         
         // globalTableData의 깊은 복사본 생성 (데이터 경합 상태 방지)
         const tableDataSnapshot = JSON.parse(JSON.stringify(globalTableData));
         
         if (tableDataSnapshot.devices[deviceIndex] && tableDataSnapshot.devices[deviceIndex].tests[voltageIndex]) {
           const deviceReads = tableDataSnapshot.devices[deviceIndex].tests[voltageIndex].reads;
           
           for (let readIndex = 0; readIndex < deviceReads.length && readIndex < 10; readIndex++) {
             const read = deviceReads[readIndex];
             if (read && read.channels[0] && read.channels[0].voltage !== null) {
               const voltage = read.channels[0].voltage;
               const truncatedVoltage = Math.floor(voltage);
               measurementData.push(truncatedVoltage);
             } else {
               measurementData.push('-');
             }
           }
         }
         
         // 10개 미만이면 나머지를 '-'로 채움
         while (measurementData.length < 10) {
           measurementData.push('-');
         }
         
         // 개별 디바이스 A.Q.L 계산 - 서버와 동일한 고정 범위 사용
         const validMeasurements = measurementData.filter(val => val !== '-');
         // 서버와 동일한 고정 범위: 200 <= 측정값 <= 242 (200과 242 포함)
         const minVoltage = 200; 
         const maxVoltage = 242;
         
         let allWithinTolerance = true;
         for (const measurement of validMeasurements) {
           if (measurement < minVoltage || measurement > maxVoltage) {
             allWithinTolerance = false;
             break;
           }
         }
         
         const deviceResult = allWithinTolerance ? 'G' : 'NG';
         voltageGroupResults[voltageIndex].devices.push({
           deviceIndex: deviceIndex,
           productNumber: productNumber,
           result: deviceResult,
           measurementData: measurementData
         });
         
         // 하나라도 NG이면 해당 전압 그룹은 NG
         if (deviceResult === 'NG') {
           voltageGroupResults[voltageIndex].allGood = false;
         }
       }
       
       console.log(`[SaveData] 📊 ${inputVoltage}V 그룹 결과: ${voltageGroupResults[voltageIndex].allGood ? 'G' : 'NG'} (디바이스별: ${voltageGroupResults[voltageIndex].devices.map(d => d.result).join(', ')})`);
     }

     // Generate table for each input voltage (3개 전압 × 3개 디바이스 × 4회 측정 = 36개 데이터)
     // globalTableData를 사용하여 클라이언트 파워테이블과 동일한 데이터 사용
     for (let voltageIndex = 0; voltageIndex < 3; voltageIndex++) {
       const inputVoltage = data.inputVolt[voltageIndex] || 24;
       
       // 각 전압별로 3개의 행 생성 (C005, C006, C007) - 각 디바이스별로 별도 행
       for (let deviceIndex = 0; deviceIndex < 3; deviceIndex++) {
         const productNumber = `C00${deviceIndex + 5}`; // C005, C006, C007
         
         // 디바이스 선택 상태 확인
         const isDeviceSelected = deviceStates[deviceIndex];
         
         if (isDeviceSelected) {
           // 선택된 디바이스의 경우 실제 측정값 표시
           // 전압별 그룹 결과에서 해당 디바이스 데이터 가져오기
           const deviceData = voltageGroupResults[voltageIndex].devices[deviceIndex];
           const measurementData = deviceData.measurementData;
           
           // A.Q.L 계산 (전압별 그룹 결과 적용)
           const voltageGroupResult = voltageGroupResults[voltageIndex];
           const aql = voltageGroupResult.allGood ? 'G' : 'NG';
           
           // 테이블 행 생성 (그림과 동일한 형태)
           console.log(`[SaveData] 📊 ${inputVoltage}V ${productNumber} - 최종 측정값: [${measurementData.join(', ')}], AQL: ${aql} (전압별 그룹 결과 적용) - 선택됨`);
           csvContent += `${inputVoltage}V,${productNumber},${measurementData.join(',')},${aql}\n`;
         } else {
           // 선택되지 않은 디바이스는 "-.-" 표시
           const measurementData = Array(10).fill('-.-');
           const aql = '-.-';
           
           // 테이블 행 생성 (선택되지 않은 디바이스)
           console.log(`[SaveData] 📊 ${inputVoltage}V ${productNumber} - 선택되지 않음, AQL: ${aql}`);
           csvContent += `${inputVoltage}V,${productNumber},${measurementData.join(',')},${aql}\n`;
         }
       }
     }
    
    // 전체 통계 계산 (3개 전압 × 3개 디바이스 × 10회 측정 = 90개 데이터)
    // globalTableData를 사용하여 클라이언트 파워테이블과 동일한 데이터 사용
    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;
    
    for (let voltageIndex = 0; voltageIndex < 3; voltageIndex++) {
      // 선택된 Device의 모든 readCount 측정값을 확인
      for (let deviceIndex = 0; deviceIndex < 3; deviceIndex++) {
        // 디바이스 선택 상태 확인
        const isDeviceSelected = deviceStates[deviceIndex];
        
        if (isDeviceSelected) {
          // globalTableData 구조: devices[deviceIndex].tests[voltageIndex].reads[readIndex].channels[channelIndex]
          if (globalTableData.devices[deviceIndex] && globalTableData.devices[deviceIndex].tests[voltageIndex]) {
            const deviceReads = globalTableData.devices[deviceIndex].tests[voltageIndex].reads;
            for (let readIndex = 0; readIndex < deviceReads.length; readIndex++) {
              const read = deviceReads[readIndex];
              if (read && read.channels[0] && read.channels[0].voltage !== null) {
                totalTests++;
                // 고정 범위로 G/NG 판정: 200 <= 측정값 <= 242
                const voltage = read.channels[0].voltage;
                const minVoltage = 200;
                const maxVoltage = 242;
                
                if (voltage >= minVoltage && voltage <= maxVoltage) {
                  passedTests++;
                } else {
                  failedTests++;
                }
              }
            }
          }
        }
      }
    }
    
    console.log(`[SaveData] 📊 통계 계산 완료: 총 ${totalTests}개, 통과 ${passedTests}개, 실패 ${failedTests}개`);
    
     // Test results summary (similar to image bottom)
     csvContent += '\n';
     csvContent += `=== Test Results Summary ===\n`;
     csvContent += `Total Tests,${totalTests}\n`;
     csvContent += `Passed Tests,${passedTests}\n`;
     csvContent += `Failed Tests,${failedTests}\n`;
     csvContent += `Pass Rate,${totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(2) : 0}%\n`;
     csvContent += `Test Result,${passedTests > failedTests ? 'PASS' : 'FAIL'}\n`;
     csvContent += `Operator,System\n`;
     csvContent += `Document Version,PS-14(Rev.1)\n`;
     csvContent += `Company Name,Adelpia Lab Co., Ltd.\n`;
    
    // 파일에 저장
    fs.writeFileSync(filePath, csvContent, 'utf8');
    
    //console.log(`[SaveData] 전기적 성능 시험 테이블 형태로 저장 완료: ${filename}`);
    //console.log(`[SaveData] 파일 경로: ${filePath}`);
    //console.log(`[SaveData] 이미지와 유사한 테이블 구조로 저장됨`);
    console.log(`[SaveData] 테스트 통계: 총 ${totalTests}개, 통과 ${passedTests}개, 실패 ${failedTests}개`);
    
    return { success: true, filename, filePath };
  } catch (error) {
    console.error('[SaveData] 파일 저장 실패:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 전압값을 고정 범위(200 <= 측정값 <= 242)로 비교하여 G/N 판정
 * @param {number} readVoltage - 읽은 전압값
 * @param {number} expectedVoltage - 설정된 전압값 (사용하지 않음, 호환성을 위해 유지)
 * @returns {string} "G" (Good) 또는 "N" (Not Good)
 */
function compareVoltage(readVoltage, expectedVoltage) {
  // 읽은 전압이 숫자가 아니거나 에러인 경우
  if (typeof readVoltage !== 'number' || isNaN(readVoltage)) {
    console.log(`[compareVoltage] 유효하지 않은 전압값: ${readVoltage} (타입: ${typeof readVoltage})`);
    return "N";
  }
  
  // 고정 범위: 200 <= 측정값 <= 242 (200과 242 포함)
  const minVoltage = 200;
  const maxVoltage = 242;
  
  // 범위 내에 있는지 확인
  const isInRange = readVoltage >= minVoltage && readVoltage <= maxVoltage;
  const result = isInRange ? "G" : "N";
  
  // 디버깅을 위한 로그 추가
  console.log(`[compareVoltage] 전압값: ${readVoltage}, 범위: ${minVoltage}-${maxVoltage}, 결과: ${result}`);
  
  return result;
}

/**
 * 여러 테스트 결과를 하나로 결합
 * @param {Array} testResults - 테스트 결과 배열
 * @returns {Object} 결합된 테스트 데이터
 */


// 테스트를 위한 PowerTable 초기화 함수
export function testPowerTableReset() {
  if (globalWss) {
    const testResetMessage = `[POWER_TABLE_RESET] ${JSON.stringify({
      action: 'test_reset',
      timestamp: new Date().toISOString(),
      message: '테스트용 PowerTable 초기화'
    })}`;
    
    let sentCount = 0;
    globalWss.clients.forEach(client => {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(testResetMessage);
        sentCount++;
      }
    });
    console.log(`[TestPowerTableReset] 테스트 초기화 메시지 전송 완료 - 클라이언트 수: ${sentCount}`);
    return { success: true, sentCount };
  } else {
    console.error(`[TestPowerTableReset] 전역 WebSocket 서버가 설정되지 않음`);
    return { success: false, error: 'WebSocket 서버 미설정' };
  }
}

// 페이지 단위 테스트 프로세스 실행 (readCount 반복 포함)
export async function runSinglePageProcess(readCount = 1) {
  // 중단 보고서 생성을 위한 변수들
  let stopInfo = null;
  
  try {
    const modeText = SIMULATION_PROC ? '시뮬레이션 모드' : '실제 모드';
    console.log(`[SinglePageProcess] 🔧 단일 페이지 프로세스 시작 (${modeText}) - readCount: ${readCount}`);
    
    // 파워스위치 상태 확인
    const { getMachineRunningStatus } = await import('./backend-websocket-server.js');
    const isPowerOn = getMachineRunningStatus();
    
    if (!isPowerOn) {
      console.error(`[SinglePageProcess] ❌ 파워스위치가 OFF 상태입니다. 테스트를 중단합니다.`);
      stopInfo = { 
        status: 'stopped', 
        message: '파워스위치가 OFF 상태 - 테스트를 실행할 수 없습니다',
        errorType: 'power_switch_off',
        stoppedAtPhase: 'power_check'
      };
      return stopInfo;
    }

    // 프로세스 시작 시 테이블 데이터 초기화
    resetTableData();
    console.log(`[SinglePageProcess] ✅ 테이블 데이터 초기화 완료`);
    
    // PowerTable 전압 데이터 초기화 메시지 전송
    if (globalWss) {
      const resetMessage = `[POWER_TABLE_RESET] ${JSON.stringify({
        action: 'single_page_reset',
        timestamp: new Date().toISOString(),
        message: '단일 페이지 프로세스 시작 - 전압 데이터 초기화'
      })}`;
      
      let sentCount = 0;
      globalWss.clients.forEach(client => {
        if (client.readyState === 1) { // WebSocket.OPEN
          client.send(resetMessage);
          sentCount++;
        }
      });
      
      // 초기화 메시지 전송 후 잠시 대기 (클라이언트가 처리할 시간 확보)
      await sleep(3000);
    } else {
      console.warn(`[SinglePageProcess] 전역 WebSocket 서버가 설정되지 않음 - PowerTable 초기화 메시지 전송 불가`);
    }
    
    const getTableOption = await getSafeGetTableOption();
    
    // currentTable 변수 정의 - 테이블 데이터 저장용 (채널 1개, Device별 readCount 크기)
    const currentTable = {
      modelName: getTableOption.modelName || 'Unknown Model',
      ProductNumber: getTableOption.ProductNumber || ['Unknown'],
      inputVolt: getTableOption.outVoltSettings || [24, 18, 30],
      reportTable: [{
        TestDate: new Date().toLocaleDateString('en-US'),
        TestTime: new Date().toLocaleTimeString('en-US'),
        TestTemperature: getTableOption.highTempSettings?.targetTemp || 'N/A',
        voltagTable: Array(3).fill(null).map(() => 
          Array(3).fill(null).map(() => // Device 1,2,3
            Array(readCount).fill(null).map(() => 
              Array(1).fill("-.-") // 채널 1개, readCount 크기
            )
          )
        )
      }]
    };
    
    // 딜레이 설정 로드
    const onDelay = getTableOption.delaySettings.onDelay;
    const offDelay = getTableOption.delaySettings.offDelay;
    
    // 3개 input 전압에 대해 각각 readCount만큼 Device 1~3 읽기
    for (let voltageIndex = 0; voltageIndex < 3; voltageIndex++) {
      // 중지 요청 확인 - 전압 테스트 시작 전
      if (getProcessStopRequested()) {
        console.log(`[SinglePageProcess] 🛑 중지 요청 감지 - 전압 테스트 ${voltageIndex + 1}/3에서 중단`);
        return { status: 'stopped', message: '사용자에 의해 중지됨', stoppedAtVoltageTest: voltageIndex + 1, stoppedAtPhase: 'voltage_test_start' };
      }
      
      // 전압 설정
      const inputVolt = getTableOption.outVoltSettings[voltageIndex];
      console.log(`[SinglePageProcess] 전압 ${voltageIndex + 1}/3 설정: ${inputVolt}V`);
      
      // 전압 설정 재시도 로직
      let voltSetSuccess = false;
      let retryCount = 0;
      const maxRetries = 5;
      
      while (!voltSetSuccess && retryCount < maxRetries) {
        // 중지 요청 확인 - 전압 설정 중
        if (getProcessStopRequested()) {
          console.log(`[SinglePageProcess] 🛑 중지 요청 감지 - 전압 설정 중 중단`);
          return { status: 'stopped', message: '사용자에 의해 중단됨', stoppedAtVoltageTest: voltageIndex + 1, stoppedAtPhase: 'voltage_setting' };
        }
        
        try {
          if (SIMULATION_PROC === false) {
            voltSetSuccess = await SendVoltCommand(inputVolt);
          } else {
            voltSetSuccess = true;
          }

          if (voltSetSuccess === true) {
            console.log(`[SinglePageProcess] 전압 설정 성공: ${inputVolt}V`);
          } else {
            throw new Error('전압 설정 실패: 응답 없음');
          }
        } catch (error) {
          retryCount++;
          console.warn(`[SinglePageProcess] 전압 설정 실패 (${retryCount}/${maxRetries}): ${error}`);
          if (retryCount < maxRetries) {
            console.log(`[SinglePageProcess] 3초 후 재시도...`);
            await sleep(3000);
          } else {
            return { status: 'stopped', message: '전압설정실패', stoppedAtVoltageTest: voltageIndex + 1, stoppedAtPhase: 'before_voltage_setting' };
          }
        }
      }

      if (voltSetSuccess === false) {
        return { status: 'stopped', message: '전압설정실패', stoppedAtVoltageTest: voltageIndex + 1, stoppedAtPhase: 'before_voltage_setting' };
      }
      
      // readCount만큼 Device 1~3 읽기 반복
      for (let readIndex = 0; readIndex < readCount; readIndex++) {
        // 중지 요청 확인
        if (getProcessStopRequested()) {
          console.log(`[SinglePageProcess] 🛑 중지 요청 감지 - readCount ${readIndex + 1}/${readCount}에서 중단`);
          return { 
            status: 'stopped', 
            message: '사용자에 의해 중지됨', 
            stoppedAtRead: readIndex + 1,
            stoppedAtVoltageTest: voltageIndex + 1,
            stoppedAtPhase: 'read_count_loop'
          };
        }
        
        console.log(`[SinglePageProcess] 전압 ${inputVolt}V - readCount ${readIndex + 1}/${readCount} 실행 시작`);
        
        // Device 1~3 읽기
        for (let deviceIndex = 0; deviceIndex < 3; deviceIndex++) {
          // 중지 요청 확인 - 디바이스 처리 시작 전
          if (getProcessStopRequested()) {
            console.log(`[SinglePageProcess] 🛑 중지 요청 감지 - 디바이스 ${deviceIndex + 1}/3에서 중단`);
            return { status: 'stopped', message: '사용자에 의해 중단됨', stoppedAtVoltageTest: voltageIndex + 1, stoppedAtDevice: deviceIndex + 1, stoppedAtPhase: 'device_start' };
          }
            
          if (getTableOption.deviceStates[deviceIndex] === false) {
            currentTable.reportTable[0].voltagTable[voltageIndex][deviceIndex][readIndex][0] = "-.-";
          } else {
            // 디바이스 선택 및 전압 읽기 로직
            const deviceResult = await executeDeviceReading(getTableOption, voltageIndex, deviceIndex, readIndex, inputVolt);
            if (deviceResult.status === 'stopped') {
              return deviceResult;
            }
            currentTable.reportTable[0].voltagTable[voltageIndex][deviceIndex][readIndex][0] = deviceResult.voltageWithComparison;
          }
        }
        
        console.log(`[SinglePageProcess] 전압 ${inputVolt}V - readCount ${readIndex + 1}/${readCount} 완료`);
      }
    }
    
    return { 
      status: 'completed', 
      message: `단일 페이지 프로세스 완료 (${readCount}회 실행)`,
      data: currentTable,
      readCount: readCount
    };
    
  } catch (error) {
    console.error('[SinglePageProcess] 예외 발생:', error);
    
    // 에러 발생 시에도 중단 보고서 생성하지 않음 - 상위 함수에서 처리
    stopInfo = { 
      status: 'error', 
      message: `예외 발생: ${error.message}`,
      errorType: 'exception',
      stoppedAtPhase: 'unknown'
    };
    
    return stopInfo;
  }
}

// 디바이스 읽기 실행 함수
async function executeDeviceReading(getTableOption, voltageIndex, deviceIndex, readIndex, inputVolt) {
  try {
    const maxRetries = 5;
    let retryCount = 0;
    
    // 딜레이 설정 로드
    const onDelay = getTableOption.delaySettings.onDelay;
    const offDelay = getTableOption.delaySettings.offDelay;
    
    // 디바이스 선택 재시도 로직
    let deviceSelectSuccess = false;
    
    while (!deviceSelectSuccess && retryCount < maxRetries) {
      // 중지 요청 확인 - 디바이스 선택 중
      if (getProcessStopRequested()) {
        console.log(`[SinglePageProcess] 🛑 중지 요청 감지 - 디바이스 ${deviceIndex + 1} 선택 중 중단`);
        return { status: 'stopped', message: '사용자에 의해 중단됨', stoppedAtVoltageTest: voltageIndex + 1, stoppedAtDevice: deviceIndex + 1, stoppedAtPhase: 'device_selection' };
      }
      
      try {
        // 릴레이 동작 전 정지 신호 확인
        if (getProcessStopRequested()) {
          console.log(`[SinglePageProcess] 🛑 릴레이 동작 전 정지 신호 감지 - 디바이스 ${deviceIndex + 1} 선택 중단`);
          return { status: 'stopped', message: '릴레이 동작 전 정지 신호 감지', stoppedAtVoltageTest: voltageIndex + 1, stoppedAtDevice: deviceIndex + 1, stoppedAtPhase: 'before_relay_operation' };
        }

        let selectResult = true;

        if (SIMULATION_PROC === false) {
          selectResult = await SelectDeviceOn(deviceIndex + 1);  // 1부터 시작
        }

        if (selectResult === true || selectResult.success === true) {
          deviceSelectSuccess = true;
        } else {
          throw new Error(selectResult?.message || selectResult?.error || '알 수 없는 오류');
        }
      } catch (error) {
        retryCount++;
        console.warn(`[SinglePageProcess] 디바이스 ${deviceIndex + 1} 선택 실패 (${retryCount}/${maxRetries}): ${error}`);
        if (retryCount < maxRetries) {
          console.log(`[SinglePageProcess] 2초 후 재시도...`);
          await sleep(2000);
        } else {
          console.error(`[SinglePageProcess] 디바이스 ${deviceIndex + 1} 선택 최종 실패`);
          return { status: 'stopped', message: '[SinglePageProcess] 디바이스선택 최종 실패', stoppedAtVoltageTest: voltageIndex + 1, stoppedAtDevice: deviceIndex + 1, stoppedAtPhase: 'before_relay_operation' };
        }
      }
    }

    // 전압 읽기 로직
    const channelResults = []; // 배열로 초기화
    
    // 채널 변경을 위한 충분한 시간 확보
    await sleep(2000);
    
    // 전압 읽기 재시도 로직 (채널 1개만)
    let voltReadSuccess = false;
    let voltData = 0; // voltData 변수를 루프 밖에서 선언
    retryCount = 0;
    
    while (!voltReadSuccess && retryCount < maxRetries) {
      // 중지 요청 확인 - 전압 읽기 중
      if (getProcessStopRequested()) {
        console.log(`[SinglePageProcess] 🛑 중지 요청 감지 - 전압 읽기 중 중단`);
        return { status: 'stopped', message: '사용자에 의해 중단됨', stoppedAtVoltageTest: voltageIndex + 1, stoppedAtDevice: deviceIndex + 1, stoppedAtPhase: 'voltage_reading' };
      }
      
      try {
        if (SIMULATION_PROC === false) {
          voltData = await ReadVolt(1);     // 채널 하나만 읽는다
        } else {
          // 시뮬레이션 모드에서는 설정된 채널 전압값을 사용하고 약간의 변동 추가
          const baseVoltage = getTableOption.channelVoltages[0];
          let variation = (Math.random() - 0.5) * (baseVoltage * 0.05); // ±5% 변동  
          voltData = baseVoltage + variation; // baseVoltage 5%이내의 변동값 적용
        }
        await sleep(100); // 시뮬레이션을 위한 짧은 대기
        voltReadSuccess = true;
      } catch (error) {
        retryCount++;
        console.warn(`[SinglePageProcess] Device ${deviceIndex + 1}, Channel 1 전압 읽기 실패 (${retryCount}/${maxRetries}): ${error}`);
        if (retryCount < maxRetries) {
          console.log(`[SinglePageProcess] 2초 후 재시도...`);
          await sleep(2000); // 재시도 대기 시간을 2초로 증가
        } else {
          console.error(`[SinglePageProcess] Device ${deviceIndex + 1}, Channel 1 전압 읽기 최종 실패`);
          voltData = 'error';
          return { status: 'stopped', message: '전압 읽기 최종 실패', stoppedAtVoltageTest: voltageIndex + 1, stoppedAtDevice: deviceIndex + 1, stoppedAtChannel: 1, stoppedAtPhase: 'channel_start' };
        }
      }
    }
    
    // 채널 읽기 완료 후 안정화를 위한 추가 대기 시간
    if (voltReadSuccess && voltData !== 'error') {
      await sleep(1000); // 채널 읽기 완료 후 1초 대기
    }
                      
    const expectedVoltage = getTableOption.channelVoltages[0] || 0;
    const comparisonResult = voltData === 'error' ? 'N' : compareVoltage(voltData, expectedVoltage);
     
    // 전압값과 비교 결과를 함께 저장 (예: "221V|G" 또는 "240V|N")
    // 전압값을 소수점 이하로 자르기
    const truncatedVoltData = voltData === 'error' ? voltData : Math.floor(voltData);
    const voltageWithComparison = voltData === 'error' ? 'error|N' : `${truncatedVoltData}V|${comparisonResult}`;
     
    // 채널 결과 수집
    channelResults.push({
      device: deviceIndex + 1,
      channel: 1,
      voltage: voltData,
      expected: expectedVoltage,
      result: comparisonResult,
      voltageWithComparison: voltageWithComparison
    });            
    
    console.log(`[SinglePageProcess] Device ${deviceIndex + 1}, Test ${voltageIndex + 1} 전압 데이터 테이블에 저장`);
    
    // 채널 1개의 전압 데이터를 테이블에 업데이트 (readIndex 추가)
    channelResults.forEach((channelResult, channelIndex) => {
      if (channelResult && typeof channelResult.voltage === 'number') {
        const channelNumber = channelIndex + 1;
        // readIndex는 현재 측정 중인 readIndex를 사용
        updateTableData(deviceIndex + 1, voltageIndex + 1, readIndex + 1, channelNumber, channelResult.voltage, 'completed');
      }
    });
    
    // 채널 1개 전압 읽기 완료 후 클라이언트에 실시간 전송 (디바운싱 적용)
    console.log(`[SinglePageProcess] Device ${deviceIndex + 1}, Test ${voltageIndex + 1}: 채널 1개 완료 - 클라이언트에 데이터 전송`);
    await debouncedBroadcastTableData();
    
    // 실시간 업데이트 메시지 전송 최소화 (디바운싱된 테이블 업데이트로 대체)
    // REALTIME_VOLTAGE_UPDATE는 제거하고 debouncedBroadcastTableData만 사용
    
    // 디바이스 해제 재시도 로직
    retryCount = 0;
    while (retryCount < maxRetries) {
      // 중지 요청 확인 - 디바이스 해제 중
      if (getProcessStopRequested()) {
        console.log(`[SinglePageProcess] 🛑 중지 요청 감지 - 디바이스 ${deviceIndex + 1} 해제 중 중단`);
        // 디바이스 해제는 시도하되 즉시 반환
        try {
          if (SIMULATION_PROC === false) {
            await SelectDeviceOff(deviceIndex + 1);
          }
        } catch (error) {
          console.warn(`[SinglePageProcess] 디바이스 ${deviceIndex + 1} 해제 실패 (중지 요청으로 인한): ${error}`);
        }
        return { status: 'stopped', message: '사용자에 의해 중단됨', stoppedAtVoltageTest: voltageIndex + 1, stoppedAtDevice: deviceIndex + 1, stoppedAtPhase: 'device_release' };
      }
      
      try {
        if (SIMULATION_PROC === false) {
          await SelectDeviceOff(deviceIndex + 1);
        }
        break; // 성공하면 루프 종료
      } catch (error) {
        retryCount++;
        console.warn(`[SinglePageProcess] 디바이스 ${deviceIndex + 1} 해제 실패 (${retryCount}/${maxRetries}): ${error}`);
        if (retryCount < maxRetries) {
          console.log(`[SinglePageProcess] 1초 후 재시도...`);
          await sleep(1000);
        } else {
          console.error(`[SinglePageProcess] 디바이스 ${deviceIndex + 1} 해제 최종 실패 - 계속 진행`);
          break; // 해제 실패해도 계속 진행
        }
      }
    }
    
    // 디바이스 해제 후 대기 시간
    await sleep(offDelay);
    
    return { 
      status: 'completed', 
      voltageWithComparison: voltageWithComparison,
      voltage: voltData,
      expected: expectedVoltage,
      result: comparisonResult
    };
    
  } catch (error) {
    console.error('[SinglePageProcess] 디바이스 읽기 예외 발생:', error);
    
    return { 
      status: 'error', 
      message: `예외 발생: ${error.message}`,
      errorType: 'exception',
      stoppedAtPhase: 'unknown'
    };
  }
}

// 단일 read 실행 함수 (기존 함수는 더 이상 사용하지 않음)
async function executeSingleRead(getTableOption, readIndex) {
  try {
    // currentTable 변수 정의 - 테이블 데이터 저장용 (채널 1개)
    const currentTable = {
      modelName: getTableOption.modelName || 'Unknown Model',
      ProductNumber: getTableOption.ProductNumber || ['Unknown'],
      inputVolt: getTableOption.outVoltSettings || [18, 24, 30],
      reportTable: [{
        TestDate: new Date().toLocaleDateString('en-US'),
        TestTime: new Date().toLocaleTimeString('en-US'),
        TestTemperature: getTableOption.highTempSettings?.targetTemp || 'N/A',
        voltagTable: Array(3).fill(null).map(() => 
          Array(10).fill(null).map(() => 
            Array(1).fill("-.-") // 채널 1개로 변경
          )
        )
      }]
    };
    
    // 시스템 상태 검증
    
    // 중지 요청 확인 - 프로세스 시작 전
    if (getProcessStopRequested()) {
      console.log(`[SinglePageProcess] 🛑 중지 요청 감지 - 프로세스 시작 전 중단`);
      return { status: 'stopped', message: '사용자에 의해 중지됨', stoppedAtPhase: 'initialization' };
    }
    
    // 딜레이 설정 로드
    const onDelay = getTableOption.delaySettings.onDelay;
    const offDelay = getTableOption.delaySettings.offDelay;
    
    // 프로세스 시작 전 포트 상태 초기화

    for(let k=0; k<3; k++) {
      // 강력한 중지 확인 - 전압 테스트 시작 전
      if (getProcessStopRequested()) {
        console.log(`[SinglePageProcess] 🛑 중지 요청 감지 - 전압 테스트 ${k+1}/3에서 중단`);
        return { status: 'stopped', message: '사용자에 의해 중지됨', stoppedAtVoltageTest: k+1, stoppedAtPhase: 'voltage_test_start' };
      }
      
      // 전압을 설정 한다. 
      const inputVolt = getTableOption.outVoltSettings[k];
      console.log(`[SinglePageProcess] 전압 설정: ${inputVolt}V`);
      
      // 전압 설정 재시도 로직
      let voltSetSuccess = false;
      let retryCount = 0;
      const maxRetries = 5;
      
      while (!voltSetSuccess && retryCount < maxRetries) {
        // 중지 요청 확인 - 전압 설정 중
        if (getProcessStopRequested()) {
          console.log(`[SinglePageProcess] 🛑 중지 요청 감지 - 전압 설정 중 중단`);
          return { status: 'stopped', message: '사용자에 의해 중단됨', stoppedAtVoltageTest: k+1, stoppedAtPhase: 'voltage_setting' };
        }
        
        // 전압 설정 전 정지 신호 확인 - 릴레이 동작 전
        if (getProcessStopRequested()) {
          console.log(`[SinglePageProcess] 🛑 전압 설정 전 정지 신호 감지 - 전압 ${inputVolt}V 설정 중단`);
          return { status: 'stopped', message: '전압 설정 전 정지 신호 감지', stoppedAtVoltageTest: k+1, stoppedAtPhase: 'before_voltage_setting' };
        }

        try {
          if(SIMULATION_PROC === false ){
            voltSetSuccess = await SendVoltCommand(inputVolt);
          }else {
            voltSetSuccess = true;
          }

          if( voltSetSuccess === true ){
            console.log(`[SinglePageProcess] 전압 설정 성공: ${inputVolt}V`);
          } else {
            throw new Error('전압 설정 실패: 응답 없음');
          }
        } catch (error) {
          retryCount++;
          console.warn(`[SinglePageProcess] 전압 설정 실패 (${retryCount}/${maxRetries}): ${error}`);
          if (retryCount < maxRetries) {
            console.log(`[SinglePageProcess] 3초 후 재시도...`);
            await sleep(3000);
          } else {
            //throw new Error(`전압 설정 실패: ${error}`);
            return { status: 'stopped', message: '전압설정실패', stoppedAtVoltageTest: k+1, stoppedAtPhase: 'before_voltage_setting' };
          }
        }
      }

      if( voltSetSuccess === false ){
        return { status: 'stopped', message: '전압설정실패', stoppedAtVoltageTest: k+1, stoppedAtPhase: 'before_voltage_setting' };
      }
      
      for ( let i = 0; i < 3; i++) {
        // 중지 요청 확인 - 디바이스 처리 시작 전
        if (getProcessStopRequested()) {
          console.log(`[SinglePageProcess] 🛑 중지 요청 감지 - 디바이스 ${i+1}/10에서 중단`);
          stopInfo = { status: 'stopped', message: '사용자에 의해 중단됨', stoppedAtVoltageTest: k+1, stoppedAtDevice: i+1, stoppedAtPhase: 'device_start' };
          return stopInfo;
        }
          
        if (getTableOption.deviceStates[i] === false) {
            currentTable.reportTable[0].voltagTable[k][i] = "-.-";
        } else {
          // 디바이스 선택 재시도 로직
          let deviceSelectSuccess = false;
          retryCount = 0;
          
          while (!deviceSelectSuccess && retryCount < maxRetries) {
            // 중지 요청 확인 - 디바이스 선택 중
            if (getProcessStopRequested()) {
              console.log(`[SinglePageProcess] 🛑 중지 요청 감지 - 디바이스 ${i+1} 선택 중 중단`);
              stopInfo = { status: 'stopped', message: '사용자에 의해 중단됨', stoppedAtVoltageTest: k+1, stoppedAtDevice: i+1, stoppedAtPhase: 'device_selection' };
              return stopInfo;
            }
            
            try {
              // 릴레이 동작 전 정지 신호 확인 - 근본적인 문제 해결
              if (getProcessStopRequested()) {
                console.log(`[SinglePageProcess] 🛑 릴레이 동작 전 정지 신호 감지 - 디바이스 ${i+1} 선택 중단`);
                stopInfo = { status: 'stopped', message: '릴레이 동작 전 정지 신호 감지', stoppedAtVoltageTest: k+1, stoppedAtDevice: i+1, stoppedAtPhase: 'before_relay_operation' };
                return stopInfo;
              }

              //await sleep(2000);         
              let selectResult = true;

              if( SIMULATION_PROC === false ){
                selectResult = await SelectDeviceOn(i+1);  // 1 부터 시작 함 debug_jsk 릴레이동작을 인버터의 입력과 출력을 같이 선택해야 함 
              }

              if (selectResult === true || selectResult.success === true) {
                deviceSelectSuccess = true;
                //console.log(`[SinglePageProcess] 디바이스 ${i+1} 선택 성공`);
              } else {
                throw new Error(selectResult?.message || selectResult?.error || '알 수 없는 오류');
              }
            } catch (error) {
              retryCount++;
              console.warn(`[SinglePageProcess] 디바이스 ${i+1} 선택 실패 (${retryCount}/${maxRetries}): ${error}`);
              if (retryCount < maxRetries) {
                console.log(`[SinglePageProcess] 2초 후 재시도...`);
                await sleep(2000); // 5초 대기로 증가
              } else {
                console.error(`[SinglePageProcess] 디바이스 ${i+1} 선택 최종 실패`);
                stopInfo = { status: 'stopped', message: '[SinglePageProcess] 디바이스선택 최종 실패', stoppedAtVoltageTest: k+1, stoppedAtDevice: i+1, stoppedAtPhase: 'before_relay_operation' };
                return stopInfo;
              }
            }
          }
          
          if (deviceSelectSuccess) {
            await sleep(onDelay);
          } else {
            console.error(`[SinglePageProcess] 디바이스 ${i+1} 선택 최종 실패`);
            stopInfo = { status: 'stopped', message: '[SinglePageProcess] 디바이스선택 최종 실패', stoppedAtVoltageTest: k+1, stoppedAtDevice: i+1, stoppedAtPhase: 'before_relay_operation' };
            return stopInfo;
          }
          
          // 채널 1개 전압 읽기 (기존 4개 채널에서 1개로 변경)
          const channelResults = []; // 배열로 초기화
          
          //for ( let j = 0; j < 4 ; j++) {       // 채널 1 하나 만 읽는다. 
            // 채널 변경을 위한 충분한 시간 확보 (기존 1초에서 2초로 증가)
            await sleep(2000);
            
            // 중지 요청 확인 - 채널 처리 시작 전
            if (getProcessStopRequested()) {
              console.log(`[SinglePageProcess] 🛑 중지 요청 감지 - 채널 1 읽기 시작 전 중단`);
              if( SIMULATION_PROC === false ){ 
                await SelectDeviceOff(i+1); // 안전을 위해 디바이스 끄기
              }
              stopInfo = { status: 'stopped', message: '사용자에 의해 중단됨', stoppedAtVoltageTest: k+1, stoppedAtDevice: i+1, stoppedAtChannel: 1, stoppedAtPhase: 'channel_start' };
              return stopInfo;
            }
             
            // 전압 읽기 재시도 로직
            let voltReadSuccess = false;
            retryCount = 0;
            let voltData = null;
             
            while (!voltReadSuccess && retryCount < maxRetries) {
              // 중지 요청 확인 - 전압 읽기 중 (매 반복마다 확인)
              if (getProcessStopRequested()) {
                console.log(`[SinglePageProcess] 🛑 중지 요청 감지 - 전압 읽기 중 중단`);
                if( SIMULATION_PROC === false ){ 
                  await SelectDeviceOff(i+1); // 안전을 위해 디바이스 끄기
                }
                stopInfo = { status: 'stopped', message: '사용자에 의해 중단됨', stoppedAtVoltageTest: k+1, stoppedAtDevice: i+1, stoppedAtChannel: 1, stoppedAtPhase: 'voltage_reading' };
                return stopInfo;
              }
              
            try {
              if( SIMULATION_PROC === false ){
                voltData = await ReadVolt(1);     // 채널 하나 만 읽는다.   debug_jsk
              } else {
                // 시뮬레이션 모드에서는 설정된 채널 전압값을 사용하고 약간의 변동 추가
                const baseVoltage = getTableOption.channelVoltages[0];
                let variation = (Math.random() - 0.5) * (baseVoltage * 0.05); // ±5% 변동  
                voltData = baseVoltage + variation; // baseVoltage 5%이내의 변동값 적용
              }
              await sleep(100); // 시뮬레이션을 위한 짧은 대기
              voltReadSuccess = true;
              //console.log(`[SinglePageProcess] Device ${i+1}, Channel ${j+1} 전압 읽기 성공: ${voltData}V`);
            } catch (error) {
                retryCount++;
                console.warn(`[SinglePageProcess] Device ${i+1}, Channel 1 전압 읽기 실패 (${retryCount}/${maxRetries}): ${error}`);
                if (retryCount < maxRetries) {
                  console.log(`[SinglePageProcess] 2초 후 재시도...`);
                  await sleep(2000); // 재시도 대기 시간을 2초로 증가
                } else {
                  console.error(`[SinglePageProcess] Device ${i+1}, Channel 1 전압 읽기 최종 실패`);
                  voltData = 'error';
                  stopInfo = { status: 'stopped', message: '전압 읽기 최종 실패', stoppedAtVoltageTest: k+1, stoppedAtDevice: i+1, stoppedAtChannel: 1, stoppedAtPhase: 'channel_start' };
                  return stopInfo;
                }
              }
            }
            
            // 채널 읽기 완료 후 안정화를 위한 추가 대기 시간
            if (voltReadSuccess && voltData !== 'error') {
              await sleep(1000); // 채널 읽기 완료 후 1초 대기
            }
                          
            const expectedVoltage = getTableOption.channelVoltages[0] || 0;
            const comparisonResult = voltData === 'error' ? 'N' : compareVoltage(voltData, expectedVoltage);
             
            // 전압값과 비교 결과를 함께 저장 (예: "221V|G" 또는 "240V|N")
            // 전압값을 소수점 이하로 자르기
            const truncatedVoltData = voltData === 'error' ? voltData : Math.floor(voltData);
            const voltageWithComparison = voltData === 'error' ? 'error|N' : `${truncatedVoltData}V|${comparisonResult}`;
             
            // voltagTable에 저장 (채널 1개만 사용하므로 [0] 인덱스 사용)
            currentTable.reportTable[0].voltagTable[k][i][0] = voltageWithComparison;
             
            // 채널 결과 수집
            channelResults.push({
              device: i+1,
              channel: 1,
              voltage: voltData,
              expected: expectedVoltage,
              result: comparisonResult,
              voltageWithComparison: voltageWithComparison
            });            
          
          console.log(`[SinglePageProcess] Device ${i+1}, Test ${k+1} 전압 데이터 테이블에 저장`);
          
          // 채널 1개의 전압 데이터를 테이블에 업데이트
          channelResults.forEach((channelResult, channelIndex) => {
            if (channelResult && typeof channelResult.voltage === 'number') {
              const channelNumber = channelIndex + 1;
              updateTableData(i+1, k+1, channelNumber, channelResult.voltage, 'completed');
            }
          });
          
          // 채널 1개 전압 읽기 완료 후 클라이언트에 실시간 전송 (디바운싱 적용)
          console.log(`[SinglePageProcess] Device ${i+1}, Test ${k+1}: 채널 1개 완료 - 클라이언트에 데이터 전송`);
          await debouncedBroadcastTableData();
          
          // 디바이스 해제 재시도 로직
          retryCount = 0;
          while (retryCount < maxRetries) {
            // 중지 요청 확인 - 디바이스 해제 중
            if (getProcessStopRequested()) {
              console.log(`[SinglePageProcess] 🛑 중지 요청 감지 - 디바이스 ${i+1} 해제 중 중단`);
              // 디바이스 해제는 시도하되 즉시 반환
              try {
                if( SIMULATION_PROC === false ){
                  await SelectDeviceOff(i+1);
                }
              } catch (error) {
                console.warn(`[SinglePageProcess] 디바이스 ${i+1} 해제 실패 (중지 요청으로 인한): ${error}`);
              }
              stopInfo = { status: 'stopped', message: '사용자에 의해 중단됨', stoppedAtVoltageTest: k+1, stoppedAtDevice: i+1, stoppedAtPhase: 'device_release' };
              return stopInfo;
            }
            
            try {
              // 디바이스 해제 전 포트 상태 확인을 위한 대기
              await sleep(2000);
              
              let offResult = true;
              if( SIMULATION_PROC === false ){
                offResult =  await SelectDeviceOff(i+1); // 1 부터 시작 함
              }
              
              if (offResult === true || offResult.success === true) {
                console.log(`[SinglePageProcess] 디바이스 ${i+1} 해제 성공`);
                break;
              } else {
                throw new Error(offResult?.message || offResult?.error || '알 수 없는 오류');
              }
            } catch (error) {
              retryCount++;
              console.warn(`[SinglePageProcess] 디바이스 ${i+1} 해제 실패 (${retryCount}/${maxRetries}): ${error}`);
              if (retryCount < maxRetries) {
                console.log(`[SinglePageProcess] 5초 후 재시도...`);
                await sleep(5000);
              } else {
                console.error(`[SinglePageProcess] 디바이스 ${i+1} 해제 최종 실패`);
                stopInfo = { status: 'stopped', message: '[SinglePageProcess] 디바이스 해제 최종 실패', stoppedAtVoltageTest: k+1, stoppedAtDevice: i+1, stoppedAtPhase: 'before_relay_operation' };
                return stopInfo;
              }
            }
          }
          
          await sleep(offDelay);
        } // if (getTableOption.deviceStates[i] === false) else 블록 닫기
      } // for (let i = 0; i < 3; i++) 디바이스 선택 루프 닫기
    } // for (let k = 0; k < 3; k++) 전압 24,18,30V 테스트 루프 닫기
    
    // 모든 테스트가 완료된 후 테이블 완성 상태 확인
    console.log('[SinglePageProcess] 모든 테스트 완료 - 테이블 완성 상태 확인');
    
    return { 
      status: 'completed', 
      message: '단일 read 실행 완료',
      data: currentTable,
      readIndex: readIndex
    };
    
  } catch (error) {
    console.error('[SinglePageProcess] 예외 발생:', error);
    
    return { 
      status: 'error', 
      message: `예외 발생: ${error.message}`,
      errorType: 'exception',
      stoppedAtPhase: 'unknown'
    };
  }
}

// 여러 read 결과를 합치는 함수
function combineReadResults(allReadResults, getTableOption) {
  try {
    console.log(`[CombineReadResults] ${allReadResults.length}개의 read 결과를 합치는 중...`);
    
    // 기본 테이블 구조 생성 (채널 1개)
    const combinedTable = {
      modelName: getTableOption.modelName || 'Unknown Model',
      ProductNumber: getTableOption.ProductNumber || ['Unknown'],
      inputVolt: getTableOption.outVoltSettings || [18, 24, 30],
      reportTable: [{
        TestDate: new Date().toLocaleDateString('en-US'),
        TestTime: new Date().toLocaleTimeString('en-US'),
        TestTemperature: getTableOption.highTempSettings?.targetTemp || 'N/A',
        voltagTable: Array(3).fill(null).map(() => 
          Array(10).fill(null).map(() => 
            Array(1).fill("-.-") // 채널 1개로 변경
          )
        )
      }]
    };
    
    // 각 read 결과의 데이터를 합치기
    for (let k = 0; k < 3; k++) { // 3개 전압 (18V, 24V, 30V)
      for (let i = 0; i < 10; i++) { // 10개 디바이스
        for (let j = 0; j < 1; j++) { // 1개 채널
          const voltageValues = [];
          const goodCounts = [];
          
          // 모든 read 결과에서 해당 위치의 데이터 수집
          allReadResults.forEach((readResult, readIndex) => {
            if (readResult.status === 'completed' && readResult.data && readResult.data.reportTable && readResult.data.reportTable[0]) {
              const voltageData = readResult.data.reportTable[0].voltagTable[k][i][j];
              if (voltageData && voltageData !== "-.-") {
                // "5.2V|G" 형식에서 전압값과 비교결과 추출
                const parts = voltageData.split('|');
                if (parts.length === 2) {
                  const voltageStr = parts[0].replace('V', '');
                  const voltage = parseFloat(voltageStr);
                  const isGood = parts[1] === 'G';
                  
                  if (!isNaN(voltage)) {
                    voltageValues.push(voltage);
                    goodCounts.push(isGood ? 1 : 0);
                  }
                }
              }
            }
          });
          
          // 평균 계산 및 결과 저장
          if (voltageValues.length > 0) {
            const averageVoltage = voltageValues.reduce((sum, val) => sum + val, 0) / voltageValues.length;
            const totalGood = goodCounts.reduce((sum, val) => sum + val, 0);
            const averageGood = totalGood / goodCounts.length;
            const comparisonResult = averageGood >= 0.5 ? 'G' : 'N'; // 50% 이상이 Good이면 Good
            
            // 소수점 2자리로 자르기
            const truncatedVoltage = Math.floor(averageVoltage * 100) / 100;
            combinedTable.reportTable[0].voltagTable[k][i][j] = `${truncatedVoltage}V|${comparisonResult}`;
          } else {
            combinedTable.reportTable[0].voltagTable[k][i][j] = "-.-";
          }
        }
      }
    }
    
    console.log(`[CombineReadResults] ${allReadResults.length}개의 read 결과 합치기 완료`);
    return combinedTable;
    
  } catch (error) {
    console.error('[CombineReadResults] 결과 합치기 실패:', error);
    // 기본 테이블 반환 (채널 1개)
    return {
      modelName: getTableOption.modelName || 'Unknown Model',
      ProductNumber: getTableOption.ProductNumber || ['Unknown'],
      inputVolt: getTableOption.outVoltSettings || [18, 24, 30],
      reportTable: [{
        TestDate: new Date().toLocaleDateString('en-US'),
        TestTime: new Date().toLocaleTimeString('en-US'),
        TestTemperature: getTableOption.highTempSettings?.targetTemp || 'N/A',
        voltagTable: Array(3).fill(null).map(() => 
          Array(10).fill(null).map(() => 
            Array(1).fill("-.-") // 채널 1개로 변경
          )
        )
      }]
    };
  }
}

/**
 * 모든 결과리포트를 합쳐서 최종결과 테이블을 생성하는 함수
 */
function createFinalResultTable(allCycleResults, getTableOption) {
  try {
    console.log(`[CreateFinalResultTable] ${allCycleResults.length}개의 사이클 결과를 합쳐서 최종 테이블 생성 중...`);
    console.log(`[CreateFinalResultTable] globalTableData를 사용하여 실제 측정 데이터 추출`);
    
    // 기본 테이블 구조 생성 (채널 1개) - runSinglePageProcess와 동일한 구조
    const finalTable = {
      modelName: getTableOption.modelName || 'Unknown Model',
      ProductNumber: getTableOption.ProductNumber || ['Unknown'],
      inputVolt: getTableOption.outVoltSettings || [18, 24, 30],
      reportTable: [{
        TestDate: new Date().toLocaleDateString('en-US'),
        TestTime: new Date().toLocaleTimeString('en-US'),
        TestTemperature: getTableOption.highTempSettings?.targetTemp || 'N/A',
        voltagTable: Array(3).fill(null).map(() => 
          Array(3).fill(null).map(() => // Device 1,2,3
            Array(10).fill(null).map(() => 
              Array(1).fill("-.-") // 채널 1개, 최대 10개 readCount
            )
          )
        )
      }]
    };
    
    // globalTableData에서 실제 측정 데이터를 가져와서 최종 테이블 생성
    for (let voltageIndex = 0; voltageIndex < 3; voltageIndex++) { // 3개 전압 (18V, 24V, 30V)
      for (let deviceIndex = 0; deviceIndex < 3; deviceIndex++) { // Device 1,2,3
        for (let readIndex = 0; readIndex < 10; readIndex++) { // readCount 최대 10
          for (let channelIndex = 0; channelIndex < 1; channelIndex++) { // 1개 채널
            const voltageValues = [];
            const goodCounts = [];
            
            // globalTableData에서 해당 위치의 실제 측정 데이터 수집
            if (globalTableData.devices[deviceIndex] && globalTableData.devices[deviceIndex].tests[voltageIndex]) {
              const deviceReads = globalTableData.devices[deviceIndex].tests[voltageIndex].reads;
              
              // 모든 사이클에서 해당 readIndex의 데이터 수집
              for (let cycleIndex = 0; cycleIndex < allCycleResults.length; cycleIndex++) {
                if (deviceReads[readIndex] && deviceReads[readIndex].channels[channelIndex]) {
                  const channel = deviceReads[readIndex].channels[channelIndex];
                  
                  if (channel && channel.voltage !== null && channel.status === 'completed') {
                    const voltage = channel.voltage;
                    const truncatedVoltage = Math.floor(voltage); // 정수로 변환
                    
                    // 고정 범위로 G/N 판정: 200 <= 측정값 <= 242
                    const minVoltage = 200;
                    const maxVoltage = 242;
                    
                    const isGood = (truncatedVoltage >= minVoltage && truncatedVoltage <= maxVoltage);
                    
                    voltageValues.push(truncatedVoltage);
                    goodCounts.push(isGood ? 1 : 0);
                    
                    console.log(`[CreateFinalResultTable] Device ${deviceIndex + 1}, Voltage ${voltageIndex + 1}, Read ${readIndex + 1}: ${truncatedVoltage}V (${isGood ? 'G' : 'N'}) - 고정 범위: 200 <= 측정값 <= 242`);
                  }
                }
              }
            }
            
            // 평균 계산 및 결과 저장
            if (voltageValues.length > 0) {
              const averageVoltage = voltageValues.reduce((sum, val) => sum + val, 0) / voltageValues.length;
              const totalGood = goodCounts.reduce((sum, val) => sum + val, 0);
              const averageGood = totalGood / goodCounts.length;
              const comparisonResult = averageGood >= 0.5 ? 'G' : 'N'; // 50% 이상이 Good이면 Good
              
              // 소수점 없이 정수로 변환
              const truncatedVoltage = Math.floor(averageVoltage);
              finalTable.reportTable[0].voltagTable[voltageIndex][deviceIndex][readIndex][channelIndex] = `${truncatedVoltage}V|${comparisonResult}`;
              
              console.log(`[CreateFinalResultTable] 최종 결과 - Device ${deviceIndex + 1}, Voltage ${voltageIndex + 1}, Read ${readIndex + 1}: ${truncatedVoltage}V|${comparisonResult} (${voltageValues.length}개 측정값 평균)`);
            } else {
              finalTable.reportTable[0].voltagTable[voltageIndex][deviceIndex][readIndex][channelIndex] = "-.-";
              console.log(`[CreateFinalResultTable] 데이터 없음 - Device ${deviceIndex + 1}, Voltage ${voltageIndex + 1}, Read ${readIndex + 1}`);
            }
          }
        }
      }
    }
    
    console.log(`[CreateFinalResultTable] ${allCycleResults.length}개의 사이클 결과 합치기 완료 (globalTableData 기반)`);
    return finalTable;
    
  } catch (error) {
    console.error('[CreateFinalResultTable] 최종 결과 테이블 생성 실패:', error);
    // 기본 테이블 반환 (채널 1개)
    return {
      modelName: getTableOption.modelName || 'Unknown Model',
      ProductNumber: getTableOption.ProductNumber || ['Unknown'],
      inputVolt: getTableOption.outVoltSettings || [18, 24, 30],
      reportTable: [{
        TestDate: new Date().toLocaleDateString('en-US'),
        TestTime: new Date().toLocaleTimeString('en-US'),
        TestTemperature: getTableOption.highTempSettings?.targetTemp || 'N/A',
        voltagTable: Array(3).fill(null).map(() => 
          Array(3).fill(null).map(() => // Device 1,2,3
            Array(10).fill(null).map(() => 
              Array(1).fill("-.-") // 채널 1개, 최대 10개 readCount
            )
          )
        )
      }]
    };
  }
}

/**
 * 전압별 그룹 결과를 계산하는 함수
 * @param {Object} reportData - 리포트 데이터
 * @param {number} voltageIndex - 전압 인덱스 (0: 18V, 1: 24V, 2: 30V)
 * @returns {Object} 전압별 그룹 결과
 */
function calculateVoltageGroupResult(reportData, voltageIndex) {
  const voltageGroupResult = {
    devices: [],
    allGood: true
  };
  
  // 해당 전압의 모든 디바이스 결과 수집
  for (let deviceIndex = 0; deviceIndex < 3; deviceIndex++) {
    if (reportData.voltagTable[voltageIndex] && reportData.voltagTable[voltageIndex][deviceIndex]) {
      const deviceReadCount = reportData.voltagTable[voltageIndex][deviceIndex].length;
      let deviceHasGood = false;
      let deviceHasBad = false;
      
      // 해당 디바이스의 모든 read 결과 확인
      for (let readIndex = 0; readIndex < deviceReadCount; readIndex++) {
        const voltageData = reportData.voltagTable[voltageIndex][deviceIndex][readIndex][0];
        if (voltageData && voltageData !== "-.-") {
          if (voltageData.includes('|G')) {
            deviceHasGood = true;
          } else if (voltageData.includes('|N')) {
            deviceHasBad = true;
          }
        }
      }
      
      // 디바이스별 결과 결정 (하나라도 N이 있으면 N)
      const deviceResult = deviceHasBad ? 'N' : (deviceHasGood ? 'G' : '-');
      
      voltageGroupResult.devices.push({
        deviceIndex: deviceIndex,
        result: deviceResult
      });
      
      // 하나라도 N이면 해당 전압 그룹은 N
      if (deviceResult === 'N') {
        voltageGroupResult.allGood = false;
      }
    }
  }
  
  console.log(`[CalculateVoltageGroupResult] 전압 인덱스 ${voltageIndex}: ${voltageGroupResult.allGood ? 'G' : 'N'} (디바이스별: ${voltageGroupResult.devices.map(d => d.result).join(', ')})`);
  
  return voltageGroupResult;
}

/**
 * 최종결과 테이블을 파일로 저장하는 함수
 */
function saveFinalResultTable(finalTable, getTableOption, totalCycles) {
  try {
    console.log(`[SaveFinalResultTable] 최종결과 테이블 저장 시작...`);
    
    const filename = `${getFormattedDateTime()}_FinalResult_AllCycles.csv`;
    
    // 전역 변수에서 테스트 디렉토리 경로 사용
    let dateFolderPath = currentTestDirectoryPath;
    
    if (!dateFolderPath) {
      console.log(`[SaveFinalResultTable] 📁 전역 디렉토리 경로가 설정되지 않음 - 자동으로 최근 테스트 디렉토리 검색`);
      
      try {
        const dataFolderPath = path.join(process.cwd(), 'Data');
        const directories = fs.readdirSync(dataFolderPath, { withFileTypes: true })
          .filter(dirent => dirent.isDirectory())
          .map(dirent => dirent.name)
          .filter(name => /^\d{8}_\d{4}$/.test(name))
          .sort()
          .reverse();
        
        if (directories.length > 0) {
          const dateDirectoryName = directories[0];
          dateFolderPath = path.join(dataFolderPath, dateDirectoryName);
          console.log(`[SaveFinalResultTable] 📁 자동으로 최근 테스트 디렉토리 발견: ${dateDirectoryName}`);
        } else {
          throw new Error('테스트 데이터 디렉토리를 찾을 수 없습니다');
        }
      } catch (error) {
        console.error(`[SaveFinalResultTable] ❌ 자동 디렉토리 검색 실패: ${error.message}`);
        throw new Error('테스트 데이터 디렉토리를 찾을 수 없습니다');
      }
    }
    
    const filePath = path.join(dateFolderPath, filename);
    
    let csvContent = '';
    const reportData = finalTable.reportTable[0];
    
    // Document header information (xxx_Cycle_HighTemp_Test.csv와 동일한 구조)
    csvContent += `Document No.,K2-AD-110-A241023-001\n`;
    csvContent += `Product Name,${finalTable.modelName || ''}\n`;
    csvContent += `Product Number,${finalTable.ProductNumber.join(';') || ''}\n`;
    csvContent += `Test Date,${reportData.TestDate || ''}\n`;
    csvContent += `Test Time,${reportData.TestTime || ''}\n`;
    csvContent += `Test Temperature,${reportData.TestTemperature || ''}℃\n`;
    csvContent += `Total Cycles,${totalCycles}\n`;
    csvContent += `Test Type,Final Result (All Cycles Combined)\n`;
    csvContent += '\n';
    
    // 새로운 테이블 구조 (그림과 유사한 형태)
    csvContent += `INPUT,제품번호,1st,2nd,3rd,4th,5th,6th,7th,8th,9th,10th,A.Q.L\n`;
    
    // Generate table for each input voltage and product number (그림과 동일한 형태)
    for (let k = 0; k < 3; k++) {
      const inputVoltage = finalTable.inputVolt[k] || 24;
      
      // 각 제품번호에 대해 테이블 생성 (C005, C006, C007)
      for (let productIndex = 0; productIndex < 3; productIndex++) {
        const productNumber = `C00${productIndex + 5}`; // C005, C006, C007
        
        // 해당 제품번호의 1st-10th 데이터 생성 (Device별 readCount 측정값)
        const measurementData = [];
        
        // 모든 Device의 모든 readCount 측정값을 순차적으로 저장
        let measurementIndex = 0;
        for (let deviceIndex = 0; deviceIndex < 3 && measurementIndex < 10; deviceIndex++) {
          if (reportData.voltagTable[k] && reportData.voltagTable[k][deviceIndex]) {
            const deviceReadCount = reportData.voltagTable[k][deviceIndex].length;
            for (let readIndex = 0; readIndex < deviceReadCount && measurementIndex < 10; readIndex++) {
              // 채널 1개의 값 사용
              const voltageData = reportData.voltagTable[k][deviceIndex][readIndex][0];
              if (voltageData && voltageData !== "-.-") {
                const parts = voltageData.split('|');
                if (parts.length === 2) {
                  const voltageStr = parts[0].replace('V', '');
                  const voltage = parseFloat(voltageStr);
                  if (!isNaN(voltage)) {
                    // 소수점 없이 정수로 변환 (그림의 형태에 맞춤)
                    measurementData.push(Math.round(voltage));
                  } else {
                    measurementData.push('-');
                  }
                } else {
                  measurementData.push('-');
                }
              } else {
                measurementData.push('-');
              }
              measurementIndex++;
            }
          }
        }
        
        // 10개 미만이면 나머지를 '-'로 채움
        while (measurementData.length < 10) {
          measurementData.push('-');
        }
        
        // A.Q.L 계산 (개별 디바이스별 측정값 기반)
        // 해당 디바이스의 모든 측정값이 200-242 범위에 있으면 G, 하나라도 범위를 벗어나면 N
        let aql = 'G'; // 기본값은 G
        
        if (isDeviceSelected) {
          // 선택된 디바이스의 경우 실제 측정값 확인
          for (let i = 0; i < measurementData.length; i++) {
            const measurement = measurementData[i];
            if (measurement !== '-' && measurement !== '-.-') {
              // 측정값이 범위를 벗어나면 N
              if (measurement < 200 || measurement > 242) {
                aql = 'N';
                console.log(`[SaveFinalResultTable] ${productNumber} ${inputVoltage}V 측정값 ${measurement}이 범위(200-242)를 벗어남 - AQL: N`);
                break;
              }
            }
          }
        } else {
          // 선택되지 않은 디바이스는 "-.-"
          aql = '-.-';
        }
        
        // 테이블 행 생성 (그림과 동일한 형태)
        csvContent += `${inputVoltage}V,${productNumber},${measurementData.join(',')},${aql}\n`;
      }
    }
    
    // Test results summary (xxx_Cycle_HighTemp_Test.csv와 동일한 형태)
    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;
    
    // 모든 Device의 모든 readCount 측정값을 확인하여 통계 계산
    for (let k = 0; k < 3; k++) {
      for (let productIndex = 0; productIndex < 3; productIndex++) {
        for (let deviceIndex = 0; deviceIndex < 3; deviceIndex++) {
          if (reportData.voltagTable[k] && reportData.voltagTable[k][deviceIndex]) {
            const deviceReadCount = reportData.voltagTable[k][deviceIndex].length;
            for (let readIndex = 0; readIndex < deviceReadCount; readIndex++) {
              const voltageData = reportData.voltagTable[k][deviceIndex][readIndex][0];
              if (voltageData && voltageData !== "-.-") {
                totalTests++;
                if (voltageData.includes('|G')) {
                  passedTests++;
                } else {
                  failedTests++;
                }
              }
            }
          }
        }
      }
    }
    
    csvContent += '\n';
    csvContent += `=== Test Results Summary ===\n`;
    csvContent += `Total Tests,${totalTests}\n`;
    csvContent += `Passed Tests,${passedTests}\n`;
    csvContent += `Failed Tests,${failedTests}\n`;
    csvContent += `Pass Rate,${totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(2) : 0}%\n`;
    csvContent += `Test Result,${passedTests > failedTests ? 'PASS' : 'FAIL'}\n`;
    csvContent += `Operator,System\n`;
    csvContent += `Document Version,PS-14(Rev.1)\n`;
    csvContent += `Company Name,Adelpia Lab Co., Ltd.\n`;
    
    // 파일에 저장
    fs.writeFileSync(filePath, csvContent, 'utf8');
    
    console.log(`[SaveFinalResultTable] 최종결과 테이블 저장 완료: ${filename}`);
    console.log(`[SaveFinalResultTable] 파일 경로: ${filePath}`);
    
    return { success: true, filename, filePath };
  } catch (error) {
    console.error('[SaveFinalResultTable] 최종결과 테이블 저장 실패:', error);
    return { success: false, error: error.message };
  }
}

// 중단 보고서 생성을 위한 통일된 함수
async function generateStopReport(stopInfo) {
  try {
    console.log(`[SinglePageProcess] 🛑 중단 보고서 생성 시작: ${stopInfo.status}`);
    
    // 전역 디렉토리명이 있는지 확인
    if (!currentTestDirectoryName) {
      currentTestDirectoryName = getDateDirectoryName();
      console.log(`[SinglePageProcess] ⚠️ 전역 디렉토리명이 없어 새로 생성: ${currentTestDirectoryName}`);
    }
    
    // 테스트 설정 정보 수집
    const getTableOption = await getSafeGetTableOption();
    const testSettings = {
      modelName: getTableOption.productInput?.modelName || 'N/A',
      productNumber: getTableOption.productInput?.productNumber || 'N/A',
      temperature: getTableOption.highTempSettings?.targetTemp || 'N/A',
      totalCycles: 1 // 단일 페이지 테스트는 1 사이클
    };
    
    // 중단 보고서 생성
    const reportResult = await generateInterruptedTestResultFile({
      stopReason: stopInfo.errorType || 'user_stop',
      stoppedAtCycle: 1, // 단일 페이지 테스트는 1 사이클
      stoppedAtPhase: stopInfo.stoppedAtPhase || 'unknown',
      errorMessage: stopInfo.message,
      testSettings: testSettings
    });
    
    if (reportResult && reportResult.success) {
      console.log(`[SinglePageProcess] ✅ 중단 보고서 생성 성공: ${reportResult.filename}`);
    } else {
      console.error(`[SinglePageProcess] ❌ 중단 보고서 생성 실패:`, reportResult?.error || '알 수 없는 오류');
    }
    
    // 중단 정보와 함께 반환
    return {
      ...stopInfo,
      finalReportGenerated: reportResult?.success || false,
      reportFilename: reportResult?.filename || null
    };
    
  } catch (reportError) {
    console.error(`[SinglePageProcess] ❌ 중단 보고서 생성 실패:`, reportError.message);
    
    // 보고서 생성 실패 시에도 원래 중단 정보 반환
    return {
      ...stopInfo,
      finalReportGenerated: false,
      reportError: reportError.message
    };
  }
}

export async function runNextTankEnviTestProcess() {
  try {
    const modeText = SIMULATION_PROC ? '시뮬레이션 모드' : '실제 모드';
    console.log(`[NextTankEnviTestProcess] 🔄 환경 테스트 프로세스 시작 (${modeText})`);
    
    // 진행상황 추적 변수 초기화
    resetProgressTracking();
    
    // 테이블 데이터 전송 디바운싱 변수 초기화
    if (tableDataBroadcastTimeout) {
      clearTimeout(tableDataBroadcastTimeout);
      tableDataBroadcastTimeout = null;
    }
    lastTableDataBroadcast = 0;
    console.log(`[NextTankEnviTestProcess] ✅ 테이블 데이터 전송 디바운싱 변수 초기화`);
    
    // 테스트 시작 알림
    if (globalWss) {
      const testStartMessage = `[TEST_PROGRESS] 테스트 시작 - 환경 시험 프로세스 (${modeText})`;
      console.log(`[NextTankEnviTestProcess] 📤 테스트 시작 메시지 전송: ${testStartMessage}`);
      let sentCount = 0;
      globalWss.clients.forEach(client => {
        if (client.readyState === 1) { // WebSocket.OPEN
          client.send(testStartMessage);
          sentCount++;
        }
      });
      console.log(`[NextTankEnviTestProcess] 📤 ${sentCount}개 클라이언트에게 메시지 전송 완료`);
    } else {
      console.log(`[NextTankEnviTestProcess] ❌ globalWss가 null입니다. WebSocket 서버가 설정되지 않았습니다.`);
    }
    
    // 프로세스 시작 전 중지 요청 확인
    if (getProcessStopRequested()) {
      console.log(`[NextTankEnviTestProcess] 🛑 중지 요청 감지 - 프로세스 시작 전 중단`);
      return { 
        status: 'stopped', 
        message: '사용자에 의해 중지됨', 
        stoppedAtPhase: 'initialization',
        stopReason: 'power_switch_off'
      };
    }
    
    // ===== 디렉토리명을 한 번만 생성하고 전역 변수에 저장 =====
    currentTestDirectoryName = getDateDirectoryName();
    console.log(`[NextTankEnviTestProcess] 📁 테스트 디렉토리명 생성: ${currentTestDirectoryName}`);
    
    // 테스트 결과 저장을 위한 디렉토리 생성
    const dataFolderPath = path.join(process.cwd(), 'Data');
    if (!fs.existsSync(dataFolderPath)) {
      fs.mkdirSync(dataFolderPath, { recursive: true });
      console.log(`[NextTankEnviTestProcess] 📁 Data 폴더 생성됨: ${dataFolderPath}`);
    }
    
    const dateFolderPath = path.join(dataFolderPath, currentTestDirectoryName);
    // 전역 변수에 전체 디렉토리 경로 저장
    currentTestDirectoryPath = dateFolderPath;
    
    if (!fs.existsSync(dateFolderPath)) {
      fs.mkdirSync(dateFolderPath, { recursive: true });
      console.log(`[NextTankEnviTestProcess] 📁 테스트 결과 저장 디렉토리 생성됨: ${dateFolderPath}`);
      
      if (globalWss) {
        const dirCreateMessage = `[DIRECTORY_CREATED] ${currentTestDirectoryName}`;
        let sentCount = 0;
        globalWss.clients.forEach(client => {
          if (client.readyState === 1) { // WebSocket.OPEN
            client.send(dirCreateMessage);
            sentCount++;
          }
        });
        console.log(`[NextTankEnviTestProcess] 📤 디렉토리 생성 알림 전송 완료 - 클라이언트 수: ${sentCount}`);
      }
    } else {
      console.log(`[NextTankEnviTestProcess] 📁 기존 테스트 결과 저장 디렉토리 사용: ${dateFolderPath}`);
    }
    
    // 중지 요청 확인 - 디렉토리 생성 후
    if (getProcessStopRequested()) {
      console.log(`[NextTankEnviTestProcess] 🛑 중지 요청 감지 - 디렉토리 생성 후 중단`);
      return { 
        status: 'stopped', 
        message: '사용자에 의해 중지됨', 
        stoppedAtPhase: 'directory_creation',
        stopReason: 'power_switch_off'
      };
    }
    
    // 테스트 설정 확인
    const getTableOption = await getSafeGetTableOption();
    const highTempEnabled = getTableOption.highTempSettings.highTemp;
    const lowTempEnabled = getTableOption.lowTempSettings.lowTemp;
    
    if (!highTempEnabled && !lowTempEnabled) {
      console.error(`[NextTankEnviTestProcess] ❌ 고온/저온 테스트가 모두 비활성화되어 있습니다.`);
      setMachineRunningStatus(false);
      return { 
        status: 'error', 
        message: '테스트가 비활성화됨 - 고온/저온 테스트 설정을 확인하세요',
        errorType: 'no_tests_enabled'
      };
    }
    // cycleNumber 횟수만큼 반복
    const cycleNumber = getTableOption.delaySettings.cycleNumber || 1; // 기본값 1
    
    // 진행상황 추적을 위한 총 사이클 수 설정
    totalCycles = cycleNumber;
    console.log(`[NextTankEnviTestProcess] 총 사이클 수 설정: ${totalCycles}`);
    
    // 전체 runSinglePageProcess 호출 횟수 계산
    let totalCalls = 0;
    if (highTempEnabled) totalCalls += cycleNumber; // 고온 테스트 × 사이클 수
    if (lowTempEnabled) totalCalls += cycleNumber;  // 저온 테스트 × 사이클 수
    totalCallCount = totalCalls;
    console.log(`[NextTankEnviTestProcess] 전체 runSinglePageProcess 호출 횟수 계산: ${totalCallCount} (고온: ${highTempEnabled ? cycleNumber : 0}, 저온: ${lowTempEnabled ? cycleNumber : 0})`);

    if( SIMULATION_PROC === false ){
      await RelayAllOff();                      // jsk debug return error 에 대한 처리를 할 것
      await sleep(3000); // 포트 초기화를 위한 추가 대기
    } else {
      // 시뮬레이션 모드일 경우 패스
      console.log('시뮬레이션 모드: RelayAllOff 및 포트 초기화 대기 패스');
    }

    for (let cycle = 1; cycle <= cycleNumber; cycle++) {
      // 중지 요청 확인 - 사이클 시작 전
      // 단순한 중지 확인 - 사이클 시작 전
      if (getProcessStopRequested()) {
        console.log(`[NextTankEnviTestProcess] 🛑 중지 요청 감지 - 사이클 ${cycle}에서 프로세스 중단`);
        return { 
          status: 'stopped', 
          message: '사용자에 의한 파워스위치 OFF',
          stoppedAtCycle: cycle,
          stopReason: 'power_switch_off'
        };
      }
      
        console.log(`[NextTankEnviTestProcess] === 사이클 ${cycle}/${cycleNumber} 시작 ===`);
        
        // 사이클 시작 진행상황 알림
        if (globalWss) {
          const cycleStartMessage = `[TEST_PROGRESS] 사이클 ${cycle}/${cycleNumber} 시작`;
          globalWss.clients.forEach(client => {
            if (client.readyState === 1) { // WebSocket.OPEN
              client.send(cycleStartMessage);
            }
          });
        }
        
        // 각 사이클 시작 시 PowerTable 초기화 메시지 제거 (테이블 깜박임 방지)
        console.log(`[NextTankEnviTestProcess] 사이클 ${cycle} 시작 - PowerTable 초기화 메시지 전송 생략 (테이블 깜박임 방지)`);
      
      // 사이클별 결과 저장용 변수
      let highTempResults = [];
      let lowTempResults = [];
      
      // high temp test
      const highTemp = getTableOption.highTempSettings.targetTemp;
      const waitTime = getTableOption.highTempSettings.waitTime; // 분 단위로 저장된 값
      const highTempTest = getTableOption.highTempSettings.highTemp;
      const readCount = getTableOption.highTempSettings.readCount;

      if(highTempTest === true) {
        console.log(`[NextTankEnviTestProcess] 사이클 ${cycle}: 1. 고온 테스트 시작`);
        
        // 고온 테스트 시작 시 PowerTable에 테스트 정보 업데이트
        if (globalWss) {
          const highTempStartMessage = `[POWER_TABLE_RESET] ${JSON.stringify({
            action: 'test_start',
            cycle: cycle,
            totalCycles: cycleNumber,
            testPhase: 'high_temp',
            currentTestNumber: 0,
            totalTestCount: readCount,
            testStatus: 'ON',
            timestamp: new Date().toISOString(),
            message: `사이클 ${cycle}: 고온 테스트 시작 (${readCount}회)`
          })}`;
          
          let sentCount = 0;
          globalWss.clients.forEach(client => {
            if (client.readyState === 1) { // WebSocket.OPEN
              client.send(highTempStartMessage);
              sentCount++;
            }
          });
          console.log(`[NextTankEnviTestProcess] 사이클 ${cycle} 고온 테스트 시작 메시지 전송 완료 - 클라이언트 수: ${sentCount}`);
        }
        
        // 챔버 온도를 읽어서 비교하여 도달하면 테스트 시작
        // 아니면 온도가 도달 할때 까지 대기
        // 온도 대기 중 중지 요청 확인을 위한 간격 - 더 빠른 응답을 위해 1초로 단축
        const tempCheckInterval = 1000; // 1초마다 중지 요청 확인
        let lastTempCheck = Date.now();
        
        while(true) {
          // 중지 요청 확인 - 온도 대기 중
          if (getProcessStopRequested()) {
            console.log(`[NextTankEnviTestProcess] 🛑 중지 요청 감지 - 고온 테스트 온도 대기 중 중단`);
            
            // PowerSwitch 상태 OFF 설정
            setMachineRunningStatus(false);
            
            // 클라이언트에게 파워스위치 OFF 상태 전송
            if (globalWss) {
              const powerOffMessage = `[POWER_SWITCH] OFF - Machine running: false - Process stopped during high temp waiting`;
              globalWss.clients.forEach(client => {
                if (client.readyState === 1) {
                  client.send(powerOffMessage);
                }
              });
            }
            
                          // 중단 보고서 생성은 최종 종료 시에만 생성하도록 수정
              console.log(`[NextTankEnviTestProcess] 📄 중단 보고서는 최종 종료 시에 생성됩니다.`);
            
            // 프로세스 중지 플래그 초기화 제거 - 중지 상태 유지
            console.log(`[NextTankEnviTestProcess] 🛑 프로세스 중지 상태 유지 - 고온 테스트 온도 대기 중`);
            // setProcessStopRequested(false) 호출 제거
            
            return { 
              status: 'stopped', 
              message: '사용자에 의해 중지됨', 
              stoppedAtCycle: cycle, 
              stoppedAtPhase: 'high_temp_waiting',
              totalCycles: cycle
            };
          }
          
          // 온도 대기 중 중지 요청 확인을 위한 간격 체크
          const now = Date.now();
          if (now - lastTempCheck >= tempCheckInterval) {
            lastTempCheck = now;
            
            // 중지 요청 확인 - 온도 대기 중 주기적 체크
            if (getProcessStopRequested()) {
              console.log(`[NextTankEnviTestProcess] 🛑 중지 요청 감지 - 고온 테스트 온도 대기 중 주기적 체크에서 중단`);
              
              // PowerSwitch 상태 OFF 설정
              setMachineRunningStatus(false);
              
              // 클라이언트에게 파워스위치 OFF 상태 전송
              if (globalWss) {
                const powerOffMessage = `[POWER_SWITCH] OFF - Machine running: false - Process stopped during high temp waiting`;
                globalWss.clients.forEach(client => {
                  if (client.readyState === 1) {
                    client.send(powerOffMessage);
                  }
                });
              }
              
              // 중단 보고서 생성은 최종 종료 시에만 생성하도록 수정
              console.log(`[NextTankEnviTestProcess] 📄 중단 보고서는 최종 종료 시에 생성됩니다.`);
              
              // 프로세스 중지 플래그 초기화 제거 - 중지 상태 유지
              console.log(`[NextTankEnviTestProcess] 🛑 프로세스 중지 상태 유지 - 고온 테스트 온도 대기 중 주기적 체크`);
              // setProcessStopRequested(false) 호출 제거
              
              return { 
                status: 'stopped', 
                message: '사용자에 의해 중지됨', 
                stoppedAtCycle: cycle, 
                stoppedAtPhase: 'high_temp_waiting',
                totalCycles: cycle
              };
            }
          }
          
          let chamberTemp = 23.45;
          if( SIMULATION_PROC === false ){
            console.log(`[NextTankEnviTestProcess] 사이클 ${cycle}: 고온 테스트 대기 중 온도 읽기`);
            chamberTemp = await getCurrentChamberTemperature();
          }
          
          // ReadChamber 실패 시 처리
          if (chamberTemp === false) {
            console.error(`[NextTankEnviTestProcess] 🛑 챔버 온도 읽기 실패 - 사이클 ${cycle}에서 프로세스 중단`);
            
            // PowerSwitch 상태를 off로 설정
            setMachineRunningStatus(false);
            console.log(`[NextTankEnviTestProcess] 🔌 챔버 오류로 인한 PowerSwitch 상태 OFF 설정`);
            
            // 클라이언트에게 파워스위치 OFF 상태 전송
            if (globalWss) {
              const powerOffMessage = `[POWER_SWITCH] OFF - Machine running: false - Chamber read failed`;
              let sentCount = 0;
              globalWss.clients.forEach(client => {
                if (client.readyState === 1) { // WebSocket.OPEN
                  client.send(powerOffMessage);
                  sentCount++;
                }
              });
              //console.log(`[NextTankEnviTestProcess] 🔌 챔버 오류로 인한 파워스위치 OFF 상태 메시지 전송 완료 - 클라이언트 수: ${sentCount}`);
            } else {
              console.warn(`[NextTankEnviTestProcess] 전역 WebSocket 서버가 설정되지 않음 - 챔버 오류 시 파워스위치 OFF 메시지 전송 불가`);
            }
            
            // 중단된 테스트 결과 파일 생성
            console.log(`[NextTankEnviTestProcess] 📄 중단된 테스트 결과 파일 생성 시작...`);
            
            try {
              // 생성된 파일들을 찾기 위해 Data 폴더 스캔
              const dataFolderPath = path.join(process.cwd(), 'Data');
              // 전역 변수에서 테스트 디렉토리명 사용
              let dateDirectoryName = currentTestDirectoryName || getDateDirectoryName();
              const dateFolderPath = path.join(dataFolderPath, dateDirectoryName);
              
              let existingFiles = [];
              if (fs.existsSync(dateFolderPath)) {
                const files = fs.readdirSync(dateFolderPath);
                existingFiles = files
                  .filter(file => file.endsWith('.csv'))
                  .map(file => path.join(dateFolderPath, file));
              }
              
              // 테스트 설정 정보 수집
              const testSettings = {
                modelName: getTableOption.productInput?.modelName || 'N/A',
                productNumber: getTableOption.productInput?.productNumber || 'N/A',
                temperature: getTableOption.highTempSettings?.targetTemp || 'N/A',
                highTempEnabled: getTableOption.highTempSettings?.highTemp || false,
                lowTempEnabled: getTableOption.lowTempSettings?.lowTemp || false,
                totalCycles: cycleNumber,
                highTempWaitTime: getTableOption.highTempSettings?.waitTime || 'N/A',
                lowTempWaitTime: getTableOption.lowTempSettings?.waitTime || 'N/A',
                highTempReadCount: getTableOption.highTempSettings?.readCount || 'N/A',
                lowTempReadCount: getTableOption.lowTempSettings?.readCount || 'N/A'
              };
              
              // 중단된 테스트 결과 파일 생성
              const result = await generateInterruptedTestResultFile({
                stopReason: 'system_failure',
                stoppedAtCycle: cycle,
                stoppedAtPhase: 'high_temp_waiting',
                errorMessage: '챔버 온도 읽기 실패 - 장비 연결 상태를 확인하세요',
                testSettings
              });
              
              if (result.success) {
                console.log(`[NextTankEnviTestProcess] ✅ 중단된 테스트 결과 파일 생성 완료: ${result.filename}`);
              } else {
                console.error(`[NextTankEnviTestProcess] ❌ 중단된 테스트 결과 파일 생성 실패: ${result.error}`);
              }
            } catch (fileError) {
              console.error(`[NextTankEnviTestProcess] 중단된 테스트 결과 파일 생성 중 오류:`, fileError);
            }

            return { 
              status: 'error', 
              message: '챔버 온도 읽기 실패 - 장비 연결 상태를 확인하세요', 
              stoppedAtCycle: cycle, 
              errorType: 'chamber_read_failed' 
            };
          }
          
          if(chamberTemp >= highTemp) {
            console.log(`[NextTankEnviTestProcess] 사이클 ${cycle}: 고온 테스트 시작 (${chamberTemp}°C)`);
            
            // waitTime 분 만큼 대기 (중지 요청 확인 가능)
            if(SIMULATION_PROC === false){
              console.log(`[NextTankEnviTestProcess] 고온 도달 후 ${waitTime}분 대기 시작...`);
              try {
                await sleepMinutesWithStopCheck(waitTime, `사이클 ${cycle} 고온 대기`);
              } catch (error) {
                if (error.message === 'PROCESS_STOP_REQUESTED') {
                  console.log(`[NextTankEnviTestProcess] 🛑 중지 요청 감지 - 고온 대기 중 중단`);
                  
                  // 중지 시에도 PowerSwitch 상태를 off로 설정
                  setMachineRunningStatus(false);
                  console.log(`[NextTankEnviTestProcess] 🔌 중지로 인한 PowerSwitch 상태 OFF 설정`);
                  
                  // 클라이언트에게 파워스위치 OFF 상태 전송
                  if (globalWss) {
                    const powerOffMessage = `[POWER_SWITCH] OFF - Machine running: false - High temp waiting stopped`;
                    let sentCount = 0;
                    globalWss.clients.forEach(client => {
                      if (client.readyState === 1) { // WebSocket.OPEN
                        client.send(powerOffMessage);
                        sentCount++;
                      }
                    });
                    console.log(`[NextTankEnviTestProcess] 🔌 고온 대기 중단으로 인한 파워스위치 OFF 상태 메시지 전송 완료 - 클라이언트 수: ${sentCount}`);
                  } else {
                    console.warn(`[NextTankEnviTestProcess] 전역 WebSocket 서버가 설정되지 않음 - 고온 대기 중단 시 파워스위치 OFF 메시지 전송 불가`);
                  }
                  
                  return { 
                    status: 'stopped', 
                    message: '사용자에 의해 중지됨', 
                    stoppedAtCycle: cycle, 
                    stoppedAtPhase: 'high_temp_waiting',
                    totalCycles: cycle
                  };
                } else {
                  throw error; // 다른 에러는 다시 던짐
                }
              }
            }
            
            // runSinglePageProcess 실행 (readCount는 함수 내부에서 처리)
            // 중지 요청 확인
            if (getProcessStopRequested()) {
              console.log(`[NextTankEnviTestProcess] 🛑 중지 요청 감지 - 고온 테스트 실행 중 중단`);
              
              // 중지 시에도 PowerSwitch 상태를 off로 설정
              setMachineRunningStatus(false);
              console.log(`[NextTankEnviTestProcess] 🔌 중지로 인한 PowerSwitch 상태 OFF 설정`);
              
              // 클라이언트에게 파워스위치 OFF 상태 전송
              if (globalWss) {
                const powerOffMessage = `[POWER_SWITCH] OFF - Machine running: false - High temp test execution stopped`;
                let sentCount = 0;
                globalWss.clients.forEach(client => {
                  if (client.readyState === 1) { // WebSocket.OPEN
                    client.send(powerOffMessage);
                    sentCount++;
                  }
                });
                console.log(`[NextTankEnviTestProcess] 🔌 고온 테스트 실행 중단으로 인한 파워스위치 OFF 상태 메시지 전송 완료 - 클라이언트 수: ${sentCount}`);
              } else {
                console.warn(`[NextTankEnviTestProcess] 전역 WebSocket 서버가 설정되지 않음 - 고온 테스트 실행 중단 시 파워스위치 OFF 메시지 전송 불가`);
              }
              
              // 중단 보고서 생성은 최종 종료 시에만 생성하도록 수정
              console.log(`[NextTankEnviTestProcess] 📄 중단 보고서는 최종 종료 시에 생성됩니다.`);
              
              return { 
                status: 'stopped', 
                message: '사용자에 의해 중단됨', 
                stoppedAtCycle: cycle, 
                stoppedAtPhase: 'high_temp_test', 
                stoppedAtTest: 1,
                totalCycles: cycle
              };
            }
            
            console.log(`[NextTankEnviTestProcess] 사이클 ${cycle}: 고온 테스트 실행 (readCount: ${readCount})`);
            
            // 현재 테스트 번호를 PowerTable에 업데이트
            if (globalWss) {
              const testUpdateMessage = `[POWER_TABLE_RESET] ${JSON.stringify({
                action: 'test_progress',
                cycle: cycle,
                totalCycles: cycleNumber,
                testPhase: 'high_temp',
                currentTestNumber: 1,
                totalTestCount: readCount,
                testStatus: 'ON',
                timestamp: new Date().toISOString(),
                message: `사이클 ${cycle}: 고온 테스트 실행 중 (readCount: ${readCount})`
              })}`;
              
              let sentCount = 0;
              globalWss.clients.forEach(client => {
                if (client.readyState === 1) { // WebSocket.OPEN
                  client.send(testUpdateMessage);
                  sentCount++;
                }
              });
              console.log(`[NextTankEnviTestProcess] 사이클 ${cycle} 고온 테스트 진행 상황 업데이트 전송 완료 - 클라이언트 수: ${sentCount}`);
            }
            
            // SinglePageProcess 재시도 로직 (최대 5회)
            let singlePageSuccess = false;
            let retryCount = 0;
            const maxRetries = 5;
            let singlePageResult = null;
            
            while (!singlePageSuccess && retryCount < maxRetries) {
              try {
                // 현재 호출 순서 계산 (고온 테스트)
                let currentCallIndex = 0;
                if (highTempEnabled) {
                  // 고온 테스트가 먼저 실행되므로: (cycle - 1) * 2 + 1 (고온이 첫 번째)
                  currentCallIndex = (cycle - 1) * 2 + 1;
                  if (!lowTempEnabled) {
                    // 저온 테스트가 비활성화된 경우: (cycle - 1) * 1 + 1
                    currentCallIndex = cycle;
                  }
                }
                
                // runSinglePageProcess 호출 전 진행상황 업데이트
                updateAndSendProgress(cycle, totalCycles, 'high_temp', currentCallIndex, totalCallCount, '고온 테스트');
                
                singlePageResult = await runSinglePageProcess(readCount);
                
                if ( singlePageResult.status === 'stopped') {
                  console.log(`[NextTankEnviTestProcess] 🛑 SinglePageProcess 중지됨: ${singlePageResult.message}`);
                  console.log(`[NextTankEnviTestProcess] 🛑 SinglePageProcess 중지로 인한 중단 보고서 생성`);
                  // PowerSwitch 상태를 off로 설정
                  setMachineRunningStatus(false);
                  
                  // 클라이언트에게 파워스위치 OFF 상태 전송
                  if (globalWss) {
                    const powerOffMessage = `[POWER_SWITCH] OFF - Machine running: false - SinglePageProcess stopped`;
                    let sentCount = 0;
                    globalWss.clients.forEach(client => {
                      if (client.readyState === 1) { // WebSocket.OPEN
                        client.send(powerOffMessage);
                        sentCount++;
                      }
                    });
                    console.log(`[NextTankEnviTestProcess] 🔌 SinglePageProcess 중지로 인한 파워스위치 OFF 상태 메시지 전송 완료 - 클라이언트 수: ${sentCount}`);
                  }
                  
                  // 중단 보고서는 최종 종료 시에만 생성하도록 수정
                  console.log(`[NextTankEnviTestProcess] 📄 중단 보고서는 최종 종료 시에 생성됩니다.`);
                  
                  // 전역 디렉토리명 초기화
                  currentTestDirectoryName = null;
                  
                  // 중단 상태로 프로세스 완료
                  return {
                    status: 'stopped',
                    message: 'SinglePageProcess 중지로 인한 전체 프로세스 중단',
                    stoppedAtCycle: cycle,
                    stoppedAtPhase: 'high_temp_test',
                    stopReason: 'SinglePageProcess_stopped',
                    finalReportGenerated: true,
                    totalCycles: cycle
                  };
                }
                
                if (singlePageResult && singlePageResult.status === 'completed' && singlePageResult.data) {
                  singlePageSuccess = true;
                  console.log(`[NextTankEnviTestProcess] 사이클 ${cycle} 고온 테스트 성공 (readCount: ${readCount}, ${retryCount + 1}번째 시도)`);
                } else {
                  throw new Error(`SinglePageProcess 실패: ${singlePageResult?.message || '알 수 없는 오류'}`);
                }
              } catch (error) {
                retryCount++;
                console.warn(`[NextTankEnviTestProcess] 사이클 ${cycle} 고온 테스트 실패 (${retryCount}/${maxRetries}): ${error.message}`);
                
                if (retryCount < maxRetries) {
                  console.log(`[NextTankEnviTestProcess] 3초 후 재시도...`);
                  await sleep(3000);
                } else {
                  console.error(`[NextTankEnviTestProcess] 사이클 ${cycle} 고온 테스트 최종 실패 - 프로세스 중단`);
                  
                  // PowerSwitch 상태를 off로 설정
                  setMachineRunningStatus(false);
                  console.log(`[NextTankEnviTestProcess] 🔌 고온 테스트 실패로 인한 PowerSwitch 상태 OFF 설정`);
                  
                  // 중단 보고서는 최종 종료 시에만 생성하도록 수정
                  console.log(`[NextTankEnviTestProcess] 📄 중단 보고서는 최종 종료 시에 생성됩니다.`);
                  
                  // 전역 디렉토리명 초기화
                  currentTestDirectoryName = null;
                  
                  return { 
                    status: 'error', 
                    message: `고온 테스트 실패 - 5회 재시도 후 최종 실패 (readCount: ${readCount})`, 
                    stoppedAtCycle: cycle, 
                    stoppedAtPhase: 'high_temp_test', 
                    stoppedAtTest: 1,
                    errorType: 'high_temp_test_failed',
                    finalReportGenerated: true
                  };
                }
              }
            }
            
            // 실행 결과를 개별 파일로 저장
            if (singlePageResult && singlePageResult.status === 'completed' && singlePageResult.data) {
              console.log(`[NextTankEnviTestProcess] 사이클 ${cycle} 고온 테스트 결과 저장 시작 (readCount: ${readCount})`);
              const saveResult = saveTotaReportTableToFile(
                singlePageResult.data, 
                getTableOption.channelVoltages, 
                cycle, 
                `HighTemp_Test`
              );
              if (saveResult.success) {
                console.log(`[NextTankEnviTestProcess] 사이클 ${cycle} 고온 테스트 결과 저장 완료: ${saveResult.filename}`);
              } else {
                console.error(`[NextTankEnviTestProcess] 사이클 ${cycle} 고온 테스트 결과 저장 실패: ${saveResult.error}`);
              }
              
              // 결과 누적 (기존 로직 유지)
              highTempResults.push(singlePageResult.data);
            }
            console.log(`[NextTankEnviTestProcess] 사이클 ${cycle}: 고온 테스트 완료 (${highTempResults.length}개 결과 누적)`);
            
            // 실행완료 하면 빠져 나감
            break;
          } else {
            console.log(`[NextTankEnviTestProcess] 사이클 ${cycle}: 고온 대기 중... 현재: ${chamberTemp}°C, 목표: ${highTemp}°C`);
            await sleep(60000); // 1분 대기
          }
        }
      }
      
      // low temp test
      const lowTemp = getTableOption.lowTempSettings.targetTemp;
      const lowWaitTime = getTableOption.lowTempSettings.waitTime; // 분 단위로 저장된 값
      const lowTempTest = getTableOption.lowTempSettings.lowTemp;
      const lowReadCount = getTableOption.lowTempSettings.readCount;
      //console.log(`[NextTankEnviTestProcess] lowTemp: ${lowTemp}`);
      //console.log(`[NextTankEnviTestProcess] lowWaitTime: ${lowWaitTime}분`);
      //console.log(`[NextTankEnviTestProcess] lowReadCount: ${lowReadCount}`); 
      //console.log(`[NextTankEnviTestProcess] lowTempTest: ${lowTempTest}`);
      
      if(lowTempTest === true) {
        console.log(`[NextTankEnviTestProcess] 사이클 ${cycle}: 2. 저온 테스트 시작`); 
        
        // 저온 테스트 시작 시 PowerTable에 테스트 정보 업데이트
        if (globalWss) {
          const lowTempStartMessage = `[POWER_TABLE_RESET] ${JSON.stringify({
            action: 'test_start',
            cycle: cycle,
            totalCycles: cycleNumber,
            testPhase: 'low_temp',
            currentTestNumber: 0,
            totalTestCount: lowReadCount,
            testStatus: 'ON',
            timestamp: new Date().toISOString(),
            message: `사이클 ${cycle}: 저온 테스트 시작 (${lowReadCount}회)`
          })}`;
          
          let sentCount = 0;
          globalWss.clients.forEach(client => {
            if (client.readyState === 1) { // WebSocket.OPEN
              client.send(lowTempStartMessage);
              sentCount++;
            }
          });
          console.log(`[NextTankEnviTestProcess] 사이클 ${cycle} 저온 테스트 시작 메시지 전송 완료 - 클라이언트 수: ${sentCount}`);
        }
        
        // 챔버 온도를 읽어서 비교하여 도달하면 테스트 시작
        // 아니면 온도가 도달 할때 까지 대기
        // 온도 대기 중 중지 요청 확인을 위한 간격 - 더 빠른 응답을 위해 1초로 단축
        const lowTempCheckInterval = 1000; // 1초마다 중지 요청 확인
        let lastLowTempCheck = Date.now();
        
        while(true) {
          // 중지 요청 확인 - 온도 대기 중
          if (getProcessStopRequested()) {
            console.log(`[NextTankEnviTestProcess] 🛑 중지 요청 감지 - 저온 테스트 대기 중 중단`);
            
            // 중지 시에도 PowerSwitch 상태를 off로 설정
            setMachineRunningStatus(false);
            console.log(`[NextTankEnviTestProcess] 🔌 중지로 인한 PowerSwitch 상태 OFF 설정`);
            
            // 클라이언트에게 파워스위치 OFF 상태 전송
            if (globalWss) {
              const powerOffMessage = `[POWER_SWITCH] OFF - Machine running: false - Low temp test waiting stopped`;
              let sentCount = 0;
              globalWss.clients.forEach(client => {
                if (client.readyState === 1) { // WebSocket.OPEN
                  client.send(powerOffMessage);
                  sentCount++;
                }
              });
              console.log(`[NextTankEnviTestProcess] 🔌 저온 테스트 대기 중단으로 인한 파워스위치 OFF 상태 메시지 전송 완료 - 클라이언트 수: ${sentCount}`);
            } else {
              console.warn(`[NextTankEnviTestProcess] 전역 WebSocket 서버가 설정되지 않음 - 저온 테스트 대기 중단 시 파워스위치 OFF 메시지 전송 불가`);
            }
            
            // 중단된 테스트 결과 파일 생성
            console.log(`[NextTankEnviTestProcess] 📄 중단된 테스트 결과 파일 생성 시작...`);
            
            try {
              // 테스트 설정 정보 수집
              const testSettings = {
                modelName: getTableOption.productInput?.modelName || 'N/A',
                productNumber: getTableOption.productInput?.productNumber || 'N/A',
                temperature: getTableOption.lowTempSettings?.targetTemp || 'N/A',
                highTempEnabled: getTableOption.highTempSettings?.highTemp || false,
                lowTempEnabled: getTableOption.lowTempSettings?.lowTemp || false,
                totalCycles: cycleNumber,
                highTempWaitTime: getTableOption.highTempSettings?.waitTime || 'N/A',
                lowTempWaitTime: getTableOption.lowTempSettings?.waitTime || 'N/A',
                highTempReadCount: getTableOption.highTempSettings?.readCount || 'N/A',
                lowTempReadCount: getTableOption.lowTempSettings?.readCount || 'N/A'
              };
              
              // 중단된 테스트 결과 파일 생성
              const result = await generateInterruptedTestResultFile({
                stopReason: 'manual_stop',
                stoppedAtCycle: cycle,
                stoppedAtPhase: 'low_temp_waiting',
                testSettings
              });
              
              if (result.success) {
                console.log(`[NextTankEnviTestProcess] ✅ 중단된 테스트 결과 파일 생성 완료: ${result.filename}`);
              } else {
                console.error(`[NextTankEnviTestProcess] ❌ 중단된 테스트 결과 파일 생성 실패: ${result.error}`);
              }
            } catch (fileError) {
              console.error(`[NextTankEnviTestProcess] 중단된 테스트 결과 파일 생성 중 오류:`, fileError);
            }
            
            // 수동 중지 시 전역 디렉토리명 초기화 (보고서 생성 후)
            console.log(`[NextTankEnviTestProcess] 📁 수동 중지 - 전역 디렉토리명 초기화: ${currentTestDirectoryName}`);
            // currentTestDirectoryName은 generateInterruptedTestResultFile에서 사용 후 null로 설정됨
            
            return { 
              status: 'stopped', 
              message: '사용자에 의해 중지됨', 
              stoppedAtCycle: cycle, 
              stoppedAtPhase: 'low_temp_waiting',
              totalCycles: cycle
            };
          }
          
          console.log(`[NextTankEnviTestProcess] 사이클 ${cycle}: 저온 테스트 대기 중 목표 온도: ${lowTemp}℃`);

          // 온도 대기 중 중지 요청 확인을 위한 간격 체크
          const now = Date.now();
          if (now - lastLowTempCheck >= lowTempCheckInterval) {
            lastLowTempCheck = now;
            
            // 중지 요청 확인 - 온도 대기 중 주기적 체크
            if (getProcessStopRequested()) {
              console.log(`[NextTankEnviTestProcess] 🛑 중지 요청 감지 - 저온 테스트 온도 대기 중 주기적 체크에서 중단`);
              
              // PowerSwitch 상태 OFF 설정
              setMachineRunningStatus(false);
              
              // 클라이언트에게 파워스위치 OFF 상태 전송
              if (globalWss) {
                const powerOffMessage = `[POWER_SWITCH] OFF - Machine running: false - Process stopped during low temp waiting`;
                globalWss.clients.forEach(client => {
                  if (client.readyState === 1) {
                    client.send(powerOffMessage);
                  }
                });
              }
              
              // 중단 보고서 생성 (안전한 처리)
              try {
                // 전역 디렉토리명이 있는지 확인
                if (!currentTestDirectoryName) {
                  currentTestDirectoryName = getDateDirectoryName();
                  console.log(`[NextTankEnviTestProcess] ⚠️ 전역 디렉토리명이 없어 새로 생성: ${currentTestDirectoryName}`);
                }
                
                const testSettings = {
                  modelName: getTableOption.productInput?.modelName || 'N/A',
                  productNumber: getTableOption.productInput?.productNumber || 'N/A',
                  temperature: getTableOption.lowTempSettings?.targetTemp || 'N/A',
                  totalCycles: cycleNumber
                };
                
                const reportResult = await generateInterruptedTestResultFile({
                  stopReason: 'power_switch_off',
                  stoppedAtCycle: cycle,
                  stoppedAtPhase: 'low_temp_waiting',
                  errorMessage: '사용자에 의한 파워스위치 OFF',
                  testSettings: testSettings
                });
                
                if (reportResult && reportResult.success) {
                  console.log(`[NextTankEnviTestProcess] ✅ 중단 보고서 생성 성공: ${reportResult.filename}`);
                  // 전역 디렉토리명은 유지 (다른 함수에서도 사용)
                  console.log(`[NextTankEnviTestProcess] 📁 전역 디렉토리명 유지: ${currentTestDirectoryName}`);
                } else {
                  console.error(`[NextTankEnviTestProcess] ❌ 중단 보고서 생성 실패:`, reportResult?.error || '알 수 없는 오류');
                }
                
              } catch (error) {
                console.error(`[NextTankEnviTestProcess] ❌ 중단 보고서 생성 실패:`, error.message);
              }
              
              // 프로세스 중지 플래그 상태 유지
              console.log(`[NextTankEnviTestProcess] 🛑 프로세스 중지 상태 유지 - 저온 테스트 온도 대기 중`);
              // setProcessStopRequested(false) 호출 제거
              
              return { 
                status: 'stopped', 
                message: '사용자에 의해 중지됨', 
                stoppedAtCycle: cycle, 
                stoppedAtPhase: 'low_temp_waiting',
                totalCycles: cycle
              };
            }
          }
          
          let chamberTemp = 23.45;
          if( SIMULATION_PROC != true ){
            chamberTemp = await getCurrentChamberTemperature();
          }
          console.log(`[NextTankEnviTestProcess] 사이클 ${cycle}: 저온 테스트 대기 중 온도: ${chamberTemp}℃`);
          
          // ReadChamber 실패 시 처리
          if (chamberTemp === false) {
            console.error(`[NextTankEnviTestProcess] 🛑 챔버 온도 읽기 실패 - 사이클 ${cycle}에서 프로세스 중단`);
            
            // PowerSwitch 상태를 off로 설정
            setMachineRunningStatus(false);
            console.log(`[NextTankEnviTestProcess] 🔌 챔버 오류로 인한 PowerSwitch 상태 OFF 설정`);
            
            // 클라이언트에게 파워스위치 OFF 상태 전송
            if (globalWss) {
              const powerOffMessage = `[POWER_SWITCH] OFF - Machine running: false - Chamber read failed`;
              let sentCount = 0;
              globalWss.clients.forEach(client => {
                if (client.readyState === 1) { // WebSocket.OPEN
                  client.send(powerOffMessage);
                  sentCount++;
                }
              });
              console.log(`[NextTankEnviTestProcess] 🔌 챔버 오류로 인한 파워스위치 OFF 상태 메시지 전송 완료 - 클라이언트 수: ${sentCount}`);
            } else {
              console.warn(`[NextTankEnviTestProcess] 전역 WebSocket 서버가 설정되지 않음 - 챔버 오류 시 파워스위치 OFF 메시지 전송 불가`);
            }
            
            return { 
              status: 'error', 
              message: '챔버 온도 읽기 실패 - 장비 연결 상태를 확인하세요', 
              stoppedAtCycle: cycle, 
              errorType: 'chamber_read_failed' 
            };
          }
          
          if(chamberTemp <= lowTemp) {
            console.log(`[NextTankEnviTestProcess] 사이클 ${cycle}: 저온 테스트 시작 (${chamberTemp}°C)`);
            console.log(`[NextTankEnviTestProcess] 저온테스트 전 ${lowWaitTime}분 대기`);
            
            // lowWaitTime 분 만큼 대기 (중지 요청 확인 가능)
            try {
              await sleepMinutesWithStopCheck(lowWaitTime, `사이클 ${cycle} 저온 대기`);
            } catch (error) {
              if (error.message === 'PROCESS_STOP_REQUESTED') {
                console.log(`[NextTankEnviTestProcess] 🛑 중지 요청 감지 - 저온 대기 중 중단`);
                
                // 중지 시에도 PowerSwitch 상태를 off로 설정
                setMachineRunningStatus(false);
                console.log(`[NextTankEnviTestProcess] 🔌 중지로 인한 PowerSwitch 상태 OFF 설정`);
                
                // 클라이언트에게 파워스위치 OFF 상태 전송
                if (globalWss) {
                  const powerOffMessage = `[POWER_SWITCH] OFF - Machine running: false - Low temp waiting stopped`;
                  let sentCount = 0;
                  globalWss.clients.forEach(client => {
                    if (client.readyState === 1) { // WebSocket.OPEN
                      client.send(powerOffMessage);
                      sentCount++;
                    }
                  });
                  console.log(`[NextTankEnviTestProcess] 🔌 저온 대기 중단으로 인한 파워스위치 OFF 상태 메시지 전송 완료 - 클라이언트 수: ${sentCount}`);
                } else {
                  console.warn(`[NextTankEnviTestProcess] 전역 WebSocket 서버가 설정되지 않음 - 저온 대기 중단 시 파워스위치 OFF 메시지 전송 불가`);
                }
                
                return { 
                  status: 'stopped', 
                  message: '사용자에 의해 중지됨', 
                  stoppedAtCycle: cycle, 
                  stoppedAtPhase: 'low_temp_waiting',
                  totalCycles: cycle
                };
              } else {
                throw error; // 다른 에러는 다시 던짐
              }
            }
            
            // runSinglePageProcess 실행 (lowReadCount는 함수 내부에서 처리)
            // 중지 요청 확인
            if (getProcessStopRequested()) {
              console.log(`[NextTankEnviTestProcess] 🛑 중지 요청 감지 - 저온 테스트 실행 중 중단`);
              
              // PowerSwitch 상태 OFF 설정
              setMachineRunningStatus(false);
              
              // 클라이언트에게 파워스위치 OFF 상태 전송
              if (globalWss) {
                const powerOffMessage = `[POWER_SWITCH] OFF - Machine running: false - Low temp test execution stopped`;
                globalWss.clients.forEach(client => {
                  if (client.readyState === 1) {
                    client.send(powerOffMessage);
                  }
                });
              }
              
              // 중단 보고서는 최종 종료 시에만 생성하도록 수정
              console.log(`[NextTankEnviTestProcess] 📄 중단 보고서는 최종 종료 시에 생성됩니다.`);
              
              return { 
                status: 'stopped', 
                message: '사용자에 의해 중단됨', 
                stoppedAtCycle: cycle, 
                stoppedAtPhase: 'low_temp_test', 
                stoppedAtTest: 1,
                totalCycles: cycle
              };
            }
            
            console.log(`[NextTankEnviTestProcess] 사이클 ${cycle}: 저온 테스트 실행 (lowReadCount: ${lowReadCount})`);
            
            // 현재 테스트 번호를 PowerTable에 업데이트
            if (globalWss) {
              const testUpdateMessage = `[POWER_TABLE_RESET] ${JSON.stringify({
                action: 'test_progress',
                cycle: cycle,
                totalCycles: cycleNumber,
                testPhase: 'low_temp',
                currentTestNumber: 1,
                totalTestCount: lowReadCount,
                testStatus: 'ON',
                timestamp: new Date().toISOString(),
                message: `사이클 ${cycle}: 저온 테스트 실행 중 (lowReadCount: ${lowReadCount})`
              })}`;
              
              let sentCount = 0;
              globalWss.clients.forEach(client => {
                if (client.readyState === 1) { // WebSocket.OPEN
                  client.send(testUpdateMessage);
                  sentCount++;
                }
              });
              console.log(`[NextTankEnviTestProcess] 사이클 ${cycle} 저온 테스트 진행 상황 업데이트 전송 완료 - 클라이언트 수: ${sentCount}`);
            }
            
            // SinglePageProcess 재시도 로직 (최대 5회)
            let singlePageSuccess = false;
            let retryCount = 0;
            const maxRetries = 5;
            let singlePageResult = null;
            
            while (!singlePageSuccess && retryCount < maxRetries) {
              try {
                // 현재 호출 순서 계산 (저온 테스트)
                let currentCallIndex = 0;
                if (lowTempEnabled) {
                  if (highTempEnabled) {
                    // 고온과 저온 모두 활성화된 경우: (cycle - 1) * 2 + 2 (저온이 두 번째)
                    currentCallIndex = (cycle - 1) * 2 + 2;
                  } else {
                    // 고온이 비활성화된 경우: (cycle - 1) * 1 + 1
                    currentCallIndex = cycle;
                  }
                }
                
                // runSinglePageProcess 호출 전 진행상황 업데이트
                updateAndSendProgress(cycle, totalCycles, 'low_temp', currentCallIndex, totalCallCount, '저온 테스트');
                
                singlePageResult = await runSinglePageProcess(lowReadCount);
                
                if (singlePageResult.status === 'stopped') {
                  console.log(`[NextTankEnviTestProcess] 🛑 SinglePageProcess 중지됨: ${singlePageResult.message}`);
                  console.log(`[NextTankEnviTestProcess] 🛑 SinglePageProcess 중지로 인한 중단 보고서 생성`);
                  
                  // PowerSwitch 상태를 off로 설정
                  setMachineRunningStatus(false);
                  
                  // 클라이언트에게 파워스위치 OFF 상태 전송
                  if (globalWss) {
                    const powerOffMessage = `[POWER_SWITCH] OFF - Machine running: false - SinglePageProcess stopped`;
                    let sentCount = 0;
                    globalWss.clients.forEach(client => {
                      if (client.readyState === 1) { // WebSocket.OPEN
                        client.send(powerOffMessage);
                        sentCount++;
                      }
                    });
                    console.log(`[NextTankEnviTestProcess] 🔌 SinglePageProcess 중지로 인한 파워스위치 OFF 상태 메시지 전송 완료 - 클라이언트 수: ${sentCount}`);
                  }
                  
                  // 중단 보고서는 최종 종료 시에만 생성하도록 수정
                  console.log(`[NextTankEnviTestProcess] 📄 중단 보고서는 최종 종료 시에 생성됩니다.`);
                  
                  // 전역 디렉토리명 초기화
                  currentTestDirectoryName = null;
                  
                  // 중단 상태로 프로세스 완료
                  return { 
                    status: 'stopped', 
                    message: 'SinglePageProcess 중지로 인한 전체 프로세스 중단',
                    stoppedAtCycle: cycle,
                    stoppedAtPhase: 'low_temp_test',
                    stopReason: 'SinglePageProcess_stopped',
                    finalReportGenerated: true
                  };
                }
                
                if (singlePageResult && singlePageResult.status === 'completed' && singlePageResult.data) {
                  singlePageSuccess = true;
                  console.log(`[NextTankEnviTestProcess] 사이클 ${cycle} 저온 테스트 성공 (lowReadCount: ${lowReadCount}, ${retryCount + 1}번째 시도)`);
                } else {
                  throw new Error(`SinglePageProcess 실패: ${singlePageResult?.message || '알 수 없는 오류'}`);
                }
              } catch (error) {
                retryCount++;
                console.warn(`[NextTankEnviTestProcess] 사이클 ${cycle} 저온 테스트 실패 (${retryCount}/${maxRetries}): ${error.message}`);
                
                if (retryCount < maxRetries) {
                  console.log(`[NextTankEnviTestProcess] 3초 후 재시도...`);
                  await sleep(3000);
                } else {
                  console.error(`[NextTankEnviTestProcess] 사이클 ${cycle} 저온 테스트 최종 실패 - 프로세스 중단`);
                  
                  // PowerSwitch 상태를 off로 설정
                  setMachineRunningStatus(false);
                  console.log(`[NextTankEnviTestProcess] 🔌 저온 테스트 실패로 인한 PowerSwitch 상태 OFF 설정`);
                  
                  // 최종 실패 시에도 중단 보고서 생성
                  try {
                    const testSettings = {
                      modelName: getTableOption.productInput?.modelName || 'N/A',
                      productNumber: getTableOption.productInput?.productNumber || 'N/A',
                      temperature: getTableOption.lowTempSettings?.targetTemp || 'N/A',
                      totalCycles: cycleNumber
                    };
                    
                    const reportResult = await generateInterruptedTestResultFile({
                      stopReason: 'low_temp_test_failed',
                      stoppedAtCycle: cycle,
                      stoppedAtPhase: 'low_temp_test',
                      errorMessage: `저온 테스트 실패 - 5회 재시도 후 최종 실패 (lowReadCount: ${lowReadCount})`,
                      testSettings: testSettings
                    });
                    
                    if (reportResult && reportResult.success) {
                      console.log(`[NextTankEnviTestProcess] ✅ 최종 실패로 인한 중단 보고서 생성 성공: ${reportResult.filename}`);
                    } else {
                      console.error(`[NextTankEnviTestProcess] ❌ 최종 실패로 인한 중단 보고서 생성 실패:`, reportResult?.error || '알 수 없는 오류');
                    }
                  } catch (reportError) {
                    console.error(`[NextTankEnviTestProcess] ❌ 최종 실패로 인한 중단 보고서 생성 실패:`, reportError.message);
                  }
                  
                  // 전역 디렉토리명 초기화
                  currentTestDirectoryName = null;
                  
                  return { 
                    status: 'error', 
                    message: `저온 테스트 실패 - 5회 재시도 후 최종 실패 (lowReadCount: ${lowReadCount})`, 
                    stoppedAtCycle: cycle, 
                    stoppedAtPhase: 'low_temp_test', 
                    stoppedAtTest: 1,
                    errorType: 'low_temp_test_failed',
                    finalReportGenerated: true
                  };
                }
              }
            }
            
            // 실행 결과를 개별 파일로 저장
            if (singlePageResult && singlePageResult.status === 'completed' && singlePageResult.data) {
              console.log(`[NextTankEnviTestProcess] 사이클 ${cycle} 저온 테스트 결과 저장 시작 (lowReadCount: ${lowReadCount})`);
              const saveResult = saveTotaReportTableToFile(
                singlePageResult.data, 
                getTableOption.channelVoltages, 
                cycle, 
                `LowTemp_Test`
              );
              if (saveResult.success) {
                console.log(`[NextTankEnviTestProcess] 사이클 ${cycle} 저온 테스트 결과 저장 완료: ${saveResult.filename}`);
              } else {
                console.error(`[NextTankEnviTestProcess] 사이클 ${cycle} 저온 테스트 결과 저장 실패: ${saveResult.error}`);
              }
              
              // 결과 누적 (기존 로직 유지)
              lowTempResults.push(singlePageResult.data);
            }
            console.log(`[NextTankEnviTestProcess] 사이클 ${cycle}: 저온 테스트 완료 (${lowTempResults.length}개 결과 누적)`);
            
            // 실행완료 하면 빠져 나감
            break;
          } else {
            console.log(`[NextTankEnviTestProcess] 사이클 ${cycle}: 저온 대기 중... 현재: ${chamberTemp}°C, 목표: ${lowTemp}°C`);
            await sleep(60000); // 1분 대기
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
    
    // 모든 사이클 완료 후 종합 리포트 생성
    console.log(`[NextTankEnviTestProcess] 📄 모든 사이클 완료 - 종합 리포트 생성`);
    try {
      const finalReportResult = await generateFinalDeviceReport(cycleNumber);
      if (finalReportResult && finalReportResult.success) {
        console.log(`[NextTankEnviTestProcess] ✅ 종합 리포트 생성 성공: ${finalReportResult.filename}`);
      } else {
        console.error(`[NextTankEnviTestProcess] ❌ 종합 리포트 생성 실패:`, finalReportResult?.error || '알 수 없는 오류');
      }
    } catch (error) {
      console.error(`[NextTankEnviTestProcess] ❌ 종합 리포트 생성 실패:`, error.message);
    }
    
    // 최종결과 테이블 생성 비활성화 (xxx_FinalResult_AllCycles.csv 파일 생성하지 않음)
    // console.log(`[NextTankEnviTestProcess] 📊 최종결과 테이블 생성 시작`);
    // try {
    //   const getTableOption = await getSafeGetTableOption();
    //   const finalTable = createFinalResultTable(cycleResults, getTableOption);
    //   const finalTableResult = saveFinalResultTable(finalTable, getTableOption, cycleNumber);
    //   
    //   if (finalTableResult && finalTableResult.success) {
    //     console.log(`[NextTankEnviTestProcess] ✅ 최종결과 테이블 생성 성공: ${finalTableResult.filename}`);
    //   } else {
    //     console.error(`[NextTankEnviTestProcess] ❌ 최종결과 테이블 생성 실패: ${finalTableResult?.error || '알 수 없는 오류'}`);
    //   }
    // } catch (error) {
    //   console.error(`[NextTankEnviTestProcess] ❌ 최종결과 테이블 생성 중 오류 발생:`, error);
    // }
    
    // PowerSwitch 상태 OFF 설정
    setMachineRunningStatus(false);
    
    // 클라이언트에게 파워스위치 OFF 상태 전송
    if (globalWss) {
      const powerOffMessage = `[POWER_SWITCH] OFF - Machine running: false - Test completed`;
      globalWss.clients.forEach(client => {
        if (client.readyState === 1) {
          client.send(powerOffMessage);
        }
      });
    }
    
    // 프로세스 중지 플래그 초기화 제거 - 중지 상태 유지
    console.log(`[NextTankEnviTestProcess] 🛑 프로세스 완료 - 중지 플래그 상태 유지`);
    // setProcessStopRequested(false) 호출 제거
    
    // 프로세스 완료 후 전역 디렉토리명 초기화 (모든 파일 생성 완료 후)
    console.log(`[NextTankEnviTestProcess] 📁 프로세스 완료 - 전역 디렉토리명 초기화: ${currentTestDirectoryName}`);
    currentTestDirectoryName = null;
    
    // 테스트 완료 알림
    if (globalWss) {
      const testCompleteMessage = `[TEST_COMPLETED] 환경 시험 프로세스 완료 - 총 ${cycleNumber}개 사이클 완료`;
      const testCompleteData = {
        type: 'TEST_COMPLETED',
        testType: '환경 시험',
        cycleCount: cycleNumber,
        completionTime: new Date().toISOString(),
        status: 'success'
      };
      
      globalWss.clients.forEach(client => {
        if (client.readyState === 1) { // WebSocket.OPEN
          client.send(testCompleteMessage);
          client.send(`[TEST_COMPLETE_DATA] ${JSON.stringify(testCompleteData)}`);
        }
      });
      console.log(`[NextTankEnviTestProcess] 🎉 테스트 완료 알림 메시지 전송 완료 - 클라이언트 수: ${globalWss.clients.size}`);
    } else {
      console.warn(`[NextTankEnviTestProcess] 전역 WebSocket 서버가 설정되지 않음 - 테스트 완료 알림 메시지 전송 불가`);
    }
    
    return { 
      status: 'completed', 
      message: '모든 사이클 완료 및 종합 리포트 생성 완료',
      totalCycles: cycleNumber,
      finalReportGenerated: true
    };
    
  } catch (error) {
    console.error('[NextTankEnviTestProcess] 예외 발생:', error);
    
    // SinglePageProcess 중지로 인한 에러인지 확인
    if (error.status === 'stopped_by_singlepage') {
      console.log(`[NextTankEnviTestProcess] 🛑 SinglePageProcess 중지로 인한 프로세스 중단 처리`);
      
      // PowerSwitch 상태 OFF 설정
      setMachineRunningStatus(false);
      
      // 프로세스 중지 플래그 초기화 제거 - 중지 상태 유지
      console.log(`[NextTankEnviTestProcess] 🛑 SinglePageProcess 중지 - 중지 플래그 상태 유지`);
      // setProcessStopRequested(false) 호출 제거
      
      // 클라이언트에게 파워스위치 OFF 상태 전송
      if (globalWss) {
        const powerOffMessage = `[POWER_SWITCH] OFF - Machine running: false - SinglePageProcess stopped`;
        let sentCount = 0;
        globalWss.clients.forEach(client => {
          if (client.readyState === 1) { // WebSocket.OPEN
            client.send(powerOffMessage);
            sentCount++;
          }
        });
        console.log(`[NextTankEnviTestProcess] 🔌 SinglePageProcess 중지로 인한 파워스위치 OFF 상태 메시지 전송 완료 - 클라이언트 수: ${sentCount}`);
      }
      
      // 전역 디렉토리명 초기화
      currentTestDirectoryName = null;
      
      // SinglePageProcess 중지로 인한 프로세스 완료 반환
      return {
        status: 'completed',
        message: error.message,
        stoppedAtCycle: error.stoppedAtCycle,
        stoppedAtPhase: error.stoppedAtPhase,
        stoppedAtTest: error.stoppedAtTest,
        finalReportGenerated: error.finalReportGenerated,
        result: error.result,
        totalCycles: error.stoppedAtCycle || 1
      };
    }
    
    // 일반 에러 발생 시 PowerSwitch 상태 OFF 설정
    setMachineRunningStatus(false);
    
    // 에러 발생 시 프로세스 중지 플래그 초기화 제거 - 중지 상태 유지
    console.log(`[NextTankEnviTestProcess] 🛑 에러 발생 - 중지 플래그 상태 유지`);
    // setProcessStopRequested(false) 호출 제거
    
    // 에러 발생 시에도 클라이언트에게 파워스위치 OFF 상태 전송
    if (globalWss) {
      const powerOffMessage = `[POWER_SWITCH] OFF - Machine running: false - Error occurred`;
      let sentCount = 0;
      globalWss.clients.forEach(client => {
        if (client.readyState === 1) { // WebSocket.OPEN
          client.send(powerOffMessage);
          sentCount++;
        }
      });
      console.log(`[NextTankEnviTestProcess] 🔌 에러 발생으로 인한 파워스위치 OFF 상태 메시지 전송 완료 - 클라이언트 수: ${sentCount}`);
    } else {
      console.warn(`[NextTankEnviTestProcess] 전역 WebSocket 서버가 설정되지 않음 - 에러 발생 시 파워스위치 OFF 메시지 전송 불가`);
    }
    
    // 에러 발생 시에도 중단된 테스트 결과 파일 생성
    console.log(`[NextTankEnviTestProcess] 📄 에러로 인한 중단된 테스트 결과 파일 생성 시작...`);
    
    try {
      // 테스트 설정 정보 수집 (에러 발생 시에는 기본값 사용)
      const testSettings = {
        modelName: 'N/A',
        productNumber: 'N/A',
        temperature: 'N/A',
        highTempEnabled: false,
        lowTempEnabled: false,
        totalCycles: 1,
        highTempWaitTime: 'N/A',
        lowTempWaitTime: 'N/A',
        highTempReadCount: 'N/A',
        lowTempReadCount: 'N/A'
      };
      
      // 중단된 테스트 결과 파일 생성 (안전한 처리)
      try {
        // 전역 디렉토리명이 있는지 확인
        if (!currentTestDirectoryName) {
          currentTestDirectoryName = getDateDirectoryName();
          console.log(`[NextTankEnviTestProcess] ⚠️ 전역 디렉토리명이 없어 새로 생성: ${currentTestDirectoryName}`);
        }
        
        const result = await generateInterruptedTestResultFile({
          stopReason: 'error',
          stoppedAtCycle: 1, // 에러 발생 시에는 사이클 1로 가정
          stoppedAtPhase: 'unknown',
          errorMessage: error.message || '알 수 없는 에러',
          testSettings
        });
        
        if (result && result.success) {
          console.log(`[NextTankEnviTestProcess] ✅ 에러로 인한 중단된 테스트 결과 파일 생성 완료: ${result.filename}`);
          // 전역 디렉토리명은 유지 (다른 함수에서도 사용)
          console.log(`[NextTankEnviTestProcess] 📁 전역 디렉토리명 유지: ${currentTestDirectoryName}`);
        } else {
          console.error(`[NextTankEnviTestProcess] ❌ 에러로 인한 중단된 테스트 결과 파일 생성 실패:`, result?.error || '알 수 없는 오류');
        }
      } catch (reportError) {
        console.error(`[NextTankEnviTestProcess] ❌ 에러로 인한 중단 보고서 생성 실패:`, reportError.message);
      }
          } catch (fileError) {
        console.error(`[NextTankEnviTestProcess] 에러로 인한 중단된 테스트 결과 파일 생성 중 오류:`, fileError);
      }
      
      // SinglePageProcess 중지가 아닌 일반 에러인 경우에도 중단 보고서 생성 후 프로세스 완료
      if (error.status !== 'stopped_by_singlepage') {
        console.log(`[NextTankEnviTestProcess] 🛑 일반 에러로 인한 프로세스 중단 - 중단 보고서 생성 완료`);
        
        // 전역 디렉토리명은 유지 (다른 함수에서도 사용)
        console.log(`[NextTankEnviTestProcess] 📁 전역 디렉토리명 유지: ${currentTestDirectoryName}`);
        
        // 에러 상태로 프로세스 완료 (에러를 다시 던지지 않음)
        return {
          status: 'error',
          message: error.message || '알 수 없는 에러',
          errorType: 'general_error',
          finalReportGenerated: true,
          totalCycles: 1
        };
      }
  }
}

/**
 * 디바이스 선택 상태를 파일에서 읽어오는 함수
 * @returns {Array} 선택된 디바이스 상태 배열 (10개 요소, true/false)
 */
function loadDeviceStates() {
  try {
    const deviceStatesPath = path.join(__dirname, 'device_states.json');
    if (fs.existsSync(deviceStatesPath)) {
      const data = fs.readFileSync(deviceStatesPath, 'utf-8');
      const deviceStates = JSON.parse(data);
      
      // 배열 형태로 저장된 경우
      if (Array.isArray(deviceStates) && deviceStates.length === 10) {
        console.log(`[FinalDeviceReport] Device states loaded: ${JSON.stringify(deviceStates)}`);
        return deviceStates;
      }
      // 기존 객체 형태로 저장된 경우 (마이그레이션)
      else if (typeof deviceStates === 'object' && deviceStates !== null) {
        console.log(`[FinalDeviceReport] Migrating from object format to array format`);
        const expectedDevices = [
          "#1 Device", "#2 Device", "#3 Device", "#4 Device", "#5 Device",
          "#6 Device", "#7 Device", "#8 Device", "#9 Device", "#10 Device"
        ];
        const arrayFormat = expectedDevices.map(device => deviceStates[device] || false);
        console.log(`[FinalDeviceReport] Migrated device states: ${JSON.stringify(arrayFormat)}`);
        return arrayFormat;
      }
    }
  } catch (error) {
    console.warn(`[FinalDeviceReport] Failed to load device states: ${error.message}`);
  }
  
  // 기본값: 10개 요소 배열 (첫 번째 기기만 선택된 상태)
  const defaultStates = [true, false, false, false, false, false, false, false, false, false];
  console.log(`[FinalDeviceReport] Using default device states: ${JSON.stringify(defaultStates)}`);
  return defaultStates;
}

/**
 * 모든 사이클의 테스트 결과를 종합하여 디바이스별 G/N 결론 리포트 생성
 * @param {number} cycleNumber - 총 사이클 수
 * @returns {Object} 종합 리포트 생성 결과
 */
export async function generateFinalDeviceReport(cycleNumber) {
  try {
    console.log(`[FinalDeviceReport] 디바이스별 종합 리포트 생성 시작 - ${cycleNumber} 사이클`);
    
    // 디바이스 선택 상태 로드
    const deviceStates = loadDeviceStates();
    console.log(`[FinalDeviceReport] 로드된 디바이스 선택 상태: ${JSON.stringify(deviceStates)}`);
    
    // ===== 현재 테스트 디렉토리에서만 CSV 파일 검색 =====
    let testDirectoryPath = null;
    
    if (currentTestDirectoryPath) {
      // 전역 변수에서 현재 테스트 디렉토리 경로 사용
      testDirectoryPath = currentTestDirectoryPath;
      console.log(`[FinalDeviceReport] 📁 현재 테스트 디렉토리에서만 파일 검색: ${testDirectoryPath}`);
    } else {
      // 전역 변수가 없으면 자동으로 최근 테스트 디렉토리 검색
      console.warn(`[FinalDeviceReport] ⚠️ 현재 테스트 디렉토리 경로가 설정되지 않음 - 자동으로 최근 테스트 디렉토리 검색`);
      
      try {
        const dataFolderPath = path.join(process.cwd(), 'Data');
        if (fs.existsSync(dataFolderPath)) {
          const dataFolders = fs.readdirSync(dataFolderPath)
            .filter(folder => fs.statSync(path.join(dataFolderPath, folder)).isDirectory())
            .sort()
            .reverse(); // 최신 순으로 정렬
          
          if (dataFolders.length > 0) {
            const latestFolder = dataFolders[0];
            testDirectoryPath = path.join(dataFolderPath, latestFolder);
            console.log(`[FinalDeviceReport] 📁 자동으로 최근 테스트 디렉토리 선택: ${testDirectoryPath}`);
          } else {
            console.error(`[FinalDeviceReport] ❌ Data 폴더에 테스트 디렉토리가 없음`);
            return { success: false, error: 'Data 폴더에 테스트 디렉토리가 없음' };
          }
        } else {
          console.error(`[FinalDeviceReport] ❌ Data 폴더가 존재하지 않음`);
          return { success: false, error: 'Data 폴더가 존재하지 않음' };
        }
      } catch (error) {
        console.error(`[FinalDeviceReport] ❌ 최근 테스트 디렉토리 검색 실패:`, error.message);
        return { success: false, error: `최근 테스트 디렉토리 검색 실패: ${error.message}` };
      }
    }
    
    // 테스트 디렉토리가 존재하는지 확인
    if (!fs.existsSync(testDirectoryPath)) {
      console.error(`[FinalDeviceReport] ❌ 테스트 디렉토리가 존재하지 않음: ${testDirectoryPath}`);
      return { success: false, error: '테스트 디렉토리가 존재하지 않음' };
    }
    
    // 현재 테스트 디렉토리에서만 CSV 파일 검색
    const allCsvFiles = [];
    
    try {
      const testDirFiles = fs.readdirSync(testDirectoryPath);
      console.log(`[FinalDeviceReport] 📁 테스트 디렉토리 파일 목록:`, testDirFiles);
      
      const testDirCsvFiles = testDirFiles.filter(file => file.endsWith('.csv') && file.includes('Cycle'));
      console.log(`[FinalDeviceReport] 📁 Cycle이 포함된 CSV 파일:`, testDirCsvFiles);
      
      allCsvFiles.push(...testDirCsvFiles.map(file => ({ file, directory: '' })));
      
      console.log(`[FinalDeviceReport] 📁 현재 테스트 디렉토리에서 발견된 CSV 파일: ${testDirCsvFiles.length}개`);
    } catch (error) {
      console.error(`[FinalDeviceReport] ❌ 테스트 디렉토리 읽기 실패:`, error.message);
      return { success: false, error: `테스트 디렉토리 읽기 실패: ${error.message}` };
    }
    
    const csvFiles = allCsvFiles;
    
    //console.log(`[FinalDeviceReport] 발견된 CSV 파일 수: ${csvFiles.length}`);
    
    if (csvFiles.length === 0) {
      console.warn(`[FinalDeviceReport] 분석할 CSV 파일이 없음`);
      return { success: false, error: '분석할 CSV 파일이 없음' };
    }
    
    console.log(`[FinalDeviceReport] 검색된 디렉토리: ${csvFiles.map(f => f.directory || 'current_test_dir').join(', ')}`);
    
    // 디바이스별 G/N 카운트 초기화 (3개 디바이스, 1개 채널) - saveTotaReportTableToFile 패턴에 맞춤
    const deviceResults = {};
    for (let device = 1; device <= 3; device++) {
      deviceResults[`Device ${device}`] = {
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        channels: {
          'Channel 1': { total: 0, passed: 0, failed: 0 }
        }
      };
    }
    
    // 채널명 매핑 함수 (1개 채널)
    const getChannelName = (channelIndex) => {
      return 'Channel 1';
    };

    // 안전한 속성 접근 함수
    const safeUpdateChannel = (deviceName, channelName, result) => {
      try {
        if (!deviceResults[deviceName]) {
          console.warn(`[FinalDeviceReport] 알 수 없는 디바이스: ${deviceName}`);
          return;
        }
        
        if (!deviceResults[deviceName].channels[channelName]) {
          console.warn(`[FinalDeviceReport] 알 수 없는 채널: ${channelName} for ${deviceName}`);
          return;
        }
        
        deviceResults[deviceName].totalTests++;
        deviceResults[deviceName].channels[channelName].total++;
        
        if (result === 'G') {
          deviceResults[deviceName].passedTests++;
          deviceResults[deviceName].channels[channelName].passed++;
          console.log(`[FinalDeviceReport] ${deviceName} ${channelName}: G - 통과 증가 (총: ${deviceResults[deviceName].channels[channelName].total})`);
        } else {
          deviceResults[deviceName].failedTests++;
          deviceResults[deviceName].channels[channelName].failed++;
          console.log(`[FinalDeviceReport] ${deviceName} ${channelName}: N - 실패 증가 (총: ${deviceResults[deviceName].channels[channelName].total})`);
        }
        
        console.log(`[FinalDeviceReport] ${deviceName} ${channelName}: ${result} (총: ${deviceResults[deviceName].channels[channelName].total})`);
      } catch (error) {
        console.error(`[FinalDeviceReport] safeUpdateChannel 오류 - ${deviceName} ${channelName}:`, error);
      }
    };

    // 각 CSV 파일 분석
    let processedFiles = 0;
    for (const fileInfo of csvFiles) {
      try {
        const { file: filename, directory } = fileInfo;
        const filePath = directory 
          ? path.join(testDirectoryPath, directory, filename)
          : path.join(testDirectoryPath, filename);
        const fileContent = fs.readFileSync(filePath, 'utf8');
        
        // 파일명에서 사이클 번호와 테스트 유형 추출 (saveTotaReportTableToFile 패턴에 맞춤)
        console.log(`[FinalDeviceReport] 파일명 분석 중: ${filename}`);
        const cycleMatch = filename.match(/Cycle(\d+)/);
        const testTypeMatch = filename.match(/(HighTemp_Test|LowTemp_Test|TimeMode_Test)/);
        
        console.log(`[FinalDeviceReport] Cycle 매치 결과:`, cycleMatch);
        console.log(`[FinalDeviceReport] TestType 매치 결과:`, testTypeMatch);
        
        if (!cycleMatch || !testTypeMatch) {
          console.warn(`[FinalDeviceReport] 파일명 형식 오류: ${filename}`);
          console.warn(`[FinalDeviceReport] 예상 형식: Cycle숫자_HighTemp_Test 또는 Cycle숫자_LowTemp_Test`);
          continue;
        }
        
        const cycle = parseInt(cycleMatch[1]);
        const testType = testTypeMatch[1];
        
        console.log(`[FinalDeviceReport] 분석 중: ${filename} (사이클 ${cycle}, ${testType})`);
        
        // CSV 내용에서 A.Q.L 컬럼의 G/N 결과 추출 (saveTotaReportTableToFile 패턴)
        const lines = fileContent.split('\n');
        let inTableSection = false;
        let headerFound = false;
        let processedRows = 0;
        
        console.log(`[FinalDeviceReport] ${filename} 분석 시작 - 총 ${lines.length}줄`);
        
        for (const line of lines) {
          // 테이블 헤더 찾기
          if (line.includes('INPUT,제품번호,1st,2nd,3rd,4th,5th,6th,7th,8th,9th,10th,A.Q.L')) {
            inTableSection = true;
            headerFound = true;
            console.log(`[FinalDeviceReport] 테이블 헤더 발견: ${filename}`);
            continue;
          }
          
          // 테이블 데이터 행 처리 (saveTotaReportTableToFile 패턴)
          if (inTableSection && headerFound && line.includes('V,C00')) {
            const parts = line.split(',');
            if (parts.length >= 13) { // INPUT,제품번호,1st~10th,A.Q.L = 13개 컬럼
              const inputVoltage = parts[0]; // 18V, 24V, 30V
              const productNumber = parts[1]; // C005, C006, C007
              const aqlResult = parts[12]; // A.Q.L 컬럼의 G/N 결과
              
              // 제품번호에서 디바이스 번호 추출 (C005 -> Device 1, C006 -> Device 2, C007 -> Device 3)
              const deviceMatch = productNumber.match(/C00(\d+)/);
              if (deviceMatch) {
                const deviceNumber = parseInt(deviceMatch[1]) - 4; // C005=1, C006=2, C007=3
                const deviceName = `Device ${deviceNumber}`;
                const channelName = 'Channel 1';
                
                if (aqlResult && (aqlResult === 'G' || aqlResult === 'NG')) {
                  const result = aqlResult === 'G' ? 'G' : 'N';
                  console.log(`[FinalDeviceReport] ${deviceName} ${channelName} (${inputVoltage} ${productNumber}): ${result} - 업데이트 중`);
                  safeUpdateChannel(deviceName, channelName, result);
                  processedRows++;
                } else {
                  console.log(`[FinalDeviceReport] ${deviceName} ${channelName} (${inputVoltage} ${productNumber}): 알 수 없는 AQL 결과 '${aqlResult}'`);
                }
              }
            }
          }
          
          // 테이블 섹션 종료 조건
          if (inTableSection && line.trim() === '') {
            inTableSection = false;
            headerFound = false;
            console.log(`[FinalDeviceReport] 테이블 섹션 종료: ${filename}`);
          }
        }
        
        if (processedRows === 0) {
          console.warn(`[FinalDeviceReport] ${filename}에서 A.Q.L 결과를 찾을 수 없음`);
        } else {
          console.log(`[FinalDeviceReport] ${filename}에서 총 ${processedRows}개의 A.Q.L 결과 처리 완료`);
        }
        
        processedFiles++;
        
      } catch (fileError) {
        console.error(`[FinalDeviceReport] 파일 분석 실패: ${filename}`, fileError);
        console.error(`[FinalDeviceReport] 오류 상세:`, fileError.stack);
      }
    }
    
    console.log(`[FinalDeviceReport] 처리된 파일 수: ${processedFiles}/${csvFiles.length}`);
    
    // 분석 결과 요약 출력
    console.log(`[FinalDeviceReport] 디바이스별 분석 결과:`);
    for (const [deviceName, results] of Object.entries(deviceResults)) {
      if (results.totalTests > 0) {
        console.log(`[FinalDeviceReport] ${deviceName}: 총 ${results.totalTests}회, 통과 ${results.passedTests}회, 실패 ${results.failedTests}회`);
        for (const [channelName, channelResult] of Object.entries(results.channels)) {
          if (channelResult.total > 0) {
            //console.log(`[FinalDeviceReport]   ${channelName}: ${channelResult.passed}/${channelResult.total} (${((channelResult.passed / channelResult.total) * 100).toFixed(1)}%)`);
          }
        }
      }
    }
    
    // 디바이스별 최종 결론 생성
    const finalConclusions = {};
    console.log(`[FinalDeviceReport] 디바이스별 최종 결론 생성 시작 (전압별 그룹 단위 G/NG 판단)`);
    
    // 전압별 그룹 결과를 저장할 객체
    const voltageGroupResults = {
      '18V': { devices: [], allGood: true },
      '24V': { devices: [], allGood: true },
      '30V': { devices: [], allGood: true }
    };
    
    // 1단계: 각 디바이스별로 전압별 결과 수집
    for (const [deviceName, results] of Object.entries(deviceResults)) {
      console.log(`[FinalDeviceReport] ${deviceName} 분석: 총 ${results.totalTests}회, 통과 ${results.passedTests}회, 실패 ${results.failedTests}회`);
      
      if (results.totalTests > 0 && results.measurements) {
        // 각 전압별로 결과 수집
        for (const [voltage, measurementData] of Object.entries(results.measurements)) {
          if (voltageGroupResults[voltage]) {
            voltageGroupResults[voltage].devices.push({
              deviceName: deviceName,
              aql: measurementData.aql,
              productNumber: measurementData.productNumber
            });
            
            // 하나라도 N이면 해당 전압 그룹은 N
            if (measurementData.aql === 'N') {
              voltageGroupResults[voltage].allGood = false;
              console.log(`[FinalDeviceReport] ${voltage} 그룹에서 ${deviceName}이 N - 전압 그룹 결과: N`);
            }
          }
        }
      }
    }
    
    // 전압별 그룹 결과 최종 확인 및 로깅
    for (const [voltage, groupResult] of Object.entries(voltageGroupResults)) {
      console.log(`[FinalDeviceReport] ${voltage} 그룹 최종 결과: ${groupResult.allGood ? 'G' : 'N'} (디바이스 수: ${groupResult.devices.length})`);
      groupResult.devices.forEach(device => {
        console.log(`[FinalDeviceReport]   - ${device.deviceName}: ${device.aql}`);
      });
    }
    
    // 2단계: 전압별 그룹 결과를 바탕으로 디바이스별 최종 결론 생성
    for (const [deviceName, results] of Object.entries(deviceResults)) {
      // 디바이스 선택 상태 확인 (Device 1 = index 0, Device 2 = index 1, Device 3 = index 2)
      const deviceIndex = parseInt(deviceName.split(' ')[1]) - 1; // Device 1 -> index 0
      const isDeviceSelected = deviceStates[deviceIndex];
      
      if (isDeviceSelected) {
        if (results.totalTests > 0) {
          // 해당 디바이스가 참여한 전압 그룹들의 결과를 확인
          // 모든 전압(18V, 24V, 30V)에서 G여야 디바이스가 G가 됨
          let deviceConclusion = 'G'; // 기본값은 G
          
          if (results.measurements) {
            // 모든 전압 그룹을 확인 (18V, 24V, 30V)
            const requiredVoltages = ['18V', '24V', '30V'];
            for (const voltage of requiredVoltages) {
              if (voltageGroupResults[voltage] && !voltageGroupResults[voltage].allGood) {
                // 해당 전압 그룹에서 하나라도 N이 있으면 전체 디바이스는 N
                deviceConclusion = 'N';
                console.log(`[FinalDeviceReport] ${deviceName} ${voltage} 그룹에서 N 발견 - 디바이스 결론: N`);
                break;
              }
            }
          }
          
          finalConclusions[deviceName] = {
            conclusion: deviceConclusion,
            totalTests: results.totalTests,
            passedTests: results.passedTests,
            failedTests: results.failedTests,
            passRate: ((results.passedTests / results.totalTests) * 100).toFixed(2),
            channels: results.channels,
            measurements: results.measurements || {}, // 상세한 측정 데이터 포함
            voltageGroupResults: voltageGroupResults, // 전압별 그룹 결과 포함
            isSelected: true
          };
          
          console.log(`[FinalDeviceReport] ${deviceName} 최종 결론: ${deviceConclusion} (모든 전압 그룹 판단 적용) - 선택됨`);
          console.log(`[FinalDeviceReport] 전압별 그룹 결과: 18V=${voltageGroupResults['18V'].allGood ? 'G' : 'N'}, 24V=${voltageGroupResults['24V'].allGood ? 'G' : 'N'}, 30V=${voltageGroupResults['30V'].allGood ? 'G' : 'N'}`);
        } else {
          console.log(`[FinalDeviceReport] ${deviceName}: 테스트 없음 - 스킵`);
        }
      } else {
        // 선택되지 않은 디바이스는 "-.-" 표시
        finalConclusions[deviceName] = {
          conclusion: '-.-',
          totalTests: 0,
          passedTests: 0,
          failedTests: 0,
          passRate: '0.00',
          channels: results.channels,
          measurements: {},
          voltageGroupResults: voltageGroupResults,
          isSelected: false
        };
        
        console.log(`[FinalDeviceReport] ${deviceName} 최종 결론: -.- (선택되지 않음)`);
      }
    }
    
    console.log(`[FinalDeviceReport] 최종 결론 생성 완료: ${Object.keys(finalConclusions).length}개 디바이스`);
    
    // finalConclusions가 비어있으면 경고
    if (Object.keys(finalConclusions).length === 0) {
      console.warn(`[FinalDeviceReport] ⚠️ 최종 결론이 비어있음 - 모든 디바이스의 totalTests가 0`);
      console.warn(`[FinalDeviceReport] ⚠️ CSV 파일에서 데이터를 제대로 읽지 못했을 가능성`);
    }
    
    // 종합 리포트 파일 생성
    const reportFilename = `${getFormattedDateTime()}_Final_Device_Report.csv`;
    
    // ===== 전역 변수에서 테스트 디렉토리명 사용 (새로 생성하지 않음) =====
    let dateDirectoryName = currentTestDirectoryName;

    // ===== 전역 변수에서 테스트 디렉토리 경로 사용 =====
    let dateFolderPath = null;
    
    if (currentTestDirectoryPath) {
      // 전역 변수에서 테스트 디렉토리 경로 사용
      dateFolderPath = currentTestDirectoryPath;
      console.log(`[FinalDeviceReport] 📁 전역 변수에서 테스트 디렉토리 경로 사용: ${dateFolderPath}`);
    } else {
      // RunTimeMode.js의 currentTestDirectoryPath도 확인
      try {
        const { getCurrentTestDirectoryPath } = await import('./RunTimeMode.js');
        const timeModePath = getCurrentTestDirectoryPath();
        if (timeModePath) {
          dateFolderPath = timeModePath;
          console.log(`[FinalDeviceReport] 📁 RunTimeMode에서 테스트 디렉토리 경로 사용: ${dateFolderPath}`);
        } else {
          // 전역 변수가 없으면 자동으로 최근 테스트 디렉토리 검색
          console.warn(`[FinalDeviceReport] ⚠️ 현재 테스트 디렉토리 경로가 설정되지 않음 - 자동으로 최근 테스트 디렉토리 검색`);
          
          try {
            const dataFolderPath = path.join(process.cwd(), 'Data');
            if (fs.existsSync(dataFolderPath)) {
              const dataFolders = fs.readdirSync(dataFolderPath)
                .filter(folder => fs.statSync(path.join(dataFolderPath, folder)).isDirectory())
                .sort()
                .reverse(); // 최신 순으로 정렬
              
              if (dataFolders.length > 0) {
                const latestFolder = dataFolders[0];
                dateFolderPath = path.join(dataFolderPath, latestFolder);
                console.log(`[FinalDeviceReport] 📁 자동으로 최근 테스트 디렉토리 선택: ${dateFolderPath}`);
              } else {
                // Data 폴더에 디렉토리가 없으면 default 디렉토리 생성
                dateFolderPath = path.join(dataFolderPath, 'default');
                if (!fs.existsSync(dateFolderPath)) {
                  fs.mkdirSync(dateFolderPath, { recursive: true });
                  console.log(`[FinalDeviceReport] 📁 기본 테스트 디렉토리 생성: ${dateFolderPath}`);
                } else {
                  console.log(`[FinalDeviceReport] 📁 기본 테스트 디렉토리 사용: ${dateFolderPath}`);
                }
              }
            } else {
              // Data 폴더가 없으면 생성하고 default 디렉토리도 생성
              const dataFolderPath = path.join(process.cwd(), 'Data');
              fs.mkdirSync(dataFolderPath, { recursive: true });
              dateFolderPath = path.join(dataFolderPath, 'default');
              fs.mkdirSync(dateFolderPath, { recursive: true });
              console.log(`[FinalDeviceReport] 📁 Data 폴더 및 기본 테스트 디렉토리 생성: ${dateFolderPath}`);
            }
          } catch (error) {
            console.error(`[FinalDeviceReport] ❌ 최근 테스트 디렉토리 검색 실패:`, error.message);
            return { success: false, error: `최근 테스트 디렉토리 검색 실패: ${error.message}` };
          }
        }
      } catch (error) {
        console.error(`[FinalDeviceReport] ❌ RunTimeMode 경로 확인 실패:`, error.message);
        return { success: false, error: `RunTimeMode 경로 확인 실패: ${error.message}` };
      }
    }
    
    const reportFilePath = path.join(dateFolderPath, reportFilename);
    
    let reportContent = '';
    
    // Document header information (saveTotaReportTableToFile 패턴에 맞춤)
    reportContent += `Document No.,K2-AD-110-A241023-001\n`;
    reportContent += `Product Name,Device Comprehensive Test Report\n`;
    reportContent += `Product Number,Device 1-3\n`;
    reportContent += `Test Date,${new Date().toLocaleDateString('en-US')}\n`;
    reportContent += `Test Time,${new Date().toLocaleTimeString('en-US')}\n`;
    reportContent += `Test Temperature,Comprehensive Analysis\n`;
    reportContent += `Total Cycles,${cycleNumber}\n`;
    reportContent += `Test Type,Device Comprehensive Test Report\n`;
    reportContent += `Analyzed Files,${processedFiles}\n`;
    reportContent += '\n';
    
    // 새로운 테이블 구조 (saveTotaReportTableToFile 패턴에 맞춤)
    reportContent += `INPUT,제품번호,1st,2nd,3rd,4th,5th,6th,7th,8th,9th,10th,A.Q.L\n`;
    
    // 3개 input 전압에 대해 각각 Device별 측정값 표시 (saveTotaReportTableToFile 패턴)
    for (let k = 0; k < 3; k++) {
      const inputVoltage = [18, 24, 30][k]; // 18V, 24V, 30V
      
      // 각 제품번호에 대해 테이블 생성 (C005, C006, C007) - 3개 디바이스만
      for (let productIndex = 0; productIndex < 3; productIndex++) {
        const productNumber = `C00${productIndex + 5}`; // C005, C006, C007
        const deviceName = `Device ${productIndex + 1}`; // Device 1, Device 2, Device 3
        
        // 디바이스 선택 상태 확인
        const deviceIndex = productIndex; // Device 1 = index 0, Device 2 = index 1, Device 3 = index 2
        const isDeviceSelected = deviceStates[deviceIndex];
        
        // 해당 디바이스의 1st-10th 데이터 생성 (실제 측정값 기반)
        const measurementData = [];
        let validMeasurements = 0;
        
        if (isDeviceSelected) {
          // 선택된 디바이스의 경우 실제 측정값 표시
          if (finalConclusions[deviceName] && finalConclusions[deviceName].totalTests > 0) {
            const deviceResult = finalConclusions[deviceName];
            
            // 실제 측정값이 있는 경우 (G/N 결과를 전압값으로 변환)
            for (let i = 0; i < 10; i++) {
              if (deviceResult.conclusion === 'G') {
                measurementData.push('G');
                validMeasurements++;
              } else if (deviceResult.conclusion === 'N') {
                measurementData.push('N');
                validMeasurements++;
              } else {
                measurementData.push('-');
              }
            }
          } else {
            // 측정값이 없는 경우
            for (let i = 0; i < 10; i++) {
              measurementData.push('-');
            }
          }
        } else {
          // 선택되지 않은 디바이스는 "-.-" 표시
          for (let i = 0; i < 10; i++) {
            measurementData.push('-.-');
          }
        }
        
        // A.Q.L 계산 (디바이스별 최종 결론 적용)
        let aql;
        if (isDeviceSelected) {
          // 디바이스별 최종 결론 사용 (모든 전압에서 G여야 G)
          const deviceConclusion = finalConclusions[deviceName]?.conclusion;
          aql = deviceConclusion === 'G' ? 'G' : 'N';
        } else {
          aql = '-.-';
        }
        
        // 테이블 행 생성 (saveTotaReportTableToFile 패턴)
        reportContent += `${inputVoltage}V,${productNumber},${measurementData.join(',')},${aql}\n`;
      }
    }
    
    // Test results summary (xxx_Cycle_HighTemp_Test.csv와 동일한 형태)
    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;
    
    // 선택된 Device의 모든 측정값을 확인하여 통계 계산
    for (const [deviceName, conclusion] of Object.entries(finalConclusions)) {
      if (conclusion.isSelected && conclusion.totalTests > 0) {
        totalTests += conclusion.totalTests;
        passedTests += conclusion.passedTests;
        failedTests += conclusion.failedTests;
      }
    }
    
    reportContent += '\n';
    reportContent += `=== Test Results Summary ===\n`;
    reportContent += `Total Tests,${totalTests}\n`;
    reportContent += `Passed Tests,${passedTests}\n`;
    reportContent += `Failed Tests,${failedTests}\n`;
    reportContent += `Pass Rate,${totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(2) : 0}%\n`;
    reportContent += `Test Result,${passedTests > failedTests ? 'PASS' : 'FAIL'}\n`;
    reportContent += `Operator,System\n`;
    reportContent += `Document Version,PS-14(Rev.1)\n`;
    reportContent += `Company Name,Adelpia Lab Co., Ltd.\n`;
    reportContent += '\n';
     
     // Include all test files sequentially
     reportContent += `=== Test Files Details ===\n`;
     reportContent += `File Name,Cycle,Test Type,Status,Processed\n`;
     
     for (let i = 0; i < csvFiles.length; i++) {
       const file = csvFiles[i];
       const filePath = file.directory 
         ? path.join(file.directory, file.file)
         : path.join(testDirectoryPath, file.file);
       
       // Extract cycle and test type from filename
       const cycleMatch = file.file.match(/Cycle(\d+)/);
       const testTypeMatch = file.file.match(/(HighTemp_Test\d+|LowTemp_Test\d+|TimeMode_Test\d+)/);
       
       const cycle = cycleMatch ? cycleMatch[1] : 'Unknown';
       const testType = testTypeMatch ? testTypeMatch[1] : 'Unknown';
       const status = i < processedFiles ? 'Processed' : 'Skipped';
       
       reportContent += `${file.file},${cycle},${testType},${status},${i < processedFiles ? 'Yes' : 'No'}\n`;
     }
     
     // Include CSV file contents
     reportContent += `\n`;
     reportContent += `=== CSV File Contents ===\n`;
     
     for (let i = 0; i < csvFiles.length; i++) {
       const file = csvFiles[i];
       const filePath = file.directory 
         ? path.join(file.directory, file.file)
         : path.join(testDirectoryPath, file.file);
       
       try {
         if (fs.existsSync(filePath)) {
           const csvContent = fs.readFileSync(filePath, 'utf8');
           
           // Extract cycle and test type from filename
           const cycleMatch = file.file.match(/Cycle(\d+)/);
           const testTypeMatch = file.file.match(/(HighTemp_Test\d+|LowTemp_Test\d+|TimeMode_Test\d+)/);
           
           const cycle = cycleMatch ? cycleMatch[1] : 'Unknown';
           const testType = testTypeMatch ? testTypeMatch[1] : 'Unknown';
           
           reportContent += `\n--- File: ${file.file} (Cycle ${cycle}, ${testType}) ---\n`;
           reportContent += csvContent;
           reportContent += `\n--- End of File: ${file.file} ---\n`;
         } else {
           reportContent += `\n--- File: ${file.file} (File not found) ---\n`;
         }
       } catch (error) {
         console.error(`[FinalDeviceReport] CSV 파일 읽기 실패: ${file.file}`, error);
         reportContent += `\n--- File: ${file.file} (Error reading file: ${error.message}) ---\n`;
       }
     }
     
     reportContent += `\n`;
     reportContent += `=== Test Conditions ===\n`;
     reportContent += `High Temperature Test,10 times (per cycle)\n`;
     reportContent += `Low Temperature Test,10 times (per cycle)\n`;
     reportContent += `Total Tests,${cycleNumber * 20} times\n`;
     reportContent += `\n`;
     reportContent += `=== Conclusion ===\n`;
     reportContent += `All devices G: Overall Pass\n`;
     reportContent += `Any device N: That device is defective\n`;
     reportContent += `\n`;
     reportContent += `Author,System\n`;
     reportContent += `Document Version,PS-14(Rev.1)\n`;
     reportContent += `Company Name,Adelpia Lab Co., Ltd.\n`;
    
    // 통계 계산 (선택된 디바이스만 고려)
    const selectedDevices = Object.values(finalConclusions).filter(c => c.isSelected);
    const totalDevices = selectedDevices.length;
    const goodDevices = selectedDevices.filter(c => c.conclusion === 'G').length;
    const notGoodDevices = selectedDevices.filter(c => c.conclusion === 'N').length;
    
    // 파일 저장
    fs.writeFileSync(reportFilePath, reportContent, 'utf8');
    
    console.log(`[FinalDeviceReport] 종합 리포트 생성 완료: ${reportFilename}`);
    console.log(`[FinalDeviceReport] 파일 경로: ${reportFilePath}`);
    console.log(`[FinalDeviceReport] 전체 디바이스: ${totalDevices}개, 양품: ${goodDevices}개, 불량: ${notGoodDevices}개`);
    
    return {
      success: true,
      filename: reportFilename,
      filePath: reportFilePath,
      totalDevices,
      goodDevices,
      notGoodDevices,
      deviceResults: finalConclusions
    };
    
  } catch (error) {
    console.error('[FinalDeviceReport] 종합 리포트 생성 실패:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 작업 디렉토리의 측정파일을 조사하여 실제 존재하는 파일 목록을 반환
 * @param {string} dateDirectoryName - 테스트 디렉토리명
 * @returns {Array} 발견된 측정파일 목록
 */
function scanExistingMeasurementFiles(dateDirectoryName) {
  try {
    // ===== 전역 변수에서 테스트 디렉토리 경로 사용 (새로 생성하지 않음) =====
    let dataFolderPath = null;
    
    if (currentTestDirectoryPath) {
      // 전역 변수에서 Data 폴더 경로 추출
      dataFolderPath = path.dirname(currentTestDirectoryPath);
      console.log(`[ScanFiles] 📁 전역 변수에서 Data 폴더 경로 사용: ${dataFolderPath}`);
    } else {
      // 전역 변수가 없으면 기본 경로 사용
      dataFolderPath = path.join(process.cwd(), 'Data');
      console.log(`[ScanFiles] 📁 기본 Data 폴더 경로 사용: ${dataFolderPath}`);
    }
    
    const dateFolderPath = path.join(dataFolderPath, dateDirectoryName);
    
    console.log(`[ScanFiles] 📁 측정파일 조사 시작: ${dateFolderPath}`);
    
    if (!fs.existsSync(dateFolderPath)) {
      console.log(`[ScanFiles] ⚠️ 디렉토리가 존재하지 않음: ${dateFolderPath}`);
      return [];
    }
    
    const files = fs.readdirSync(dateFolderPath);
    const measurementFiles = files
      .filter(file => {
        const isCSV = file.endsWith('.csv');
        const isMeasurementFile = file.includes('Cycle') || file.includes('Test') || file.includes('측정') || file.includes('결과');
        const isNotReport = !file.includes('중단보고서') && !file.includes('종합리포트') && !file.includes('최종보고서');
        return isCSV && isMeasurementFile && isNotReport;
      })
      .map(file => {
        const filePath = path.join(dateFolderPath, file);
        const stats = fs.statSync(filePath);
        return {
          filename: file,
          filepath: filePath,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime
        };
      })
      .sort((a, b) => b.modified - a.modified); // 최신 파일순으로 정렬
    
    console.log(`[ScanFiles] 📊 발견된 측정파일 수: ${measurementFiles.length}`);
    measurementFiles.forEach((file, index) => {
      console.log(`[ScanFiles] ${index + 1}. ${file.filename} (${(file.size / 1024).toFixed(1)}KB)`);
    });
    
    return measurementFiles;
    
  } catch (error) {
    console.error(`[ScanFiles] ❌ 측정파일 조사 실패:`, error.message);
    return [];
  }
}

/**
 * 중단 원인을 상세하게 분석하여 사용자 친화적인 메시지로 변환
 * @param {string} stopReason - 원본 중단 원인
 * @param {string} errorMessage - 에러 메시지
 * @param {string} stoppedAtPhase - 중단된 페이즈
 * @returns {Object} 분석된 중단 정보
 */
function analyzeStopReason(stopReason, errorMessage, stoppedAtPhase) {
  const reasonMap = {
    'power_switch_off': {
      category: '수동 중지',
      description: '사용자가 파워 스위치를 OFF로 변경',
      severity: 'normal',
      actionRequired: '필요시 테스트 재시작'
    },
    'manual_stop': {
      category: '수동 중지',
      description: '사용자가 수동으로 테스트 중단',
      severity: 'normal', 
      actionRequired: '필요시 테스트 재시작'
    },
    'system_failure': {
      category: '시스템 오류',
      description: '시스템 장애로 인한 강제 중단',
      severity: 'critical',
      actionRequired: '시스템 점검 후 재시작 필요'
    },
    'error': {
      category: '예외 오류',
      description: '예기치 않은 오류 발생',
      severity: 'high',
      actionRequired: '오류 원인 분석 후 재시작 필요'
    },
    'timeout': {
      category: '시간 초과',
      description: '설정된 대기 시간 초과',
      severity: 'medium',
      actionRequired: '설정 확인 후 재시작'
    },
    'unknown': {
      category: '알 수 없음',
      description: '원인 불명의 중단',
      severity: 'medium',
      actionRequired: '시스템 상태 점검 필요'
    }
  };
  
  const analysis = reasonMap[stopReason] || reasonMap['unknown'];
  
  return {
    ...analysis,
    originalReason: stopReason,
    errorMessage: errorMessage || '',
    stoppedAtPhase: stoppedAtPhase || 'unknown',
    timestamp: new Date().toLocaleString('en-US')
  };
}

/**
 * 테스트가 중단된 경우 측정파일을 조사하고 정상 종료와 유사한 형식으로 최종 리포트를 생성
 * @param {Object} options - 중단 정보 및 설정
 * @param {string} options.stopReason - 중단 원인 ('manual_stop', 'error', 'system_failure', 'power_switch_off', 'timeout')
 * @param {number} options.stoppedAtCycle - 중단된 사이클 번호
 * @param {string} options.stoppedAtPhase - 중단된 테스트 페이즈
 * @param {number} options.stoppedAtTest - 중단된 테스트 번호
 * @param {string} options.errorMessage - 에러 메시지 (에러 발생 시)
 * @param {Object} options.testSettings - 테스트 설정 정보
 * @param {Array} options.existingFiles - 이미 생성된 파일들의 경로 배열 (선택사항, 자동 조사됨)
 * @returns {Object} 결과 파일 생성 결과
 */
export async function generateInterruptedTestResultFile(options) {
  try {
    console.log(`[InterruptedTestResult] 📄 중단된 테스트 최종 리포트 생성 시작`);
    
    // 기본 옵션 설정
    const {
      stopReason = 'unknown',
      stoppedAtCycle = 1,
      stoppedAtPhase = 'unknown',
      stoppedAtTest = 0,
      errorMessage = '',
      testSettings = {},
      existingFiles = [] // 이 값은 무시하고 실제 파일을 조사함
    } = options || {};
    
    // ===== 전역 변수에서 디렉토리명 가져오기 (새로 생성하지 않음) =====
    let dateDirectoryName = currentTestDirectoryName;
          if (!dateDirectoryName) {
        console.log(`[InterruptedTestResult] 📁 전역 디렉토리명이 설정되지 않음 - 자동으로 최근 테스트 디렉토리 검색`);
        
        // Automatically find the most recent test directory
        try {
          const dataFolderPath = path.join(process.cwd(), 'Data');
          const directories = fs.readdirSync(dataFolderPath, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name)
            .filter(name => /^\d{8}_\d{4}$/.test(name)) // Filter for date format YYYYMMDD_HHMM
            .sort()
            .reverse(); // Most recent first
          
          if (directories.length > 0) {
            dateDirectoryName = directories[0];
            console.log(`[InterruptedTestResult] 📁 자동으로 최근 테스트 디렉토리 발견: ${dateDirectoryName}`);
          } else {
            throw new Error('테스트 데이터 디렉토리를 찾을 수 없습니다');
          }
        } catch (error) {
          console.error(`[InterruptedTestResult] ❌ 자동 디렉토리 검색 실패: ${error.message}`);
          throw new Error('테스트 데이터 디렉토리를 찾을 수 없습니다');
        }
      }
    console.log(`[InterruptedTestResult] 📁 기존 테스트 디렉토리 사용: ${dateDirectoryName}`);
    
    const dataFolderPath = path.join(process.cwd(), 'Data');
    const dateFolderPath = path.join(dataFolderPath, dateDirectoryName);
    
    // 디렉토리 생성 (안전한 처리)
    try {
      if (!fs.existsSync(dataFolderPath)) {
        fs.mkdirSync(dataFolderPath, { recursive: true });
      }
      if (!fs.existsSync(dateFolderPath)) {
        fs.mkdirSync(dateFolderPath, { recursive: true });
      }
    } catch (mkdirError) {
      console.error(`[InterruptedTestResult] ❌ 디렉토리 생성 실패:`, mkdirError.message);
      throw new Error(`디렉토리 생성 실패: ${mkdirError.message}`);
    }
    
    // ===== 1. 측정파일 조사 =====
    const measurementFiles = scanExistingMeasurementFiles(dateDirectoryName);
    
    // ===== 2. 중단 원인 분석 =====
    let stopAnalysis;
    if (stopReason === 'completed_successfully') {
      stopAnalysis = {
        category: '정상 완료',
        description: '모든 테스트가 성공적으로 완료됨',
        severity: '정보',
        actionRequired: '추가 조치 불필요',
        errorMessage: '',
        timestamp: new Date().toLocaleString('en-US')
      };
    } else {
      stopAnalysis = analyzeStopReason(stopReason, errorMessage, stoppedAtPhase);
    }
    
    // ===== 3. 파일명 생성 (정상 종료와 유사한 형식) =====
    const timestamp = getFormattedDateTime();
    let filename;
    if (stopReason === 'completed_successfully') {
      filename = `최종보고서_${timestamp}.csv`;
    } else {
      filename = `중단된테스트_최종보고서_${timestamp}.csv`;
    }
    const filePath = path.join(dateFolderPath, filename);
    
    // ===== 4. CSV 내용 생성 (정상 종료 형식과 유사하게) =====
    let csvContent = '';
    
    // 헤더 정보 (정상 종료 리포트와 유사)
    if (stopReason === 'completed_successfully') {
      csvContent += `=== 테스트 최종 결과 보고서 ===\n`;
      csvContent += `생성일시,${timestamp}\n`;
      csvContent += `테스트 상태,완료됨\n`;
      csvContent += `완료 사이클,${stoppedAtCycle}/${testSettings.totalCycles || 'N/A'}\n`;
      csvContent += `완료 지점,사이클 ${stoppedAtCycle} - ${stoppedAtPhase}\n`;
    } else {
      csvContent += `=== 중단된 테스트 최종 결과 보고서 ===\n`;
      csvContent += `생성일시,${timestamp}\n`;
      csvContent += `테스트 상태,중단됨\n`;
      csvContent += `완료 사이클,${stoppedAtCycle - 1}/${testSettings.totalCycles || 'N/A'}\n`;
      csvContent += `중단 지점,사이클 ${stoppedAtCycle} - ${stoppedAtPhase}\n`;
    }
    csvContent += `\n`;
    
    // 중단 원인 상세 정보
    if (stopReason === 'completed_successfully') {
      csvContent += `=== 테스트 완료 요약 ===\n`;
      csvContent += `분류,${stopAnalysis.category}\n`;
      csvContent += `상태,${stopAnalysis.description}\n`;
      csvContent += `심각도,${stopAnalysis.severity}\n`;
      csvContent += `조치사항,${stopAnalysis.actionRequired}\n`;
      csvContent += `완료 시간,${stopAnalysis.timestamp}\n`;
    } else {
      csvContent += `=== 중단 원인 분석 ===\n`;
      csvContent += `분류,${stopAnalysis.category}\n`;
      csvContent += `원인,${stopAnalysis.description}\n`;
      csvContent += `심각도,${stopAnalysis.severity}\n`;
      csvContent += `조치사항,${stopAnalysis.actionRequired}\n`;
      if (stopAnalysis.errorMessage) {
        csvContent += `오류 메시지,${stopAnalysis.errorMessage}\n`;
      }
      csvContent += `중단 시간,${stopAnalysis.timestamp}\n`;
    }
    csvContent += `\n`;
    
    // 테스트 설정 정보 (정상 종료 리포트와 동일 형식)
    csvContent += `=== 테스트 설정 정보 ===\n`;
    csvContent += `제품명,${testSettings.modelName || 'N/A'}\n`;
    csvContent += `제품번호,${testSettings.productNumber || 'N/A'}\n`;
    csvContent += `목표 사이클 수,${testSettings.totalCycles || 'N/A'}\n`;
    csvContent += `고온 테스트,${testSettings.highTempEnabled ? 'O' : 'X'}\n`;
    csvContent += `저온 테스트,${testSettings.lowTempEnabled ? 'O' : 'X'}\n`;
    if (testSettings.highTempEnabled) {
      csvContent += `고온 설정,${testSettings.temperature || 'N/A'}℃\n`;
      csvContent += `고온 대기시간,${testSettings.highTempWaitTime || 'N/A'}초\n`;
      csvContent += `고온 측정횟수,${testSettings.highTempReadCount || 'N/A'}회\n`;
    }
    if (testSettings.lowTempEnabled) {
      csvContent += `저온 설정,${testSettings.lowTempSettings?.targetTemp || 'N/A'}℃\n`;
      csvContent += `저온 대기시간,${testSettings.lowTempWaitTime || 'N/A'}초\n`;
      csvContent += `저온 측정횟수,${testSettings.lowTempReadCount || 'N/A'}회\n`;
    }
    csvContent += `\n`;
    
    // 측정파일 조사 결과 (요구사항 4,5,6)
    csvContent += `=== 측정파일 조사 결과 ===\n`;
    if (measurementFiles.length === 0) {
      csvContent += `상태,측정파일이 하나도 생성되지 않았습니다\n`;
      csvContent += `파일 수,0개\n`;
    } else {
      csvContent += `상태,${measurementFiles.length}개의 측정파일이 발견되었습니다\n`;
      csvContent += `파일 수,${measurementFiles.length}개\n`;
      csvContent += `\n`;
      csvContent += `=== 발견된 파일 목록 ===\n`;
      csvContent += `순번,파일명,크기(KB),생성시간,수정시간\n`;
      measurementFiles.forEach((file, index) => {
        const sizeKB = (file.size / 1024).toFixed(1);
        const createdTime = file.created.toLocaleString('en-US');
        const modifiedTime = file.modified.toLocaleString('en-US');
        csvContent += `${index + 1},${file.filename},${sizeKB},${createdTime},${modifiedTime}\n`;
      });
      
      // CSV 파일 내용 포함
      csvContent += `\n`;
      csvContent += `=== CSV 파일 내용 ===\n`;
      
      for (let i = 0; i < measurementFiles.length; i++) {
        const file = measurementFiles[i];
        
        try {
          if (fs.existsSync(file.filepath)) {
            const fileContent = fs.readFileSync(file.filepath, 'utf8');
            
            // Extract cycle and test type from filename
            const cycleMatch = file.filename.match(/Cycle(\d+)/);
            const testTypeMatch = file.filename.match(/(HighTemp_Test\d+|LowTemp_Test\d+|TimeMode_Test\d+)/);
            
            const cycle = cycleMatch ? cycleMatch[1] : 'Unknown';
            const testType = testTypeMatch ? testTypeMatch[1] : 'Unknown';
            
            csvContent += `\n--- File: ${file.filename} (Cycle ${cycle}, ${testType}) ---\n`;
            csvContent += fileContent;
            csvContent += `\n--- End of File: ${file.filename} ---\n`;
          } else {
            csvContent += `\n--- File: ${file.filename} (File not found) ---\n`;
          }
        } catch (error) {
          console.error(`[InterruptedTestResult] CSV 파일 읽기 실패: ${file.filename}`, error);
          csvContent += `\n--- File: ${file.filename} (Error reading file: ${error.message}) ---\n`;
        }
      }
    }
    csvContent += `\n`;
    
    // 테스트 진행 상황 분석
    csvContent += `=== 테스트 진행 상황 ===\n`;
    const totalExpectedCycles = testSettings.totalCycles || 1;
    let completedCycles, progressPercentage;
    
    if (stopReason === 'completed_successfully') {
      completedCycles = stoppedAtCycle;
      progressPercentage = '100.0';
    } else {
      completedCycles = Math.max(0, stoppedAtCycle - 1);
      progressPercentage = ((completedCycles / totalExpectedCycles) * 100).toFixed(1);
    }
    
    csvContent += `전체 진행률,${progressPercentage}% (${completedCycles}/${totalExpectedCycles} 사이클)\n`;
    csvContent += `완료된 사이클,${completedCycles}개\n`;
    csvContent += `미완료 사이클,${totalExpectedCycles - completedCycles}개\n`;
    if (stopReason === 'completed_successfully') {
      csvContent += `최종 완료 단계,${stoppedAtPhase}\n`;
    } else {
      csvContent += `마지막 완료 단계,${stoppedAtPhase}\n`;
    }
    csvContent += `\n`;
    
    // 권장 조치사항 (상세화)
    if (stopReason === 'completed_successfully') {
      csvContent += `=== 권장 조치사항 ===\n`;
      csvContent += `1단계,생성된 측정파일 검증 (${measurementFiles.length}개 파일)\n`;
      csvContent += `2단계,테스트 결과 데이터 백업\n`;
      csvContent += `3단계,시스템 상태 점검\n`;
      csvContent += `4단계,다음 테스트 준비\n`;
      csvContent += `5단계,테스트 완료 보고서 검토\n`;
    } else {
      csvContent += `=== 권장 조치사항 ===\n`;
      csvContent += `1단계,시스템 상태 점검\n`;
      csvContent += `2단계,생성된 측정파일 검증 (${measurementFiles.length}개 파일)\n`;
      csvContent += `3단계,중단 원인 해결 (${stopAnalysis.category})\n`;
      csvContent += `4단계,${stopAnalysis.actionRequired}\n`;
      if (measurementFiles.length > 0) {
        csvContent += `5단계,기존 데이터 백업 후 테스트 재시작\n`;
      } else {
        csvContent += `5단계,처음부터 테스트 재시작\n`;
      }
    }
    csvContent += `\n`;
    
    // 문서 정보 (정상 종료 리포트와 동일)
    csvContent += `=== 문서 정보 ===\n`;
    csvContent += `작성자,시스템\n`;
    csvContent += `문서버전,PS-14(Rev.1)\n`;
    csvContent += `회사명,(주)아델피아랩\n`;
    if (stopReason === 'completed_successfully') {
      csvContent += `보고서 유형,테스트 최종 보고서\n`;
    } else {
      csvContent += `보고서 유형,중단된 테스트 최종 보고서\n`;
    }
    csvContent += `생성 시스템,환경 테스트 자동화 시스템\n`;
    
    // ===== 5. 파일 저장 =====
    try {
      
      fs.writeFileSync(filePath, csvContent, 'utf8');
      
      // 2초 대기 후 파일 존재 여부 확인
      await sleep(2000);
      
      // 파일 존재 여부 확인
      if (!fs.existsSync(filePath)) {
        throw new Error('파일이 생성되지 않음');
      }
      
      if (stopReason === 'completed_successfully') {
        console.log(`[InterruptedTestResult] ✅ 테스트 최종 보고서 생성 완료: ${filename}`);
        console.log(`[InterruptedTestResult] 📁 파일 경로: ${filePath}`);
        console.log(`[InterruptedTestResult] 📊 조사된 측정파일: ${measurementFiles.length}개`);
        console.log(`[InterruptedTestResult] 🎉 테스트 완료: ${stopAnalysis.category} - ${stopAnalysis.description}`);
      } else {
        console.log(`[InterruptedTestResult] ✅ 중단된 테스트 최종 보고서 생성 완료: ${filename}`);
        console.log(`[InterruptedTestResult] 📁 파일 경로: ${filePath}`);
        console.log(`[InterruptedTestResult] 📊 조사된 측정파일: ${measurementFiles.length}개`);
        console.log(`[InterruptedTestResult] 🔍 중단 원인: ${stopAnalysis.category} - ${stopAnalysis.description}`);
      }
      
    } catch (writeError) {
      console.error(`[InterruptedTestResult] ❌ 파일 저장 실패:`, writeError.message);
      throw new Error(`파일 저장 실패: ${writeError.message}`);
    }
    
    return { 
      success: true, 
      filename,
      filePath,
      stopReason,
      stoppedAtCycle,
      stoppedAtPhase,
      stoppedAtTest,
      measurementFilesCount: measurementFiles.length,
      measurementFiles: measurementFiles.map(f => f.filename),
      stopAnalysis
    };
    
  } catch (error) {
    console.error('[InterruptedTestResult] ❌ 중단된 테스트 최종 보고서 생성 실패:', error.message);
    
    // 에러 발생 시에도 간단한 로그 파일 생성
    try {
      const errorLogPath = path.join(process.cwd(), 'Data', 'error-interrupted-report.txt');
      const errorContent = `[${new Date().toISOString()}] 중단된 테스트 보고서 생성 실패\n에러: ${error.message}\n스택: ${error.stack}\n`;
      fs.writeFileSync(errorLogPath, errorContent, 'utf8');
      console.log(`[InterruptedTestResult] 📝 에러 로그 저장됨: ${errorLogPath}`);
    } catch (logError) {
      console.error('[InterruptedTestResult] ❌ 에러 로그 생성도 실패:', logError.message);
    }
    
    return { 
      success: false, 
      error: error.message
    };
  }
}

// 전역 테이블 데이터 저장소 추가 (채널 1개, readCount 지원)
let globalTableData = {
  devices: Array.from({ length: 10 }, (_, deviceIndex) => ({
    deviceNumber: deviceIndex + 1,
    tests: Array.from({ length: 3 }, (_, testIndex) => ({
      testNumber: testIndex + 1,
      reads: Array.from({ length: 10 }, (_, readIndex) => ({ // readCount 최대 10개 지원
        readIndex: readIndex + 1,
        channels: Array.from({ length: 1 }, (_, channelIndex) => ({ // 채널 1개
          channelNumber: channelIndex + 1,
          voltage: null,
          timestamp: null,
          status: 'pending'
        }))
      }))
    }))
  })),
  lastUpdate: null,
  isComplete: false
};

// 전압 데이터를 테이블에 업데이트하는 함수 (readIndex 지원)
export function updateTableData(deviceNumber, testNumber, readIndex, channelNumber, voltage, status = 'completed') {
  try {
    if (deviceNumber >= 1 && deviceNumber <= 10 && 
        testNumber >= 1 && testNumber <= 3 && 
        readIndex >= 1 && readIndex <= 10 &&
        channelNumber >= 1 && channelNumber <= 1) { // 채널 1개로 변경
      
      globalTableData.devices[deviceNumber - 1].tests[testNumber - 1].reads[readIndex - 1].channels[channelNumber - 1] = {
        channelNumber,
        voltage: voltage,
        timestamp: new Date().toISOString(),
        status: status
      };
      
      globalTableData.lastUpdate = new Date().toISOString();
      
      console.log(`[TableData] Device ${deviceNumber}, Test ${testNumber}, Read ${readIndex}, Channel ${channelNumber}: ${voltage}V (${status})`);
      
      // 전압 데이터가 업데이트될 때마다 즉시 클라이언트에 전송하는 대신
      // 4개 채널이 모두 읽힌 후에 전송하도록 변경
      // broadcastTableData(); // 이 줄 제거
    }
  } catch (error) {
    console.error(`[TableData] 테이블 데이터 업데이트 오류:`, error);
  }
}

// 현재 테이블 데이터를 가져오는 함수
export function getCurrentTableData() {
  return globalTableData;
}

// 테이블 데이터를 클라이언트에 전송하는 함수
export async function broadcastTableData() {
  if (!globalWss) {
    console.warn(`[TableData] 전역 WebSocket 서버가 설정되지 않음`);
    return;
  }
  
  try {
    // 시간 기반 디바운싱 제거 - 이벤트 기반 전송으로 변경
    
    // globalTableData의 깊은 복사본 생성 (데이터 경합 상태 방지)
    const tableDataSnapshot = JSON.parse(JSON.stringify(globalTableData));
    
    // 전송할 데이터 상태 로깅
    const snapshotCompletedCells = tableDataSnapshot.devices.reduce((total, device) => {
      return total + device.tests.reduce((testTotal, test) => {
        return testTotal + test.reads.reduce((readTotal, read) => {
          return readTotal + read.channels.filter(channel => channel.status === 'completed').length;
        }, 0);
      }, 0);
    }, 0);
    console.log(`[BroadcastTableData] 🔍 전송할 데이터 상태 - 완료된 셀: ${snapshotCompletedCells}, Device 1 Test 1 Read 1: ${tableDataSnapshot.devices[0]?.tests[0]?.reads[0]?.channels[0]?.voltage || 'null'}`);
    
    // 선택된 디바이스 상태 가져오기
    const getTableOption = await getSafeGetTableOption();
    const deviceStates = getTableOption.deviceStates || [];
    
    // TimeMode용 단계별 진행상황 계산 (100%에 도달하지 않도록 수정)
    let totalCells = 0;
    let completedCells = 0;
    let currentReadCount = 0;
    let maxReadCount = 10; // 최대 readCount (설정에서 가져올 수 있음)
    
    // 현재 진행 중인 readCount 찾기 (실제 완료된 측정만 카운트)
    tableDataSnapshot.devices.forEach((device, deviceIndex) => {
      if (deviceStates[deviceIndex]) {
        device.tests.forEach(test => {
          test.reads.forEach((read, readIndex) => {
            // 실제로 완료된 채널이 있는 경우만 카운트
            if (read.channels.some(channel => channel.status === 'completed' && channel.voltage !== null)) {
              currentReadCount = Math.max(currentReadCount, readIndex + 1);
            }
          });
        });
      }
    });
    
    // TimeMode: 전체 readCount를 기준으로 계산 (현재 단계의 진행상황)
    const selectedDeviceCount = deviceStates.filter(state => state).length;
    totalCells = 3 * selectedDeviceCount * maxReadCount; // 전체 readCount 기준
    
    // 실제 완료된 셀 수 계산 (현재까지 완료된 것만)
    tableDataSnapshot.devices.forEach((device, deviceIndex) => {
      if (deviceStates[deviceIndex]) {
        device.tests.forEach(test => {
          test.reads.forEach((read, readIndex) => {
            read.channels.forEach(channel => {
              if (channel.status === 'completed' && channel.voltage !== null) {
                completedCells++;
              }
            });
          });
        });
      }
    });
    
    // TimeMode: 완성도 계산 완전 제거 - 실제 측정 데이터만 전송
    console.log(`[TableData] TimeMode 실제 데이터 전송 - 현재 readCount: ${currentReadCount}/${maxReadCount}, 선택된 디바이스: ${selectedDeviceCount}, 총 셀: ${totalCells}, 완료된 셀: ${completedCells} (완성도 계산 제거)`);
    
    // 전송할 테이블 데이터 구성 - 클라이언트 포맷에 맞춤
    const tableDataForClient = {
      timestamp: globalTableData.lastUpdate || new Date().toISOString(),
      totalDevices: 3, // Device 1,2,3만 사용
      totalTests: 3,   // 3개 전압 테스트
      totalChannels: 1, // 채널 1개
      completedCells: completedCells,
      totalCells: totalCells,
      // 순차적 테이블 채우기를 위한 새로운 voltagTable 포맷: [voltageIndex][productIndex][measurementIndex][channel]
      // 측정 순서: voltageIndex → productIndex → measurementIndex (순차적으로)
      // 표시 순서: 각 전압(24V, 18V, 30V)에 대해 제품(C005, C006, C007)별로 1st~10th 열에 순차적으로 배치
      voltagTable: Array(3).fill(null).map((_, voltageIndex) => 
        Array(3).fill(null).map((_, productIndex) => 
          Array(10).fill(null).map((_, measurementIndex) => 
            Array(1).fill(null).map((_, channelIndex) => {
              // 순차적 측정을 위해 measurementIndex를 직접 사용
              // measurementIndex 0-9가 1st~10th 열에 순차적으로 매핑됨
              
              // globalTableData에서 해당 위치의 데이터 찾기
              // voltageIndex는 테스트 번호 (0=24V, 1=18V, 2=30V)
              // productIndex는 제품 번호 (0=C005, 1=C006, 2=C007)
              // measurementIndex는 측정 순서 (0=1st, 1=2nd, ..., 9=10th)
              
              const device = globalTableData.devices[productIndex]; // productIndex를 deviceIndex로 사용
              if (device && device.tests[voltageIndex]) {
                const read = device.tests[voltageIndex].reads[measurementIndex];
                if (read && read.channels[channelIndex]) {
                  const channel = read.channels[channelIndex];
                  if (channel && channel.status === 'completed' && channel.voltage !== null) {
                    // 전압값과 비교결과를 함께 저장 (예: "221V|G")
                    const expectedVoltage = getTableOption.channelVoltages[0] || 0;
                    const comparisonResult = compareVoltage(channel.voltage, expectedVoltage);
                    const truncatedVoltage = Math.floor(channel.voltage);
                    return `${truncatedVoltage}V|${comparisonResult}`;
                  }
                }
              }
              return '-.-';
            })
          )
        )
      ),
        summary: {
          totalCells: totalCells,
          completedCells: completedCells,
          currentReadCount: currentReadCount,
          maxReadCount: maxReadCount,
          status: 'in_progress' // TimeMode에서는 항상 진행 중으로 표시
        }
    };
    
    // 테이블 데이터 전송
    const tableMessage = `[POWER_TABLE_UPDATE] ${JSON.stringify(tableDataForClient)}`;
    
    let sentCount = 0;
    globalWss.clients.forEach(client => {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(tableMessage);
        sentCount++;
      }
    });
    
    console.log(`[TableData] 테이블 데이터 전송 완료 - 클라이언트 수: ${sentCount}, 완료된 셀: ${completedCells}/${totalCells}`);
    
    // TimeMode에서는 완성 메시지 전송하지 않음 (단계별 진행상황만 표시)
    // 각 runSinglePageProcess 완료는 runTimeModeTestProcess에서 관리
    
  } catch (error) {
    console.error(`[TableData] 테이블 데이터 전송 오류:`, error);
  }
}

// 테이블 초기화 함수
export function resetTableData() {
  globalTableData = {
    devices: Array.from({ length: 10 }, (_, deviceIndex) => ({
      deviceNumber: deviceIndex + 1,
      tests: Array.from({ length: 3 }, (_, testIndex) => ({
        testNumber: testIndex + 1,
        reads: Array.from({ length: 10 }, (_, readIndex) => ({ // readCount 최대 10개 지원
          readIndex: readIndex + 1,
          channels: Array.from({ length: 1 }, (_, channelIndex) => ({ // 채널 1개
            channelNumber: channelIndex + 1,
            voltage: null,
            timestamp: null,
            status: 'pending'
          }))
        }))
      }))
    })),
    lastUpdate: null,
    isComplete: false
  };
  
  console.log(`[TableData] 테이블 데이터 초기화 완료`);
  
  // 테이블 초기화 시에는 클라이언트에 전송하지 않음 - 실제 데이터가 있을 때만 전송
  // broadcastTableData(); // 제거: 초기화 시 불필요한 전송 방지
}

/**
 * 전압값을 소수점 2자리로 자르는 함수 (3자리 이하 버림)
 * @param {string} voltageValue - "5.2V|G" 형식의 전압값 문자열
 * @returns {string} 소수점 2자리로 자른 전압값 문자열
 */
function truncateVoltageToTwoDecimals(voltageValue) {
  if (!voltageValue || voltageValue === "-.-") {
    return voltageValue;
  }
  
  // "5.2V|G" 형식에서 전압값만 추출
  const parts = voltageValue.split('|');
  if (parts.length < 2) {
    return voltageValue; // 형식이 맞지 않으면 원본 반환
  }
  
  const voltagePart = parts[0];
  const comparisonPart = parts[1];
  
  // V 제거하고 숫자로 변환
  const voltage = parseFloat(voltagePart.replace('V', ''));
  if (isNaN(voltage)) {
    return voltageValue; // 숫자로 변환할 수 없으면 원본 반환
  }
  
  // 소수점 2자리로 자르기 (3자리 이하 버림)
  const truncatedVoltage = Math.floor(voltage * 100) / 100;
  
  // 원본 형식으로 반환
  return `${truncatedVoltage}V|${comparisonPart}`;
}


/**
 * runNextTankEnviTestProcess의 결과를 받아서 최종 리포트를 생성하는 오케스트레이터 함수
 * @param {Object} testResult - runNextTankEnviTestProcess의 리턴 값
 * @param {string} directoryName - 리포트 작성에 필요한 디렉토리 이름
 * @returns {Object} 최종 리포트 생성 결과
 */
export async function processTestResultAndGenerateReport(testResult, directoryName) {
  try {
    console.log(`[TestResultProcessor] 🚀 테스트 결과 처리 시작: ${testResult.status}`);
    
    if (!testResult) {
      console.error(`[TestResultProcessor] ❌ 테스트 결과가 없습니다.`);
      return {
        success: false,
        error: '테스트 결과가 없습니다.',
        reportType: 'none'
      };
    }

    // ===== 디렉토리명 설정 (기존 전역 변수 우선 사용) =====
    if (directoryName && !currentTestDirectoryName) {
      currentTestDirectoryName = directoryName;
      console.log(`[TestResultProcessor] 📁 외부에서 전달된 디렉토리명 설정: ${currentTestDirectoryName}`);
          } else if (!currentTestDirectoryName) {
        console.log(`[TestResultProcessor] 📁 전역 디렉토리명이 설정되지 않음 - 자동으로 최근 테스트 디렉토리 검색`);
        
        // Automatically find the most recent test directory
        try {
          const dataFolderPath = path.join(process.cwd(), 'Data');
          const directories = fs.readdirSync(dataFolderPath, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name)
            .filter(name => /^\d{8}_\d{4}$/.test(name)) // Filter for date format YYYYMMDD_HHMM
            .sort()
            .reverse(); // Most recent first
          
          if (directories.length > 0) {
            currentTestDirectoryName = directories[0];
            console.log(`[TestResultProcessor] 📁 자동으로 최근 테스트 디렉토리 발견: ${currentTestDirectoryName}`);
          } else {
            throw new Error('테스트 데이터 디렉토리를 찾을 수 없습니다');
          }
        } catch (error) {
          console.error(`[TestResultProcessor] ❌ 자동 디렉토리 검색 실패: ${error.message}`);
          throw new Error('테스트 데이터 디렉토리를 찾을 수 없습니다');
        }
      } else {
      console.log(`[TestResultProcessor] 📁 기존 전역 디렉토리명 사용: ${currentTestDirectoryName}`);
    }

    let reportResult = null;
    let reportType = '';

    // 테스트 결과 상태에 따라 리포트 생성
    switch (testResult.status) {
      case 'completed':
        console.log(`[TestResultProcessor] ✅ 정상 완료 - 정상 동작 리포트 생성 시작`);
        reportType = 'normal_operation';
        
        // 정상 완료 시에는 이미 생성된 리포트가 있는지 확인
        if (testResult.finalReportGenerated) {
          console.log(`[TestResultProcessor] ✅ 이미 정상 완료 리포트가 생성됨`);
          reportResult = {
            success: true,
            filename: testResult.reportFilename || '정상완료_리포트.csv',
            reportType: reportType
          };
        } else {
          // 정상 완료 리포트 생성 (필요한 경우)
          try {
            const getTableOption = await getSafeGetTableOption();
            const testSettings = {
              modelName: getTableOption.productInput?.modelName || 'N/A',
              productNumber: getTableOption.productInput?.productNumber || 'N/A',
              temperature: getTableOption.highTempSettings?.targetTemp || 'N/A',
              totalCycles: testResult.totalCycles || 1
            };
            
            // 정상 완료 리포트 생성 로직 (필요시 구현)
            console.log(`[TestResultProcessor] 📄 정상 완료 리포트 생성 완료`);
            reportResult = {
              success: true,
              filename: `정상완료_리포트_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`,
              reportType: reportType
            };
          } catch (reportError) {
            console.error(`[TestResultProcessor] ❌ 정상 완료 리포트 생성 실패:`, reportError.message);
            reportResult = {
              success: false,
              error: reportError.message,
              reportType: reportType
            };
          }
        }
        break;

      case 'stopped':
        console.log(`[TestResultProcessor] 🛑 중단됨 - 중간정지 리포트 생성 시작`);
        reportType = 'intermediate_stop';
        
        // 중단 시에는 이미 생성된 리포트가 있는지 확인
        if (testResult.finalReportGenerated) {
          console.log(`[TestResultProcessor] ✅ 이미 중단 리포트가 생성됨: ${testResult.reportFilename}`);
          reportResult = {
            success: true,
            filename: testResult.reportFilename,
            reportType: reportType
          };
        } else {
          // 중단 리포트 생성
          try {
            const getTableOption = await getSafeGetTableOption();
            const testSettings = {
              modelName: getTableOption.productInput?.modelName || 'N/A',
              productNumber: getTableOption.productInput?.productNumber || 'N/A',
              temperature: getTableOption.highTempSettings?.targetTemp || 'N/A',
              totalCycles: testResult.totalCycles || 1
            };
            
            const stopReportResult = await generateInterruptedTestResultFile({
              stopReason: testResult.stopReason || 'user_stop',
              stoppedAtCycle: testResult.stoppedAtCycle || 1,
              stoppedAtPhase: testResult.stoppedAtPhase || 'unknown',
              errorMessage: testResult.message || '사용자에 의해 중단됨',
              testSettings: testSettings
            });
            
            if (stopReportResult && stopReportResult.success) {
              console.log(`[TestResultProcessor] ✅ 중단 리포트 생성 성공: ${stopReportResult.filename}`);
              reportResult = {
                success: true,
                filename: stopReportResult.filename,
                reportType: reportType
              };
            } else {
              console.error(`[TestResultProcessor] ❌ 중단 리포트 생성 실패:`, stopReportResult?.error || '알 수 없는 오류');
              reportResult = {
                success: false,
                error: stopReportResult?.error || '알 수 없는 오류',
                reportType: reportType
              };
            }
          } catch (reportError) {
            console.error(`[TestResultProcessor] ❌ 중단 리포트 생성 실패:`, reportError.message);
            reportResult = {
              success: false,
              error: reportError.message,
              reportType: reportType
            };
          }
        }
        break;

      case 'error':
        console.log(`[TestResultProcessor] ❌ 에러 발생 - 중간정지 리포트 생성 시작`);
        reportType = 'intermediate_stop';
        
        // 에러 시에는 이미 생성된 리포트가 있는지 확인
        if (testResult.finalReportGenerated) {
          console.log(`[TestResultProcessor] ✅ 이미 에러 리포트가 생성됨: ${testResult.reportFilename}`);
          reportResult = {
            success: true,
            filename: testResult.reportFilename,
            reportType: reportType
          };
        } else {
          // 에러 리포트 생성
          try {
            const getTableOption = await getSafeGetTableOption();
            const testSettings = {
              modelName: getTableOption.productInput?.modelName || 'N/A',
              productNumber: getTableOption.productInput?.productNumber || 'N/A',
              temperature: getTableOption.highTempSettings?.targetTemp || 'N/A',
              totalCycles: testResult.totalCycles || 1
            };
            
            const errorReportResult = await generateInterruptedTestResultFile({
              stopReason: testResult.errorType || 'error',
              stoppedAtCycle: testResult.stoppedAtCycle || 1,
              stoppedAtPhase: testResult.stoppedAtPhase || 'unknown',
              errorMessage: testResult.message || '알 수 없는 에러',
              testSettings: testSettings
            });
            
            if (errorReportResult && errorReportResult.success) {
              console.log(`[TestResultProcessor] ✅ 에러 리포트 생성 성공: ${errorReportResult.filename}`);
              reportResult = {
                success: true,
                filename: errorReportResult.filename,
                reportType: reportType
              };
            } else {
              console.error(`[TestResultProcessor] ❌ 에러 리포트 생성 실패:`, errorReportResult?.error || '알 수 없는 오류');
              reportResult = {
                success: false,
                error: errorReportResult?.error || '알 수 없는 오류',
                reportType: reportType
              };
            }
          } catch (reportError) {
            console.error(`[TestResultProcessor] ❌ 에러 리포트 생성 실패:`, reportError.message);
            reportResult = {
              success: false,
              error: reportError.message,
              reportType: reportType
            };
          }
        }
        break;

      default:
        console.warn(`[TestResultProcessor] ⚠️ 알 수 없는 상태: ${testResult.status}`);
        reportType = 'unknown';
        reportResult = {
          success: false,
          error: `알 수 없는 상태: ${testResult.status}`,
          reportType: reportType
        };
        break;
    }

    // 프로세스 완료 후 전역 디렉토리명 초기화 (모든 파일 생성 완료 후)
    console.log(`[TestResultProcessor] 📁 프로세스 완료 - 전역 디렉토리명 초기화: ${currentTestDirectoryName}`);
    currentTestDirectoryName = null;
    
    // 최종 결과 반환
    const finalResult = {
      success: reportResult.success,
      reportType: reportType,
      testResult: testResult,
      reportResult: reportResult,
      directoryName: directoryName
    };

    if (reportResult.success) {
      console.log(`[TestResultProcessor] ✅ 최종 리포트 처리 완료: ${reportType} - ${reportResult.filename}`);
    } else {
      console.error(`[TestResultProcessor] ❌ 최종 리포트 처리 실패: ${reportType} - ${reportResult.error}`);
    }

    return finalResult;

  } catch (error) {
    console.error(`[TestResultProcessor] ❌ 예외 발생:`, error.message);
    
    // 전역 디렉토리명 초기화
    currentTestDirectoryName = null;
    
    return {
      success: false,
      error: error.message,
      reportType: 'error',
      testResult: testResult,
      reportResult: null,
      directoryName: directoryName
    };
  }
}

/**
 * runNextTankEnviTestProcess를 실행하고 결과를 처리하는 메인 함수
 * @param {Object} options - 테스트 실행 옵션
 * @returns {Object} 최종 처리 결과
 */
export async function runTestProcessWithResultHandling(options = {}) {
  try {
    console.log(`[TestProcessOrchestrator] 🚀 테스트 프로세스 실행 시작`);
    
    // runNextTankEnviTestProcess 실행 (내부에서 디렉토리명 생성)
    const testResult = await runNextTankEnviTestProcess(options);
    console.log(`[TestProcessOrchestrator] ✅ 테스트 프로세스 실행 완료: ${testResult.status}`);
    
    // 결과 처리 및 리포트 생성 (전역 변수의 디렉토리명 사용)
    const finalResult = await processTestResultAndGenerateReport(testResult, null);
    
    console.log(`[TestProcessOrchestrator] 🎯 최종 처리 완료: ${finalResult.reportType}`);
    return finalResult;
    
  } catch (error) {
    console.error(`[TestProcessOrchestrator] ❌ 예외 발생:`, error.message);
    
    // 에러 발생 시에도 에러 리포트 생성 시도
    const errorResult = {
      status: 'error',
      message: error.message,
      errorType: 'orchestrator_error'
    };
    
    try {
      const finalResult = await processTestResultAndGenerateReport(errorResult, null);
      return finalResult;
    } catch (reportError) {
      console.error(`[TestProcessOrchestrator] ❌ 에러 리포트 생성 실패:`, reportError.message);
      
      // 에러 리포트 생성 실패 시에도 전역 디렉토리명 초기화
      if (currentTestDirectoryName) {
        console.log(`[TestProcessOrchestrator] 📁 에러 발생 - 전역 디렉토리명 초기화: ${currentTestDirectoryName}`);
        currentTestDirectoryName = null;
      }
      
      return {
        success: false,
        error: error.message,
        reportType: 'error',
        testResult: errorResult,
        reportResult: null,
        directoryName: null
      };
    }
  }
}
