// serialport 라이브러리 임포트
import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import { promises as fs } from 'fs';

const CHAMBER_STATUS_READ = '0230315253442c30362c3030303143390d0a';
const USB_PORT_SETTINGS_FILE = 'usb_port_settings.json'; // USB 포트 설정 저장 파일

// --- 시리얼 포트 설정 ---
const BAUD_RATE = 115200; // 장치에 맞는 보드 레이트를 설정하세요.
const RESPONSE_TIMEOUT_MS = 2000; // 응답을 기다릴 최대 시간 (밀리초)

// USB 포트 설정을 파일에서 읽어오는 함수
async function loadUsbPortSettings() {
    try {
        const data = await fs.readFile(USB_PORT_SETTINGS_FILE, 'utf-8');
        const settings = JSON.parse(data);
        return settings;
    } catch (error) {
        throw new Error(`USB port settings file not found: ${USB_PORT_SETTINGS_FILE}`);
    }
}

/**
 * 시리얼 포트에 명령을 전송하고 장치로부터의 응답을 기다립니다.
 * 수신된 응답에 따라 'good', 'bad' 또는 'timeout'을 반환합니다.
 *
 * @param {string} commandToSend 시리얼 포트로 보낼 명령 문자열
 * @returns {Promise<string>} 'good', 'bad', 'timeout' 중 하나로 resolve 되는 Promise
 */

function hexToDecimal(hexString) {
    // 입력된 문자열이 유효한 16진수인지 확인 (선택 사항이지만 안정성을 위해 권장)
    if (!/^[0-9a-fA-F]{4}$/.test(hexString)) {
      throw new Error("유효하지 않은 2바이트 16진수 문자열입니다. '09f7'과 같은 형식이어야 합니다.");
    }
  
    // parseInt 함수를 사용하여 16진수(radix 16)를 십진수로 변환
    return parseInt(hexString, 16);
}

export async function usbChamber(commandToSend) {
    // USB 포트 설정에서 챔버 포트 가져오기
    const usbSettings = await loadUsbPortSettings();
    const portPath = '/dev/' + usbSettings.chamber;
    
    // console.log(`[ReadChamber] Using chamber port: ${portPath}`);

    return new Promise((resolve, reject) => {
        const port = new SerialPort({
            path: portPath,
            baudRate: BAUD_RATE
        });

        // ReadlineParser를 사용하여 라인 단위로 데이터를 파싱합니다.
        // 장치 응답이 개행 문자로 끝나는 경우 유용합니다.
        const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

        let timeoutId;
        let receivedResponse = false;

        // --- 데이터 수신 핸들러 ---
        parser.on('data', data => {
            const response = data.toString().trim(); // 수신된 데이터를 문자열로 변환하고 공백 제거
            // console.log(`[시리얼 포트] 수신 데이터: '${response}'`);
            receivedResponse = true;

            clearTimeout(timeoutId); // 응답을 받았으니 타임아웃 해제

            // TODO: 여기에 장치 응답에 따른 'good'/'bad' 로직을 구현하세요.
            // 예시: 응답이 'ACK'이면 good, 'NACK'이면 bad
            const responseString = response.split(',');
            // console.log(responseString);
            const responseCode = responseString[1];

            const response2 = responseString[2];
            
            // console.log(`[시리얼 포트] response2 : '${response2}'`);

            let resp = hexToDecimal(response2);
   
            // console.log(`[시리얼 포트] resp : '${resp}'`);
            if( resp > 32767) {
                resp = resp - 65536;
            }

            const temperature = resp/100;  // debug 2025.0804
            // console.log(`[시리얼 포트] 수신 챔버온도: '${temperature}'`);

            if (responseCode === "OK") {
                resolve(temperature);

            } else {
                // 예상치 못한 응답
                console.warn(`[시리얼 포트] 예상치 못한 응답: '${response}'`);
                resolve('bad'); // 또는 'unknown'으로 처리할 수도 있습니다.
            }
            port.close(); // 응답을 처리했으니 포트 닫기
        });

        // --- 에러 핸들러 ---
        port.on('error', err => {
            console.error(`[시리얼 포트] 에러: ${err.message}`);
            clearTimeout(timeoutId); // 에러 발생 시 타임아웃 해제
            reject(`에러: ${err.message}`);
            if (port.isOpen) {
                port.close();
            }
        });

        // --- 포트 열림 핸들러 ---
        port.on('open', () => {
            // console.log(`[시리얼 포트] ${portPath} 포트가 ${BAUD_RATE}bps로 열렸습니다.`);

            // 타임아웃 설정
            timeoutId = setTimeout(() => {
                if (!receivedResponse) {
                    console.warn('[시리얼 포트] 응답 타임아웃 발생.');
                    resolve('timeout'); // 응답이 오지 않으면 'timeout' 반환
                    port.close(); // 타임아웃 시 포트 닫기
                }
            }, RESPONSE_TIMEOUT_MS);

            // --- 데이터 전송 ---
            port.write(commandToSend, err => {
                if (err) {
                    console.error(`[시리얼 포트] 데이터 전송 에러: ${err.message}`);
                    clearTimeout(timeoutId);
                    reject(`데이터 전송 에러: ${err.message}`);
                    port.close();
                } else {
                    // console.log(`[시리얼 포트] 데이터 전송 완료: '${commandToSend}'`);
                }
            });
        });

        // --- 포트 닫힘 핸들러 ---
        port.on('close', () => {
            // console.log(`[시리얼 포트] ${portPath} 포트가 닫혔습니다.`);
        });
    });
}

export async function ReadChamber() {
    const str = CHAMBER_STATUS_READ;
    const hexBuffer = Buffer.from(str, 'hex');

    const response = await usbChamber(hexBuffer);
    return response;
}



// --- 함수 사용 예시 ---

