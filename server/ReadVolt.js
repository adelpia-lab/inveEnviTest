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

const RETURN_PATTERN = '-0.003\r\n';

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
    return '/dev/' + usbSettings.load;
  } catch (error) {
    console.error('Failed to load USB port settings, using default:', error.message);
    return '/dev/ttyUSB2'; // 기본값
  }
}

const BAUD_RATE = 19200; // 장치에 맞는 보드 레이트를 설정하세요.
const RESPONSE_TIMEOUT_MS = 10000; // 응답을 기다릴 최대 시간 (밀리초) - 10초로 변경

/**
 * 지정한 채널의 전압을 읽어 반환합니다.
 * @param {number} channel 1~5 사이의 채널 번호
 * @returns {Promise<number|string>} 전압값(float) 또는 에러 문자열
 */
export async function ReadVolt(channel) {
    if (channel < 1 || channel > 5) {
        return Promise.reject('채널 번호는 1~5 사이여야 합니다.');
    }

    return new Promise(async (resolve, reject) => {
        const portPath = await getPortPath();
        const port = new SerialPort({
            path: portPath,
            baudRate: BAUD_RATE
        });

        let dataBuffer = '';
        let timeoutId;
        let isVoltageRequested = false;

        port.on('data', data => {
            dataBuffer += data.toString();
            // 전압값 응답 패턴: -0.003\r\n
            if (isVoltageRequested && /-?\d+\.\d+\r?\n/.test(dataBuffer)) {
                clearTimeout(timeoutId);
                const match = dataBuffer.match(/(-?\d+\.\d+)/);
                if (match) {
                    const voltage = parseFloat(match[1]);
                    resolve(voltage);
                } else {
                    resolve('bad');
                }
                port.close();
            }
        });

        port.on('error', err => {
            clearTimeout(timeoutId);
            reject(`에러: ${err.message}`);
            if (port.isOpen) port.close();
        });

        port.on('open', () => {
            // 1. 채널 선택 명령 송신 (응답 없음)
            const selectCmd = CH_SELECT[channel - 1] + '\r\n';
            port.write(selectCmd, err => {
                if (err) {
                    clearTimeout(timeoutId);
                    reject(`채널 선택 명령 송신 에러: ${err.message}`);
                    port.close();
                    return;
                }
                // 2. 전압 읽기 명령 송신
                setTimeout(() => {
                    isVoltageRequested = true;
                    timeoutId = setTimeout(() => {
                        resolve('timeout');
                        port.close();
                    }, RESPONSE_TIMEOUT_MS);
                    port.write(READ_VOLT + '\r\n', err2 => {
                        if (err2) {
                            clearTimeout(timeoutId);
                            reject(`전압 읽기 명령 송신 에러: ${err2.message}`);
                            port.close();
                        }
                    });
                }, 100); // 장치가 명령 처리할 시간 약간 대기
            });
        });

        port.on('close', () => {
            // 포트 닫힘 로그
        });
    });
}

/**
 * 5개 채널의 전압을 순차적으로 읽어 배열로 반환합니다.
 * @returns {Promise<(number|string)[]>} [volt1, volt2, volt3, volt4, volt5]
 */
export async function ReadAllVoltages() {
    const { SerialPort } = await import('serialport');
    return new Promise(async (resolve, reject) => {
        const portPath = await getPortPath();
        const port = new SerialPort({
            path: portPath,
            baudRate: BAUD_RATE
        });
        let results = [];
        let channel = 0;
        let timeoutId;
        let isVoltageRequested = false;
        let dataBuffer = '';

        function cleanup() {
            if (port.isOpen) port.close();
            clearTimeout(timeoutId);
        }

        function readNextChannel() {
            if (channel >= 5) {
                cleanup();
                resolve(results);
                return;
            }
            dataBuffer = '';
            isVoltageRequested = false;
            // 1. 채널 선택 명령 송신
            const selectCmd = CH_SELECT[channel] + '\r\n';
            port.write(selectCmd, err => {
                if (err) {
                    results.push(`채널${channel+1} 선택 에러: ${err.message}`);
                    channel++;
                    readNextChannel();
                    return;
                }
                // 2. 전압 읽기 명령 송신
                setTimeout(() => {
                    isVoltageRequested = true;
                    timeoutId = setTimeout(() => {
                        results.push('timeout');
                        channel++;
                        readNextChannel();
                    }, RESPONSE_TIMEOUT_MS);
                    port.write(READ_VOLT + '\r\n', err2 => {
                        if (err2) {
                            clearTimeout(timeoutId);
                            results.push(`채널${channel+1} 전압 읽기 에러: ${err2.message}`);
                            channel++;
                            readNextChannel();
                        }
                    });
                }, 100);
            });
        }

        port.on('data', data => {
            dataBuffer += data.toString();
            if (isVoltageRequested && /-?\d+\.\d+\r?\n/.test(dataBuffer)) {
                clearTimeout(timeoutId);
                const match = dataBuffer.match(/(-?\d+\.\d+)/);
                if (match) {
                    results.push(parseFloat(match[1]));
                } else {
                    results.push('bad');
                }
                channel++;
                readNextChannel();
            }
        });

        port.on('error', err => {
            cleanup();
            reject(`에러: ${err.message}`);
        });

        port.on('open', () => {
            readNextChannel();
        });

        port.on('close', () => {
            // 포트 닫힘 로그
        });
    });
}

// --- 함수 사용 예시 ---

