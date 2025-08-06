import { SerialPort } from 'serialport';
import { promises as fs } from 'fs';

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
    return usbSettings.relay; // relay 포트 사용
  } catch (error) {
    // console.error('Failed to load USB port settings, using default:', error.message);
    return '/dev/ttyUSB3'; // 기본값
  }
}

const BAUD_RATE = 9600;
const RESPONSE_TIMEOUT_MS = 1000;

// Serial port manager to ensure only one connection at a time
let currentPort = null;
let portInUse = false;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
                portInUse = false;
                resolve();
            });
        });
    }
    portInUse = false;
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
    portInUse = false;
}

/**
 * 포트 사용 가능할 때까지 대기 (최대 10초)
 */
async function waitForPortAvailability(maxWaitTime = 10000) {
    const startTime = Date.now();
    while (portInUse && (Date.now() - startTime) < maxWaitTime) {
        console.log('[시리얼 포트] 포트 사용 중, 대기 중...');
        await sleep(500);
    }
    
    if (portInUse) {
        console.warn('[시리얼 포트] 포트 대기 시간 초과, 강제 해제');
        await forceReleasePort();
    }
}

export async function RelayDevice(commandToSend) {
    // Wait if port is in use with timeout
    await waitForPortAvailability();

    portInUse = true;

    return new Promise(async (resolve, reject) => {
        try {
            // Close any existing port first
            await closeCurrentPort();

            // 동적으로 포트 경로 가져오기
            const portPath = await getPortPath();

            currentPort = new SerialPort({
                path: portPath,
                baudRate: BAUD_RATE
            });

            // MODBUS RTU용 데이터 수신 처리
            let dataBuffer = Buffer.alloc(0);
            let timeoutId;
            let receivedResponse = false;

            // --- 데이터 수신 핸들러 ---
            currentPort.on('data', data => {
                // 수신된 데이터를 버퍼에 추가
                dataBuffer = Buffer.concat([dataBuffer, data]);
                
                            // 상세한 수신 데이터 로깅
            // console.log(`[시리얼 포트] 새로 수신된 데이터: ${data.toString('hex').toUpperCase()}`);
            // console.log(`[시리얼 포트] 누적 버퍼 크기: ${dataBuffer.length} 바이트`);
            // console.log(`[시리얼 포트] 전체 버퍼 (HEX): ${dataBuffer.toString('hex').toUpperCase()}`);
                
                // 바이트별 상세 정보 출력
                if (dataBuffer.length > 0) {
                    let byteDetails = '[시리얼 포트] 바이트별 분석: ';
                    for (let i = 0; i < Math.min(dataBuffer.length, 10); i++) {
                        byteDetails += `[${i}]=0x${dataBuffer[i].toString(16).padStart(2, '0').toUpperCase()} `;
                    }
                    if (dataBuffer.length > 10) {
                        byteDetails += `... (총 ${dataBuffer.length}바이트)`;
                    }
                    // console.log(byteDetails);
                }
                
                // MODBUS RTU 응답 길이 검증 및 파싱
                if (!receivedResponse && dataBuffer.length >= 4) {
                    const slaveAddress = dataBuffer[0];
                    const functionCode = dataBuffer[1];
                    
                    // console.log(`[MODBUS RTU] 슬레이브 주소: 0x${slaveAddress.toString(16).padStart(2, '0').toUpperCase()}`);
                    // console.log(`[MODBUS RTU] 함수 코드: 0x${functionCode.toString(16).padStart(2, '0').toUpperCase()}`);
                    
                    // 함수 코드별 예상 응답 길이 확인
                    let expectedLength = 0;
                    
                    if (functionCode === 0x06) {
                        // Write Single Register 성공 응답: 8바이트
                        expectedLength = 8;
                        // console.log(`[MODBUS RTU] Write Single Register 성공 응답 예상: ${expectedLength}바이트`);
                    } else if (functionCode === 0x86) {
                        // Write Single Register 에러 응답: 5바이트
                        expectedLength = 5;
                        // console.log(`[MODBUS RTU] Write Single Register 에러 응답 예상: ${expectedLength}바이트`);
                    } else {
                        // console.log(`[MODBUS RTU] 알 수 없는 함수 코드: 0x${functionCode.toString(16).padStart(2, '0').toUpperCase()}`);
                    }
                    
                    // 예상 길이에 도달했는지 확인
                    if (expectedLength > 0 && dataBuffer.length >= expectedLength) {
                        receivedResponse = true;
                        // console.log(`[시리얼 포트] ===== MODBUS RTU 응답 완료 =====`);
                        // console.log(`[시리얼 포트] 예상 길이: ${expectedLength}바이트, 실제 수신: ${dataBuffer.length}바이트`);
                        // console.log(`[시리얼 포트] 완전한 응답 (HEX): ${dataBuffer.toString('hex').toUpperCase()}`);
                        
                        // 완전한 응답만 파싱
                        const completeResponse = dataBuffer.slice(0, expectedLength);
                        
                        // CRC 검증
                        const calculatedCRC = calculateCRC16(completeResponse.slice(0, -2));
                        const receivedCRC = completeResponse.readUInt16LE(completeResponse.length - 2);
                        
                        if (calculatedCRC === receivedCRC) {
                            // console.log(`[MODBUS RTU] CRC 검증 성공: 0x${calculatedCRC.toString(16).padStart(4, '0').toUpperCase()}`);
                            
                            // 응답 파싱
                            const parsedResponse = parseModbusRTUResponse(completeResponse);
                            clearTimeout(timeoutId);
                            resolve(parsedResponse);
                            closeCurrentPort();
                        } else {
                            // console.log(`[MODBUS RTU] CRC 검증 실패: 계산값=0x${calculatedCRC.toString(16).padStart(4, '0').toUpperCase()}, 수신값=0x${receivedCRC.toString(16).padStart(4, '0').toUpperCase()}`);
                            clearTimeout(timeoutId);
                            resolve('crc_error');
                            closeCurrentPort();
                        }
                    }
                }
            });

            // --- 에러 핸들러 ---
            currentPort.on('error', err => {
                console.error(`[시리얼 포트] 에러: ${err.message}`);
                clearTimeout(timeoutId); // 에러 발생 시 타임아웃 해제
                
                // 포트 강제 해제
                forceReleasePort();
                
                // 특정 에러에 대한 재시도 로직
                if (err.message.includes('Cannot lock port') || err.message.includes('Resource temporarily unavailable')) {
                    console.warn('[시리얼 포트] 포트 잠금 에러 발생, 3초 후 재시도');
                    setTimeout(async () => {
                        try {
                            await forceReleasePort();
                            await sleep(5000);
                            // 재시도는 상위 함수에서 처리
                        } catch (retryError) {
                            console.error('[시리얼 포트] 재시도 중 에러:', retryError.message);
                        }
                    }, 100);
                }
                
                reject(`에러: ${err.message}`);
            });

            // --- 포트 열림 핸들러 ---
            currentPort.on('open', () => {
                // console.log(`[시리얼 포트] ${portPath} 포트가 ${BAUD_RATE}bps로 열렸습니다.`);

                // 타임아웃 설정
                timeoutId = setTimeout(() => {
                    if (!receivedResponse) {
                        // console.warn('[시리얼 포트] 응답 타임아웃 발생.');
                        resolve('timeout'); // 응답이 오지 않으면 'timeout' 반환
                        closeCurrentPort(); // 타임아웃 시 포트 닫기
                    }
                }, RESPONSE_TIMEOUT_MS);

                // --- 데이터 전송 ---
                currentPort.write(commandToSend, err => {
                    if (err) {
                        // console.error(`[시리얼 포트] 데이터 전송 에러: ${err.message}`);
                        clearTimeout(timeoutId);
                        reject(`데이터 전송 에러: ${err.message}`);
                        closeCurrentPort();
                    } else {
                        //console.log(`[시리얼 포트] 데이터 전송 완료: '${commandToSend}'`);
                    }
                });
            });

            // --- 포트 닫힘 핸들러 ---
            currentPort.on('close', () => {
                //console.log(`[시리얼 포트] ${portPath} 포트가 닫혔습니다.`);
                portInUse = false;
            });

        } catch (error) {
            portInUse = false;
            reject(error);
        }
    });
}

