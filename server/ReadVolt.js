// serialport 라이브러리 임포트
// 부하기의 5채널 전압을 읽는다.

// command string = 'MEAS:VOLT'
import { SerialPort } from 'serialport';
import { promises as fs } from 'fs';

// 채널 선택 명령
const CH_SELECT = [
    'INST:SEL CH1',
    'INST:SEL CH2',
    'INST:SEL CH3',
    'INST:SEL CH4',
    'INST:SEL CH5',
];

const READ_VOLT = 'MEAS:VOLT?';

// --- 설정 상수 ---
const BAUD_RATE = 19200;
const RESPONSE_TIMEOUT_MS = 5000; // 5초로 단축
const CHANNEL_SELECT_DELAY_MS = 200; // 채널 선택 후 대기 시간
const BUFFER_CLEAR_DELAY_MS = 100; // 버퍼 클리어 대기 시간
const MAX_RETRIES = 3; // 최대 재시도 횟수
const RETRY_DELAY_MS = 500; // 재시도 간 대기 시간

// --- 로깅 유틸리티 ---
function log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level}] ReadVolt: ${message}`);
}

// --- 포트 풀 관리 ---
let portPool = new Map();
let portInUse = false;

async function getOrCreatePort() {
    const portPath = await getPortPath();
    
    if (portPool.has(portPath)) {
        const port = portPool.get(portPath);
        if (port && port.isOpen) {
            return port;
        }
    }
    
    const port = new SerialPort({
        path: portPath,
        baudRate: BAUD_RATE,
        autoOpen: false
    });
    
    portPool.set(portPath, port);
    return port;
}

// --- 버퍼 클리어 함수 개선 ---
async function clearPortBuffer(port) {
    return new Promise((resolve) => {
        if (port && port.isOpen) {
            try {
                port.flush();
                setTimeout(() => {
                    resolve();
                }, BUFFER_CLEAR_DELAY_MS);
            } catch (error) {
                log(`Buffer clear error: ${error.message}`, 'WARN');
                resolve();
            }
        } else {
            resolve();
        }
    });
}

// --- USB 포트 설정을 파일에서 읽어오는 함수 개선 ---
async function loadUsbPortSettings() {
    try {
        const data = await fs.readFile('usb_port_settings.json', 'utf-8');
        const settings = JSON.parse(data);
        
        if (settings.chamber && settings.power && settings.load && settings.relay) {
            return settings;
        } else {
            throw new Error('USB port settings are missing required keys: chamber, power, load, relay');
        }
    } catch (error) {
        log(`Failed to load USB port settings: ${error.message}`, 'ERROR');
        throw error;
    }
}

// --- 동적으로 PORT_PATH를 가져오는 함수 ---
async function getPortPath() {
    const usbSettings = await loadUsbPortSettings();
    return usbSettings.load;
}

// --- 데이터 파싱 함수 개선 ---
function parseVoltageResponse(dataBuffer) {
    // 더 유연한 정규식 패턴들 시도
    const patterns = [
        /(-?\d+\.\d+)\r?\n/, // 기본 패턴
        /(-?\d+\.\d+)/, // 개행 없이
        /(-?\d+\.\d+e?[-+]?\d*)/, // 과학적 표기법 포함
        /(-?\d+\.\d+)\s*$/, // 공백으로 끝남
    ];
    
    for (const pattern of patterns) {
        const match = dataBuffer.match(pattern);
        if (match) {
            const voltage = parseFloat(match[1]);
            if (!isNaN(voltage)) {
                return voltage;
            }
        }
    }
    
    return null;
}

// --- 포트 연결 및 통신 함수 ---
async function communicateWithDevice(port, commands, timeoutMs = RESPONSE_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        let dataBuffer = '';
        let timeoutId;
        let commandIndex = 0;
        
        const cleanup = () => {
            clearTimeout(timeoutId);
            port.removeAllListeners('data');
            port.removeAllListeners('error');
        };
        
        const sendNextCommand = () => {
            if (commandIndex >= commands.length) {
                cleanup();
                resolve(dataBuffer);
                return;
            }
            
            const command = commands[commandIndex];
            log(`Sending command: ${command.trim()}`, 'DEBUG');
            
            port.write(command, (err) => {
                if (err) {
                    cleanup();
                    reject(new Error(`Command send error: ${err.message}`));
                    return;
                }
                
                commandIndex++;
                
                // 마지막 명령이면 응답 대기
                if (commandIndex >= commands.length) {
                    timeoutId = setTimeout(() => {
                        cleanup();
                        reject(new Error('Response timeout'));
                    }, timeoutMs);
                } else {
                    // 다음 명령으로 즉시 진행
                    setTimeout(sendNextCommand, 50);
                }
            });
        };
        
        port.on('data', (data) => {
            dataBuffer += data.toString();
            log(`Received data: ${data.toString().trim()}`, 'DEBUG');
            
            // 응답 패턴 확인
            if (parseVoltageResponse(dataBuffer) !== null) {
                cleanup();
                resolve(dataBuffer);
            }
        });
        
        port.on('error', (err) => {
            cleanup();
            reject(new Error(`Port error: ${err.message}`));
        });
        
        sendNextCommand();
    });
}

// --- 재시도 로직 ---
async function withRetry(operation, maxRetries = MAX_RETRIES) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            log(`Attempt ${attempt} failed: ${error.message}`, 'WARN');
            
            if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt));
            }
        }
    }
    
    throw lastError;
}

/**
 * 지정한 채널의 전압을 읽어 반환합니다.
 * @param {number} channel 1~5 사이의 채널 번호
 * @returns {Promise<number>} 전압값(float)
 */
export async function ReadVolt(channel) {
    if (channel < 1 || channel > 5) {
        return Promise.reject('채널 번호는 1~5 사이여야 합니다.');
    }
    
    log(`Starting voltage read for channel ${channel}`, 'INFO');
    
    return withRetry(async () => {
        // 포트 사용 중이면 대기
        while (portInUse) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        portInUse = true;
        let port = null;
        
        try {
            port = await getOrCreatePort();
            
            if (!port.isOpen) {
                await new Promise((resolve, reject) => {
                    port.open((err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
            }
            
            // 버퍼 클리어
            await clearPortBuffer(port);
            
            // 명령 시퀀스 준비
            const commands = [
                CH_SELECT[channel - 1] + '\r\n',
                READ_VOLT + '\r\n'
            ];
            
            // 통신 실행
            const response = await communicateWithDevice(port, commands);
            
            // 응답 파싱
            const voltage = parseVoltageResponse(response);
            if (voltage === null) {
                throw new Error('Invalid voltage response format');
            }
            
            log(`Successfully read voltage ${voltage}V for channel ${channel}`, 'INFO');
            return voltage;
            
        } finally {
            portInUse = false;
        }
    });
}

/**
 * 5개 채널의 전압을 순차적으로 읽어 배열로 반환합니다.
 * @returns {Promise<number[]>} [volt1, volt2, volt3, volt4, volt5]
 */
export async function ReadAllVoltages() {
    log('Starting to read all channel voltages', 'INFO');
    
    const results = [];
    
    for (let channel = 1; channel <= 5; channel++) {
        try {
            const voltage = await ReadVolt(channel);
            results.push(voltage);
            log(`Channel ${channel} voltage: ${voltage}V`, 'INFO');
        } catch (error) {
            log(`Failed to read channel ${channel}: ${error.message}`, 'ERROR');
            results.push(null);
        }
        
        // 채널 간 간격
        if (channel < 5) {
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    }
    
    log(`Completed reading all voltages: ${results}`, 'INFO');
    return results;
}

// --- 포트 정리 함수 ---
export async function cleanupPorts() {
    for (const [path, port] of portPool.entries()) {
        if (port && port.isOpen) {
            port.close();
            log(`Closed port: ${path}`, 'INFO');
        }
    }
    portPool.clear();
}

// --- 에러 타입 정의 ---
export class ReadVoltError extends Error {
    constructor(message, code) {
        super(message);
        this.name = 'ReadVoltError';
        this.code = code;
    }
}

