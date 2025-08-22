import { GetData } from './GetData.js';
import { RelayAllOff, SelectDeviceOn, SelectDeviceOff } from './SelectDevice.js';
import { SendVoltCommand } from './SetVolt.js';
import { ReadVolt } from './ReadVolt.js';

import { ReadChamber } from './ReadChamber.js'; 
import { getProcessStopRequested, setMachineRunningStatus, getCurrentChamberTemperature, getSafeGetTableOption } from './backend-websocket-server.js';
import fs from 'fs';
import path from 'path';
import { InterByteTimeoutParser } from 'serialport';

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

// 전역 WebSocket 서버 참조를 위한 변수
let globalWss = null;

// 테스트 실행별 디렉토리명을 저장하는 전역 변수
let currentTestDirectoryName = null;

// WebSocket 서버 참조를 설정하는 함수
export function setWebSocketServer(wss) {
  globalWss = wss;
  console.log('[RunTestProcess] WebSocket 서버 참조 설정됨');
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
 * 날짜별 디렉토리명을 생성하는 함수
 * @returns {string} YYYYMMDD 형식의 날짜 디렉토리명
 */
function getDateDirectoryName() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  
  return `${year}${month}${day}_${hour}${minute}`;
}

/**
 * TotaReportTable을 이미지와 유사한 전기적 성능 시험 테이블 형태로 저장
 * 이미지의 테이블 구조에 맞춰 CSV 형식으로 저장
 */