export async function RelayAllOff() {
    const numToSend = DeviceOff.length;
    for (let i = 0; i < numToSend; i++) {
        const str = DeviceOff[i];
        const hexBuffer = Buffer.from(str, 'hex');

        try {
          // console.log(`[${i + 1}/${numToSend}] "${str}" 전송 중...`);
          await RelayDevice(hexBuffer);
          // console.log(`[${i + 1}/${numToSend}] "${str}" 전송 완료.`);
          await sleep(1000); // 2초 대기
        } catch (error) {
          // console.error(`오류: "${str}" 전송 중 문제가 발생했습니다:`, error);
        }
    }
}

export async function SelectDevice(deviceNumber) {
    const str = DeviceOn[deviceNumber-1];
    const hexBuffer = Buffer.from(str, 'hex');
    await sleep(2000); // 2초 대기
    
    try {
        const result = await RelayDevice(hexBuffer);
        
        // RelayDevice의 결과를 확인
        if (result && result.isValid) {
            console.log(`[SelectDevice] Device ${deviceNumber} selected successfully`);
            await sleep(2000); // 2초 대기
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
    const str = DeviceOn[deviceNumber-1];
    const hexBuffer = Buffer.from(str, 'hex');
    await RelayDevice(hexBuffer);
    await sleep(2000); // 2초 대기
}

export async function SelectDeviceOff(deviceNumber) {
    const str = DeviceOff[deviceNumber-1];
    const hexBuffer = Buffer.from(str, 'hex');
    await RelayDevice(hexBuffer);
    await sleep(2000); // 2초 대기
}






