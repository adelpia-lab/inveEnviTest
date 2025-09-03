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
const RESPONSE_TIMEOUT_MS = 8000; // 8초로 증가하여 안정성 향상
const CHANNEL_SELECT_DELAY_MS = 500; // 채널 선택 후 대기 시간 증가
const VOLTAGE_READ_DELAY_MS = 300; // 전압 읽기 후 안정화를 위한 대기 시간
const BUFFER_CLEAR_DELAY_MS = 200; // 버퍼 클리어 대기 시간 증가
const MAX_RETRIES = 3; // 최대 재시도 횟수
const RETRY_DELAY_MS = 1000; // 재시도 간 대기 시간

// --- 순차적 실행을 위한 큐 시스템 ---
let operationQueue = [];
let isProcessing = false;
let currentOperation = null;

// 큐에 작업 추가
function addToQueue(operation) {
    return new Promise((resolve, reject) => {
        operationQueue.push({
            operation,
            resolve,
            reject,
            timestamp: Date.now()
        });
        
        // 큐가 비어있으면 즉시 처리 시작
        if (!isProcessing) {
            processQueue();
        }
    });
}

// 큐 처리
async function processQueue() {
    if (isProcessing || operationQueue.length === 0) {
        return;
    }
    
    isProcessing = true;
    
    while (operationQueue.length > 0) {
        const { operation, resolve, reject } = operationQueue.shift();
        currentOperation = operation;
        
        try {
            const result = await operation();
            resolve(result);
        } catch (error) {
            reject(error);
        } finally {
            currentOperation = null;
        }
        
        // 작업 간 간격 추가 (안정성 향상)
        if (operationQueue.length > 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    
    isProcessing = false;
}

// --- 로깅 유틸리티 개선 ---
function log(message, level = 'INFO', channel = null) {
    const timestamp = new Date().toISOString();
    const channelInfo = channel ? `[CH${channel}]` : '';
    const queueInfo = currentOperation ? `[Q:${operationQueue.length}]` : '';
    console.log(`[${timestamp}] [${level}] ReadVolt${channelInfo}${queueInfo}: ${message}`);
}

// --- 포트 풀 관리 개선 ---
let portPool = new Map();
let portInUse = false;
let portLockOwner = null;

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

// 포트 획득 (순차적 보장)
async function acquirePort(channel, timeoutMs = 20000) {
    const startTime = Date.now();
    const operationId = `CH${channel}_${Date.now()}`;
    
    //log(`포트 획득 시도 시작`, 'DEBUG', channel);
    
    while (portInUse) {
        if (Date.now() - startTime > timeoutMs) {
            throw new Error(`포트 획득 타임아웃 - 채널 ${channel} (${timeoutMs}ms)`);
        }
        
        // 현재 포트 사용자 정보 로깅
        if (portLockOwner) {
            log(`포트 사용 중 - ${portLockOwner}가 사용 중, 대기 중...`, 'INFO', channel);
        } else {
            log(`포트 사용 중, 대기 중...`, 'INFO', channel);
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    portInUse = true;
    portLockOwner = operationId;
    //log(`포트 획득 성공`, 'DEBUG', channel);
    
    return operationId;
}

// 포트 해제
function releasePort(operationId, channel) {
    if (portInUse && portLockOwner === operationId) {
        portInUse = false;
        portLockOwner = null;
        //log(`포트 해제 완료`, 'DEBUG', channel);
    }
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

// --- 포트 연결 및 통신 함수 개선 ---
async function communicateWithDevice(port, commands, timeoutMs = RESPONSE_TIMEOUT_MS, channel) {
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
            //log(`명령 전송: ${command.trim()}`, 'DEBUG', channel);
            
            port.write(command, (err) => {
                if (err) {
                    cleanup();
                    reject(new Error(`명령 전송 오류: ${err.message}`));
                    return;
                }
                
                commandIndex++;
                
                // 마지막 명령이면 응답 대기
                if (commandIndex >= commands.length) {
                    timeoutId = setTimeout(() => {
                        cleanup();
                        reject(new Error('응답 타임아웃'));
                    }, timeoutMs);
                } else {
                    // 채널 선택 명령 후에는 더 긴 대기 시간 적용
                    const isChannelSelect = command.includes('INST:SEL CH');
                    const delay = isChannelSelect ? CHANNEL_SELECT_DELAY_MS : 100;
                    
                    //log(`명령 전송 완료, ${delay}ms 후 다음 명령 실행...`, 'DEBUG', channel);
                    setTimeout(sendNextCommand, delay);
                }
            });
        };
        
        port.on('data', (data) => {
            dataBuffer += data.toString();
            // log(`데이터 수신: ${data.toString().trim()}`, 'DEBUG', channel);
            
            // 응답 패턴 확인
            if (parseVoltageResponse(dataBuffer) !== null) {
                cleanup();
                resolve(dataBuffer);
            }
        });
        
        port.on('error', (err) => {
            cleanup();
            reject(new Error(`포트 오류: ${err.message}`));
        });
        
        sendNextCommand();
    });
}

// --- 재시도 로직 개선 ---
async function withRetry(operation, maxRetries = MAX_RETRIES, channel) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            log(`시도 ${attempt} 실패: ${error.message}`, 'WARN', channel);
            
            if (attempt < maxRetries) {
                const delay = RETRY_DELAY_MS * attempt;
                log(`${delay}ms 후 재시도...`, 'INFO', channel);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    throw lastError;
}

// --- 순차적 채널 읽기 함수 ---
async function readChannelSequentially(channel) {
    //log(`채널 ${channel} 전압 읽기 시작`, 'INFO', channel);
    
    return withRetry(async () => {
        // 포트 획득
        const operationId = await acquirePort(channel);
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
            const response = await communicateWithDevice(port, commands, RESPONSE_TIMEOUT_MS, channel);
            
            // 응답 파싱
            const voltage = parseVoltageResponse(response);
            if (voltage === null) {
                throw new Error('잘못된 전압 응답 형식');
            }
            
            // 채널 읽기 후 안정화를 위한 대기 시간 추가
            await new Promise(resolve => setTimeout(resolve, VOLTAGE_READ_DELAY_MS));
            
            // log(`채널 ${channel} 전압 읽기 성공: ${voltage}V`, 'INFO', channel);
            return voltage;
            
        } finally {
            // 포트 해제
            releasePort(operationId, channel);
        }
    }, MAX_RETRIES, channel);
}

/**
 * 지정한 채널의 전압을 읽어 반환합니다. (순차적 실행 보장)
 * @param {number} channel 1~5 사이의 채널 번호
 * @returns {Promise<number>} 전압값(float)
 */
export async function ReadVolt(channel) {
    if (channel < 1 || channel > 5) {
        return Promise.reject('채널 번호는 1~5 사이여야 합니다.');
    }
    
    // 큐에 작업 추가하여 순차적 실행 보장
    return addToQueue(() => readChannelSequentially(channel));
}

/**
 * 5개 채널의 전압을 순차적으로 읽어 배열로 반환합니다. (순차적 실행 보장)
 * @returns {Promise<number[]>} [volt1, volt2, volt3, volt4, volt5]
 */
export async function ReadAllVoltages() {
    // log('모든 채널 전압 읽기 시작', 'INFO');
    
    const results = [];
    
    // 순차적으로 각 채널 읽기
    for (let channel = 1; channel <= 5; channel++) {
        try {
            //log(`채널 ${channel} 읽기 시작 (${channel}/5)`, 'INFO');
            const voltage = await ReadVolt(channel);
            results.push(voltage);
            // log(`채널 ${channel} 전압: ${voltage}V (${channel}/5 완료)`, 'INFO');
        } catch (error) {
            log(`채널 ${channel} 읽기 실패: ${error.message}`, 'ERROR');
            results.push(null);
        }
        
        // 채널 간 간격 (안정성 향상)
        if (channel < 5) {
            //log(`다음 채널 읽기 전 ${200}ms 대기...`, 'DEBUG');
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    }
    
    // log(`모든 채널 전압 읽기 완료: ${results}`, 'INFO');
    return results;
}

// --- 포트 정리 함수 ---
export async function cleanupPorts() {
    // 큐 처리 중단
    operationQueue = [];
    isProcessing = false;
    currentOperation = null;
    
    // 포트 정리
    for (const [path, port] of portPool.entries()) {
        if (port && port.isOpen) {
            port.close();
            // log(`포트 닫힘: ${path}`, 'INFO');
        }
    }
    portPool.clear();
    
    // 포트 상태 초기화
    portInUse = false;
    portLockOwner = null;
}

// --- 큐 상태 확인 함수 ---
export function getQueueStatus() {
    return {
        queueLength: operationQueue.length,
        isProcessing: isProcessing,
        currentOperation: currentOperation,
        portInUse: portInUse,
        portLockOwner: portLockOwner
    };
}

// --- 에러 타입 정의 ---
export class ReadVoltError extends Error {
    constructor(message, code) {
        super(message);
        this.name = 'ReadVoltError';
        this.code = code;
    }
}

