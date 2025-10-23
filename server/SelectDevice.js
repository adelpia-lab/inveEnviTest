import { SerialPort } from 'serialport';
import { promises as fs } from 'fs';
import { sleep } from './utils/common.js';
/*
const DeviceOn=[
    "010600010100D99A", "010600020100299A", "010600030100785A", "010600040100C99B",
    "010600050100985B", "020600010100D9A9", "02060002010029A9", "0206000301007869",
    "020600040100C9A8", "0206000501009868"
];

const DeviceOff=[
    "010600010200D96A", "010600020200296A", "01060003020078AA", "010600040200C96B",
    "01060005020098AB", "020600010200D959", "0206000202002959", "0206000302007899",
    "020600040200C958", "0206000502009898"
];
*/
const DeviceAOn=[
    "010600010100D99A", "010600020100299A", "010600030100785A", "010600040100C99B",
    "010600050100985B", "0106000601005B68", "0106000701009B39", "0106000801009809" 
];
const DeviceBOn=[
    "020600010100D9A9", "02060002010029A9", "0206000301007869", "020600040100C9A8", 
    "0206000501009868", "0206000601006868", "020600070100A839", "020600080100AB09" 
];

const DeviceAOff=[
    "010600010200D96A", "010600020200296A", "01060003020078AA", "010600040200C96B", 
    "01060005020098AB", "010600060200AB68", "0106000702006B39", "0106000802006809"
];
const DeviceBOff=[
    "020600010200D959", "0206000202002959", "0206000302007899", "020600040200C958",
    "0206000502009898", "0206000602009868", "0206000702005839", "0206000802005809"
];

// --- 시리얼 포트 설정 ---
// USB 포트 설정을 파일에서 읽어오는 함수
async function loadUsbPortSettings() {
  try {
    const data = await fs.readFile('usb_port_settings.json', 'utf-8');
    const settings = JSON.parse(data);
    
    // 영문 키가 모두 있는지 확인
    if (settings.chamber && settings.power && settings.load && settings.relay) {
      return settings;
    } else {
      // 기본값 반환 (한글 키가 있거나 영문 키가 누락된 경우)
      const defaultSettings = {
        chamber: 'ttyUSB1',
        power: 'ttyUSB3',
        load: 'ttyUSB2',
        relay: 'ttyUSB0'
      };
      return defaultSettings;
    }
  } catch (error) {
    // 기본값
    const defaultSettings = {
      chamber: 'ttyUSB1',
      power: 'ttyUSB3',
      load: 'ttyUSB2',
      relay: 'ttyUSB0'
    };
    return defaultSettings;
  }
}

// 동적으로 PORT_PATH를 가져오는 함수
async function getPortPath() {
  try {
    const usbSettings = await loadUsbPortSettings();
    const relayPort = usbSettings.relay;
    
    // Windows COM 포트인지 확인 (COM1-COM20 범위)
    if (relayPort && relayPort.startsWith('COM')) {
      const comNumber = parseInt(relayPort.substring(3));
      if (comNumber >= 1 && comNumber <= 20) {
        console.log(`[SelectDevice] Using Windows COM port: ${relayPort}`);
        return relayPort;
      } else {
        console.warn(`[SelectDevice] Invalid COM port number: ${relayPort}, using default COM6`);
        return 'COM6';
      }
    }
    
    // Linux 스타일 포트인 경우
    if (relayPort && relayPort.startsWith('/dev/')) {
      console.log(`[SelectDevice] Using Linux port: ${relayPort}`);
      return relayPort;
    }
    
    // 기본값 (Windows COM 포트)
    console.log(`[SelectDevice] Using default COM port: COM6`);
    return 'COM6';
  } catch (error) {
    console.error('[SelectDevice] Failed to load USB port settings, using default:', error.message);
    return 'COM6'; // Windows 기본값
  }
}

const BAUD_RATE = 9600;
const RESPONSE_TIMEOUT_MS = 3000; // 3초로 증가

