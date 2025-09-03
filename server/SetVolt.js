// serialport 라이브러리 임포트
// 전압을 설정한

// command string = 'SOUR:VOLT:LEV:IMM:AMP 18'
// command string = 'OUTP:STAT:IMM: ON'
// command string = 'OUTP:STAT:IMM: OFF'

// OUTP ON OFF 명령이 수행 되지 않으므로 0v 로 디체 한다. 
const Q_Power = "*IDN?";
const Q_Power_Response = "KIKUSUI,PWR401L,DP001131,VER01.25 BLD0057";

const PWR_ON = 'OUTP:STAT:IMM: ON';
const PWR_OFF = 'OUTP:STAT:IMM: OFF';

import { SerialPort } from 'serialport';
import { promises as fs } from 'fs';

// --- 시리얼 포트 설정 ---
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

// USB 포트 설정을 파일에서 읽어오는 함수
async function loadUsbPortSettings() {
  try {
    const data = await fs.readFile('usb_port_settings.json', 'utf-8');
    const settings = JSON.parse(data);
    
    // 영문 키가 모두 있는지 확인
    if (settings.chamber && settings.power && settings.load && settings.relay) {
      return settings;
    } else {
      throw new Error('USB port settings file is missing required keys');
    }
  } catch (error) {
    throw error;
  }
}

// 동적으로 PORT_PATH를 가져오는 함수
async function getPortPath() {
  const usbSettings = await loadUsbPortSettings();
  return usbSettings.power;
}

const BAUD_RATE = 19200; // 장치에 맞는 보드 레이트를 설정하세요.
const RESPONSE_TIMEOUT_MS = 2000; // 응답을 기다릴 최대 시간 (밀리초)

/**
 * 입력값이 숫자일 경우 해당 숫자를 전압으로 하여 명령 문자열을 생성하고,
 * 시리얼 포트로 전송합니다.
 *
 * @param {number} voltValue 전압 값 (예: 0, 18, 24, 30)
 * @param {number} timeoutMs 타임아웃 시간 (밀리초, 기본값: 5000ms)
 * @returns {Promise<boolean>} 전송 성공 시 true, 실패 시 에러 발생
 */
export async function SendVoltCommand(voltValue, timeoutMs = 5000) {
    if (typeof voltValue !== 'number' || !Number.isFinite(voltValue)) {
        throw new Error(`voltValue는 숫자여야 합니다. 입력값: ${voltValue}`);
    }
    
    if (voltValue < 0 || voltValue > 100) {
        throw new Error(`voltValue는 0-100V 범위여야 합니다. 입력값: ${voltValue}V`);
    }
    
    // 명령 문자열 생성
    const serialCommand = `SOUR:VOLT:LEV:IMM:AMPL ${voltValue}`;
    const commandWithCRLF = serialCommand + '\r\n';

    return new Promise(async (resolve, reject) => {
        let port;
        let timeoutId;
        let isResolved = false;
        
        try {
            const portPath = await getPortPath();
            port = new SerialPort({
                path: portPath,
                baudRate: BAUD_RATE,
                autoOpen: false // 수동으로 포트 열기
            });

            // 타임아웃 설정
            timeoutId = setTimeout(() => {
                if (!isResolved) {
                    isResolved = true;
                    if (port && port.isOpen) {
                        port.close();
                    }
                    reject(new Error(`전압 설정 명령 타임아웃 (${timeoutMs}ms)`));
                }
            }, timeoutMs);

            // 에러 핸들러
            port.on('error', err => {
                if (!isResolved) {
                    isResolved = true;
                    clearTimeout(timeoutId);
                    console.error(`[시리얼 포트] 에러: ${err.message}`);
                    reject(new Error(`시리얼 포트 에러: ${err.message}`));
                    if (port.isOpen) {
                        port.close();
                    }
                }
            });

            // 포트 열림 핸들러
            port.on('open', async () => {
                try {
                    // 송신 전 버퍼 클리어
                    await clearPortBuffer(port);
                    
                    // 명령 전송
                    port.write(commandWithCRLF, err => {
                        if (err) {
                            if (!isResolved) {
                                isResolved = true;
                                clearTimeout(timeoutId);
                                console.error(`[시리얼 포트] 데이터 전송 에러: ${err.message}`);
                                reject(new Error(`데이터 전송 에러: ${err.message}`));
                                port.close();
                            }
                        } else {
                            // 명령 전송 완료 후 약간의 지연을 두고 성공 처리
                            // 실제 장치에서는 응답을 기다려야 할 수 있음
                            setTimeout(() => {
                                if (!isResolved) {
                                    isResolved = true;
                                    clearTimeout(timeoutId);
                                    console.log(`[시리얼 포트] 전압 설정 명령 전송 완료: ${voltValue}V`);
                                    resolve(true);
                                    port.close();
                                }
                            }, 200);
                        }
                    });
                } catch (bufferError) {
                    if (!isResolved) {
                        isResolved = true;
                        clearTimeout(timeoutId);
                        reject(new Error(`버퍼 클리어 실패: ${bufferError.message}`));
                        port.close();
                    }
                }
            });

            // 포트 닫힘 핸들러
            port.on('close', () => {
                if (!isResolved) {
                    isResolved = true;
                    clearTimeout(timeoutId);
                }
            });

            // 포트 열기 시도
            port.open((err) => {
                if (err) {
                    if (!isResolved) {
                        isResolved = true;
                        clearTimeout(timeoutId);
                        reject(new Error(`포트 열기 실패: ${err.message}`));
                    }
                }
            });

        } catch (error) {
            if (!isResolved) {
                isResolved = true;
                if (timeoutId) clearTimeout(timeoutId);
                reject(new Error(`포트 초기화 실패: ${error.message}`));
            }
        }
    });
}