function saveTotaReportTableToFile(data, channelVoltages = [5.0, 15.0, -15.0, 24.0], cycleNumber = 1, testType = '') {
  try {
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
    
    // 절대 경로로 Data 폴더 설정
    const dataFolderPath = path.join(process.cwd(), 'Data');
    
    // Data 폴더가 없으면 생성
    if (!fs.existsSync(dataFolderPath)) {
      fs.mkdirSync(dataFolderPath, { recursive: true });
      console.log(`[SaveData] Data 폴더 생성됨: ${dataFolderPath}`);
    }
    
    // 전역 변수에서 테스트 디렉토리명 사용 (없으면 새로 생성)
    let dateDirectoryName = currentTestDirectoryName;
    if (!dateDirectoryName) {
      dateDirectoryName = getDateDirectoryName();
      console.log(`[SaveData] ⚠️ 전역 디렉토리명이 없어 새로 생성: ${dateDirectoryName}`);
    }
    
    const dateFolderPath = path.join(dataFolderPath, dateDirectoryName);
    
    if (!fs.existsSync(dateFolderPath)) {
      fs.mkdirSync(dateFolderPath, { recursive: true });
      console.log(`[SaveData] 📁 테스트 결과 저장 디렉토리 생성됨: ${dateFolderPath}`);
      console.log(`[SaveData] 📅 디렉토리명: ${dateDirectoryName} (${new Date().toLocaleString('ko-KR')})`);
      
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
    
    // 문서 헤더 정보 (이미지와 유사한 형태)
    csvContent += `문서번호,K2-AD-110-A241023-001\n`;
    csvContent += `제품명,${data.modelName || ''}\n`;
    csvContent += `제품번호,${data.ProductNumber.join(';') || ''}\n`;
    csvContent += `검사날짜,${reportData.TestDate || ''}\n`;
    csvContent += `검사시간,${reportData.TestTime || ''}\n`;
    csvContent += `테스트온도,${reportData.TestTemperature || ''}℃\n`;
    csvContent += `사이클번호,${cycleNumber}\n`;
    csvContent += `테스트유형,${testType}\n`;
    csvContent += '\n';
    
    // 테이블 헤더 (이미지와 동일한 구조)
    csvContent += `순,검사항목,검사방법,규격,시료번호(S/N),A.Q.L\n`;
    csvContent += `,,,입력전압,부하조건,출력전압,1,2,3,4,5,6,7,\n`;
    csvContent += '\n';
    
    // 전기적 성능 시험 데이터 (이미지의 101번 항목과 유사)
    let rowNumber = 101;
    
    // 각 입력 전압별로 테이블 생성
    for (let k = 0; k < 3; k++) {
      const inputVoltage = data.inputVolt[k] || 24;
      const voltageName = k === 0 ? '18Vdc [최소]' : k === 1 ? '24Vdc [정격]' : '30Vdc [최대]';
      
      // 검사항목: 전기적 성능 시험 - Line/Load Regulation
      csvContent += `${rowNumber},전기적 성능 시험,Power Supply,${voltageName},최대부하,5V (4.75V~5.25V),,,,,,,,A\n`;
      csvContent += `,Line/Load Regulation,O.S.C,${voltageName},최대부하,15V (14.25V~15.75V),,,,,,,,A\n`;
      csvContent += `,,전자부하기,${voltageName},최대부하,-15V (-14.25V~-15.75V),,,,,,,,A\n`;
      csvContent += `,,DVM,${voltageName},최대부하,24V (22.80V~25.20V),,,,,,,,A\n`;
      csvContent += `,,<SPEC>,${voltageName},최소부하,5V (4.75V~5.25V),,,,,,,,A\n`;
      csvContent += `,,Line R.: ±1%,${voltageName},최소부하,15V (14.25V~15.75V),,,,,,,,A\n`;
      csvContent += `,,Load R.: ±5%,${voltageName},최소부하,-15V (-14.25V~-15.75V),,,,,,,,A\n`;
      csvContent += `,,,${voltageName},최소부하,24V (22.80V~25.20V),,,,,,,,A\n`;
      csvContent += `,,,${voltageName},정격부하,5V (4.75V~5.25V),,,,,,,,A\n`;
      csvContent += `,,,${voltageName},정격부하,15V (14.25V~15.75V),,,,,,,,A\n`;
      csvContent += `,,,${voltageName},정격부하,-15V (-14.25V~-15.75V),,,,,,,,A\n`;
      csvContent += `,,,${voltageName},정격부하,24V (22.80V~25.20V),,,,,,,,A\n`;
      
      // 실제 측정 데이터 입력
      csvContent += '\n';
      csvContent += `측정결과 (${voltageName})\n`;
      csvContent += `채널,Device 1,Device 2,Device 3,Device 4,Device 5,Device 6,Device 7,Device 8,Device 9,Device 10\n`;
      
      // 4개 채널의 측정 결과
      for (let j = 0; j < 4; j++) {
        const channelName = `Channel ${j+1}`;
        const expectedVoltage = channelVoltages[j];
        csvContent += `${channelName} (${expectedVoltage}V),`;
        
        for (let i = 0; i < 10; i++) {
          // voltagTable 접근 시 안전한 검증
          let voltageValue = '';
          try {
            if (reportData.voltagTable && 
                reportData.voltagTable[k] && 
                reportData.voltagTable[k][i] && 
                reportData.voltagTable[k][i][j] !== undefined) {
              voltageValue = reportData.voltagTable[k][i][j];
            }
          } catch (accessError) {
            console.warn(`[SaveData] ⚠️ voltagTable[${k}][${i}][${j}] 접근 오류:`, accessError.message);
            voltageValue = '';
          }
          
          if (voltageValue && voltageValue !== "-.-") {
            // "5.2V|G" 형식에서 전압값만 추출
            const voltagePart = voltageValue.split('|')[0];
            csvContent += `${voltagePart},`;
          } else {
            csvContent += `-,`;
          }
        }
        csvContent = csvContent.slice(0, -1) + '\n'; // 마지막 쉼표 제거
      }
      
      // 비교 결과 (G/N)
      csvContent += '\n';
      csvContent += `비교결과 (G=Good, N=Not Good)\n`;
      csvContent += `채널,Device 1,Device 2,Device 3,Device 4,Device 5,Device 6,Device 7,Device 8,Device 9,Device 10\n`;
      
      for (let j = 0; j < 4; j++) {
        const channelName = `Channel ${j+1}`;
        csvContent += `${channelName},`;
        
        for (let i = 0; i < 10; i++) {
          // voltagTable 접근 시 안전한 검증
          let voltageValue = '';
          try {
            if (reportData.voltagTable && 
                reportData.voltagTable[k] && 
                reportData.voltagTable[k][i] && 
                reportData.voltagTable[k][i][j] !== undefined) {
              voltageValue = reportData.voltagTable[k][i][j];
            }
          } catch (accessError) {
            console.warn(`[SaveData] ⚠️ voltagTable[${k}][${i}][${j}] 접근 오류:`, accessError.message);
            voltageValue = '';
          }
          
          if (voltageValue && voltageValue !== "-.-") {
            // "5.2V|G" 형식에서 비교 결과만 추출
            const comparisonResult = voltageValue.includes('|') ? voltageValue.split('|')[1] : '';
            csvContent += `${comparisonResult},`;
          } else {
            csvContent += `-,`;
          }
        }
        csvContent = csvContent.slice(0, -1) + '\n'; // 마지막 쉼표 제거
      }
      
      csvContent += '\n';
      rowNumber++;
    }
    
    // 전체 통계 계산
    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;
    
    for (let k = 0; k < 3; k++) {
      for (let i = 0; i < 10; i++) {
        for (let j = 0; j < 4; j++) {
          // voltagTable 접근 시 안전한 검증
          let voltageValue = '';
          try {
            if (reportData.voltagTable && 
                reportData.voltagTable[k] && 
                reportData.voltagTable[k][i] && 
                reportData.voltagTable[k][i][j] !== undefined) {
              voltageValue = reportData.voltagTable[k][i][j];
            }
          } catch (accessError) {
            console.warn(`[SaveData] ⚠️ 통계 계산 중 voltagTable[${k}][${i}][${j}] 접근 오류:`, accessError.message);
            voltageValue = '';
          }
          
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
    
    // 검사결과 요약 (이미지 하단과 유사)
    csvContent += '\n';
    csvContent += `=== 검사결과 요약 ===\n`;
    csvContent += `총 테스트 수,${totalTests}\n`;
    csvContent += `통과 테스트 수,${passedTests}\n`;
    csvContent += `실패 테스트 수,${failedTests}\n`;
    csvContent += `통과율,${totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(2) : 0}%\n`;
    csvContent += `검사결과,${passedTests > failedTests ? '양품' : '불량'}\n`;
    csvContent += `작업자,시스템\n`;
    csvContent += `문서버전,PS-14(Rev.1)\n`;
    csvContent += `회사명,(주)아델피아랩\n`;
    
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
  let tolerance = expectedVoltage * 0.05;
  
  if(tolerance < 0 ) tolerance = tolerance * -1.0;  // 2025.0818 by skjung

  let minVoltage = expectedVoltage - tolerance;
  let maxVoltage = expectedVoltage + tolerance;
  
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

// 페이지 단위 테스트 프로세스 실행
export async function runSinglePageProcess() {
  try {
    const modeText = SIMULATION_PROC ? '시뮬레이션 모드' : '실제 모드';
    console.log(`[SinglePageProcess] 🔧 단일 페이지 프로세스 시작 (${modeText})`);
    
    // 파워스위치 상태 확인
    const { getMachineRunningStatus } = await import('./backend-websocket-server.js');
    const isPowerOn = getMachineRunningStatus();
    
    if (!isPowerOn) {
      console.error(`[SinglePageProcess] ❌ 파워스위치가 OFF 상태입니다. 테스트를 중단합니다.`);
      return { 
        status: 'error', 
        message: '파워스위치가 OFF 상태 - 테스트를 실행할 수 없습니다',
        errorType: 'power_switch_off'
      };
    }
    
    // 디렉토리 공유 확인 및 설정
    if (!currentTestDirectoryName) {
      // runNextTankEnviTestProcess에서 생성된 디렉토리가 없으면 새로 생성
      currentTestDirectoryName = getDateDirectoryName();
      console.log(`[SinglePageProcess] 📁 전역 디렉토리명이 없어 새로 생성: ${currentTestDirectoryName}`);
      
      // 테스트 결과 저장을 위한 디렉토리 생성
      const dataFolderPath = path.join(process.cwd(), 'Data');
      if (!fs.existsSync(dataFolderPath)) {
        fs.mkdirSync(dataFolderPath, { recursive: true });
        console.log(`[SinglePageProcess] 📁 Data 폴더 생성됨: ${dataFolderPath}`);
      }
      
      const dateFolderPath = path.join(dataFolderPath, currentTestDirectoryName);
      if (!fs.existsSync(dateFolderPath)) {
        fs.mkdirSync(dateFolderPath, { recursive: true });
        console.log(`[SinglePageProcess] 📁 테스트 결과 저장 디렉토리 생성됨: ${dateFolderPath}`);
        
        // 클라이언트에게 디렉토리 생성 알림 전송
        if (globalWss) {
          const dirCreateMessage = `[DIRECTORY_CREATED] ${currentTestDirectoryName}`;
          let sentCount = 0;
          globalWss.clients.forEach(client => {
            if (client.readyState === 1) { // WebSocket.OPEN
              client.send(dirCreateMessage);
              sentCount++;
            }
          });
          console.log(`[SinglePageProcess] 📤 디렉토리 생성 알림 전송 완료 - 클라이언트 수: ${sentCount}`);
        }
      } else {
        console.log(`[SinglePageProcess] 📁 기존 테스트 결과 저장 디렉토리 사용: ${dateFolderPath}`);
      }
    } else {
      console.log(`[SinglePageProcess] 📁 기존 전역 디렉토리명 사용: ${currentTestDirectoryName}`);
    }
    
    // 프로세스 시작 시 테이블 데이터 초기화
    console.log(`[SinglePageProcess] 📊 테이블 데이터 초기화 시작...`);
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
      await sleep(1000);
    } else {
      console.warn(`[SinglePageProcess] 전역 WebSocket 서버가 설정되지 않음 - PowerTable 초기화 메시지 전송 불가`);
    }
    
    const getTableOption = await getSafeGetTableOption();
    
    // currentTable 변수 정의 - 테이블 데이터 저장용
    const currentTable = {
      modelName: getTableOption.modelName || 'Unknown Model',
      ProductNumber: getTableOption.ProductNumber || ['Unknown'],
      inputVolt: getTableOption.outVoltSettings || [18, 24, 30],
      reportTable: [{
        TestDate: new Date().toLocaleDateString('ko-KR'),
        TestTime: new Date().toLocaleTimeString('ko-KR'),
        TestTemperature: getTableOption.highTempSettings?.targetTemp || 'N/A',
        voltagTable: Array(3).fill(null).map(() => 
          Array(10).fill(null).map(() => 
            Array(4).fill("-.-")
          )
        )
      }]
    };
    
    // 시스템 상태 검증
    console.log(`[SinglePageProcess] 시스템 상태 검증 중...`);
    
    // 중지 요청 확인 - 프로세스 시작 전
    // 단순한 중지 확인 - 프로세스 시작 전
    if (getProcessStopRequested()) {
      console.log(`[SinglePageProcess] 🛑 중지 요청 감지 - 프로세스 시작 전 중단`);
      return { status: 'stopped', message: '사용자에 의해 중지됨', stoppedAtPhase: 'initialization' };
    }
    
    // 딜레이 설정 로드
    const onDelay = getTableOption.delaySettings.onDelay || 1000;
    const offDelay = getTableOption.delaySettings.offDelay || 1000;
    
    // 프로세스 시작 전 포트 상태 초기화
    // console.log('[SinglePageProcess] 프로세스 시작 전 포트 상태 초기화');
  
    if( SIMULATION_PROC === false ){
      await RelayAllOff();
      await sleep(3000); // 포트 초기화를 위한 추가 대기
      // console.log('[SinglePageProcess] 포트 상태 초기화 완료');
    }

    for(let k=0; k<3; k++) {
          // 강력한 중지 확인 - 전압 테스트 시작 전
    if (getProcessStopRequested()) {
      console.log(`[SinglePageProcess] 🛑 중지 요청 감지 - 전압 테스트 ${k+1}/3에서 중단`);
      return { status: 'stopped', message: '사용자에 의해 중지됨', stoppedAtVoltageTest: k+1 };
    }
    
    // 전압 테스트 중에도 중지 요청 확인 (더 빠른 응답)
    const checkStopInterval = setInterval(() => {
      if (getProcessStopRequested()) {
        clearInterval(checkStopInterval);
        console.log(`[SinglePageProcess] 🛑 중지 요청 감지 - 전압 테스트 ${k+1}/3 중단`);
        return { status: 'stopped', message: '사용자에 의해 중단됨', stoppedAtVoltageTest: k+1 };
      }
    }, 50); // 50ms마다 확인 (더 빠른 응답)
      
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
          
          // 프로세스 중지 플래그 초기화 제거 - 중지 상태 유지
          console.log(`[SinglePageProcess] 🛑 프로세스 중지 상태 유지 - 전압 설정 중`);
          // setProcessStopRequested(false) 호출 제거
          
          return { status: 'stopped', message: '사용자에 의해 중단됨', stoppedAtVoltageTest: k+1, stoppedAtPhase: 'voltage_setting' };
        }
        
        // 전압 설정 전 정지 신호 확인 - 릴레이 동작 전
        if (getProcessStopRequested()) {
          console.log(`[SinglePageProcess] 🛑 전압 설정 전 정지 신호 감지 - 전압 ${inputVolt}V 설정 중단`);
          return { status: 'stopped', message: '전압 설정 전 정지 신호 감지', stoppedAtVoltageTest: k+1, stoppedAtPhase: 'before_voltage_setting' };
        }

        try {
          if(SIMULATION_PROC === false ){
            await SendVoltCommand(inputVolt);
          }
          voltSetSuccess = true;
          console.log(`[SinglePageProcess] 전압 설정 성공: ${inputVolt}V`);
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
          // 중지 요청 확인 - 디바이스 처리 시작 전
          if (getProcessStopRequested()) {
            console.log(`[SinglePageProcess] 🛑 중지 요청 감지 - 디바이스 ${i+1}/10에서 중단`);
            
            // 프로세스 중지 플래그 초기화 제거 - 중지 상태 유지
            console.log(`[SinglePageProcess] 🛑 프로세스 중지 상태 유지 - 디바이스 ${i+1}/10에서`);
            // setProcessStopRequested(false) 호출 제거
            
            return { status: 'stopped', message: '사용자에 의해 중단됨', stoppedAtVoltageTest: k+1, stoppedAtDevice: i+1 };
          }
          
          if (getTableOption.deviceStates[i] === false) {
            for ( let j = 0; j < 4 ; j++) {  // 입력 전압 24, 18, 30V default
              currentTable.reportTable[0].voltagTable[k][i][j] = "-.-";
            }
          } else {
            // 디바이스 선택 재시도 로직
            let deviceSelectSuccess = false;
            retryCount = 0;
            
            while (!deviceSelectSuccess && retryCount < maxRetries) {
              // 중지 요청 확인 - 디바이스 선택 중
              if (getProcessStopRequested()) {
                console.log(`[SinglePageProcess] 🛑 중지 요청 감지 - 디바이스 ${i+1} 선택 중 중단`);
                
                // 프로세스 중지 플래그 초기화 제거 - 중지 상태 유지
                console.log(`[SinglePageProcess] 🛑 프로세스 중지 상태 유지 - 디바이스 ${i+1} 선택 중`);
                // setProcessStopRequested(false) 호출 제거
                
                return { status: 'stopped', message: '사용자에 의해 중단됨', stoppedAtVoltageTest: k+1, stoppedAtDevice: i+1, stoppedAtPhase: 'device_selection' };
              }
              
              try {
                console.log(`[SinglePageProcess] 디바이스 ${i+1} 선택 시도 (${retryCount + 1}/${maxRetries})`);
                
                // 디바이스 선택 전 포트 상태 확인을 위한 대기
                // 릴레이 동작 전 정지 신호 확인 - 근본적인 문제 해결
                if (getProcessStopRequested()) {
                  console.log(`[SinglePageProcess] 🛑 릴레이 동작 전 정지 신호 감지 - 디바이스 ${i+1} 선택 중단`);
                  return { status: 'stopped', message: '릴레이 동작 전 정지 신호 감지', stoppedAtVoltageTest: k+1, stoppedAtDevice: i+1, stoppedAtPhase: 'before_relay_operation' };
                }

                await sleep(2000);
           
                let selectResult = true;

                if( SIMULATION_PROC === false ){
                  selectResult = await SelectDeviceOn(i+1);  // 1 부터 시작 함
                }

                if (selectResult === true || selectResult.success === true) {
                  deviceSelectSuccess = true;
                  console.log(`[SinglePageProcess] 디바이스 ${i+1} 선택 성공`);
                } else {
                  throw new Error(selectResult?.message || selectResult?.error || '알 수 없는 오류');
                }
              } catch (error) {
                retryCount++;
                console.warn(`[SinglePageProcess] 디바이스 ${i+1} 선택 실패 (${retryCount}/${maxRetries}): ${error}`);
                if (retryCount < maxRetries) {
                  console.log(`[SinglePageProcess] 10초 후 재시도...`);
                  await sleep(10000); // 10초 대기로 증가
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
            
            // 4개 채널 전압을 모두 읽은 후 클라이언트에 결과 전송
            const channelResults = [];
            
            for ( let j = 0; j < 4 ; j++) {  // 입력 전압 18, 24, 30V default
              // 중지 요청 확인 - 채널 처리 시작 전
              if (getProcessStopRequested()) {
                console.log(`[SinglePageProcess] 🛑 중지 요청 감지 - 채널 ${j+1}/4에서 중단`);
                if( SIMULATION_PROC === false ){ 
                  await SelectDeviceOff(i+1); // 안전을 위해 디바이스 끄기
                }
                
                // 프로세스 중지 플래그 초기화 제거 - 중지 상태 유지
                console.log(`[SinglePageProcess] 🛑 프로세스 중지 상태 유지 - 채널 ${j+1}/4에서`);
                // setProcessStopRequested(false) 호출 제거
                
                return { status: 'stopped', message: '사용자에 의해 중단됨', stoppedAtVoltageTest: k+1, stoppedAtDevice: i+1, stoppedAtChannel: j+1 };
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
                  
                  // 프로세스 중지 플래그 초기화 제거 - 중지 상태 유지
                  console.log(`[SinglePageProcess] 🛑 프로세스 중지 상태 유지 - 전압 읽기 중`);
                  // setProcessStopRequested(false) 호출 제거
                  
                  return { status: 'stopped', message: '사용자에 의해 중단됨', stoppedAtVoltageTest: k+1, stoppedAtDevice: i+1, stoppedAtChannel: j+1, stoppedAtPhase: 'voltage_reading' };
                }
                
                try {
                  if( SIMULATION_PROC === false ){
                    voltData = await ReadVolt(j+1);
                  } else {
                    // 시뮬레이션 모드에서는 설정된 채널 전압값을 사용하고 약간의 변동 추가
                    const baseVoltage = getTableOption.channelVoltages[j];
                    let variation = (Math.random() - 0.5) * 0.2; // ±0.1V 변동
                    
                    // 채널 3 (-15)의 경우 음수 값이 올바르게 생성되도록 보장
                    if (j === 2 && baseVoltage < 0) {
                      // -15 채널의 경우 음수 값 유지
                      voltData = baseVoltage + variation;
                      //console.log(`[SinglePageProcess] Device ${i+1}, Channel ${j+1}: 시뮬레이션 -15 채널 전압 생성: ${voltData}V`);
                    } else {
                      voltData = baseVoltage + variation;
                    }
                    
                    await sleep(100); // 시뮬레이션을 위한 짧은 대기
                  }
                  voltReadSuccess = true;
                } catch (error) {
                  retryCount++;
                  console.warn(`[SinglePageProcess] Device ${i+1}, Channel ${j+1} 전압 읽기 실패 (${retryCount}/${maxRetries}): ${error}`);
                  if (retryCount < maxRetries) {
                    console.log(`[SinglePageProcess] 1초 후 재시도...`);
                    await sleep(5000);
                  } else {
                    console.error(`[SinglePageProcess] Device ${i+1}, Channel ${j+1} 전압 읽기 최종 실패`);
                    voltData = 'error';
                    break;
                  }
                }
              }
               
              // 채널 3 (j=2)의 경우 읽은 전압에 -1.0을 곱함
              // 시뮬레이션인 경우는 통과한다. 
              if( SIMULATION_PROC === false ){
                if (j === 2 && voltData !== 'error' && typeof voltData === 'number') {
                  voltData = voltData * -1.0;
                  //console.log(`[SinglePageProcess] Device ${i+1}, Channel ${j+1}: 채널 3 전압값에 -1.0 곱함: ${voltData}V`);
                }
              } else {
                // 시뮬레이션 모드에서도 채널 3 (-15) 처리
                if (j === 2 && voltData !== 'error' && typeof voltData === 'number') {
                  // 시뮬레이션에서는 이미 -15 근처의 값이 생성되므로 추가 변환 불필요
                  //console.log(`[SinglePageProcess] Device ${i+1}, Channel ${j+1}: 시뮬레이션 모드 채널 3 (-15) 처리: ${voltData}V`);
                }
              }
               
              const expectedVoltage = getTableOption.channelVoltages[j] || 0;
              const comparisonResult = voltData === 'error' ? 'N' : compareVoltage(voltData, expectedVoltage);
               
              // 전압값과 비교 결과를 함께 저장 (예: "5.2V|G" 또는 "5.2V|N")
              const voltageWithComparison = voltData === 'error' ? 'error|N' : `${voltData}V|${comparisonResult}`;
               
              // 기존 voltagTable에도 저장 (호환성 유지)
              currentTable.reportTable[0].voltagTable[k][i][j] = voltageWithComparison;
               
              // 채널 결과 수집
              channelResults.push({
                device: i+1,
                channel: j+1,
                voltage: voltData,
                expected: expectedVoltage,
                result: comparisonResult,
                voltageWithComparison: voltageWithComparison
              });
               
              // 로그 출력
              //console.log(`[SinglePageProcess] Device ${i+1}, Channel ${j+1}: 읽은값=${voltData}V, 설정값=${expectedVoltage}V, 결과=${comparisonResult}`);
            } // for (let j = 0; j < 4; j++) 루프 닫기
            
            // 4개 채널 전압을 모두 읽은 후 테이블에 누적
            console.log(`[SinglePageProcess] Device ${i+1}, Test ${k+1} 전압 데이터 테이블에 누적`);
            
            // 각 채널의 전압 데이터를 테이블에 업데이트
            channelResults.forEach((channelResult, channelIndex) => {
              if (channelResult && typeof channelResult.voltage === 'number') {
                const channelNumber = channelIndex + 1;
                updateTableData(i+1, k+1, channelNumber, channelResult.voltage, 'completed');
              }
            });
            
            // 4개 채널 전압을 모두 읽은 후 클라이언트에 결과 전송
            // 각 디바이스가 선정되고 4개의 전압을 읽었을 때 송신
            console.log(`[SinglePageProcess] Device ${i+1}, Test ${k+1}: 4개 채널 완료 - 클라이언트에 데이터 전송`);
            broadcastTableData();
            
            // 이제 각 디바이스의 4개 채널이 완료될 때마다 전송됨
            
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
                // 프로세스 중지 플래그 초기화 제거 - 중지 상태 유지
                console.log(`[SinglePageProcess] 🛑 프로세스 중지 상태 유지 - 디바이스 ${i+1} 해제 중`);
                // setProcessStopRequested(false) 호출 제거
                
                return { status: 'stopped', message: '사용자에 의해 중단됨', stoppedAtVoltageTest: k+1, stoppedAtDevice: i+1, stoppedAtPhase: 'device_release' };
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
                  break;
                }
              }
            }
            
            await sleep(offDelay);
          } // if (getTableOption.deviceStates[i] === false) else 블록 닫기
        } // for (let i = 0; i < 10; i++) 루프 닫기
    } // for (let k = 0; k < 3; k++) 루프 닫기
    
    // 모든 테스트가 완료된 후 테이블 완성 상태 확인
    console.log('[SinglePageProcess] 모든 테스트 완료 - 테이블 완성 상태 확인');
    
    // 이미 각 디바이스의 4개 채널 완료 시점에 전송했으므로 중복 전송 제거
    // broadcastTableData(); // 제거: 중복 전송 방지
    
    console.log('[SinglePageProcess] 프로세스 완료');
    console.log('[SinglePageProcess] 테이블 출력:', currentTable);
    console.log('[SinglePageProcess] 테이블 출력:', currentTable.reportTable[0].voltagTable);
    
    // 테스트 결과를 파일로 저장
    try {
      console.log('[SinglePageProcess] 📁 테스트 결과 저장 시작');
      console.log(`[SinglePageProcess] 📁 사용 중인 디렉토리: ${currentTestDirectoryName || '새로 생성됨'}`);
      
      // getTableOption에서 channelVoltages 가져오기
      const getTableOption = await getSafeGetTableOption();
      const channelVoltages = getTableOption.channelVoltages || [5.0, 15.0, -15.0, 24.0];
      
      // 현재 시간을 기준으로 테스트 타입 설정
      const testType = 'SinglePageTest';
      
      // 결과 저장
      const saveResult = saveTotaReportTableToFile(
        currentTable,
        channelVoltages,
        1, // cycleNumber (단일 페이지 테스트는 1)
        testType
      );
      
      if (saveResult.success) {
        console.log(`[SinglePageProcess] ✅ 테스트 결과 저장 완료: ${saveResult.filename}`);
        console.log(`[SinglePageProcess] 📁 저장 경로: ${saveResult.filePath}`);
      } else {
        console.error(`[SinglePageProcess] ❌ 테스트 결과 저장 실패: ${saveResult.error}`);
      }
    } catch (saveError) {
      console.error('[SinglePageProcess] ❌ 결과 저장 중 오류 발생:', saveError);
    }
    
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
    const modeText = SIMULATION_PROC ? '시뮬레이션 모드' : '실제 모드';
    console.log(`[NextTankEnviTestProcess] 🔄 환경 테스트 프로세스 시작 (${modeText})`);
    
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
    
    // 테스트 시작 시 디렉토리명을 한 번만 생성하여 저장
    currentTestDirectoryName = getDateDirectoryName();
    
    // 테스트 결과 저장을 위한 디렉토리 생성
    const dataFolderPath = path.join(process.cwd(), 'Data');
    if (!fs.existsSync(dataFolderPath)) {
      fs.mkdirSync(dataFolderPath, { recursive: true });
      //console.log(`[NextTankEnviTestProcess] 📁 Data 폴더 생성됨: ${dataFolderPath}`);
    }
    
    const dateFolderPath = path.join(dataFolderPath, currentTestDirectoryName);
    if (!fs.existsSync(dateFolderPath)) {
      fs.mkdirSync(dateFolderPath, { recursive: true });
      //console.log(`[NextTankEnviTestProcess] 📁 테스트 결과 저장 디렉토리 생성됨: ${dateFolderPath}`);
      //console.log(`[NextTankEnviTestProcess] 📅 디렉토리명: ${currentTestDirectoryName} (${new Date().toLocaleString('ko-KR')})`);
      
      // 클라이언트에게 디렉토리 생성 알림 전송
      if (globalWss) {
        const dirCreateMessage = `[DIRECTORY_CREATED] ${currentTestDirectoryName}`;
        let sentCount = 0;
        globalWss.clients.forEach(client => {
          if (client.readyState === 1) { // WebSocket.OPEN
            client.send(dirCreateMessage);
            sentCount++;
          }
        });
        //console.log(`[NextTankEnviTestProcess] 📤 디렉토리 생성 알림 전송 완료 - 클라이언트 수: ${sentCount}`);
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
    
    //console.log(`[NextTankEnviTestProcess] ✅ 시스템 상태 검증 완료`);
    //console.log(`[NextTankEnviTestProcess] - 고온 테스트: ${highTempEnabled ? '활성화' : '비활성화'}`);
    //console.log(`[NextTankEnviTestProcess] - 저온 테스트: ${lowTempEnabled ? '활성화' : '비활성화'}`);
    
    // cycleNumber 횟수만큼 반복
    const cycleNumber = getTableOption.delaySettings.cycleNumber || 1; // 기본값 1
    //console.log(`[NextTankEnviTestProcess] 📊 총 ${cycleNumber}회 사이클 실행 예정`);
    
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
      
      // 각 사이클 시작 시 PowerTable 전압 데이터 초기화
      if (globalWss) {
        const cycleResetMessage = `[POWER_TABLE_RESET] ${JSON.stringify({
          action: 'cycle_reset',
          cycle: cycle,
          totalCycles: cycleNumber,
          testPhase: 'none', // 사이클 시작 시에는 테스트 페이즈 없음
          currentTestNumber: 0,
          totalTestCount: 0,
          testStatus: 'none',
          timestamp: new Date().toISOString(),
          message: `사이클 ${cycle} 시작 - 전압 데이터 초기화`
        })}`;
        
        let sentCount = 0;
        globalWss.clients.forEach(client => {
          if (client.readyState === 1) { // WebSocket.OPEN
            client.send(cycleResetMessage);
            sentCount++;
            console.log(`[NextTankEnviTestProcess] 사이클 ${cycle} - 클라이언트 ${sentCount}에게 초기화 메시지 전송됨`);
          }
        });
        console.log(`[NextTankEnviTestProcess] 사이클 ${cycle} PowerTable 초기화 메시지 전송 완료 - 클라이언트 수: ${sentCount}`);
      } else {
        console.warn(`[NextTankEnviTestProcess] 사이클 ${cycle} - 전역 WebSocket 서버가 설정되지 않음 - PowerTable 초기화 메시지 전송 불가`);
      }
      
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
                temperature: getTableOption.highTempSettings?.targetTemp || 'N/A',
                totalCycles: cycleNumber
              };
              
              const reportResult = await generateInterruptedTestResultFile({
                stopReason: 'power_switch_off',
                stoppedAtCycle: cycle,
                stoppedAtPhase: 'high_temp_waiting',
                errorMessage: '사용자에 의한 파워스위치 OFF',
                testSettings: testSettings,
                existingFiles: []
              });
              
              if (reportResult && reportResult.success) {
                console.log(`[NextTankEnviTestProcess] ✅ 중단 보고서 생성 성공: ${reportResult.filename}`);
                // 보고서 생성 완료 후 전역 디렉토리명 초기화
                currentTestDirectoryName = null;
              } else {
                console.error(`[NextTankEnviTestProcess] ❌ 중단 보고서 생성 실패:`, reportResult?.error || '알 수 없는 오류');
              }
              
            } catch (error) {
              console.error(`[NextTankEnviTestProcess] ❌ 중단 보고서 생성 실패:`, error.message);
            }
            
            // 프로세스 중지 플래그 초기화 제거 - 중지 상태 유지
            console.log(`[NextTankEnviTestProcess] 🛑 프로세스 중지 상태 유지 - 고온 테스트 온도 대기 중`);
            // setProcessStopRequested(false) 호출 제거
            
            return { status: 'stopped', message: '사용자에 의해 중지됨', stoppedAtCycle: cycle, stoppedAtPhase: 'high_temp_waiting' };
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
                  temperature: getTableOption.highTempSettings?.targetTemp || 'N/A',
                  totalCycles: cycleNumber
                };
                
                const reportResult = await generateInterruptedTestResultFile({
                  stopReason: 'power_switch_off',
                  stoppedAtCycle: cycle,
                  stoppedAtPhase: 'high_temp_waiting',
                  errorMessage: '사용자에 의한 파워스위치 OFF',
                  testSettings: testSettings,
                  existingFiles: []
                });
                
                if (reportResult && reportResult.success) {
                  console.log(`[NextTankEnviTestProcess] ✅ 중단 보고서 생성 성공: ${reportResult.filename}`);
                  // 보고서 생성 완료 후 전역 디렉토리명 초기화
                  currentTestDirectoryName = null;
                } else {
                  console.error(`[NextTankEnviTestProcess] ❌ 중단 보고서 생성 실패:`, reportResult?.error || '알 수 없는 오류');
                }
                
              } catch (error) {
                console.error(`[NextTankEnviTestProcess] ❌ 중단 보고서 생성 실패:`, error.message);
              }
              
              // 프로세스 중지 플래그 초기화 제거 - 중지 상태 유지
              console.log(`[NextTankEnviTestProcess] 🛑 프로세스 중지 상태 유지 - 고온 테스트 온도 대기 중 주기적 체크`);
              // setProcessStopRequested(false) 호출 제거
              
              return { status: 'stopped', message: '사용자에 의해 중지됨', stoppedAtCycle: cycle, stoppedAtPhase: 'high_temp_waiting' };
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
              const dateDirectoryName = currentTestDirectoryName || getDateDirectoryName();
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
                testSettings,
                existingFiles
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
            
            // waitTime 분 만큼 대기
            if(SIMULATION_PROC === false){
              console.log(`[NextTankEnviTestProcess] 고온 도달 후 ${waitTime}분 대기 시작...`);
              await sleepMinutes(waitTime);
            }
            
            // runSinglePageProcess 를 readCount 만큼 실행
            for(let i = 0; i < readCount; i++) {
              // 중지 요청 확인
              if (getProcessStopRequested()) {
                console.log(`[NextTankEnviTestProcess] 🛑 중지 요청 감지 - 고온 테스트 실행 중 중단 (${i+1}/${readCount})`);
                
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
                    temperature: getTableOption.highTempSettings?.targetTemp || 'N/A',
                    totalCycles: cycleNumber
                  };
                  
                  const reportResult = await generateInterruptedTestResultFile({
                    stopReason: 'power_switch_off',
                    stoppedAtCycle: cycle,
                    stoppedAtPhase: 'high_temp_test',
                    stoppedAtTest: i+1,
                    errorMessage: '사용자에 의한 파워스위치 OFF',
                    testSettings: testSettings,
                    existingFiles: []
                  });
                  
                  if (reportResult && reportResult.success) {
                    console.log(`[NextTankEnviTestProcess] ✅ 중단 보고서 생성 성공: ${reportResult.filename}`);
                    // 보고서 생성 완료 후 전역 디렉토리명 초기화
                    currentTestDirectoryName = null;
                  } else {
                    console.error(`[NextTankEnviTestProcess] ❌ 중단 보고서 생성 실패:`, reportResult?.error || '알 수 없는 오류');
                  }
                  
                } catch (error) {
                  console.error(`[NextTankEnviTestProcess] ❌ 중단 보고서 생성 실패:`, error.message);
                }
                
                return { status: 'stopped', message: '사용자에 의해 중단됨', stoppedAtCycle: cycle, stoppedAtPhase: 'high_temp_test', stoppedAtTest: i+1 };
              }
              
              console.log(`[NextTankEnviTestProcess] 사이클 ${cycle}: 고온 테스트 ${i+1}/${readCount} 실행`);
              
              // 현재 테스트 번호를 PowerTable에 업데이트
              if (globalWss) {
                const testUpdateMessage = `[POWER_TABLE_RESET] ${JSON.stringify({
                  action: 'test_progress',
                  cycle: cycle,
                  totalCycles: cycleNumber,
                  testPhase: 'high_temp',
                  currentTestNumber: i + 1,
                  totalTestCount: readCount,
                  testStatus: 'ON',
                  timestamp: new Date().toISOString(),
                  message: `사이클 ${cycle}: 고온 테스트 ${i+1}/${readCount} 실행 중`
                })}`;
                
                let sentCount = 0;
                globalWss.clients.forEach(client => {
                  if (client.readyState === 1) { // WebSocket.OPEN
                    client.send(testUpdateMessage);
                    sentCount++;
                  }
                });
                console.log(`[NextTankEnviTestProcess] 사이클 ${cycle} 고온 테스트 ${i+1}/${readCount} 진행 상황 업데이트 전송 완료 - 클라이언트 수: ${sentCount}`);
              }
              
              // SinglePageProcess 재시도 로직 (최대 5회)
              let singlePageSuccess = false;
              let retryCount = 0;
              const maxRetries = 5;
              let singlePageResult = null;
              
              while (!singlePageSuccess && retryCount < maxRetries) {
                try {
                  singlePageResult = await runSinglePageProcess();
                  
                  if (singlePageResult && singlePageResult.status === 'stopped') {
                    console.log(`[NextTankEnviTestProcess] 🛑 SinglePageProcess 중지됨: ${singlePageResult.message}`);
                    
                    // SinglePageProcess 중지 시 즉시 전체 프로세스 중단
                    console.log(`[NextTankEnviTestProcess] 🛑 SinglePageProcess 중지로 인한 전체 프로세스 중단`);
                    
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
                    
                    // 즉시 중단 상태 반환
                    return { 
                      status: 'stopped', 
                      message: 'SinglePageProcess 중지로 인한 전체 프로세스 중단',
                      stoppedAtCycle: cycle,
                      stoppedAtPhase: 'high_temp_test',
                      stopReason: 'SinglePageProcess_stopped'
                    };
                  }
                  
                  if (singlePageResult && singlePageResult.status === 'completed' && singlePageResult.data) {
                    singlePageSuccess = true;
                    console.log(`[NextTankEnviTestProcess] 사이클 ${cycle} 고온 테스트 ${i+1}/${readCount} 성공 (${retryCount + 1}번째 시도)`);
                  } else {
                    throw new Error(`SinglePageProcess 실패: ${singlePageResult?.message || '알 수 없는 오류'}`);
                  }
                } catch (error) {
                  retryCount++;
                  console.warn(`[NextTankEnviTestProcess] 사이클 ${cycle} 고온 테스트 ${i+1}/${readCount} 실패 (${retryCount}/${maxRetries}): ${error.message}`);
                  
                  if (retryCount < maxRetries) {
                    console.log(`[NextTankEnviTestProcess] 3초 후 재시도...`);
                    await sleep(3000);
                  } else {
                    console.error(`[NextTankEnviTestProcess] 사이클 ${cycle} 고온 테스트 ${i+1}/${readCount} 최종 실패 - 프로세스 중단`);
                    
                    // PowerSwitch 상태를 off로 설정
                    setMachineRunningStatus(false);
                    console.log(`[NextTankEnviTestProcess] 🔌 고온 테스트 실패로 인한 PowerSwitch 상태 OFF 설정`);
                    
                    return { 
                      status: 'error', 
                      message: `고온 테스트 ${i+1}/${readCount} 실패 - 5회 재시도 후 최종 실패`, 
                      stoppedAtCycle: cycle, 
                      stoppedAtPhase: 'high_temp_test', 
                      stoppedAtTest: i+1,
                      errorType: 'high_temp_test_failed'
                    };
                  }
                }
              }
              
              // 각 실행 결과를 개별 파일로 저장
              if (singlePageResult && singlePageResult.status === 'completed' && singlePageResult.data) {
                console.log(`[NextTankEnviTestProcess] 사이클 ${cycle} 고온 테스트 ${i+1}/${readCount} 결과 저장 시작`);
                const saveResult = saveTotaReportTableToFile(
                  singlePageResult.data, 
                  getTableOption.channelVoltages, 
                  cycle, 
                  `HighTemp_Test${i+1}`
                );
                if (saveResult.success) {
                  console.log(`[NextTankEnviTestProcess] 사이클 ${cycle} 고온 테스트 ${i+1}/${readCount} 결과 저장 완료: ${saveResult.filename}`);
                } else {
                  console.error(`[NextTankEnviTestProcess] 사이클 ${cycle} 고온 테스트 ${i+1}/${readCount} 결과 저장 실패: ${saveResult.error}`);
                }
                
                // 결과 누적 (기존 로직 유지)
                highTempResults.push(singlePageResult.data);
              }
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
              // 생성된 파일들을 찾기 위해 Data 폴더 스캔
              const dataFolderPath = path.join(process.cwd(), 'Data');
              // 전역 변수에서 테스트 디렉토리명 사용
              const dateDirectoryName = currentTestDirectoryName || getDateDirectoryName();
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
                testSettings,
                existingFiles
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
            
            return { status: 'stopped', message: '사용자에 의해 중지됨', stoppedAtCycle: cycle, stoppedAtPhase: 'low_temp_waiting' };
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
                  testSettings: testSettings,
                  existingFiles: []
                });
                
                if (reportResult && reportResult.success) {
                  console.log(`[NextTankEnviTestProcess] ✅ 중단 보고서 생성 성공: ${reportResult.filename}`);
                  // 보고서 생성 완료 후 전역 디렉토리명 초기화
                  currentTestDirectoryName = null;
                } else {
                  console.error(`[NextTankEnviTestProcess] ❌ 중단 보고서 생성 실패:`, reportResult?.error || '알 수 없는 오류');
                }
                
              } catch (error) {
                console.error(`[NextTankEnviTestProcess] ❌ 중단 보고서 생성 실패:`, error.message);
              }
              
              // 프로세스 중지 플래그 초기화 제거 - 중지 상태 유지
              console.log(`[NextTankEnviTestProcess] 🛑 프로세스 중지 상태 유지 - 저온 테스트 온도 대기 중`);
              // setProcessStopRequested(false) 호출 제거
              
              return { status: 'stopped', message: '사용자에 의해 중지됨', stoppedAtCycle: cycle, stoppedAtPhase: 'low_temp_waiting' };
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
            
            // lowWaitTime 분 만큼 대기
            await sleepMinutes(lowWaitTime);
            
            // runSinglePageProcess 를 readCount 만큼 실행
            for(let i = 0; i < lowReadCount; i++) {
              // 중지 요청 확인
              if (getProcessStopRequested()) {
                console.log(`[NextTankEnviTestProcess] 🛑 중지 요청 감지 - 저온 테스트 실행 중 중단 (${i+1}/${lowReadCount})`);
                
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
                    stopReason: 'manual_stop',
                    stoppedAtCycle: cycle,
                    stoppedAtPhase: 'low_temp_test',
                    stoppedAtTest: i+1,
                    testSettings: testSettings,
                    existingFiles: []
                  });
                  
                  if (reportResult && reportResult.success) {
                    console.log(`[NextTankEnviTestProcess] ✅ 중단 보고서 생성 성공: ${reportResult.filename}`);
                    // 보고서 생성 완료 후 전역 디렉토리명 초기화
                    currentTestDirectoryName = null;
                  } else {
                    console.error(`[NextTankEnviTestProcess] ❌ 중단 보고서 생성 실패:`, reportResult?.error || '알 수 없는 오류');
                  }
                  
                } catch (error) {
                  console.error(`[NextTankEnviTestProcess] ❌ 중단 보고서 생성 실패:`, error.message);
                }
                
                return { status: 'stopped', message: '사용자에 의해 중단됨', stoppedAtCycle: cycle, stoppedAtPhase: 'low_temp_test', stoppedAtTest: i+1 };
              }
              
              console.log(`[NextTankEnviTestProcess] 사이클 ${cycle}: 저온 테스트 ${i+1}/${lowReadCount} 실행`);
              
              // 현재 테스트 번호를 PowerTable에 업데이트
              if (globalWss) {
                const testUpdateMessage = `[POWER_TABLE_RESET] ${JSON.stringify({
                  action: 'test_progress',
                  cycle: cycle,
                  totalCycles: cycleNumber,
                  testPhase: 'low_temp',
                  currentTestNumber: i + 1,
                  totalTestCount: lowReadCount,
                  testStatus: 'ON',
                  timestamp: new Date().toISOString(),
                  message: `사이클 ${cycle}: 저온 테스트 ${i+1}/${lowReadCount} 실행 중`
                })}`;
                
                let sentCount = 0;
                globalWss.clients.forEach(client => {
                  if (client.readyState === 1) { // WebSocket.OPEN
                    client.send(testUpdateMessage);
                    sentCount++;
                  }
                });
                console.log(`[NextTankEnviTestProcess] 사이클 ${cycle} 저온 테스트 ${i+1}/${lowReadCount} 진행 상황 업데이트 전송 완료 - 클라이언트 수: ${sentCount}`);
              }
              
              // SinglePageProcess 재시도 로직 (최대 5회)
              let singlePageSuccess = false;
              let retryCount = 0;
              const maxRetries = 5;
              let singlePageResult = null;
              
              while (!singlePageSuccess && retryCount < maxRetries) {
                try {
                  singlePageResult = await runSinglePageProcess();
                  
                  if (singlePageResult && singlePageResult.status === 'stopped') {
                    console.log(`[NextTankEnviTestProcess] 🛑 SinglePageProcess 중지됨: ${singlePageResult.message}`);
                    
                    // SinglePageProcess 중지 시 즉시 전체 프로세스 중단
                    console.log(`[NextTankEnviTestProcess] 🛑 SinglePageProcess 중지로 인한 전체 프로세스 중단`);
                    
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
                    
                    // 즉시 중단 상태 반환
                    return { 
                      status: 'stopped', 
                      message: 'SinglePageProcess 중지로 인한 전체 프로세스 중단',
                      stoppedAtCycle: cycle,
                      stoppedAtPhase: 'low_temp_test',
                      stopReason: 'SinglePageProcess_stopped'
                    };
                  }
                  
                  if (singlePageResult && singlePageResult.status === 'completed' && singlePageResult.data) {
                    singlePageSuccess = true;
                    console.log(`[NextTankEnviTestProcess] 사이클 ${cycle} 저온 테스트 ${i+1}/${lowReadCount} 성공 (${retryCount + 1}번째 시도)`);
                  } else {
                    throw new Error(`SinglePageProcess 실패: ${singlePageResult?.message || '알 수 없는 오류'}`);
                  }
                } catch (error) {
                  retryCount++;
                  console.warn(`[NextTankEnviTestProcess] 사이클 ${cycle} 저온 테스트 ${i+1}/${lowReadCount} 실패 (${retryCount}/${maxRetries}): ${error.message}`);
                  
                  if (retryCount < maxRetries) {
                    console.log(`[NextTankEnviTestProcess] 3초 후 재시도...`);
                    await sleep(3000);
                  } else {
                    console.error(`[NextTankEnviTestProcess] 사이클 ${cycle} 저온 테스트 ${i+1}/${lowReadCount} 최종 실패 - 프로세스 중단`);
                    
                    // PowerSwitch 상태를 off로 설정
                    setMachineRunningStatus(false);
                    console.log(`[NextTankEnviTestProcess] 🔌 저온 테스트 실패로 인한 PowerSwitch 상태 OFF 설정`);
                    
                    return { 
                      status: 'error', 
                      message: `저온 테스트 ${i+1}/${lowReadCount} 실패 - 5회 재시도 후 최종 실패`, 
                      stoppedAtCycle: cycle, 
                      stoppedAtPhase: 'low_temp_test', 
                      stoppedAtTest: i+1,
                      errorType: 'low_temp_test_failed'
                    };
                  }
                }
              }
              
              // 각 실행 결과를 개별 파일로 저장
              if (singlePageResult && singlePageResult.status === 'completed' && singlePageResult.data) {
                console.log(`[NextTankEnviTestProcess] 사이클 ${cycle} 저온 테스트 ${i+1}/${lowReadCount} 결과 저장 시작`);
                const saveResult = saveTotaReportTableToFile(
                  singlePageResult.data, 
                  getTableOption.channelVoltages, 
                  cycle, 
                  `LowTemp_Test${i+1}`
                );
                if (saveResult.success) {
                  console.log(`[NextTankEnviTestProcess] 사이클 ${cycle} 저온 테스트 ${i+1}/${lowReadCount} 결과 저장 완료: ${saveResult.filename}`);
                } else {
                  console.error(`[NextTankEnviTestProcess] 사이클 ${cycle} 저온 테스트 ${i+1}/${lowReadCount} 결과 저장 실패: ${saveResult.error}`);
                }
                
                // 결과 누적 (기존 로직 유지)
                lowTempResults.push(singlePageResult.data);
              }
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
    
    // 모든 사이클 완료 후 종합 리포트 생성 (단순화)
    try {
      await generateFinalDeviceReport(cycleNumber);
    } catch (error) {
      console.error(`[NextTankEnviTestProcess] ❌ 종합 리포트 생성 실패:`, error.message);
    }
    
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
    
    // 전역 디렉토리명 초기화
    currentTestDirectoryName = null;
    
    return { status: 'completed', message: '모든 사이클 완료 및 종합 리포트 생성 완료' };
    
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
        result: error.result
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
      // 생성된 파일들을 찾기 위해 Data 폴더 스캔
      const dataFolderPath = path.join(process.cwd(), 'Data');
      // 전역 변수에서 테스트 디렉토리명 사용
      const dateDirectoryName = currentTestDirectoryName || getDateDirectoryName();
      const dateFolderPath = path.join(dataFolderPath, dateDirectoryName);
      
      let existingFiles = [];
      if (fs.existsSync(dateFolderPath)) {
        const files = fs.readdirSync(dateFolderPath);
        existingFiles = files
          .filter(file => file.endsWith('.csv'))
          .map(file => path.join(dateFolderPath, file));
      }
      
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
          testSettings,
          existingFiles
        });
        
        if (result && result.success) {
          console.log(`[NextTankEnviTestProcess] ✅ 에러로 인한 중단된 테스트 결과 파일 생성 완료: ${result.filename}`);
          // 보고서 생성 완료 후 전역 디렉토리명 초기화
          currentTestDirectoryName = null;
        } else {
          console.error(`[NextTankEnviTestProcess] ❌ 에러로 인한 중단된 테스트 결과 파일 생성 실패:`, result?.error || '알 수 없는 오류');
        }
      } catch (reportError) {
        console.error(`[NextTankEnviTestProcess] ❌ 에러로 인한 중단 보고서 생성 실패:`, reportError.message);
      }
          } catch (fileError) {
        console.error(`[NextTankEnviTestProcess] 에러로 인한 중단된 테스트 결과 파일 생성 중 오류:`, fileError);
      }
      
      // SinglePageProcess 중지가 아닌 일반 에러인 경우에만 에러를 다시 던짐
      if (error.status !== 'stopped_by_singlepage') {
        throw error;
      }
  }
}