// Serial port manager to ensure only one connection at a time
let currentPort = null;
let portInUse = false;
let portLockTimeout = null;
// Serialize all RelayDevice calls to prevent concurrent port open/write
let relayQueue = Promise.resolve();

// 버퍼 클리어 함수 추가
async function clearPortBuffer(port) {
    return new Promise((resolve) => {
        if (port && port.isOpen) {
            // 수신 버퍼 클리어
            port.flush();
            // 약간의 지연 후 클리어 완료
            setTimeout(() => {
                resolve();
            }, 50);
        } else {
            resolve();
        }
    });
}


// 포트 잠금 해제 함수 추가
function clearPortLock() {
    if (portLockTimeout) {
        clearTimeout(portLockTimeout);
        portLockTimeout = null;
    }
    portInUse = false;
}

// 포트 잠금 설정 함수 추가
function setPortLock(duration = 5000) {
    portInUse = true;
    clearPortLock();
    portLockTimeout = setTimeout(() => {
        console.warn('[시리얼 포트] 포트 잠금 시간 초과, 자동 해제');
        portInUse = false;
    }, duration);
}

function hexToDecimal(hexString) {
    return parseInt(hexString, 16);
}

// MODBUS CRC16 계산 함수
function calculateCRC16(data) {
    let crc = 0xFFFF;
    for (let i = 0; i < data.length; i++) {
        crc ^= data[i];
        for (let j = 0; j < 8; j++) {
            if (crc & 0x0001) {
                crc = (crc >> 1) ^ 0xA001;
            } else {
                crc = crc >> 1;
            }
        }
    }
    return crc;
}

// MODBUS RTU 응답 파싱 함수
function parseModbusRTUResponse(responseBuffer) {
    if (responseBuffer.length < 4) {
        // console.warn(`[MODBUS RTU] 응답 길이 부족: ${responseBuffer.length} 바이트`);
        return { isValid: false, error: '응답 길이 부족' };
    }

    // CRC 검증
    const dataWithoutCRC = responseBuffer.slice(0, -2);
    const receivedCRC = responseBuffer.readUInt16LE(responseBuffer.length - 2);
    const calculatedCRC = calculateCRC16(dataWithoutCRC);
    
    if (receivedCRC !== calculatedCRC) {
        // console.warn(`[MODBUS RTU] CRC 불일치: 수신=${receivedCRC.toString(16)}, 계산=${calculatedCRC.toString(16)}`);
        return { isValid: false, error: 'CRC 불일치' };
    }

    // MODBUS 응답 구조 파싱
    const slaveAddress = responseBuffer[0];
    const functionCode = responseBuffer[1];
    
                        // console.log(`[MODBUS RTU] 슬레이브 주소: ${slaveAddress}, 함수 코드: ${functionCode}`);

    // 함수 코드별 응답 처리
    switch (functionCode) {
        case 0x06: // Write Single Register 응답
            if (responseBuffer.length === 8) {
                const registerAddress = responseBuffer.readUInt16BE(2);
                const registerValue = responseBuffer.readUInt16BE(4);
                // console.log(`[MODBUS RTU] 레지스터 쓰기 성공: 주소=${registerAddress}, 값=${registerValue}`);
                return { 
                    isValid: true, 
                    type: 'write_single_register',
                    slaveAddress,
                    registerAddress,
                    registerValue
                };
            }
            break;
            
        case 0x86: // Write Single Register 에러 응답
            if (responseBuffer.length === 5) {
                const errorCode = responseBuffer[2];
                // console.error(`[MODBUS RTU] 레지스터 쓰기 에러: 코드=${errorCode}`);
                return { 
                    isValid: false, 
                    error: `MODBUS 에러 코드: ${errorCode}`,
                    errorCode
                };
            }
            break;
            
        default:
            // console.warn(`[MODBUS RTU] 지원하지 않는 함수 코드: ${functionCode}`);
            return { isValid: false, error: `지원하지 않는 함수 코드: ${functionCode}` };
    }

    return { isValid: false, error: '알 수 없는 응답 형식' };
}

