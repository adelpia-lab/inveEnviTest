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
    return '/dev/' + usbSettings.power;
  } catch (error) {
    console.error('Failed to load USB port settings, using default:', error.message);
    return '/dev/ttyUSB2'; // 기본값
  }
}

const BAUD_RATE = 19200; // 장치에 맞는 보드 레이트를 설정하세요.
const RESPONSE_TIMEOUT_MS = 2000; // 응답을 기다릴 최대 시간 (밀리초)

/**
 * 입력값이 숫자일 경우 해당 숫자를 전압으로 하여 명령 문자열을 생성하고,
 * 시리얼 포트로 전송합니다.
 *
 * @param {number} voltValue 전압 값 (예: 0, 18, 24, 30)
 * @returns {Promise<string>} 전송 성공 시 'success', 실패 시 에러 메시지
 */
export async function SendVoltCommand(voltValue) {
    if (typeof voltValue !== 'number' || !Number.isFinite(voltValue)) {
        throw new Error(`voltValue는 숫자여야 합니다. 입력값: ${voltValue}`);
    }
    // 명령 문자열 생성
    const serialCommand = `SOUR:VOLT:LEV:IMM:AMPL ${voltValue}`;
    // CR+LF 개행 문자를 추가합니다 (\r\n)
    const commandWithCRLF = serialCommand + '\r\n';

    return new Promise(async (resolve, reject) => {
        const portPath = await getPortPath();
        const port = new SerialPort({
            path: portPath,
            baudRate: BAUD_RATE
        });

        // --- 에러 핸들러 ---
        port.on('error', err => {
            console.error(`[시리얼 포트] 에러: ${err.message}`);
            reject(`시리얼 포트 에러: ${err.message}`);
            if (port.isOpen) {
                port.close();
            }
        });

        // --- 포트 열림 핸들러 ---
        port.on('open', () => {
            //console.log(`[시리얼 포트] ${portPath} 포트가 ${BAUD_RATE}bps로 열렸습니다.`);
            //console.log(`[시리얼 포트] 전송할 명령: '${serialCommand}' (CR+LF 포함)`);

            // --- 데이터 전송 ---
            port.write(commandWithCRLF, err => {
                if (err) {
                    console.error(`[시리얼 포트] 데이터 전송 에러: ${err.message}`);
                    reject(`데이터 전송 에러: ${err.message}`);
                    port.close();
                } else {
                    //console.log(`[시리얼 포트] 데이터 전송 완료: '${serialCommand}'`);
                    resolve('success');
                    port.close();
                }
            });
        });

        // --- 포트 닫힘 핸들러 ---
        port.on('close', () => {
            //console.log(`[시리얼 포트] ${portPath} 포트가 닫혔습니다.`);
        });
    });
}