/**
 * SendVoltCommand 함수를 재시도 로직과 함께 실행합니다.
 * 
 * @param {number} voltValue 전압 값
 * @param {number} maxRetries 최대 재시도 횟수 (기본값: 3)
 * @param {number} delayMs 재시도 간 지연 시간 (밀리초, 기본값: 1000)
 * @param {number} timeoutMs 각 시도별 타임아웃 (밀리초, 기본값: 5000)
 * @returns {Promise<boolean>} 성공 시 true
 */
export async function SendVoltCommandWithRetry(voltValue, maxRetries = 3, delayMs = 1000) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`[SendVoltCommand] 전압 설정 시도 ${attempt}/${maxRetries}: ${voltValue}V`);
            const result = await SendVoltCommand(voltValue);
            if (result === true) {
                console.log(`[SendVoltCommand] 전압 설정 성공 (시도 ${attempt}/${maxRetries}): ${voltValue}V`);
                return result;
            }
        } catch (error) {
            lastError = error;
            console.warn(`[SendVoltCommand] 시도 ${attempt}/${maxRetries} 실패: ${error.message}`);
            
            if (attempt === maxRetries) {
                console.error(`[SendVoltCommand] 모든 재시도 실패. 최종 에러: ${error.message}`);
                throw new Error(`전압 설정 실패 (${maxRetries}회 시도): ${error.message}`);
            }
            
            console.log(`[SendVoltCommand] ${delayMs}ms 후 재시도...`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
    
    throw lastError;
}

/**
 * 시리얼 포트 상태를 확인합니다.
 * 
 * @returns {Promise<boolean>} 포트가 정상이면 true, 문제가 있으면 false
 */
export async function checkSerialPortHealth() {
    try {
        const portPath = await getPortPath();
        const port = new SerialPort({ 
            path: portPath, 
            baudRate: BAUD_RATE,
            autoOpen: false 
        });
        
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                port.close();
                resolve(false);
            }, 2000);
            
            port.on('open', () => {
                clearTimeout(timeout);
                port.close();
                resolve(true);
            });
            
            port.on('error', () => {
                clearTimeout(timeout);
                resolve(false);
            });
            
            port.open();
        });
    } catch (error) {
        console.error(`[checkSerialPortHealth] 포트 상태 확인 실패: ${error.message}`);
        return false;
    }
}

/**
 * 전압 설정 전 포트 상태를 사전 확인하고 전압을 설정합니다.
 * 
 * @param {number} voltValue 전압 값
 * @param {boolean} checkHealth 포트 상태 확인 여부 (기본값: true)
 * @returns {Promise<boolean>} 성공 시 true
 */
export async function SendVoltCommandWithHealthCheck(voltValue, checkHealth = true) {
    if (checkHealth) {
        const isHealthy = await checkSerialPortHealth();
        if (!isHealthy) {
            throw new Error('시리얼 포트 상태가 비정상입니다. 연결을 확인해주세요.');
        }
        console.log(`[SendVoltCommand] 포트 상태 확인 완료 - 정상`);
    }
    
    return await SendVoltCommand(voltValue);
}