// Function to close current port if it exists
async function closeCurrentPort() {
    if (currentPort && currentPort.isOpen) {
        return new Promise((resolve) => {
            currentPort.close((err) => {
                if (err) {
                    console.error(`[시리얼 포트] 포트 닫기 에러: ${err.message}`);
                } else {
                    // console.log(`[시리얼 포트] 포트가 닫혔습니다.`);
                }
                currentPort = null;
                clearPortLock(); // 포트 잠금 해제
                resolve();
            });
        });
    }
    clearPortLock(); // 포트 잠금 해제
}

/**
 * 포트 강제 해제 함수 (에러 발생 시 사용)
 */
async function forceReleasePort() {
    console.warn('[시리얼 포트] 포트 강제 해제 시도');
    if (currentPort) {
        try {
            if (currentPort.isOpen) {
                currentPort.close();
            }
        } catch (error) {
            console.error('[시리얼 포트] 포트 강제 해제 중 에러:', error.message);
        }
        currentPort = null;
    }
    clearPortLock(); // 포트 잠금 해제
}

/**
 * 포트 상태 확인 및 초기화 함수
 */
async function checkAndResetPort() {
    console.log('[시리얼 포트] 포트 상태 확인 중...');
    
    // 현재 포트가 열려있으면 닫기
    if (currentPort && currentPort.isOpen) {
        console.log('[시리얼 포트] 열린 포트 발견, 닫는 중...');
        try {
            currentPort.close();
            await sleep(1000); // 포트 닫힘 대기
        } catch (error) {
            console.error('[시리얼 포트] 포트 닫기 중 에러:', error.message);
        }
    }
    
    // 포트 잠금 해제
    clearPortLock();
    
    // 추가 대기 시간
    await sleep(2000);
    
    console.log('[시리얼 포트] 포트 상태 초기화 완료');
}

/**
 * 포트 사용 가능할 때까지 대기 (최대 10초)
 */
async function waitForPortAvailability(maxWaitTime = 15000) {
    const startTime = Date.now();
    let waitCount = 0;
    
    while (portInUse && (Date.now() - startTime) < maxWaitTime) {
        waitCount++;
        console.log(`[시리얼 포트] 포트 사용 중, 대기 중... (${waitCount})`);
        await sleep(1000); // 1초씩 대기
        
        // 5초마다 포트 상태 강제 확인
        if (waitCount % 5 === 0) {
            console.log('[시리얼 포트] 포트 상태 강제 확인 중...');
            await forceReleasePort();
        }
    }
    
    if (portInUse) {
        console.warn('[시리얼 포트] 포트 대기 시간 초과, 강제 해제');
        await forceReleasePort();
        // 강제 해제 후 추가 대기
        await sleep(2000);
    }
    
    console.log('[시리얼 포트] 포트 사용 가능 확인됨');
}