/**
 * 모든 사이클의 테스트 결과를 종합하여 디바이스별 G/N 결론 리포트 생성
 * @param {number} cycleNumber - 총 사이클 수
 * @returns {Object} 종합 리포트 생성 결과
 */
async function generateFinalDeviceReport(cycleNumber) {
  try {
    console.log(`[FinalDeviceReport] 디바이스별 종합 리포트 생성 시작 - ${cycleNumber} 사이클`);
    
    // 절대 경로로 Data 폴더 설정
    const dataFolderPath = path.join(process.cwd(), 'Data');
    
    // Data 폴더가 없으면 생성
    if (!fs.existsSync(dataFolderPath)) {
      fs.mkdirSync(dataFolderPath, { recursive: true });
      console.log(`[FinalDeviceReport] Data 폴더 생성됨: ${dataFolderPath}`);
    }
    
    // 모든 날짜별 하위 디렉토리에서 CSV 파일 검색
    const allCsvFiles = [];
    
    // Data 폴더의 모든 하위 디렉토리 검색
    const subDirectories = fs.readdirSync(dataFolderPath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
    
    // Data 폴더 자체에서도 CSV 파일 검색
    const rootFiles = fs.readdirSync(dataFolderPath);
    const rootCsvFiles = rootFiles.filter(file => file.endsWith('.csv') && file.includes('Cycle'));
    allCsvFiles.push(...rootCsvFiles.map(file => ({ file, directory: '' })));
    
    // 각 하위 디렉토리에서 CSV 파일 검색
    for (const subDir of subDirectories) {
      try {
        const subDirPath = path.join(dataFolderPath, subDir);
        const subDirFiles = fs.readdirSync(subDirPath);
        const subDirCsvFiles = subDirFiles.filter(file => file.endsWith('.csv') && file.includes('Cycle'));
        allCsvFiles.push(...subDirCsvFiles.map(file => ({ file, directory: subDir })));
      } catch (error) {
        console.warn(`[FinalDeviceReport] 하위 디렉토리 ${subDir} 읽기 실패:`, error.message);
      }
    }
    
    const csvFiles = allCsvFiles;
    
    console.log(`[FinalDeviceReport] 발견된 CSV 파일 수: ${csvFiles.length}`);
    
    if (csvFiles.length === 0) {
      console.warn(`[FinalDeviceReport] 분석할 CSV 파일이 없음`);
      return { success: false, error: '분석할 CSV 파일이 없음' };
    }
    
    console.log(`[FinalDeviceReport] 검색된 디렉토리: ${csvFiles.map(f => f.directory || 'root').join(', ')}`);
    
    // 디바이스별 G/N 카운트 초기화 (10개 디바이스, 4개 채널)
    const deviceResults = {};
    for (let device = 1; device <= 10; device++) {
      deviceResults[`Device ${device}`] = {
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        channels: {
          'Channel 1 (5V)': { total: 0, passed: 0, failed: 0 },
          'Channel 2 (15V)': { total: 0, passed: 0, failed: 0 },
          'Channel 3 (-15V)': { total: 0, passed: 0, failed: 0 },
          'Channel 4 (24V)': { total: 0, passed: 0, failed: 0 }
        }
      };
    }
    
    // 채널명 매핑 함수
    const getChannelName = (channelIndex) => {
      const channelNames = [
        'Channel 1 (5V)',
        'Channel 2 (15V)', 
        'Channel 3 (-15V)',
        'Channel 4 (24V)'
      ];
      return channelNames[channelIndex] || `Channel ${channelIndex + 1}`;
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
        } else {
          deviceResults[deviceName].failedTests++;
          deviceResults[deviceName].channels[channelName].failed++;
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
          ? path.join(dataFolderPath, directory, filename)
          : path.join(dataFolderPath, filename);
        const fileContent = fs.readFileSync(filePath, 'utf8');
        
        // 파일명에서 사이클 번호와 테스트 유형 추출
        const cycleMatch = filename.match(/Cycle(\d+)/);
        const testTypeMatch = filename.match(/(HighTemp_Test\d+|LowTemp_Test\d+)/);
        
        if (!cycleMatch || !testTypeMatch) {
          console.warn(`[FinalDeviceReport] 파일명 형식 오류: ${filename}`);
          continue;
        }
        
        const cycle = parseInt(cycleMatch[1]);
        const testType = testTypeMatch[1];
        
        console.log(`[FinalDeviceReport] 분석 중: ${filename} (사이클 ${cycle}, ${testType})`);
        
        // CSV 내용에서 G/N 결과 추출
        const lines = fileContent.split('\n');
        let inComparisonSection = false;
        let channelIndex = 0;
        let sectionCount = 0;
        
        console.log(`[FinalDeviceReport] ${filename} 분석 시작 - 총 ${lines.length}줄`);
        
        for (const line of lines) {
          if (line.includes('비교결과 (G=Good, N=Not Good)')) {
            inComparisonSection = true;
            channelIndex = 0;
            sectionCount++;
            console.log(`[FinalDeviceReport] 비교결과 섹션 ${sectionCount} 발견: ${filename}`);
            continue;
          }
          
          if (inComparisonSection && line.startsWith('Channel')) {
            const channelName = getChannelName(channelIndex);
            const results = line.split(',').slice(1); // Device 1~10 결과
            
            console.log(`[FinalDeviceReport] 섹션 ${sectionCount} 채널 ${channelIndex + 1} 분석: ${channelName}, 결과 수: ${results.length}`);
            
            for (let deviceIndex = 0; deviceIndex < Math.min(10, results.length); deviceIndex++) {
              const deviceName = `Device ${deviceIndex + 1}`;
              const result = results[deviceIndex];
              
              if (result && (result === 'G' || result === 'N')) {
                safeUpdateChannel(deviceName, channelName, result);
              } else if (result && result !== '-') {
                console.log(`[FinalDeviceReport] ${deviceName} ${channelName}: 알 수 없는 결과값 '${result}'`);
              }
            }
            channelIndex++;
            
            if (channelIndex >= 4) {
              inComparisonSection = false;
              console.log(`[FinalDeviceReport] 섹션 ${sectionCount} 완료: ${filename}`);
            }
          }
        }
        
        if (sectionCount === 0) {
          console.warn(`[FinalDeviceReport] ${filename}에서 비교결과 섹션을 찾을 수 없음`);
        } else {
          console.log(`[FinalDeviceReport] ${filename}에서 총 ${sectionCount}개의 비교결과 섹션 처리 완료`);
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
            console.log(`[FinalDeviceReport]   ${channelName}: ${channelResult.passed}/${channelResult.total} (${((channelResult.passed / channelResult.total) * 100).toFixed(1)}%)`);
          }
        }
      }
    }
    
    // 디바이스별 최종 결론 생성
    const finalConclusions = {};
    for (const [deviceName, results] of Object.entries(deviceResults)) {
      if (results.totalTests > 0) {
        // 하나라도 N이 있으면 전체 디바이스는 N
        const hasAnyFailure = results.failedTests > 0;
        finalConclusions[deviceName] = {
          conclusion: hasAnyFailure ? 'N' : 'G',
          totalTests: results.totalTests,
          passedTests: results.passedTests,
          failedTests: results.failedTests,
          passRate: ((results.passedTests / results.totalTests) * 100).toFixed(2),
          channels: results.channels
        };
      }
    }
    
    // 종합 리포트 파일 생성
    const reportFilename = `${getFormattedDateTime()}_Final_Device_Report.csv`;
    
    // 전역 변수에서 테스트 디렉토리명 사용 (없으면 새로 생성)
    const dateDirectoryName = currentTestDirectoryName || getDateDirectoryName();
    const dateFolderPath = path.join(dataFolderPath, dateDirectoryName);
    
    if (!fs.existsSync(dateFolderPath)) {
      fs.mkdirSync(dateFolderPath, { recursive: true });
      console.log(`[FinalDeviceReport] 날짜별 디렉토리 생성됨: ${dateFolderPath}`);
    }
    
    const reportFilePath = path.join(dateFolderPath, reportFilename);
    
    let reportContent = '';
    reportContent += `=== 디바이스별 종합 테스트 리포트 ===\n`;
    reportContent += `생성일시,${new Date().toLocaleString('ko-KR')}\n`;
    reportContent += `총 사이클 수,${cycleNumber}\n`;
    reportContent += `분석된 파일 수,${processedFiles}\n`;
    reportContent += `\n`;
    
    // 디바이스별 요약
    reportContent += `디바이스,최종결론,총테스트수,통과수,실패수,통과율,상세결과\n`;
    for (const [deviceName, conclusion] of Object.entries(finalConclusions)) {
      reportContent += `${deviceName},${conclusion.conclusion},${conclusion.totalTests},${conclusion.passedTests},${conclusion.failedTests},${conclusion.passRate}%,`;
      
      // 채널별 상세 결과
      const channelDetails = [];
      for (const [channelName, channelResult] of Object.entries(conclusion.channels)) {
        if (channelResult.total > 0) {
          const channelPassRate = ((channelResult.passed / channelResult.total) * 100).toFixed(1);
          channelDetails.push(`${channelName}: ${channelResult.passed}/${channelResult.total} (${channelPassRate}%)`);
        }
      }
      reportContent += channelDetails.join('; ') + '\n';
    }
    
    // 전체 통계
    const totalDevices = Object.keys(finalConclusions).length;
    const goodDevices = Object.values(finalConclusions).filter(c => c.conclusion === 'G').length;
    const notGoodDevices = Object.values(finalConclusions).filter(c => c.conclusion === 'N').length;
    
    reportContent += `\n`;
    reportContent += `=== 전체 요약 ===\n`;
    reportContent += `총 디바이스 수,${totalDevices}\n`;
    reportContent += `양품(G) 디바이스 수,${goodDevices}\n`;
    reportContent += `불량(N) 디바이스 수,${notGoodDevices}\n`;
    reportContent += `전체 양품률,${totalDevices > 0 ? ((goodDevices / totalDevices) * 100).toFixed(2) : 0}%\n`;
    reportContent += `\n`;
    reportContent += `=== 테스트 조건 ===\n`;
    reportContent += `고온 테스트,10회 (각 사이클당)\n`;
    reportContent += `저온 테스트,10회 (각 사이클당)\n`;
    reportContent += `총 테스트 수,${cycleNumber * 20}회\n`;
    reportContent += `\n`;
    reportContent += `=== 결론 ===\n`;
    reportContent += `모든 디바이스가 G인 경우: 전체 양품\n`;
    reportContent += `하나라도 N인 경우: 해당 디바이스 불량\n`;
    reportContent += `\n`;
    reportContent += `작성자,시스템\n`;
    reportContent += `문서버전,PS-14(Rev.1)\n`;
    reportContent += `회사명,(주)아델피아랩\n`;
    
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
 * 테스트가 중단된 경우에도 생성된 파일들을 기반으로 결과 파일을 생성하고 중단 원인을 기록
 * @param {Object} options - 중단 정보 및 설정
 * @param {string} options.stopReason - 중단 원인 ('manual_stop', 'error', 'system_failure')
 * @param {number} options.stoppedAtCycle - 중단된 사이클 번호
 * @param {string} options.stoppedAtPhase - 중단된 테스트 페이즈
 * @param {string} options.errorMessage - 에러 메시지 (에러 발생 시)
 * @param {Object} options.testSettings - 테스트 설정 정보
 * @param {Array} options.existingFiles - 이미 생성된 파일들의 경로 배열
 * @returns {Object} 결과 파일 생성 결과
 */
export async function generateInterruptedTestResultFile(options) {
  try {
    console.log(`[InterruptedTestResult] 📄 중단 보고서 생성 시작`);
    
    // 기본 옵션 설정
    const {
      stopReason = 'unknown',
      stoppedAtCycle = 1,
      stoppedAtPhase = 'unknown',
      stoppedAtTest = 0,
      errorMessage = '',
      testSettings = {},
      existingFiles = []
    } = options || {};
    
    // 디렉토리 경로 설정 (안전한 처리)
    let dateDirectoryName = currentTestDirectoryName;
    if (!dateDirectoryName) {
      dateDirectoryName = getDateDirectoryName();
      console.log(`[InterruptedTestResult] ⚠️ 전역 디렉토리명이 없어 새로 생성: ${dateDirectoryName}`);
    }
    
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
    
    // 파일명 생성
    const timestamp = getFormattedDateTime();
    const filename = `중단보고서_${stopReason}_${timestamp}.csv`;
    const filePath = path.join(dateFolderPath, filename);
    
    // CSV 내용 생성 (단순화)
    let csvContent = `=== 중단된 테스트 결과 보고서 ===\n`;
    csvContent += `생성 시간,${timestamp}\n`;
    csvContent += `중단 원인,${stopReason}\n`;
    csvContent += `중단 사이클,${stoppedAtCycle}\n`;
    csvContent += `중단 페이즈,${stoppedAtPhase}\n`;
    csvContent += `중단 테스트,${stoppedAtTest}\n`;
    csvContent += `에러 메시지,${errorMessage}\n`;
    csvContent += `\n`;
    
    // 테스트 설정 정보
    if (testSettings && Object.keys(testSettings).length > 0) {
      csvContent += `=== 테스트 설정 ===\n`;
      Object.entries(testSettings).forEach(([key, value]) => {
        csvContent += `${key},${value}\n`;
      });
      csvContent += `\n`;
    }
    
    // 기존 파일 목록
    if (existingFiles && existingFiles.length > 0) {
      csvContent += `=== 생성된 파일 목록 ===\n`;
      existingFiles.forEach(file => {
        const fileName = path.basename(file);
        csvContent += `파일,${fileName}\n`;
      });
      csvContent += `\n`;
    }
    
    // 권장 조치사항 (단순화)
    csvContent += `=== 권장 조치사항 ===\n`;
    csvContent += `1. 중단 상태 확인,시스템 상태 점검\n`;
    csvContent += `2. 데이터 검증,생성된 파일 확인\n`;
    csvContent += `3. 테스트 재시작,필요시 재시작\n`;
    
    // 파일 저장 (안전한 처리)
    try {
      fs.writeFileSync(filePath, csvContent, 'utf8');
      
      // 파일 존재 여부 확인
      if (!fs.existsSync(filePath)) {
        throw new Error('파일이 생성되지 않음');
      }
      
      console.log(`[InterruptedTestResult] ✅ 중단 보고서 생성 완료: ${filename}`);
      console.log(`[InterruptedTestResult] 📁 파일 경로: ${filePath}`);
      
    } catch (writeError) {
      console.error(`[InterruptedTestResult] ❌ 파일 저장 실패:`, writeError.message);
      throw new Error(`파일 저장 실패: ${writeError.message}`);
    }
    
    // 보고서 생성 완료 - 전역 디렉토리명은 호출하는 쪽에서 관리
    
    return { 
      success: true, 
      filename,
      filePath,
      stopReason,
      stoppedAtCycle,
      stoppedAtPhase,
      stoppedAtTest
    };
    
  } catch (error) {
    console.error('[InterruptedTestResult] ❌ 중단 보고서 생성 실패:', error.message);
    
    // 에러 발생 시에도 간단한 로그 파일 생성
    try {
      const errorLogPath = path.join(process.cwd(), 'Data', 'error-log.txt');
      const errorContent = `[${new Date().toISOString()}] 중단 보고서 생성 실패\n에러: ${error.message}\n`;
      fs.writeFileSync(errorLogPath, errorContent, 'utf8');
    } catch (logError) {
      console.error('[InterruptedTestResult] ❌ 에러 로그 생성도 실패');
    }
    
    return { 
      success: false, 
      error: error.message
    };
  }
}

// 전역 테이블 데이터 저장소 추가
let globalTableData = {
  devices: Array.from({ length: 10 }, (_, deviceIndex) => ({
    deviceNumber: deviceIndex + 1,
    tests: Array.from({ length: 3 }, (_, testIndex) => ({
      testNumber: testIndex + 1,
      channels: Array.from({ length: 4 }, (_, channelIndex) => ({
        channelNumber: channelIndex + 1,
        voltage: null,
        timestamp: null,
        status: 'pending'
      }))
    }))
  })),
  lastUpdate: null,
  isComplete: false
};

// 전압 데이터를 테이블에 업데이트하는 함수
export function updateTableData(deviceNumber, testNumber, channelNumber, voltage, status = 'completed') {
  try {
    if (deviceNumber >= 1 && deviceNumber <= 10 && 
        testNumber >= 1 && testNumber <= 3 && 
        channelNumber >= 1 && channelNumber <= 4) {
      
      globalTableData.devices[deviceNumber - 1].tests[testNumber - 1].channels[channelNumber - 1] = {
        channelNumber,
        voltage: voltage,
        timestamp: new Date().toISOString(),
        status: status
      };
      
      globalTableData.lastUpdate = new Date().toISOString();
      
      console.log(`[TableData] Device ${deviceNumber}, Test ${testNumber}, Channel ${channelNumber}: ${voltage}V (${status})`);
      
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
export function broadcastTableData() {
  if (!globalWss) {
    console.warn(`[TableData] 전역 WebSocket 서버가 설정되지 않음`);
    return;
  }
  
  try {
    // 시간 기반 디바운싱 제거 - 이벤트 기반 전송으로 변경
    
    // 테이블 완성도 계산
    let totalCells = 0;
    let completedCells = 0;
    
    globalTableData.devices.forEach(device => {
      device.tests.forEach(test => {
        test.channels.forEach(channel => {
          totalCells++;
          if (channel.status === 'completed' && channel.voltage !== null) {
            completedCells++;
          }
        });
      });
    });
    
    const completionPercentage = totalCells > 0 ? (completedCells / totalCells) * 100 : 0;
    
    // 전송할 테이블 데이터 구성
    const tableDataForClient = {
      timestamp: globalTableData.lastUpdate || new Date().toISOString(),
      totalDevices: 10,
      totalTests: 3,
      totalChannels: 4,
      completionPercentage: completionPercentage,
      completedCells: completedCells,
      totalCells: totalCells,
      tableData: globalTableData.devices.map(device => 
        device.tests.map(test => 
          test.channels.map(channel => {
            if (channel.status === 'completed' && channel.voltage !== null) {
              return `${channel.voltage.toFixed(2)}V`;
            } else {
              return '-.-';
            }
          })
        )
      ),
      summary: {
        totalCells: totalCells,
        completedCells: completedCells,
        status: completionPercentage >= 95 ? 'completed' : 'in_progress'
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
    
    console.log(`[TableData] 테이블 데이터 전송 완료 - 클라이언트 수: ${sentCount}, 완성도: ${completionPercentage.toFixed(1)}%`);
    
    // 테이블이 완성되면 완성 메시지도 전송
    if (completionPercentage >= 95 && !globalTableData.isComplete) {
      globalTableData.isComplete = true;
      const completeMessage = `[POWER_TABLE_COMPLETE] ${JSON.stringify(tableDataForClient)}`;
      
      globalWss.clients.forEach(client => {
        if (client.readyState === 1) {
          client.send(completeMessage);
        }
      });
      
      console.log(`[TableData] 테이블 완성 알림 전송`);
    }
    
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
        channels: Array.from({ length: 4 }, (_, channelIndex) => ({
          channelNumber: channelIndex + 1,
          voltage: null,
          timestamp: null,
          status: 'pending'
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