async function RelayDeviceCore(commandToSend) {
    // Wait if port is in use with timeout (kept for safety, but queue already serializes)
    await waitForPortAvailability();

    // 포트 상태 초기화
    await checkAndResetPort();

    setPortLock(); // 포트 잠금 설정

    return new Promise(async (resolve) => {
        let isResolved = false; // 중복 resolve 방지

        const safeResolve = (result) => {
            if (!isResolved) {
                isResolved = true;
                clearPortLock(); // 포트 잠금 해제
                resolve(result);
            }
        };

        try {
            // Close any existing port first
            await closeCurrentPort();

            // 동적으로 포트 경로 가져오기
            const portPath = await getPortPath();
            console.log(`[RelayDevice] Attempting to connect to port: ${portPath}`);

            const port = new SerialPort({
                path: portPath,
                baudRate: BAUD_RATE
            });
            currentPort = port; // 추적용 전역 포인터 업데이트

            // --- 에러 핸들러 ---
            port.on('error', err => {
                console.error(`[시리얼 포트] 에러: ${err.message}`);

                // 현재 인스턴스에 대해서만 정리
                try {
                    if (port.isOpen) {
                        port.close();
                    }
                } catch {}
                if (currentPort === port) {
                    currentPort = null;
                }

                const errorMessage = `Serial port error: ${err.message}`;
                console.error(`[RelayDevice] ${errorMessage}`);
                safeResolve({ isValid: false, error: errorMessage, type: 'port_error' });
            });

            // --- 포트 열림 핸들러 ---
            port.on('open', () => {
                console.log(`[시리얼 포트] ${portPath} 포트가 ${BAUD_RATE}bps로 열렸습니다.`);

                // --- 데이터 전송 ---
                // 송신 전 버퍼 클리어
                clearPortBuffer(port).then(() => {
                    // 가드: 포트가 유효하고 열려있는지 확인
                    if (!port || !port.isOpen) {
                        const errorMessage = 'Port is not open for writing';
                        console.error(`[RelayDevice] ${errorMessage}`);
                        safeResolve({ isValid: false, error: errorMessage, type: 'port_not_open' });
                        return;
                    }

                    port.write(commandToSend, err => {
                        if (err) {
                            console.error(`[시리얼 포트] 데이터 전송 에러: ${err.message}`);
                            const errorMessage = `Data transmission error: ${err.message}`;
                            console.error(`[RelayDevice] ${errorMessage}`);
                            safeResolve({ isValid: false, error: errorMessage, type: 'transmission_error' });
                            try {
                                if (port.isOpen) {
                                    port.close();
                                }
                            } catch {}
                        } else {
                            console.log(`[시리얼 포트] 데이터 전송 완료: '${commandToSend.toString('hex').toUpperCase()}'`);

                            // 명령 전송 후 즉시 성공 응답 반환
                            safeResolve({ isValid: true, type: 'command_sent', message: 'Command sent successfully' });

                            // 포트 닫기 (비동기로 처리)
                            setTimeout(() => {
                                try {
                                    if (port.isOpen) {
                                        port.close();
                                    }
                                } catch {}
                            }, 100);
                        }
                    });
                });
            });

            // --- 포트 닫힘 핸들러 ---
            port.on('close', () => {
                console.log(`[시리얼 포트] ${portPath} 포트가 닫혔습니다.`);
                if (currentPort === port) {
                    currentPort = null;
                }
                clearPortLock(); // 포트 잠금 해제
            });

        } catch (error) {
            const errorMessage = `Setup error: ${error.message}`;
            console.error(`[RelayDevice] ${errorMessage}`);
            safeResolve({ isValid: false, error: errorMessage, type: 'setup_error' });
        }
    });
}

export function RelayDevice(commandToSend) {
    // 순차 실행 보장: 이전 작업이 끝난 뒤에만 새 작업 실행
    const job = () => RelayDeviceCore(commandToSend);
    const p = relayQueue.then(job, job);
    // 오류가 나도 다음 작업을 막지 않도록 체인을 복구
    relayQueue = p.catch(() => {});
    return p;
}

export async function RelayAllOff() {

    for (let i = 1; i < 9; i++) {
        try {
          await RelayOff('A', i );
          await sleep(250); // 0.25초 대기
          await RelayOff('B', i );
          await sleep(250); // 0.25초 대기
        } catch (error) {
          console.error(`오류: RelayAllOff 중 문제가 발생했습니다:`, error);
        }
    }
}

export async function SelectDevice(deviceNumber) {
    const str = DeviceOn[deviceNumber-1];
    const hexBuffer = Buffer.from(str, 'hex');
    await sleep(1000); // 2초 대기
    
    try {
        const result = await RelayDevice(hexBuffer);
        
        // RelayDevice의 결과를 확인
        if (result && result.isValid) {
            console.log(`[SelectDevice] Device ${deviceNumber} selected successfully`);
            await sleep(1000); // 2초 대기
            return { success: true, message: `Device ${deviceNumber} selected successfully` };
        } else {
            console.error(`[SelectDevice] Device ${deviceNumber} selection failed:`, result);
            throw new Error(result?.error || 'Unknown error');
        }
    } catch (error) {
        console.error(`[SelectDevice] Error selecting device ${deviceNumber}:`, error.message);
        throw error;
    }
}

export async function SelectDeviceOn(deviceNumber) {
    
    try {
        
        await RelayOn('A', deviceNumber);
        await RelayOn('B', deviceNumber);
        await RelayOn('B', deviceNumber+3);
        return { success: true, message: `Device ${deviceNumber} turned ON successfully` };
    } catch (error) {
        console.error(`[SelectDeviceOn] Error turning ON device ${deviceNumber}:`, error.message);
        return { 
            success: false, 
            message: `SelectDeviceOn ${deviceNumber} error: ${error.message}`, 
            error: error.message 
        };
    }
}

export async function SelectDeviceOff(deviceNumber) {   
    try {       
        await RelayOff('B', deviceNumber);
        await RelayOff('B', deviceNumber+3);
        await RelayOff('A', deviceNumber);
        return { success: true, message: `Device ${deviceNumber} turned OFF successfully` };
    } catch (error) {
        console.error(`[SelectDeviceOff] Error turning Off device ${deviceNumber}:`, error.message);
        return { 
            success: false, 
            message: `SelectDeviceOff ${deviceNumber} error: ${error.message}`, 
            error: error.message 
        };
    }
}

export async function RelayOn(AorB, deviceNumber) {
    const str = AorB === 'A' ? DeviceAOn[deviceNumber-1] : DeviceBOn[deviceNumber-1];
    const hexBuffer = Buffer.from(str, 'hex');
    
    try {
        console.log(`[SelectDeviceOn] Attempting to turn ON device ${deviceNumber} with command: ${str}`);
        const result = await RelayDevice(hexBuffer);
        
        console.log(`[SelectDeviceOn] RelayDevice result:`, result);
        
        // RelayDevice의 결과를 확인
        if (result && result.isValid) {
            console.log(`[SelectDeviceOn] Device ${deviceNumber} turned ON successfully`);
            return { success: true, message: `Device ${deviceNumber} turned ON successfully` };
        } else {
            const errorMessage = result?.error || 'Unknown error';
            console.error(`[SelectDeviceOn] Device ${deviceNumber} ON failed:`, result);
            return { 
                success: false, 
                message: `Device ${deviceNumber} ON failed: ${errorMessage}`, 
                error: errorMessage 
            };
        }
    } catch (error) {
        console.error(`[SelectDeviceOn] Error turning ON device ${deviceNumber}:`, error.message);
        return { 
            success: false, 
            message: `Device ${deviceNumber} ON error: ${error.message}`, 
            error: error.message 
        };
    }
}

export async function RelayOff(AorB, deviceNumber) {
    const str = AorB === 'A' ? DeviceAOff[deviceNumber-1] : DeviceBOff[deviceNumber-1];
    const hexBuffer = Buffer.from(str, 'hex');
    
    try {
        console.log(`[SelectDeviceOn] Attempting to turn ON device ${deviceNumber} with command: ${str}`);
        const result = await RelayDevice(hexBuffer);
        
        console.log(`[SelectDeviceOn] RelayDevice result:`, result);
        
        // RelayDevice의 결과를 확인
        if (result && result.isValid) {
            console.log(`[SelectDeviceOn] Device ${deviceNumber} turned ON successfully`);
            return { success: true, message: `Device ${deviceNumber} turned ON successfully` };
        } else {
            const errorMessage = result?.error || 'Unknown error';
            console.error(`[SelectDeviceOn] Device ${deviceNumber} ON failed:`, result);
            return { 
                success: false, 
                message: `Device ${deviceNumber} ON failed: ${errorMessage}`, 
                error: errorMessage 
            };
        }
    } catch (error) {
        console.error(`[SelectDeviceOn] Error turning ON device ${deviceNumber}:`, error.message);
        return { 
            success: false, 
            message: `Device ${deviceNumber} ON error: ${error.message}`, 
            error: error.message 
        };
    }
}

