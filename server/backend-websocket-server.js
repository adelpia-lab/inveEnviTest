// backend-websocket-server.js
//----
import { WebSocketServer } from 'ws';
import { promises as fs } from 'fs';
import path from 'path';
import { ReadChamber } from './ReadChamber.js';
import { SendVoltCommand } from './SetVolt.js';
import { ReadAllVoltages, ReadVolt } from './ReadVolt.js';
import { RelayAllOff, SelectDevice, SelectDeviceOn, SelectDeviceOff } from './SelectDevice.js';
import { GetData } from './GetData.js';
import { runSinglePageProcess, runNextTankEnviTestProcess, setWebSocketServer, testPowerTableReset } from './RunTestProcess.js';

const LOCAL_WS_PORT = 8081; // WebSocket 서버가 사용할 포트
const DELAY_SETTINGS_FILE = 'delay_settings.json'; // 딜레이 설정 저장 파일
const DEVICE_STATES_FILE = 'device_states.json'; // 기기 상태 저장 파일
const HIGH_TEMP_SETTINGS_FILE = 'high_temp_settings.json'; // 고온 설정 저장 파일
const LOW_TEMP_SETTINGS_FILE = 'low_temp_settings.json'; // 저온 설정 저장 파일
const PRODUCT_INPUT_FILE = 'product_input.json'; // 제품 입력 저장 파일
const USB_PORT_SETTINGS_FILE = 'usb_port_settings.json'; // USB 포트 설정 저장 파일
const OUT_VOLT_SETTINGS_FILE = 'out_volt_settings.json'; // 입력 전압 설정 저장 파일
const CHANNEL_VOLTAGES_FILE = 'channel_voltages.json'; // 채널 전압 설정 저장 파일

const SIMULATION_PROCESS = true;

// 전역 변수: 머신 실행 상태
let machineRunning = false;

// 전역 변수: 프로세스 중지 플래그
let processStopRequested = false;

// 전역 변수: 챔버 온도 모니터링
let chamberTemperatureInterval = null;
let currentChamberTemperature = null;

// 머신 실행 상태를 가져오는 함수
function getMachineRunningStatus() {
    return machineRunning;
}

// 머신 실행 상태를 설정하는 함수
function setMachineRunningStatus(status) {
    machineRunning = status;
    
    // 모든 연결된 클라이언트에게 상태 변경 알림
    wss.clients.forEach(client => {
        if (client.readyState === 1) { // WebSocket.OPEN
            const statusMessage = `[POWER_SWITCH] ${status ? 'ON' : 'OFF'} - Machine running: ${status}`;
            client.send(statusMessage);
            console.log(`📤 [Backend WS Server] Power switch status broadcast: ${statusMessage}`);
        }
    });
}

// 프로세스 완료 시 클라이언트에게 알림을 보내는 함수
function notifyProcessCompleted() {
    wss.clients.forEach(client => {
        if (client.readyState === 1) { // WebSocket.OPEN
            const completionMessage = `[POWER_SWITCH] PROCESS_COMPLETED`;
            client.send(completionMessage);
            console.log(`📤 [Backend WS Server] Process completion broadcast: ${completionMessage}`);
        }
    });
}

// 프로세스 중지 시 클라이언트에게 알림을 보내는 함수
function notifyProcessStopped(reason = '사용자에 의해 중지됨') {
    wss.clients.forEach(client => {
        if (client.readyState === 1) { // WebSocket.OPEN
            const stopMessage = `[POWER_SWITCH] PROCESS_STOPPED: ${reason}`;
            client.send(stopMessage);
            console.log(`📤 [Backend WS Server] Process stop broadcast: ${stopMessage}`);
        }
    });
}

// 프로세스 중지 플래그를 가져오는 함수
function getProcessStopRequested() {
    return processStopRequested;
}

// 프로세스 중지 플래그를 설정하는 함수
function setProcessStopRequested(status) {
    processStopRequested = status;
    console.log(`🔄 [Backend WS Server] Process stop flag set to: ${status}`);
}

// 챔버 온도를 읽어서 모든 클라이언트에게 전송하는 함수
async function readAndBroadcastChamberTemperature() {
    try {
        const temperature = SIMULATION_PROCESS ? 25 : await ReadChamber();
        
        if (typeof temperature === 'number' && !isNaN(temperature)) {
            currentChamberTemperature = temperature;
            
            // 모든 연결된 클라이언트에게 온도 전송
            wss.clients.forEach(client => {
                if (client.readyState === 1) { // WebSocket.OPEN
                    const temperatureMessage = `[CHAMBER_TEMPERATURE] ${temperature}`;
                    client.send(temperatureMessage);
                }
            });
            
            console.log(`🌡️ [Backend WS Server] Chamber temperature broadcast: ${temperature}°C`);
        } else {
            console.warn(`🌡️ [Backend WS Server] Invalid temperature reading: ${temperature}`);
        }
    } catch (error) {
        console.error(`🌡️ [Backend WS Server] Failed to read chamber temperature: ${error.message}`);
    }
}

// 챔버 온도 모니터링 시작
function startChamberTemperatureMonitoring() {
    if (chamberTemperatureInterval) {
        clearInterval(chamberTemperatureInterval);
    }
    
    // 즉시 첫 번째 읽기 실행
    readAndBroadcastChamberTemperature();
    
    // 5초마다 온도 읽기 및 전송
    chamberTemperatureInterval = setInterval(readAndBroadcastChamberTemperature, 120000);
    console.log(`🌡️ [Backend WS Server] Chamber temperature monitoring started (5-second interval)`);
}

// 챔버 온도 모니터링 중지
function stopChamberTemperatureMonitoring() {
    if (chamberTemperatureInterval) {
        clearInterval(chamberTemperatureInterval);
        chamberTemperatureInterval = null;
        console.log(`🌡️ [Backend WS Server] Chamber temperature monitoring stopped`);
    }
}

// 현재 챔버 온도 가져오기
function getCurrentChamberTemperature() {
    return currentChamberTemperature;
}

// 머신 실행 상태와 프로세스 중지 플래그를 외부에서 접근할 수 있도록 export
export { getMachineRunningStatus, setMachineRunningStatus, getProcessStopRequested, setProcessStopRequested, startChamberTemperatureMonitoring, stopChamberTemperatureMonitoring, getCurrentChamberTemperature };

const wss = new WebSocketServer({ port: LOCAL_WS_PORT });

// RunTestProcess에 WebSocket 서버 참조 설정
setWebSocketServer(wss);

// 딜레이 설정을 파일에 저장하는 함수
async function saveDelaySettings(onDelay, offDelay, cycleNumber = 1) {
  try {
    const settings = { onDelay, offDelay, cycleNumber };
    await fs.writeFile(DELAY_SETTINGS_FILE, JSON.stringify(settings, null, 2));
    // console.log(`[Backend WS Server] Delay settings saved: ON_DELAY=${onDelay}, OFF_DELAY=${offDelay}, CYCLE=${cycleNumber}`);
    return true;
  } catch (error) {
    console.error(`[Backend WS Server] Failed to save delay settings: ${error.message}`);
    return false;
  }
}

// 딜레이 설정을 파일에서 읽어오는 함수
async function loadDelaySettings() {
  try {
    const data = await fs.readFile(DELAY_SETTINGS_FILE, 'utf-8');
    const settings = JSON.parse(data);
    // console.log(`[Backend WS Server] Delay settings loaded: ON_DELAY=${settings.onDelay}, OFF_DELAY=${settings.offDelay}, CYCLE=${settings.cycleNumber || 1}`);
    return {
      onDelay: settings.onDelay || 0,
      offDelay: settings.offDelay || 0,
      cycleNumber: settings.cycleNumber || 1
    };
  } catch (error) {
    // console.log(`[Backend WS Server] No saved delay settings found, using defaults: ON_DELAY=0, OFF_DELAY=0, CYCLE=1`);
    return { onDelay: 0, offDelay: 0, cycleNumber: 1 };
  }
}

// 기기 상태를 파일에 저장하는 함수 - 10개 요소 배열로 저장
async function saveDeviceStates(deviceStates) {
  try {
    // console.log(`💾 [Backend WS Server] Attempting to save device states to file: ${DEVICE_STATES_FILE}`);
    // console.log(`💾 [Backend WS Server] Device states to save (array):`, deviceStates);
    
    // 배열 형태 검증
    if (!Array.isArray(deviceStates) || deviceStates.length !== 10) {
      throw new Error(`Invalid device states format. Expected array with 10 elements, got: ${typeof deviceStates} with length ${Array.isArray(deviceStates) ? deviceStates.length : 'N/A'}`);
    }
    
    // 모든 요소가 boolean인지 확인
    if (!deviceStates.every(state => typeof state === 'boolean')) {
      throw new Error('All device states must be boolean values');
    }
    
    const jsonString = JSON.stringify(deviceStates, null, 2);
    // console.log(`💾 [Backend WS Server] JSON string to write:`, jsonString);
    
    await fs.writeFile(DEVICE_STATES_FILE, jsonString);
    // console.log(`✅ [Backend WS Server] Device states successfully written to file: ${DEVICE_STATES_FILE}`);
    // console.log(`✅ [Backend WS Server] Device states saved (array): ${JSON.stringify(deviceStates)}`);
    return true;
  } catch (error) {
    console.error(`❌ [Backend WS Server] Failed to save device states: ${error.message}`);
    console.error(`❌ [Backend WS Server] Error stack:`, error.stack);
    console.error(`❌ [Backend WS Server] File path: ${DEVICE_STATES_FILE}`);
    return false;
  }
}

// 기기 상태를 파일에서 읽어오는 함수 - 10개 요소 배열로 로드
async function loadDeviceStates() {
  try {
    const data = await fs.readFile(DEVICE_STATES_FILE, 'utf-8');
    const deviceStates = JSON.parse(data);
    
    // 배열 형태로 저장된 경우
    if (Array.isArray(deviceStates) && deviceStates.length === 10) {
      // console.log(`📖 [Backend WS Server] Device states loaded from file (array): ${JSON.stringify(deviceStates)}`);
      return deviceStates;
    }
    // 기존 객체 형태로 저장된 경우 (마이그레이션)
    else if (typeof deviceStates === 'object' && deviceStates !== null) {
      // console.log(`🔄 [Backend WS Server] Migrating from object format to array format`);
      const expectedDevices = [
        "#1 Device", "#2 Device", "#3 Device", "#4 Device", "#5 Device",
        "#6 Device", "#7 Device", "#8 Device", "#9 Device", "#10 Device"
      ];
      const arrayFormat = expectedDevices.map(device => deviceStates[device] || false);
      // console.log(`🔄 [Backend WS Server] Migrated device states (array): ${JSON.stringify(arrayFormat)}`);
      
      // 마이그레이션된 데이터를 파일에 저장
      await saveDeviceStates(arrayFormat);
      // console.log(`💾 [Backend WS Server] Migrated device states saved to file`);
      
      return arrayFormat;
    }
    else {
      throw new Error(`Invalid device states format in file: ${typeof deviceStates}`);
    }
  } catch (error) {
    // console.log(`📖 [Backend WS Server] No saved device states found or invalid format, using default: array with first device selected`);
    // 기본값: 10개 요소 배열 (첫 번째 기기만 선택된 상태)
    const defaultStates = [true, false, false, false, false, false, false, false, false, false];
    // console.log(`📖 [Backend WS Server] Default device states (array): ${JSON.stringify(defaultStates)}`);
    return defaultStates;
  }
}

// 고온 설정을 파일에 저장하는 함수
async function saveHighTempSettings(settings) {
  try {
    // console.log(`💾 [Backend WS Server] Attempting to save high temp settings to file: ${HIGH_TEMP_SETTINGS_FILE}`);
    // console.log(`💾 [Backend WS Server] Settings to save:`, settings);
    
    const jsonString = JSON.stringify(settings, null, 2);
    // console.log(`💾 [Backend WS Server] JSON string to write:`, jsonString);
    
    await fs.writeFile(HIGH_TEMP_SETTINGS_FILE, jsonString);
    // console.log(`✅ [Backend WS Server] High temp settings successfully written to file: ${HIGH_TEMP_SETTINGS_FILE}`);
    // console.log(`✅ [Backend WS Server] Settings saved: ${JSON.stringify(settings)}`);
    return true;
  } catch (error) {
    console.error(`❌ [Backend WS Server] Failed to save high temp settings: ${error.message}`);
    console.error(`❌ [Backend WS Server] Error stack:`, error.stack);
    console.error(`❌ [Backend WS Server] File path: ${HIGH_TEMP_SETTINGS_FILE}`);
    return false;
  }
}

// 고온 설정을 파일에서 읽어오는 함수
async function loadHighTempSettings() {
  try {
    const data = await fs.readFile(HIGH_TEMP_SETTINGS_FILE, 'utf-8');
    const settings = JSON.parse(data);
    // console.log(`📖 [Backend WS Server] High temp settings loaded from file: ${JSON.stringify(settings)}`);
    return settings;
  } catch (error) {
    // console.log(`📖 [Backend WS Server] No saved high temp settings found, using default`);
        // 기본값 - 고온 측정 선택이 off 상태
    const defaultSettings = {
        highTemp: false, // 기본적으로 off 상태
        targetTemp: 75,
        waitTime: 200,
        readCount: 10,
    };
    // console.log(`📖 [Backend WS Server] Default high temp settings:`, defaultSettings);
    return defaultSettings;
  }
}

// 저온 설정을 파일에 저장하는 함수
async function saveLowTempSettings(settings) {
  try {
    console.log(`💾 [Backend WS Server] Attempting to save low temp settings to file: ${LOW_TEMP_SETTINGS_FILE}`);
    console.log(`💾 [Backend WS Server] Settings to save:`, settings);
    
    // 입력값 검증
    if (!settings || typeof settings !== 'object') {
      console.error(`❌ [Backend WS Server] Invalid settings object:`, settings);
      return false;
    }
    
    // 필수 필드 확인
    const requiredFields = ['lowTemp', 'targetTemp', 'waitTime', 'readCount'];
    for (const field of requiredFields) {
      if (!(field in settings)) {
        console.error(`❌ [Backend WS Server] Missing required field: ${field}`);
        return false;
      }
    }
    
    const jsonString = JSON.stringify(settings, null, 2);
    console.log(`💾 [Backend WS Server] JSON string to write:`, jsonString);
    
    await fs.writeFile(LOW_TEMP_SETTINGS_FILE, jsonString);
    console.log(`✅ [Backend WS Server] Low temp settings successfully written to file: ${LOW_TEMP_SETTINGS_FILE}`);
    console.log(`✅ [Backend WS Server] Settings saved: ${JSON.stringify(settings)}`);
    
    // 저장 후 파일 내용 확인
    const verifyData = await fs.readFile(LOW_TEMP_SETTINGS_FILE, 'utf-8');
    const verifySettings = JSON.parse(verifyData);
    console.log(`✅ [Backend WS Server] Verified saved settings:`, verifySettings);
    
    return true;
  } catch (error) {
    console.error(`❌ [Backend WS Server] Failed to save low temp settings: ${error.message}`);
    console.error(`❌ [Backend WS Server] Error stack:`, error.stack);
    console.error(`❌ [Backend WS Server] File path: ${LOW_TEMP_SETTINGS_FILE}`);
    return false;
  }
}

// 저온 설정을 파일에서 읽어오는 함수
async function loadLowTempSettings() {
  try {
    console.log(`📖 [Backend WS Server] Loading low temp settings from file: ${LOW_TEMP_SETTINGS_FILE}`);
    const data = await fs.readFile(LOW_TEMP_SETTINGS_FILE, 'utf-8');
    console.log(`📖 [Backend WS Server] Raw file data:`, data);
    
    const settings = JSON.parse(data);
    console.log(`📖 [Backend WS Server] Parsed low temp settings:`, settings);
    return settings;
  } catch (error) {
    console.log(`📖 [Backend WS Server] No saved low temp settings found, using default`);
    console.log(`📖 [Backend WS Server] Error details:`, error.message);
    // 기본값
    const defaultSettings = {
        lowTemp: false,
        targetTemp: -32,
        waitTime: 200,
        readCount: 10,
    };
    console.log(`📖 [Backend WS Server] Default low temp settings:`, defaultSettings);
    return defaultSettings;
  }
}

// 제품 입력을 파일에 저장하는 함수
async function saveProductInput(productInput) {
  try {
    // console.log(`💾 [Backend WS Server] Attempting to save product input to file: ${PRODUCT_INPUT_FILE}`);
    // console.log(`💾 [Backend WS Server] Product input to save:`, productInput);
    
    const jsonString = JSON.stringify(productInput, null, 2);
    // console.log(`💾 [Backend WS Server] JSON string to write:`, jsonString);
    
    await fs.writeFile(PRODUCT_INPUT_FILE, jsonString);
    // console.log(`✅ [Backend WS Server] Product input successfully written to file: ${PRODUCT_INPUT_FILE}`);
    // console.log(`✅ [Backend WS Server] Product input saved: ${JSON.stringify(productInput)}`);
    return true;
  } catch (error) {
    console.error(`❌ [Backend WS Server] Failed to save product input: ${error.message}`);
    console.error(`❌ [Backend WS Server] Error stack:`, error.stack);
    console.error(`❌ [Backend WS Server] File path: ${PRODUCT_INPUT_FILE}`);
    return false;
  }
}

// 제품 입력을 파일에서 읽어오는 함수
async function loadProductInput() {
  try {
    const data = await fs.readFile(PRODUCT_INPUT_FILE, 'utf-8');
    const productInput = JSON.parse(data);
    // console.log(`📖 [Backend WS Server] Product input loaded from file: ${JSON.stringify(productInput)}`);
    return productInput;
  } catch (error) {
    // console.log(`📖 [Backend WS Server] No saved product input found, using default`);
    // 기본값
    const defaultProductInput = {
      modelName: '61514540',
      productNames: ['PL2222', 'PL2233', 'PL2244', 'PL2255', 'PL2266', 'PL2277', 'PL2288', 'PL2299', 'PL2300', 'PL2311']
    };
    // console.log(`📖 [Backend WS Server] Default product input:`, defaultProductInput);
    return defaultProductInput;
  }
}

// USB 포트 설정을 파일에 저장하는 함수
async function saveUsbPortSettings(settings) {
  try {
    console.log(`💾 [Backend WS Server] Attempting to save USB port settings to file: ${USB_PORT_SETTINGS_FILE}`);
    console.log(`💾 [Backend WS Server] Settings to save:`, settings);
    
    // Validate that all required ports are provided and not empty
    if (!settings.chamber || !settings.power || !settings.load || !settings.relay) {
      throw new Error('All USB port settings (chamber, power, load, relay) must be provided and cannot be empty');
    }
    
    // Validate COM port format and range (COM1-COM20)
    const validateComPort = (port) => {
      if (port.startsWith('COM')) {
        const comNumber = parseInt(port.substring(3));
        return comNumber >= 1 && comNumber <= 20;
      }
      return true; // Allow non-COM ports (Linux style)
    };
    
    const invalidPorts = [];
    if (!validateComPort(settings.chamber)) invalidPorts.push(`chamber: ${settings.chamber}`);
    if (!validateComPort(settings.power)) invalidPorts.push(`power: ${settings.power}`);
    if (!validateComPort(settings.load)) invalidPorts.push(`load: ${settings.load}`);
    if (!validateComPort(settings.relay)) invalidPorts.push(`relay: ${settings.relay}`);
    
    if (invalidPorts.length > 0) {
      throw new Error(`Invalid COM port(s): ${invalidPorts.join(', ')}. COM ports must be COM1-COM20.`);
    }
    
    // 영문 키만 허용, 유효성 검사
    const validSettings = {
      chamber: settings.chamber,
      power: settings.power,
      load: settings.load,
      relay: settings.relay
    };
    
    console.log(`💾 [Backend WS Server] Valid settings to save:`, validSettings);
    
    const jsonString = JSON.stringify(validSettings, null, 2);
    console.log(`💾 [Backend WS Server] JSON string to write:`, jsonString);
    
    await fs.writeFile(USB_PORT_SETTINGS_FILE, jsonString);
    console.log(`✅ [Backend WS Server] USB port settings successfully written to file: ${USB_PORT_SETTINGS_FILE}`);
    console.log(`✅ [Backend WS Server] Settings saved: ${JSON.stringify(validSettings)}`);
    return true;
  } catch (error) {
    console.error(`❌ [Backend WS Server] Failed to save USB port settings: ${error.message}`);
    console.error(`❌ [Backend WS Server] Error stack:`, error.stack);
    console.error(`❌ [Backend WS Server] File path: ${USB_PORT_SETTINGS_FILE}`);
    return false;
  }
}

// USB 포트 설정을 파일에서 읽어오는 함수
async function loadUsbPortSettings() {
  try {
    const data = await fs.readFile(USB_PORT_SETTINGS_FILE, 'utf-8');
    const settings = JSON.parse(data);
    console.log(`📖 [Backend WS Server] USB port settings loaded from file: ${JSON.stringify(settings)}`);
    
    // 영문 키가 모두 있는지 확인
    if (settings.chamber && settings.power && settings.load && settings.relay) {
      console.log(`✅ [Backend WS Server] Valid USB port settings found`);
      return settings;
    } else {
      console.log(`⚠️ [Backend WS Server] Invalid USB port settings found in file`);
      throw new Error('Invalid USB port settings format in file');
    }
  } catch (error) {
    console.log(`📖 [Backend WS Server] Failed to load USB port settings: ${error.message}`);
    throw error; // Re-throw to be handled by caller
  }
}

// 입력 전압 설정을 파일에 저장하는 함수 (배열만 저장)
async function saveOutVoltSettings(settings) {
  try {
    if (!Array.isArray(settings) || settings.length !== 4) throw new Error('입력 전압 설정은 4개 요소의 배열이어야 합니다.');
    const jsonString = JSON.stringify(settings, null, 2);
    await fs.writeFile(OUT_VOLT_SETTINGS_FILE, jsonString);
    return true;
  } catch (error) {
    console.error(`[Backend WS Server] Failed to save out volt settings: ${error.message}`);
    return false;
  }
}

// 입력 전압 설정을 파일에서 읽어오는 함수 (배열만 로드)
async function loadOutVoltSettings() {
  try {
    const data = await fs.readFile(OUT_VOLT_SETTINGS_FILE, 'utf-8');
    const settings = JSON.parse(data);
    if (!Array.isArray(settings) || settings.length !== 4) throw new Error('입력 전압 설정은 4개 요소의 배열이어야 합니다.');
    return settings;
  } catch (error) {
    // 기본값: 4개 요소 배열
    return [18.0, 24.0, 30.0, 0.0];
  }
}

// 채널 전압 설정을 파일에 저장하는 함수
async function saveChannelVoltages(channelVoltages) {
  try {
    if (!Array.isArray(channelVoltages) || channelVoltages.length !== 4) {
      throw new Error('채널 전압 설정은 4개 요소의 배열이어야 합니다.');
    }
    await fs.writeFile(CHANNEL_VOLTAGES_FILE, JSON.stringify(channelVoltages, null, 2));
    console.log(`✅ [Backend WS Server] Channel voltages saved: ${JSON.stringify(channelVoltages)}`);
    return true;
  } catch (error) {
    console.error(`❌ [Backend WS Server] Failed to save channel voltages: ${error.message}`);
    return false;
  }
}

// 채널 전압 설정을 파일에서 읽어오는 함수
async function loadChannelVoltages() {
  try {
    const data = await fs.readFile(CHANNEL_VOLTAGES_FILE, 'utf-8');
    const channelVoltages = JSON.parse(data);
    if (!Array.isArray(channelVoltages) || channelVoltages.length !== 4) {
      throw new Error('채널 전압 설정은 4개 요소의 배열이어야 합니다.');
    }
    console.log(`📖 [Backend WS Server] Channel voltages loaded: ${JSON.stringify(channelVoltages)}`);
    return channelVoltages;
  } catch (error) {
    // 기본값: 4개 요소 배열
    console.log(`📖 [Backend WS Server] No saved channel voltages found, using defaults: [5.0, 15.0, -15.0, 24.0]`);
    return [5.0, 15.0, -15.0, 24.0];
  }
}

// getTableOption 객체 - 모든 설정 파일의 데이터를 통합하여 관리
let getTableOption = {
  delaySettings: {},
  deviceStates: {},
  highTempSettings: {},
  lowTempSettings: {},
  productInput: {},
  usbPortSettings: {},
  outVoltSettings: {},
  channelVoltages: []
};

// getTableOption 객체를 모든 JSON 파일에서 읽어와서 초기화하는 함수
export async function loadGetTableOption() {
  try {
    console.log(`📖 [Backend WS Server] Loading getTableOption from all JSON files...`);
    
    // 모든 설정 파일을 병렬로 읽기
    const [
      delaySettings,
      deviceStates,
      highTempSettings,
      lowTempSettings,
      productInput,
      usbPortSettings,
      outVoltSettings,
      channelVoltages
    ] = await Promise.all([
      loadDelaySettings(),
      loadDeviceStates(),
      loadHighTempSettings(),
      loadLowTempSettings(),
      loadProductInput(),
      loadUsbPortSettings(),
      loadOutVoltSettings(),
      loadChannelVoltages()
    ]);
    
    // getTableOption 객체 업데이트
    getTableOption = {
      delaySettings,
      deviceStates,
      highTempSettings,
      lowTempSettings,
      productInput,
      usbPortSettings,
      outVoltSettings,
      channelVoltages
    };
    
    console.log(`✅ [Backend WS Server] getTableOption loaded successfully:`, JSON.stringify(getTableOption, null, 2));
    console.log(`📊 [Backend WS Server] Low temp settings loaded:`, lowTempSettings);
    return getTableOption;
  } catch (error) {
    console.error(`❌ [Backend WS Server] Failed to load getTableOption: ${error.message}`);
    throw error;
  }
}

// getTableOption 객체의 특정 섹션을 업데이트하고 해당 JSON 파일에 저장하는 함수
async function updateGetTableOptionSection(sectionName, newData) {
  try {
    console.log(`💾 [Backend WS Server] Updating getTableOption section: ${sectionName}`);
    console.log(`💾 [Backend WS Server] New data:`, newData);
    
    // getTableOption 객체 업데이트
    getTableOption[sectionName] = newData;
    
    // 해당 섹션에 맞는 파일에 저장
    let saveSuccess = false;
    switch (sectionName) {
      case 'delaySettings':
        saveSuccess = await saveDelaySettings(newData.onDelay, newData.offDelay, newData.cycleNumber);
        break;
      case 'deviceStates':
        saveSuccess = await saveDeviceStates(newData);
        break;
      case 'highTempSettings':
        saveSuccess = await saveHighTempSettings(newData);
        break;
      case 'lowTempSettings':
        saveSuccess = await saveLowTempSettings(newData);
        break;
      case 'productInput':
        saveSuccess = await saveProductInput(newData);
        break;
      case 'usbPortSettings':
        saveSuccess = await saveUsbPortSettings(newData);
        break;
      case 'outVoltSettings':
        saveSuccess = await saveOutVoltSettings(newData);
        break;
      case 'channelVoltages':
        saveSuccess = await saveChannelVoltages(newData);
        break;
      default:
        throw new Error(`Unknown section: ${sectionName}`);
    }
    
    if (saveSuccess) {
      console.log(`✅ [Backend WS Server] getTableOption section '${sectionName}' updated and saved successfully`);
      return true;
    } else {
      throw new Error(`Failed to save ${sectionName} to file`);
    }
  } catch (error) {
    console.error(`❌ [Backend WS Server] Failed to update getTableOption section '${sectionName}': ${error.message}`);
    throw error;
  }
}

// getTableOption 객체의 전체 내용을 모든 JSON 파일에 저장하는 함수
async function saveGetTableOption() {
  try {
    console.log(`💾 [Backend WS Server] Saving entire getTableOption to all JSON files...`);
    console.log(`💾 [Backend WS Server] getTableOption to save:`, JSON.stringify(getTableOption, null, 2));
    
    // 모든 설정 파일을 병렬로 저장
    const saveResults = await Promise.all([
      saveDelaySettings(getTableOption.delaySettings.onDelay, getTableOption.delaySettings.offDelay),
      saveDeviceStates(getTableOption.deviceStates),
      saveHighTempSettings(getTableOption.highTempSettings),
      saveLowTempSettings(getTableOption.lowTempSettings),
      saveProductInput(getTableOption.productInput),
      saveUsbPortSettings(getTableOption.usbPortSettings),
      saveOutVoltSettings(getTableOption.outVoltSettings),
      saveChannelVoltages(getTableOption.channelVoltages)
    ]);
    
    // 모든 저장이 성공했는지 확인
    const allSuccess = saveResults.every(result => result === true);
    
    if (allSuccess) {
      console.log(`✅ [Backend WS Server] getTableOption saved to all JSON files successfully`);
      return true;
    } else {
      throw new Error('Some files failed to save');
    }
  } catch (error) {
    console.error(`❌ [Backend WS Server] Failed to save getTableOption: ${error.message}`);
    throw error;
  }
}

function convertStringToArray(str) {
  // trim()을 사용하여 문자열 양 끝의 공백을 제거하고,
  // split(' ')을 사용하여 공백을 기준으로 문자열을 분리합니다.
  // filter(word => word !== '')를 사용하여 빈 문자열 요소를 제거합니다.
  return str.trim().split(' ').filter(word => word !== '');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 모든 클라이언트에게 메시지를 브로드캐스트하는 함수
function broadcastToClients(message) {
  console.log(`[Broadcast] 브로드캐스트 시작 - 연결된 클라이언트 수: ${wss.clients.size}`);
  let sentCount = 0;
  
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
      sentCount++;
      console.log(`[Broadcast] 클라이언트 ${client._socket.remoteAddress}:${client._socket.remotePort}에 메시지 전송`);
    } else {
      console.log(`[Broadcast] 클라이언트 ${client._socket.remoteAddress}:${client._socket.remotePort} 연결 상태: ${client.readyState}`);
    }
  });
  
  console.log(`[Broadcast] 브로드캐스트 완료 - 전송된 클라이언트 수: ${sentCount}`);
}

// 함수와 객체를 export하여 다른 모듈에서 사용할 수 있도록 함
export { broadcastToClients, wss };

wss.on('connection', ws => {
    console.log(`[Backend WS Server] 클라이언트 연결됨 (${ws._socket.remoteAddress}:${ws._socket.remotePort})`);

    // 챔버 온도 모니터링 시작
    startChamberTemperatureMonitoring();
    
    // 현재 챔버 온도를 클라이언트에게 즉시 전송
    if (currentChamberTemperature !== null) {
        const temperatureMessage = `[CHAMBER_TEMPERATURE] ${currentChamberTemperature}`;
        ws.send(temperatureMessage);
        console.log(`🌡️ [Backend WS Server] Sending current chamber temperature to new client: ${currentChamberTemperature}°C`);
    }

    // 클라이언트 연결 시 저장된 기기 상태를 자동으로 전송
    const sendInitialDeviceState = async () => {
        try {
            const savedStates = await loadDeviceStates();
            console.log(`📤 [Backend WS Server] Sending initial device states to client (array):`, savedStates);
            console.log(`📤 [Backend WS Server] Sending device states array on connection`);
            ws.send(`Initial device states: ${JSON.stringify(savedStates)}`);
        } catch (error) {
            console.error(`❌ [Backend WS Server] Failed to send initial device states: ${error.message}`);
            // 기본값 전송 - 10개 요소 배열 (첫 번째 기기만 선택된 상태)
            const defaultStates = [true, false, false, false, false, false, false, false, false, false];
            console.log(`📤 [Backend WS Server] Sending default device states (array):`, defaultStates);
            ws.send(`Initial device states: ${JSON.stringify(defaultStates)}`);
        }
    };

    // 클라이언트 연결 시 저장된 고온 설정을 자동으로 전송
    const sendInitialHighTempSettings = async () => {
        try {
            const savedSettings = await loadHighTempSettings();
            console.log(`📤 [Backend WS Server] Sending initial high temp settings to client:`, savedSettings);
            ws.send(`Initial high temp settings: ${JSON.stringify(savedSettings)}`);
        } catch (error) {
            console.error(`❌ [Backend WS Server] Failed to send initial high temp settings: ${error.message}`);
            // 기본값 전송 - 고온 측정 선택이 off 상태
            const defaultSettings = {
                highTemp: false, // 기본적으로 off 상태
                targetTemp: 75,
                waitTime: 200,
                readCount: 10,
            };
            console.log(`📤 [Backend WS Server] Sending default high temp settings:`, defaultSettings);
            ws.send(`Initial high temp settings: ${JSON.stringify(defaultSettings)}`);
        }
    };

    // 클라이언트 연결 시 저장된 저온 설정을 자동으로 전송
    const sendInitialLowTempSettings = async () => {
        try {
            const savedSettings = await loadLowTempSettings();
            console.log(`📤 [Backend WS Server] Sending initial low temp settings to client:`, savedSettings);
            console.log(`📤 [Backend WS Server] Saved settings lowTemp value:`, savedSettings.lowTemp);
            console.log(`📤 [Backend WS Server] Saved settings lowTemp type:`, typeof savedSettings.lowTemp);
            ws.send(`Initial low temp settings: ${JSON.stringify(savedSettings)}`);
        } catch (error) {
            console.error(`❌ [Backend WS Server] Failed to send initial low temp settings: ${error.message}`);
            // 기본값 전송 - 저온 측정 선택이 off 상태
            const defaultSettings = {
                lowTemp: false, // 기본적으로 off 상태
                targetTemp: -32,
                waitTime: 200,
                readCount: 10,
            };
            console.log(`📤 [Backend WS Server] Sending default low temp settings:`, defaultSettings);
            ws.send(`Initial low temp settings: ${JSON.stringify(defaultSettings)}`);
        }
    };

    // 클라이언트 연결 시 저장된 제품 입력을 자동으로 전송
    const sendInitialProductInput = async () => {
        try {
            const savedProductInput = await loadProductInput();
            console.log(`📤 [Backend WS Server] Sending initial product input to client:`, savedProductInput);
            ws.send(`Initial product input: ${JSON.stringify(savedProductInput)}`);
        } catch (error) {
            console.error(`❌ [Backend WS Server] Failed to send initial product input: ${error.message}`);
            // 기본값 전송
            const defaultProductInput = {
                modelName: '61514540',
                productNames: ['PL2222', 'PL2233', 'PL2244', 'PL2255', 'PL2266', 'PL2277', 'PL2288', 'PL2299', 'PL2300', 'PL2311']
            };
            console.log(`📤 [Backend WS Server] Sending default product input:`, defaultProductInput);
            ws.send(`Initial product input: ${JSON.stringify(defaultProductInput)}`);
        }
    };

    // 클라이언트 연결 시 저장된 USB 포트 설정을 자동으로 전송
    const sendInitialUsbPortSettings = async () => {
        try {
            const savedSettings = await loadUsbPortSettings();
            console.log(`📤 [Backend WS Server] Sending initial USB port settings to client:`, savedSettings);
            ws.send(`Initial USB port settings: ${JSON.stringify(savedSettings)}`);
        } catch (error) {
            console.error(`❌ [Backend WS Server] Failed to load USB port settings: ${error.message}`);
            console.error(`❌ [Backend WS Server] No USB port settings available - client must configure ports`);
            ws.send(`Error: No USB port settings found - please configure ports first`);
        }
    };

    // 클라이언트 연결 시 저장된 입력 전압 설정을 자동으로 전송 (배열)
    const sendInitialOutVoltSettings = async () => {
        try {
            const savedSettings = await loadOutVoltSettings();
            ws.send(`Initial out volt settings: ${JSON.stringify(savedSettings)}`);
        } catch (error) {
            ws.send(`Initial out volt settings: ${JSON.stringify([18.0, 24.0, 30.0, 0.0])}`);
        }
    };

    // 클라이언트 연결 시 저장된 채널 전압 설정을 자동으로 전송 (배열)
    const sendInitialChannelVoltages = async () => {
        try {
            const savedChannelVoltages = await loadChannelVoltages();
            ws.send(`Initial channel voltages: ${JSON.stringify(savedChannelVoltages)}`);
        } catch (error) {
            ws.send(`Initial channel voltages: ${JSON.stringify([5.0, 15.0, -15.0, 24.0])}`);
        }
    };

    // 연결 즉시 저장된 기기 상태, 고온 설정, 저온 설정, 제품 입력, USB 포트 설정, 입력 전압 설정, 채널 전압 설정 전송
    sendInitialDeviceState();
    sendInitialHighTempSettings();
    sendInitialLowTempSettings();
    sendInitialProductInput();
    sendInitialUsbPortSettings();
    sendInitialOutVoltSettings();
    sendInitialChannelVoltages();
    
    // 현재 머신 실행 상태 전송
    const currentMachineStatus = getMachineRunningStatus();
    const statusMessage = `[POWER_SWITCH] STATUS - Machine running: ${currentMachineStatus}`;
    ws.send(statusMessage);
    console.log(`📤 [Backend WS Server] Sending current machine status: ${currentMachineStatus}`);
    
    // getTableOption 초기화 및 전송
    const sendInitialGetTableOption = async () => {
        try {
            const tableOption = await loadGetTableOption();
            console.log(`📤 [Backend WS Server] Sending initial getTableOption to client:`, tableOption);
            ws.send(`Initial getTableOption: ${JSON.stringify(tableOption)}`);
        } catch (error) {
            console.error(`❌ [Backend WS Server] Failed to send initial getTableOption: ${error.message}`);
            ws.send(`Error: Failed to load getTableOption - ${error.message}`);
        }
    };
    
    sendInitialGetTableOption();

    // 클라이언트로부터 메시지를 수신했을 때
    ws.on('message', async message => {
        try {
            const decodedMessage = message.toString(); // Buffer를 문자열로 변환
            console.log(`[Backend WS Server] 메시지 수신: ${decodedMessage}`);
            // 수신한 메시지를 클라이언트에게 다시 에코합니다.
            ws.send(`[Echo from Backend WS Server] ${decodedMessage}`);
            const decodeWebSocket = convertStringToArray(decodedMessage);

            console.log(decodeWebSocket);

            // device select process         
            if(decodeWebSocket[0] === '[DEVICE_SELECT]') {
                console.log("=== Device Selection Process: OK ===");
                console.log("📥 Raw message received:", decodedMessage);
                console.log("📥 Parsed message parts:", decodeWebSocket);
                
                try {
                    // [DEVICE_SELECT] 부분을 제외하고 나머지 데이터 부분만 추출
                    const deviceSelectionData = decodedMessage.replace('[DEVICE_SELECT] ', '');
                    console.log("📥 Device selection data extracted (without command):", deviceSelectionData);
                    
                    const selectedDeviceIndices = JSON.parse(deviceSelectionData);
                    console.log("📥 Parsed selected device indices:", selectedDeviceIndices);
                    
                    if (Array.isArray(selectedDeviceIndices)) {
                        // 10개 디바이스의 boolean 배열 생성 (기본값: false)
                        const deviceStates = new Array(10).fill(false);
                        
                        // 선택된 디바이스 인덱스들을 true로 설정
                        selectedDeviceIndices.forEach(deviceIndex => {
                            if (deviceIndex >= 0 && deviceIndex < 10) {
                                deviceStates[deviceIndex] = true;
                            }
                        });
                        
                        console.log("📥 Converted device states array:", deviceStates);
                        
                        // getTableOption 업데이트 및 저장
                        const updateSuccess = await updateGetTableOptionSection('deviceStates', deviceStates);
                        if (updateSuccess) {
                            console.log(`✅ [Backend WS Server] Device states saved:`, deviceStates);
                            ws.send(`Device states saved: ${JSON.stringify(deviceStates)}`);
                        } else {
                            console.error(`❌ [Backend WS Server] Failed to save device states`);
                            ws.send(`Error: Failed to save device states`);
                        }
                    } else {
                        console.error(`❌ [Backend WS Server] Invalid device selection format:`, typeof selectedDeviceIndices);
                        ws.send(`Error: Invalid device selection format - expected array`);
                    }
                } catch (error) {
                    console.error(`❌ [Backend WS Server] Device selection error: ${error.message}`);
                    ws.send(`Error: Device selection failed - ${error.message}`);
                }
            } else if(decodeWebSocket[0] === '[DEVICE_READ]') {
                console.log("=== Device Read Process: OK ===");
                try {
                    const deviceStates = await loadDeviceStates();
                    console.log("📤 [Backend WS Server] Sending device states to client:", deviceStates);
                    ws.send(`Initial device states: ${JSON.stringify(deviceStates)}`);
                } catch (error) {
                    console.error(`❌ [Backend WS Server] Failed to load device states: ${error.message}`);
                    // 기본값 전송 - 10개 요소 배열 (첫 번째 기기만 선택된 상태)
                    const defaultStates = [true, false, false, false, false, false, false, false, false, false];
                    console.log(`📤 [Backend WS Server] Sending default device states:`, defaultStates);
                    ws.send(`Initial device states: ${JSON.stringify(defaultStates)}`);
                }
            } else if(decodeWebSocket[0] === '[VOLT_SELECT]') {
                const voltCommand = decodeWebSocket[1];
                console.log(`[Backend WS Server] Voltage command received: ${voltCommand}`);
                
                try {
                    await SendVoltCommand(voltCommand);
                    await sleep(1000);
                    ws.send(`Voltage command executed: ${voltCommand}`);
                } catch (error) {
                    console.error(`[Backend WS Server] Voltage command error: ${error.message}`);
                    ws.send(`Error: Voltage command failed - ${error.message}`);
                }
               
            } else if(decodeWebSocket[0] === '[READ_VOLT]') {
                console.log("Read Volt Process: OK");
                try {
                    const voltData = await ReadAllVoltages();
                    if (!voltData || !Array.isArray(voltData) || voltData.length !== 5) {
                        ws.send("Error: Voltage data is invalid or incomplete.");
                        console.error("[Backend WS Server] Voltage data invalid:", voltData);
                        return;
                    }
                    ws.send(`Voltage data: ${JSON.stringify(voltData)}`);
                } catch (error) {
                    ws.send(`Error: Failed to read voltages - ${error.message}`);
                    console.error(`[Backend WS Server] ReadAllVoltages error:`, error);
                }
            } else if(decodeWebSocket[0] === '[TEST_PROCESS]') {
                const index = decodeWebSocket[1].substring(1);
                console.log("Test Process: " + index);
                
                try {
                    const data = await GetData();
                    console.log("Data: " + JSON.stringify(data));
                    ws.send(`Data: ${JSON.stringify(data)}`);
                } catch (error) {
                    console.error(`[Backend WS Server] Test process error: ${error.message}`);
                    ws.send(`Error: Test process failed - ${error.message}`);
                }
            } else if(decodeWebSocket[0] === '[READ_CHAMBER]') {
                const index = decodeWebSocket[1].substring(1);
                console.log("Read Temperature Process: " + index);
                
                try {
                    // getTableOption에서 챔버 포트 설정 가져오기
                    const chamberPort = getTableOption.usbPortSettings.chamber || '/dev/ttyUSB0';
                    console.log(`🌡️ [Backend WS Server] Reading chamber temperature from port: ${chamberPort}`);
                    
                    const data = await ReadChamber(chamberPort);
                    console.log("Temperature: " + JSON.stringify(data));
                    ws.send(`Temperature: ${JSON.stringify(data)}`);
                } catch (error) {
                    console.error(`[Backend WS Server] Read Temperature process error: ${error.message}`);
                    ws.send(`Error: Read Temperature process failed - ${error.message}`);
                }
            } else if(decodeWebSocket[0] === '[DELAY_SETTINGS]') {
                console.log("=== Delay Settings Process: OK ===");
                console.log("📥 Raw message received:", decodedMessage);
                console.log("📥 Parsed message parts:", decodeWebSocket);
                
                try {
                    // 메시지에서 ON_DELAY, OFF_DELAY, CYCLE 값 추출
                    // decodeWebSocket 배열에서 파라미터들을 개별적으로 추출
                    console.log("📥 Full decodeWebSocket array:", decodeWebSocket);
                    
                    let onDelay = null;
                    let offDelay = null;
                    let cycleNumber = null;
                    
                    // 각 배열 요소에서 파라미터 추출
                    for (let i = 1; i < decodeWebSocket.length; i++) {
                        const part = decodeWebSocket[i];
                        console.log(`📥 Processing part ${i}:`, part);
                        
                        const onDelayMatch = part.match(/ON_DELAY:(\d+)/);
                        const offDelayMatch = part.match(/OFF_DELAY:(\d+)/);
                        const cycleMatch = part.match(/CYCLE:(\d+)/);
                        
                        if (onDelayMatch) onDelay = parseInt(onDelayMatch[1]);
                        if (offDelayMatch) offDelay = parseInt(offDelayMatch[1]);
                        if (cycleMatch) cycleNumber = parseInt(cycleMatch[1]);
                    }
                    
                    console.log("📥 Extracted values:", { onDelay, offDelay, cycleNumber });
                    
                    // 모든 파라미터가 추출되었는지 확인
                    if (onDelay !== null && offDelay !== null) {
                        // CYCLE이 없으면 기본값 1 사용
                        if (cycleNumber === null) {
                            cycleNumber = 1;
                            console.log("📥 Using default cycle number: 1");
                        }
                        
                        console.log("📥 All parameters extracted successfully");
                        
                        // 값 검증 (0-999 범위, cycle은 1-3 범위)
                        if (onDelay >= 0 && onDelay <= 999 && 
                            offDelay >= 0 && offDelay <= 999 && 
                            cycleNumber >= 1 && cycleNumber <= 3) {
                            
                            // 딜레이 설정 객체 생성
                            const delaySettings = {
                                onDelay,
                                offDelay,
                                cycleNumber
                            };
                            
                            console.log("💾 [Backend WS Server] Attempting to save delay settings:", delaySettings);
                            
                            // getTableOption 업데이트 및 저장
                            const updateSuccess = await updateGetTableOptionSection('delaySettings', delaySettings);
                            if (updateSuccess) {
                                console.log(`✅ [Backend WS Server] Delay settings saved successfully:`, delaySettings);
                                ws.send(`Delay settings saved: ${JSON.stringify(delaySettings)}`);
                            } else {
                                console.error(`❌ [Backend WS Server] Failed to save delay settings`);
                                ws.send(`Error: Failed to save delay settings`);
                            }
                        } else {
                            console.error(`❌ [Backend WS Server] Invalid delay values:`, { onDelay, offDelay, cycleNumber });
                            ws.send(`Error: Invalid delay values. ON_DELAY/OFF_DELAY: 0-999 seconds, CYCLE: 1-3`);
                        }
                    } else {
                        console.error(`❌ [Backend WS Server] Missing required parameters`);
                        console.error(`❌ [Backend WS Server] onDelay: ${onDelay}, offDelay: ${offDelay}, cycleNumber: ${cycleNumber}`);
                        ws.send(`Error: Missing required parameters - ON_DELAY and OFF_DELAY are required`);
                    }
                } catch (error) {
                    console.error(`❌ [Backend WS Server] Delay settings error: ${error.message}`);
                    ws.send(`Error: Delay settings failed - ${error.message}`);
                }
            } else if(decodeWebSocket[0] === '[GET_DELAY_SETTINGS]') {
                console.log("Get Delay Settings Process: OK");
                
                try {
                    const settings = await loadDelaySettings();
                    ws.send(`Delay settings: ${JSON.stringify(settings)}`);
                } catch (error) {
                    console.error(`[Backend WS Server] Get delay settings error: ${error.message}`);
                    ws.send(`Error: Failed to get delay settings - ${error.message}`);
                }   
            } else if(decodeWebSocket[0] === '[SAVE_DEVICE_STATES]') {
                console.log("=== Save Device States Process: OK ===");
                console.log("📥 Raw message received:", decodedMessage);
                console.log("📥 Parsed message parts:", decodeWebSocket);
                
                try {
                    // [SAVE_DEVICE_STATES] 부분을 제외하고 나머지 device state 부분만 추출
                    const deviceStatesData = decodedMessage.replace('[SAVE_DEVICE_STATES] ', '');
                    console.log("📥 Device states data extracted (without command):", deviceStatesData);
                    
                    const deviceStates = JSON.parse(deviceStatesData);
                    console.log("📥 Parsed device states (array):", deviceStates);
                    
                    // 배열 형태 검증
                    if (Array.isArray(deviceStates) && deviceStates.length === 10) {
                        console.log(`✅ [Backend WS Server] Received device states to save (array):`, deviceStates);
                        
                        // 모든 요소가 boolean인지 확인
                        if (!deviceStates.every(state => typeof state === 'boolean')) {
                            throw new Error('All device states must be boolean values');
                        }
                        
                        // 배열 형태로 파일에 저장
                        const saveSuccess = await saveDeviceStates(deviceStates);
                        if (saveSuccess) {
                            const responseMessage = `Device states saved: ${JSON.stringify(deviceStates)}`;
                            console.log(`✅ [Backend WS Server] Sending confirmation:`, responseMessage);
                            ws.send(responseMessage);
                            console.log(`✅ [Backend WS Server] Device states successfully saved to file (array)`);
                        } else {
                            console.error(`❌ [Backend WS Server] Failed to save device states to file`);
                            ws.send(`Error: Failed to save device states`);
                        }
                    } else {
                        console.error(`❌ [Backend WS Server] Invalid device states format:`, typeof deviceStates);
                        console.error(`❌ [Backend WS Server] Expected array with 10 elements, got:`, deviceStates);
                        ws.send(`Error: Invalid device states format - expected array with 10 boolean elements`);
                    }
                } catch (error) {
                    console.error(`❌ [Backend WS Server] Save device states error: ${error.message}`);
                    console.error(`❌ [Backend WS Server] Error stack:`, error.stack);
                    ws.send(`Error: Save device states failed - ${error.message}`);
                }
            } else if(decodeWebSocket[0] === '[SAVE_HIGH_TEMP_SETTINGS]') {
                console.log("=== Save High Temp Settings Process: OK ===");
                console.log("📥 Raw message received:", decodedMessage);
                console.log("📥 Parsed message parts:", decodeWebSocket);
                
                try {
                    // [SAVE_HIGH_TEMP_SETTINGS] 부분을 제외하고 나머지 settings 부분만 추출
                    const settingsData = decodedMessage.replace('[SAVE_HIGH_TEMP_SETTINGS] ', '');
                    console.log("📥 Settings data extracted (without command):", settingsData);
                    
                    const settings = JSON.parse(settingsData);
                    console.log("📥 Parsed high temp settings:", settings);
                    
                    if (typeof settings === 'object' && settings !== null) {
                        console.log(`✅ [Backend WS Server] Received high temp settings to save:`, settings);
                        
                        // 고온 설정을 파일에 저장
                        const saveSuccess = await saveHighTempSettings(settings);
                        if (saveSuccess) {
                            const responseMessage = `High temp settings saved: ${JSON.stringify(settings)}`;
                            console.log(`✅ [Backend WS Server] Sending confirmation:`, responseMessage);
                            ws.send(responseMessage);
                            console.log(`✅ [Backend WS Server] High temp settings successfully saved to file`);
                        } else {
                            console.error(`❌ [Backend WS Server] Failed to save high temp settings to file`);
                            ws.send(`Error: Failed to save high temp settings`);
                        }
                    } else {
                        console.error(`❌ [Backend WS Server] Invalid high temp settings format:`, typeof settings);
                        ws.send(`Error: Invalid high temp settings format - expected object`);
                    }
                } catch (error) {
                    console.error(`❌ [Backend WS Server] Save high temp settings error: ${error.message}`);
                    console.error(`❌ [Backend WS Server] Error stack:`, error.stack);
                    ws.send(`Error: Save high temp settings failed - ${error.message}`);
                }
            } else if(decodeWebSocket[0] === '[READ_HIGH_TEMP_SETTINGS]') {
                console.log("=== Read High Temp Settings Process: OK ===");
                console.log("📥 Raw message received:", decodedMessage);
                
                try {
                    // 서버에서 고온 설정을 읽어와서 클라이언트에게 전송
                    const savedSettings = await loadHighTempSettings();
                    console.log(`📤 [Backend WS Server] Sending high temp settings to client:`, savedSettings);
                    ws.send(`High temp settings read: ${JSON.stringify(savedSettings)}`);
                } catch (error) {
                    console.error(`❌ [Backend WS Server] Failed to read high temp settings: ${error.message}`);
                    // 기본값 전송
                    const defaultSettings = {
                        highTemp: false,
                        targetTemp: 75,
                        waitTime: 200,
                        readCount: 10,
                    };
                    console.log(`📤 [Backend WS Server] Sending default high temp settings:`, defaultSettings);
                    ws.send(`High temp settings read: ${JSON.stringify(defaultSettings)}`);
                }
            } else if(decodeWebSocket[0] === '[SAVE_LOW_TEMP_SETTINGS]') {
                console.log("=== Save Low Temp Settings Process: OK ===");
                console.log("📥 Raw message received:", decodedMessage);
                console.log("📥 Parsed message parts:", decodeWebSocket);
                
                try {
                    // [SAVE_LOW_TEMP_SETTINGS] 부분을 제외하고 나머지 settings 부분만 추출
                    const settingsData = decodedMessage.replace('[SAVE_LOW_TEMP_SETTINGS] ', '');
                    console.log("📥 Settings data extracted (without command):", settingsData);
                    
                    const settings = JSON.parse(settingsData);
                    console.log("📥 Parsed low temp settings:", settings);
                    
                    if (typeof settings === 'object' && settings !== null) {
                        console.log(`✅ [Backend WS Server] Received low temp settings to save:`, settings);
                        
                        // 저온 설정을 파일에 저장
                        const saveSuccess = await saveLowTempSettings(settings);
                        if (saveSuccess) {
                            const responseMessage = `Low temp settings saved: ${JSON.stringify(settings)}`;
                            console.log(`✅ [Backend WS Server] Sending confirmation:`, responseMessage);
                            ws.send(responseMessage);
                            console.log(`✅ [Backend WS Server] Low temp settings successfully saved to file`);
                            
                            // 설정 저장 후 getTableOption 즉시 리로드
                            try {
                                console.log(`🔄 [Backend WS Server] Reloading getTableOption after low temp settings save...`);
                                await loadGetTableOption();
                                console.log(`✅ [Backend WS Server] getTableOption reloaded successfully after low temp settings save`);
                            } catch (reloadError) {
                                console.error(`❌ [Backend WS Server] Failed to reload getTableOption: ${reloadError.message}`);
                            }
                        } else {
                            console.error(`❌ [Backend WS Server] Failed to save low temp settings to file`);
                            ws.send(`Error: Failed to save low temp settings`);
                        }
                    } else {
                        console.error(`❌ [Backend WS Server] Invalid low temp settings format:`, typeof settings);
                        ws.send(`Error: Invalid low temp settings format - expected object`);
                    }
                } catch (error) {
                    console.error(`❌ [Backend WS Server] Save low temp settings error: ${error.message}`);
                    console.error(`❌ [Backend WS Server] Error stack:`, error.stack);
                    ws.send(`Error: Save low temp settings failed - ${error.message}`);
                }
            } else if(decodeWebSocket[0] === '[READ_LOW_TEMP_SETTINGS]') {
                console.log("=== Read Low Temp Settings Process: OK ===");
                console.log("📥 Raw message received:", decodedMessage);
                
                try {
                    // 서버에서 저온 설정을 읽어와서 클라이언트에게 전송
                    const savedSettings = await loadLowTempSettings();
                    console.log(`📤 [Backend WS Server] Sending low temp settings to client:`, savedSettings);
                    ws.send(`Low temp settings read: ${JSON.stringify(savedSettings)}`);
                } catch (error) {
                    console.error(`❌ [Backend WS Server] Failed to read low temp settings: ${error.message}`);
                    // 기본값 전송
                    const defaultSettings = {
                        lowTemp: false,
                        targetTemp: -32,
                        waitTime: 200,
                        readCount: 10,
                    };
                    console.log(`📤 [Backend WS Server] Sending default low temp settings:`, defaultSettings);
                    ws.send(`Low temp settings read: ${JSON.stringify(defaultSettings)}`);
                }
            } else if(decodeWebSocket[0] === '[SAVE_PRODUCT_INPUT]') {
                console.log("=== Save Product Input Process: OK ===");
                console.log("📥 Raw message received:", decodedMessage);
                console.log("📥 Parsed message parts:", decodeWebSocket);
                
                try {
                    // [SAVE_PRODUCT_INPUT] 부분을 제외하고 나머지 product input 부분만 추출
                    const productInputData = decodedMessage.replace('[SAVE_PRODUCT_INPUT] ', '');
                    console.log("📥 Product input data extracted (without command):", productInputData);
                    
                    const productInput = JSON.parse(productInputData);
                    console.log("📥 Parsed product input:", productInput);
                    
                    if (typeof productInput === 'object' && productInput !== null) {
                        console.log(`✅ [Backend WS Server] Received product input to save:`, productInput);
                        
                        // 제품 입력을 파일에 저장
                        const saveSuccess = await saveProductInput(productInput);
                        if (saveSuccess) {
                            const responseMessage = `Product input saved: ${JSON.stringify(productInput)}`;
                            console.log(`✅ [Backend WS Server] Sending confirmation:`, responseMessage);
                            ws.send(responseMessage);
                            console.log(`✅ [Backend WS Server] Product input successfully saved to file`);
                        } else {
                            console.error(`❌ [Backend WS Server] Failed to save product input to file`);
                            ws.send(`Error: Failed to save product input`);
                        }
                    } else {
                        console.error(`❌ [Backend WS Server] Invalid product input format:`, typeof productInput);
                        ws.send(`Error: Invalid product input format - expected object`);
                    }
                } catch (error) {
                    console.error(`❌ [Backend WS Server] Save product input error: ${error.message}`);
                    console.error(`❌ [Backend WS Server] Error stack:`, error.stack);
                    ws.send(`Error: Save product input failed - ${error.message}`);
                }
                            } else if(decodeWebSocket[0] === '[SAVE_USB_PORT_SETTINGS]') {
                console.log("=== Save USB Port Settings Process: OK ===");
                console.log("📥 Raw message received:", decodedMessage);
                console.log("📥 Parsed message parts:", decodeWebSocket);
                
                try {
                    // [SAVE_USB_PORT_SETTINGS] 부분을 제외하고 나머지 settings 부분만 추출
                    const settingsData = decodedMessage.replace('[SAVE_USB_PORT_SETTINGS] ', '');
                    console.log("📥 USB port settings data extracted (without command):", settingsData);
                    
                    const settings = JSON.parse(settingsData);
                    console.log("📥 Parsed USB port settings:", settings);
                    
                    if (typeof settings === 'object' && settings !== null) {
                        console.log(`✅ [Backend WS Server] Received USB port settings to save:`, settings);
                        
                        // USB 포트 설정을 파일에 저장
                        const saveSuccess = await saveUsbPortSettings(settings);
                        if (saveSuccess) {
                            const responseMessage = `USB port settings saved: ${JSON.stringify(settings)}`;
                            console.log(`✅ [Backend WS Server] Sending confirmation:`, responseMessage);
                            ws.send(responseMessage);
                            console.log(`✅ [Backend WS Server] USB port settings successfully saved to file`);
                        } else {
                            console.error(`❌ [Backend WS Server] Failed to save USB port settings to file`);
                            ws.send(`Error: Failed to save USB port settings`);
                        }
                    } else {
                        console.error(`❌ [Backend WS Server] Invalid USB port settings format:`, typeof settings);
                        ws.send(`Error: Invalid USB port settings format - expected object`);
                    }
                } catch (error) {
                    console.error(`❌ [Backend WS Server] Save USB port settings error: ${error.message}`);
                    console.error(`❌ [Backend WS Server] Error stack:`, error.stack);
                    ws.send(`Error: Save USB port settings failed - ${error.message}`);
                }
            } else if(decodeWebSocket[0] === '[SAVE_OUT_VOLT_SETTINGS]') {
                console.log("=== Save Out Volt Settings Process: OK ===");
                console.log("📥 Raw message received:", decodedMessage);
                console.log("📥 Parsed message parts:", decodeWebSocket);
                
                try {
                    // [SAVE_OUT_VOLT_SETTINGS] 부분을 제외하고 나머지 settings 부분만 추출
                    const settingsData = decodedMessage.replace('[SAVE_OUT_VOLT_SETTINGS] ', '');
                    console.log("📥 Out volt settings data extracted (without command):", settingsData);
                    
                    const settings = JSON.parse(settingsData);
                    console.log("📥 Parsed out volt settings:", settings);
                    
                    if (typeof settings === 'object' && settings !== null) {
                        console.log(`✅ [Backend WS Server] Received out volt settings to save:`, settings);
                        
                        // 입력 전압 설정을 파일에 저장
                        const saveSuccess = await saveOutVoltSettings(settings);
                        if (saveSuccess) {
                            const responseMessage = `Out volt settings saved: ${JSON.stringify(settings)}`;
                            console.log(`✅ [Backend WS Server] Sending confirmation:`, responseMessage);
                            ws.send(responseMessage);
                            console.log(`✅ [Backend WS Server] Out volt settings successfully saved to file`);
                        } else {
                            console.error(`❌ [Backend WS Server] Failed to save out volt settings to file`);
                            ws.send(`Error: Failed to save out volt settings`);
                        }
                    } else {
                        console.error(`❌ [Backend WS Server] Invalid out volt settings format:`, typeof settings);
                        ws.send(`Error: Invalid out volt settings format - expected object`);
                    }
                } catch (error) {
                    console.error(`❌ [Backend WS Server] Save out volt settings error: ${error.message}`);
                    console.error(`❌ [Backend WS Server] Error stack:`, error.stack);
                    ws.send(`Error: Save out volt settings failed - ${error.message}`);
                }
            } else if(decodeWebSocket[0] === '[CHANNEL_VOLTAGES]') {
                console.log("=== Save Channel Voltages Process: OK ===");
                console.log("📥 Raw message received:", decodedMessage);
                console.log("📥 Parsed message parts:", decodeWebSocket);
                
                try {
                    // [CHANNEL_VOLTAGES] 부분을 제외하고 나머지 voltages 부분만 추출
                    const voltagesData = decodedMessage.replace('[CHANNEL_VOLTAGES] ', '');
                    console.log("📥 Channel voltages data extracted (without command):", voltagesData);
                    
                    const voltages = JSON.parse(voltagesData);
                    console.log("📥 Parsed channel voltages:", voltages);
                    
                    if (Array.isArray(voltages) && voltages.length === 4) {
                        console.log(`✅ [Backend WS Server] Received channel voltages to save:`, voltages);
                        
                        // 채널 전압 설정을 파일에 저장
                        const saveSuccess = await saveChannelVoltages(voltages);
                        if (saveSuccess) {
                            const responseMessage = `[CHANNEL_VOLTAGES_SAVED] ${JSON.stringify(voltages)}`;
                            console.log(`✅ [Backend WS Server] Sending confirmation:`, responseMessage);
                            ws.send(responseMessage);
                            console.log(`✅ [Backend WS Server] Channel voltages successfully saved to file`);
                        } else {
                            console.error(`❌ [Backend WS Server] Failed to save channel voltages to file`);
                            ws.send(`Error: Failed to save channel voltages`);
                        }
                    } else {
                        console.error(`❌ [Backend WS Server] Invalid channel voltages format:`, typeof voltages);
                        ws.send(`Error: Invalid channel voltages format - expected array with 4 elements`);
                    }
                } catch (error) {
                    console.error(`❌ [Backend WS Server] Save channel voltages error: ${error.message}`);
                    console.error(`❌ [Backend WS Server] Error stack:`, error.stack);
                    ws.send(`Error: Save channel voltages failed - ${error.message}`);
                }
            } else if(decodeWebSocket[0] === '[SAVE_CHANNEL_VOLTAGES]') {
                console.log("=== Save Channel Voltages Process: OK ===");
                console.log("📥 Raw message received:", decodedMessage);
                console.log("📥 Parsed message parts:", decodeWebSocket);
                
                try {
                    // [SAVE_CHANNEL_VOLTAGES] 부분을 제외하고 나머지 voltages 부분만 추출
                    const voltagesData = decodedMessage.replace('[SAVE_CHANNEL_VOLTAGES] ', '');
                    console.log("📥 Channel voltages data extracted (without command):", voltagesData);
                    
                    const voltages = JSON.parse(voltagesData);
                    console.log("📥 Parsed channel voltages:", voltages);
                    
                    if (Array.isArray(voltages) && voltages.length === 4) {
                        console.log(`✅ [Backend WS Server] Received channel voltages to save:`, voltages);
                        
                        // 채널 전압 설정을 파일에 저장
                        const saveSuccess = await saveChannelVoltages(voltages);
                        if (saveSuccess) {
                            const responseMessage = `Channel voltages saved: ${JSON.stringify(voltages)}`;
                            console.log(`✅ [Backend WS Server] Sending confirmation:`, responseMessage);
                            ws.send(responseMessage);
                            console.log(`✅ [Backend WS Server] Channel voltages successfully saved to file`);
                        } else {
                            console.error(`❌ [Backend WS Server] Failed to save channel voltages to file`);
                            ws.send(`Error: Failed to save channel voltages`);
                        }
                    } else {
                        console.error(`❌ [Backend WS Server] Invalid channel voltages format:`, typeof voltages);
                        ws.send(`Error: Invalid channel voltages format - expected array with 4 elements`);
                    }
                } catch (error) {
                    console.error(`❌ [Backend WS Server] Save channel voltages error: ${error.message}`);
                    console.error(`❌ [Backend WS Server] Error stack:`, error.stack);
                    ws.send(`Error: Save channel voltages failed - ${error.message}`);
                }
            } else if(decodeWebSocket[0] === '[GET_TABLE_OPTION]') {
                console.log("=== Get Table Option Process: OK ===");
                
                try {
                    const tableOption = await loadGetTableOption();
                    const responseMessage = `getTableOption: ${JSON.stringify(tableOption)}`;
                    console.log(`✅ [Backend WS Server] Sending getTableOption:`, responseMessage);
                    ws.send(responseMessage);
                } catch (error) {
                    console.error(`❌ [Backend WS Server] Get table option error: ${error.message}`);
                    ws.send(`Error: Get table option failed - ${error.message}`);
                }
            } else if(decodeWebSocket[0] === '[UPDATE_TABLE_OPTION_SECTION]') {
                console.log("=== Update Table Option Section Process: OK ===");
                console.log("📥 Raw message received:", decodedMessage);
                console.log("📥 Parsed message parts:", decodeWebSocket);
                
                try {
                    // [UPDATE_TABLE_OPTION_SECTION] sectionName 부분을 제외하고 나머지 데이터 부분만 추출
                    const sectionName = decodeWebSocket[1];
                    const dataString = decodedMessage.replace(`[UPDATE_TABLE_OPTION_SECTION] ${sectionName} `, '');
                    console.log("📥 Section name:", sectionName);
                    console.log("📥 Data string extracted:", dataString);
                    
                    const newData = JSON.parse(dataString);
                    console.log("📥 Parsed new data:", newData);
                    
                    if (typeof newData === 'object' && newData !== null) {
                        console.log(`✅ [Backend WS Server] Received update for section '${sectionName}':`, newData);
                        
                        // getTableOption 섹션 업데이트 및 저장
                        const updateSuccess = await updateGetTableOptionSection(sectionName, newData);
                        if (updateSuccess) {
                            const responseMessage = `Table option section '${sectionName}' updated: ${JSON.stringify(newData)}`;
                            console.log(`✅ [Backend WS Server] Sending confirmation:`, responseMessage);
                            ws.send(responseMessage);
                            console.log(`✅ [Backend WS Server] getTableOption section '${sectionName}' successfully updated and saved`);
                        } else {
                            console.error(`❌ [Backend WS Server] Failed to update getTableOption section '${sectionName}'`);
                            ws.send(`Error: Failed to update table option section '${sectionName}'`);
                        }
                    } else {
                        console.error(`❌ [Backend WS Server] Invalid data format for section '${sectionName}':`, typeof newData);
                        ws.send(`Error: Invalid data format for section '${sectionName}' - expected object`);
                    }
                } catch (error) {
                    console.error(`❌ [Backend WS Server] Update table option section error: ${error.message}`);
                    console.error(`❌ [Backend WS Server] Error stack:`, error.stack);
                    ws.send(`Error: Update table option section failed - ${error.message}`);
                }
            } else if(decodeWebSocket[0] === '[SAVE_TABLE_OPTION]') {
                console.log("=== Save Table Option Process: OK ===");
                console.log("📥 Raw message received:", decodedMessage);
                console.log("📥 Parsed message parts:", decodeWebSocket);
                
                try {
                    // [SAVE_TABLE_OPTION] 부분을 제외하고 나머지 table option 부분만 추출
                    const tableOptionData = decodedMessage.replace('[SAVE_TABLE_OPTION] ', '');
                    console.log("📥 Table option data extracted (without command):", tableOptionData);
                    
                    const tableOption = JSON.parse(tableOptionData);
                    console.log("📥 Parsed table option:", tableOption);
                    
                    if (typeof tableOption === 'object' && tableOption !== null) {
                        console.log(`✅ [Backend WS Server] Received complete table option to save:`, tableOption);
                        
                        // getTableOption 객체 업데이트
                        getTableOption = tableOption;
                        
                        // 모든 JSON 파일에 저장
                        const saveSuccess = await saveGetTableOption();
                        if (saveSuccess) {
                            const responseMessage = `Table option saved: ${JSON.stringify(tableOption)}`;
                            console.log(`✅ [Backend WS Server] Sending confirmation:`, responseMessage);
                            ws.send(responseMessage);
                            console.log(`✅ [Backend WS Server] Complete table option successfully saved to all files`);
                        } else {
                            console.error(`❌ [Backend WS Server] Failed to save complete table option to files`);
                            ws.send(`Error: Failed to save table option`);
                        }
                    } else {
                        console.error(`❌ [Backend WS Server] Invalid table option format:`, typeof tableOption);
                        ws.send(`Error: Invalid table option format - expected object`);
                    }
                } catch (error) {
                    console.error(`❌ [Backend WS Server] Save table option error: ${error.message}`);
                    console.error(`❌ [Backend WS Server] Error stack:`, error.stack);
                    ws.send(`Error: Save table option failed - ${error.message}`);
                }
            } else if(decodeWebSocket[0] === '[CHAMBER_TEST]') {
                console.log("=== Chamber Test Process: OK ===");
                console.log("📥 Raw message received:", decodedMessage);
                console.log("📥 Parsed message parts:", decodeWebSocket);
                
                try {
                    const portMatch = decodedMessage.match(/\[CHAMBER_TEST\] PORT:(\d+)/);
                    if (portMatch) {
                        const portNumber = parseInt(portMatch[1]);
                        console.log(`🌡️ [Backend WS Server] Testing chamber on port ${portNumber}`);
                        
                        // 챔버 테스트 시뮬레이션
                        await sleep(1500); // 챔버 테스트는 조금 더 오래 걸림
                        
                        // 챔버 테스트 성공률 (90%)
                        const isSuccess = Math.random() > 0.1;
                        
                        if (isSuccess) {
                            try {
                                // getTableOption에서 챔버 포트 설정 가져오기
                                const chamberPort = getTableOption.usbPortSettings.chamber || '/dev/ttyUSB0';
                                console.log(`🌡️ [Backend WS Server] Reading chamber temperature from port: ${chamberPort}`);
                                
                                // 실제 ReadChamber 함수 호출
                                const temperature = await ReadChamber(chamberPort);
                                
                                if (typeof temperature === 'number') {
                                    const responseMessage = `[CHAMBER_TEST] PORT:${portNumber} STATUS:success MESSAGE:챔버 ${portNumber} 정상 동작`;
                                    console.log(`✅ [Backend WS Server] Chamber ${portNumber} test successful, temperature: ${temperature}°C`);
                                    ws.send(responseMessage);
                                    
                                    // 실제 온도 데이터 전송
                                    const tempData = { temperature: parseFloat(temperature.toFixed(1)) };
                                    ws.send(`Temperature: ${JSON.stringify(tempData)}`);
                                } else {
                                    const responseMessage = `[CHAMBER_TEST] PORT:${portNumber} STATUS:error MESSAGE:챔버 ${portNumber} 온도 읽기 실패`;
                                    console.log(`❌ [Backend WS Server] Chamber ${portNumber} temperature reading failed`);
                                    ws.send(responseMessage);
                                }
                            } catch (error) {
                                console.error(`❌ [Backend WS Server] Chamber temperature reading error: ${error.message}`);
                                const responseMessage = `[CHAMBER_TEST] PORT:${portNumber} STATUS:error MESSAGE:챔버 ${portNumber} 연결 실패`;
                                ws.send(responseMessage);
                            }
                        } else {
                            const responseMessage = `[CHAMBER_TEST] PORT:${portNumber} STATUS:error MESSAGE:챔버 ${portNumber} 연결 실패`;
                            console.log(`❌ [Backend WS Server] Chamber ${portNumber} test failed`);
                            ws.send(responseMessage);
                        }
                    } else {
                        console.error(`❌ [Backend WS Server] Invalid chamber test message format`);
                        ws.send(`Error: Invalid chamber test message format`);
                    }
                } catch (error) {
                    console.error(`❌ [Backend WS Server] Chamber test error: ${error.message}`);
                    ws.send(`Error: Chamber test failed - ${error.message}`);
                }
            } else if(decodeWebSocket[0] === '[POWER_TEST]') {
                console.log("=== Power Test Process: OK ===");
                console.log("📥 Raw message received:", decodedMessage);
                console.log("📥 Parsed message parts:", decodeWebSocket);
                
                try {
                    // Parse port and voltage from message
                    const powerMatch = decodedMessage.match(/\[POWER_TEST\] PORT:(\d+)(?: VOLTAGE:([\d.-]+))?/);
                    if (powerMatch) {
                        const portNumber = parseInt(powerMatch[1]);
                        const voltage = powerMatch[2] ? parseFloat(powerMatch[2]) : 18.0; // Default to 18.0V if not specified
                        
                        console.log(`⚡ [Backend WS Server] Testing power on port ${portNumber} with voltage ${voltage}V`);
                        
                        // Validate voltage range
                        if (voltage < -30.0 || voltage > 30.0) {
                            const responseMessage = `[POWER_TEST] PORT:${portNumber} STATUS:error MESSAGE:전압 범위 오류 (-30.0V ~ 30.0V)`;
                            console.log(`❌ [Backend WS Server] Power ${portNumber} test failed - voltage out of range: ${voltage}V`);
                            ws.send(responseMessage);
                            return;
                        }
                        
                        // Send voltage command to power supply
                        try {
                            console.log(`⚡ [Backend WS Server] Sending voltage command: ${voltage}V`);
                            await SendVoltCommand(voltage);
                            console.log(`✅ [Backend WS Server] Voltage command sent successfully: ${voltage}V`);
                            
                            // 파워 테스트 시뮬레이션
                            await sleep(800); // 파워 테스트는 빠름
                            
                            // 파워 테스트 성공률 (95%)
                            const isSuccess = Math.random() > 0.05;
                            
                            if (isSuccess) {
                                const responseMessage = `[POWER_TEST] PORT:${portNumber} STATUS:success MESSAGE:파워 ${portNumber} 정상 공급 (${voltage}V)`;
                                console.log(`✅ [Backend WS Server] Power ${portNumber} test successful with ${voltage}V`);
                                ws.send(responseMessage);
                            } else {
                                const responseMessage = `[POWER_TEST] PORT:${portNumber} STATUS:error MESSAGE:파워 ${portNumber} 공급 실패`;
                                console.log(`❌ [Backend WS Server] Power ${portNumber} test failed`);
                                ws.send(responseMessage);
                            }
                        } catch (voltError) {
                            console.error(`❌ [Backend WS Server] Voltage command failed: ${voltError.message}`);
                            const responseMessage = `[POWER_TEST] PORT:${portNumber} STATUS:error MESSAGE:전압 설정 실패 - ${voltError.message}`;
                            ws.send(responseMessage);
                        }
                    } else {
                        console.error(`❌ [Backend WS Server] Invalid power test message format`);
                        ws.send(`Error: Invalid power test message format`);
                    }
                } catch (error) {
                    console.error(`❌ [Backend WS Server] Power test error: ${error.message}`);
                    ws.send(`Error: Power test failed - ${error.message}`);
                }
            } else if(decodeWebSocket[0] === '[LOAD_TEST]') {
                console.log("📥 Parsed message parts:", decodeWebSocket);
                console.log("📥 Raw message received:", decodedMessage);
                try {
                    // Parse port and channel from message
                    const loadMatch = decodedMessage.match(/\[LOAD_TEST\] PORT:(\d+)(?: CHANNEL:(\d+))?/);
                    if (loadMatch) {
                        const portNumber = parseInt(loadMatch[1]);
                        const channelNumber = loadMatch[2] ? parseInt(loadMatch[2]) : 1; // Default to channel 1 if not specified
                        
                        console.log(`🔌 [Backend WS Server] Load test on port ${portNumber} with channel ${channelNumber}`);
                        
                        // Validate channel range
                        if (channelNumber < 1 || channelNumber > 5) {
                            const responseMessage = `[LOAD_TEST] PORT:${portNumber} STATUS:error MESSAGE:채널 번호 범위 오류 (1~5)`;
                            console.log(`❌ [Backend WS Server] Load ${portNumber} test failed - channel out of range: ${channelNumber}`);
                            ws.send(responseMessage);
                            return;
                        }
                        
                        // Read voltage from selected channel with 2-second timeout
                        try {
                            console.log(`🔌 [Backend WS Server] Reading voltage from channel ${channelNumber}`);
                            const voltage = await ReadVolt(channelNumber);
                            
                            // Check if voltage reading was successful
                            if (typeof voltage === 'number') {
                                const responseMessage = `[LOAD_TEST] PORT:${portNumber} STATUS:success MESSAGE:로드 ${portNumber} 정상 연결`;
                                console.log(`✅ [Backend WS Server] Load ${portNumber} test successful, voltage: ${voltage}V from channel ${channelNumber}`);
                                ws.send(responseMessage);
                                
                                // Send voltage data with port and channel information
                                const voltageData = { 
                                    port: portNumber, 
                                    voltage: voltage,
                                    channel: channelNumber 
                                };
                                ws.send(`LoadVoltage: ${JSON.stringify(voltageData)}`);
                            } else if (voltage === 'timeout') {
                                const responseMessage = `[LOAD_TEST] PORT:${portNumber} STATUS:error MESSAGE:로드 ${portNumber} 응답 시간 초과 (10초)`;
                                console.log(`❌ [Backend WS Server] Load ${portNumber} test failed - timeout after 10 seconds`);
                                ws.send(responseMessage);
                            } else {
                                const responseMessage = `[LOAD_TEST] PORT:${portNumber} STATUS:error MESSAGE:로드 ${portNumber} 전압 읽기 실패`;
                                console.log(`❌ [Backend WS Server] Load ${portNumber} test failed - invalid voltage reading: ${voltage}`);
                                ws.send(responseMessage);
                            }
                        } catch (voltError) {
                            console.error(`❌ [Backend WS Server] Voltage reading failed: ${voltError.message}`);
                            const responseMessage = `[LOAD_TEST] PORT:${portNumber} STATUS:error MESSAGE:전압 읽기 실패 - ${voltError.message}`;
                            ws.send(responseMessage);
                        }
                    } else {
                        console.error(`❌ [Backend WS Server] Invalid load test message format`);
                        ws.send(`Error: Invalid load test message format`);
                    }
                } catch (error) {
                    console.error(`❌ [Backend WS Server] Load test error: ${error.message}`);
                    ws.send(`Error: Load test failed - ${error.message}`);
                }
            } else if(decodeWebSocket[0] === '[POWER_SWITCH]') {
                console.log("=== Power Switch Process: OK ===");
                console.log("📥 Raw message received:", decodedMessage);
                console.log("📥 Parsed message parts:", decodeWebSocket);
                
                try {
                    const powerState = decodeWebSocket[1]; // ON 또는 OFF
                    console.log(`🔌 [Backend WS Server] Power switch command: ${powerState}`);
                    
                    if (powerState === 'ON') {
                        // 프로세스 중지 플래그 초기화 (재실행을 위해)
                        setProcessStopRequested(false);
                        console.log(`🔄 [Backend WS Server] Process stop flag reset to false for restart`);
                        
                        // 머신 실행 상태를 true로 설정
                        setMachineRunningStatus(true);
                        console.log(`🔌 [Backend WS Server] Machine running status set to: true`);
                        
                        // 클라이언트에게 상태 확인 메시지 전송
                        const responseMessage = `[POWER_SWITCH] ON - Machine running: true`;
                        ws.send(responseMessage);
                        console.log(`✅ [Backend WS Server] Power switch ON confirmation sent`);
                        
                        // 전압 데이터 초기화 메시지를 모든 클라이언트에게 브로드캐스트
                        const resetMessage = `[POWER_SWITCH] ON - Voltage data reset`;
                        broadcastToClients(resetMessage);
                        console.log(`🔌 [Backend WS Server] 전압 데이터 초기화 메시지 브로드캐스트`);
                        
                        // runNextTankEnviTestProcess 실행
                        try {
                            console.log(`🚀 [Backend WS Server] Starting runNextTankEnviTestProcess...`);
                            await runNextTankEnviTestProcess();
                            console.log(`✅ [Backend WS Server] runNextTankEnviTestProcess completed successfully`);
                        } catch (processError) {
                            console.error(`❌ [Backend WS Server] runNextTankEnviTestProcess error: ${processError.message}`);
                            const errorMessage = `[POWER_SWITCH] PROCESS_ERROR: ${processError.message}`;
                            ws.send(errorMessage);
                            
                            // 에러 발생 시 머신 실행 상태를 false로 설정
                            setMachineRunningStatus(false);
                            const statusMessage = `[POWER_SWITCH] OFF - Machine running: false`;
                            ws.send(statusMessage);
                        }
                    } else if (powerState === 'OFF') {
                        // 머신 실행 상태를 false로 설정
                        setMachineRunningStatus(false);
                        console.log(`🔌 [Backend WS Server] Machine running status set to: false`);
                        
                        // 프로세스 중지 플래그 설정
                        setProcessStopRequested(true);
                        console.log(`🛑 [Backend WS Server] Process stop requested`);
                        
                        // 프로세스 중지 완료 후 재실행 준비 상태임을 명시
                        console.log(`🔄 [Backend WS Server] Process stopped - Ready for restart`);
                        
                        // 클라이언트에게 상태 확인 메시지 전송
                        const responseMessage = `[POWER_SWITCH] OFF - Machine running: false - Ready for restart`;
                        ws.send(responseMessage);
                        console.log(`✅ [Backend WS Server] Power switch OFF confirmation sent`);
                    } else {
                        console.error(`❌ [Backend WS Server] Invalid power switch state: ${powerState}`);
                        ws.send(`Error: Invalid power switch state - expected ON or OFF`);
                    }
                } catch (error) {
                    console.error(`❌ [Backend WS Server] Power switch error: ${error.message}`);
                    ws.send(`Error: Power switch failed - ${error.message}`);
                }
            } else if(decodeWebSocket[0] === '[RELAY_TEST]') {
                console.log("=== Relay Test Process: OK ===");
                console.log("📥 Raw message received:", decodedMessage);
                console.log("📥 Parsed message parts:", decodeWebSocket);
                
                try {
                    // Parse port and device number from message
                    const relayMatch = decodedMessage.match(/\[RELAY_TEST\] PORT:(\d+)(?: DEVICE:(\d+))?/);
                    if (relayMatch) {
                        const portNumber = parseInt(relayMatch[1]);
                        const deviceNumber = relayMatch[2] ? parseInt(relayMatch[2]) : 1; // Default to device 1 if not specified
                        
                        console.log(`🔌 [Backend WS Server] Relay test on port ${portNumber} with device ${deviceNumber}`);
                        
                        // Validate device range
                        if (deviceNumber < 1 || deviceNumber > 10) {
                            const responseMessage = `[RELAY_TEST] PORT:${portNumber} STATUS:error MESSAGE:디바이스 번호 범위 오류 (1~10)`;
                            console.log(`❌ [Backend WS Server] Relay ${portNumber} test failed - device out of range: ${deviceNumber}`);
                            ws.send(responseMessage);
                            return;
                        }
                        
                        // 실제 SelectDevice 함수 호출
                        try {
                            console.log(`🔌 [Backend WS Server] Testing relay on device ${deviceNumber}`);
                            
                            // SelectDevice.js에서 함수 import
                            const { SelectDevice } = await import('./SelectDevice.js');
                            
                            // 실제 릴레이 테스트 실행
                            const result = await SelectDevice(deviceNumber);
                            
                            if (result && result.success) {
                                const responseMessage = `[RELAY_TEST] PORT:${portNumber} STATUS:success MESSAGE:릴레이 ${portNumber} 정상 동작`;
                                console.log(`✅ [Backend WS Server] Relay ${portNumber} test successful`);
                                ws.send(responseMessage);
                            } else {
                                const responseMessage = `[RELAY_TEST] PORT:${portNumber} STATUS:error MESSAGE:릴레이 ${portNumber} 동작 실패`;
                                console.log(`❌ [Backend WS Server] Relay ${portNumber} test failed`);
                                ws.send(responseMessage);
                            }
                        } catch (relayError) {
                            console.error(`❌ [Backend WS Server] Relay test failed: ${relayError.message}`);
                            const responseMessage = `[RELAY_TEST] PORT:${portNumber} STATUS:error MESSAGE:릴레이 테스트 실패 - ${relayError.message}`;
                            ws.send(responseMessage);
                        }
                    } else {
                        console.error(`❌ [Backend WS Server] Invalid relay test message format`);
                        ws.send(`Error: Invalid relay test message format`);
                    }
                } catch (error) {
                    console.error(`❌ [Backend WS Server] Relay test error: ${error.message}`);
                    ws.send(`Error: Relay test failed - ${error.message}`);
                }
            } else if(decodeWebSocket[0] === '[RELAY_ON]') {
                console.log("=== Relay ON Process: OK ===");
                console.log("📥 Raw message received:", decodedMessage);
                console.log("📥 Parsed message parts:", decodeWebSocket);
                
                try {
                    // Parse port and device number from message
                    const relayMatch = decodedMessage.match(/\[RELAY_ON\] PORT:(\d+)(?: DEVICE:(\d+))?/);
                    if (relayMatch) {
                        const portNumber = parseInt(relayMatch[1]);
                        const deviceNumber = relayMatch[2] ? parseInt(relayMatch[2]) : 1; // Default to device 1 if not specified
                        
                        console.log(`🔌 [Backend WS Server] Relay ON on port ${portNumber} with device ${deviceNumber}`);
                        
                        // Validate device range
                        if (deviceNumber < 1 || deviceNumber > 10) {
                            const responseMessage = `[RELAY_ON] PORT:${portNumber} STATUS:error MESSAGE:디바이스 번호 범위 오류 (1~10)`;
                            console.log(`❌ [Backend WS Server] Relay ${portNumber} ON failed - device out of range: ${deviceNumber}`);
                            ws.send(responseMessage);
                            return;
                        }
                        
                        // 실제 SelectDeviceOn 함수 호출
                        try {
                            console.log(`🔌 [Backend WS Server] Turning ON relay on device ${deviceNumber}`);
                            
                            // SelectDevice.js에서 함수 import
                            const { SelectDeviceOn } = await import('./SelectDevice.js');
                            
                            // 실제 릴레이 ON 실행 (타임아웃 추가)
                            const result = await Promise.race([
                                SelectDeviceOn(deviceNumber),
                                new Promise((_, reject) => 
                                    setTimeout(() => reject(new Error('Operation timeout')), 5000)
                                )
                            ]);
                            
                            console.log(`[Backend WS Server] SelectDeviceOn result:`, result);
                            
                            if (result && result.success) {
                                const responseMessage = `[RELAY_ON] PORT:${portNumber} STATUS:success MESSAGE:릴레이 ${portNumber} ON 성공`;
                                console.log(`✅ [Backend WS Server] Relay ${portNumber} ON successful`);
                                ws.send(responseMessage);
                            } else {
                                const errorMessage = result?.message || result?.error || '알 수 없는 오류';
                                const responseMessage = `[RELAY_ON] PORT:${portNumber} STATUS:error MESSAGE:${errorMessage}`;
                                console.log(`❌ [Backend WS Server] Relay ${portNumber} ON failed: ${errorMessage}`);
                                ws.send(responseMessage);
                            }
                        } catch (relayError) {
                            console.error(`❌ [Backend WS Server] Relay ON failed: ${relayError.message}`);
                            const responseMessage = `[RELAY_ON] PORT:${portNumber} STATUS:error MESSAGE:릴레이 ON 실패 - ${relayError.message}`;
                            ws.send(responseMessage);
                        }
                    } else {
                        console.error(`❌ [Backend WS Server] Invalid relay ON message format`);
                        ws.send(`Error: Invalid relay ON message format`);
                    }
                } catch (error) {
                    console.error(`❌ [Backend WS Server] Relay ON error: ${error.message}`);
                    ws.send(`Error: Relay ON failed - ${error.message}`);
                }
            } else if(decodeWebSocket[0] === '[RELAY_OFF]') {
                console.log("=== Relay OFF Process: OK ===");
                console.log("📥 Raw message received:", decodedMessage);
                console.log("📥 Parsed message parts:", decodeWebSocket);
                
                try {
                    // Parse port and device number from message
                    const relayMatch = decodedMessage.match(/\[RELAY_OFF\] PORT:(\d+)(?: DEVICE:(\d+))?/);
                    if (relayMatch) {
                        const portNumber = parseInt(relayMatch[1]);
                        const deviceNumber = relayMatch[2] ? parseInt(relayMatch[2]) : 1; // Default to device 1 if not specified
                        
                        console.log(`🔌 [Backend WS Server] Relay OFF on port ${portNumber} with device ${deviceNumber}`);
                        
                        // Validate device range
                        if (deviceNumber < 1 || deviceNumber > 10) {
                            const responseMessage = `[RELAY_OFF] PORT:${portNumber} STATUS:error MESSAGE:디바이스 번호 범위 오류 (1~10)`;
                            console.log(`❌ [Backend WS Server] Relay ${portNumber} OFF failed - device out of range: ${deviceNumber}`);
                            ws.send(responseMessage);
                            return;
                        }
                        
                        // 실제 SelectDeviceOff 함수 호출
                        try {
                            console.log(`🔌 [Backend WS Server] Turning OFF relay on device ${deviceNumber}`);
                            
                            // SelectDevice.js에서 함수 import
                            const { SelectDeviceOff } = await import('./SelectDevice.js');
                            
                            // 실제 릴레이 OFF 실행 (타임아웃 추가)
                            const result = await Promise.race([
                                SelectDeviceOff(deviceNumber),
                                new Promise((_, reject) => 
                                    setTimeout(() => reject(new Error('Operation timeout')), 5000)
                                )
                            ]);
                            
                            console.log(`[Backend WS Server] SelectDeviceOff result:`, result);
                            
                            if (result && result.success) {
                                const responseMessage = `[RELAY_OFF] PORT:${portNumber} STATUS:success MESSAGE:릴레이 ${portNumber} OFF 성공`;
                                console.log(`✅ [Backend WS Server] Relay ${portNumber} OFF successful`);
                                ws.send(responseMessage);
                            } else {
                                const errorMessage = result?.message || result?.error || '알 수 없는 오류';
                                const responseMessage = `[RELAY_OFF] PORT:${portNumber} STATUS:error MESSAGE:${errorMessage}`;
                                console.log(`❌ [Backend WS Server] Relay ${portNumber} OFF failed: ${errorMessage}`);
                                ws.send(responseMessage);
                            }
                        } catch (relayError) {
                            console.error(`❌ [Backend WS Server] Relay OFF failed: ${relayError.message}`);
                            const responseMessage = `[RELAY_OFF] PORT:${portNumber} STATUS:error MESSAGE:릴레이 OFF 실패 - ${relayError.message}`;
                            ws.send(responseMessage);
                        }
                    } else {
                        console.error(`❌ [Backend WS Server] Invalid relay OFF message format`);
                        ws.send(`Error: Invalid relay OFF message format`);
                    }
                } catch (error) {
                    console.error(`❌ [Backend WS Server] Relay OFF error: ${error.message}`);
                    ws.send(`Error: Relay OFF failed - ${error.message}`);
                }
            } else if(decodeWebSocket[0] === '[POWER_TABLE_TEST]') {
                console.log("=== PowerTable Test Process: OK ===");
                console.log("📥 Raw message received:", decodedMessage);
                console.log("📥 Parsed message parts:", decodeWebSocket);
                
                try {
                    const testResult = testPowerTableReset();
                    if (testResult.success) {
                        const responseMessage = `[POWER_TABLE_TEST] SUCCESS - 클라이언트 ${testResult.sentCount}개에게 초기화 메시지 전송됨`;
                        ws.send(responseMessage);
                        console.log(`✅ [Backend WS Server] PowerTable 테스트 성공: ${responseMessage}`);
                    } else {
                        const responseMessage = `[POWER_TABLE_TEST] ERROR - ${testResult.error}`;
                        ws.send(responseMessage);
                        console.error(`❌ [Backend WS Server] PowerTable 테스트 실패: ${responseMessage}`);
                    }
                } catch (error) {
                    console.error(`❌ [Backend WS Server] PowerTable 테스트 오류: ${error.message}`);
                    ws.send(`Error: PowerTable 테스트 실패 - ${error.message}`);
                }
            } else if(decodeWebSocket[0] === '[SINGLE_PAGE_TEST]') {
                console.log("=== Single Page Process Test: OK ===");
                console.log("📥 Raw message received:", decodedMessage);
                console.log("📥 Parsed message parts:", decodeWebSocket);
                
                try {
                    // 단일 페이지 프로세스 초기화 메시지 전송
                    const singlePageResetMessage = `[POWER_TABLE_RESET] ${JSON.stringify({
                        action: 'single_page_reset',
                        timestamp: new Date().toISOString(),
                        message: '테스트용 단일 페이지 프로세스 초기화'
                    })}`;
                    
                    let sentCount = 0;
                    wss.clients.forEach(client => {
                        if (client.readyState === 1) { // WebSocket.OPEN
                            client.send(singlePageResetMessage);
                            sentCount++;
                        }
                    });
                    console.log(`[SinglePageTest] 단일 페이지 프로세스 초기화 메시지 전송 완료 - 클라이언트 수: ${sentCount}`);
                } catch (error) {
                    console.error(`[SinglePageTest] 메시지 전송 실패:`, error);
                }
                
            } else if(decodeWebSocket[0] === '[CYCLE_TEST]') {
                console.log("=== Cycle Test Simulation: OK ===");
                console.log("📥 Raw message received:", decodedMessage);
                console.log("📥 Parsed message parts:", decodeWebSocket);
                
                try {
                    // 사이클 시작 시뮬레이션 메시지 전송
                    const cycleStartMessage = `[POWER_TABLE_RESET] ${JSON.stringify({
                        action: 'cycle_reset',
                        cycle: 1,
                        totalCycles: 3,
                        testPhase: 'none',
                        currentTestNumber: 0,
                        totalTestCount: 0,
                        testStatus: 'none',
                        timestamp: new Date().toISOString(),
                        message: '테스트용 사이클 1 시작 - 전압 데이터 초기화'
                    })}`;
                    
                    let sentCount = 0;
                    wss.clients.forEach(client => {
                        if (client.readyState === 1) { // WebSocket.OPEN
                            client.send(cycleStartMessage);
                            sentCount++;
                        }
                    });
                    console.log(`[CycleTest] 사이클 시작 메시지 전송 완료 - 클라이언트 수: ${sentCount}`);
                    
                    // 2초 후 고온 테스트 시작 시뮬레이션
                    setTimeout(() => {
                        const highTempStartMessage = `[POWER_TABLE_RESET] ${JSON.stringify({
                            action: 'test_start',
                            cycle: 1,
                            totalCycles: 3,
                            testPhase: 'high_temp',
                            currentTestNumber: 0,
                            totalTestCount: 5,
                            testStatus: 'ON',
                            timestamp: new Date().toISOString(),
                            message: '테스트용 사이클 1: 고온 테스트 시작 (5회)'
                        })}`;
                        
                        let sentCount = 0;
                        wss.clients.forEach(client => {
                            if (client.readyState === 1) { // WebSocket.OPEN
                                client.send(highTempStartMessage);
                                sentCount++;
                            }
                        });
                        console.log(`[CycleTest] 고온 테스트 시작 메시지 전송 완료 - 클라이언트 수: ${sentCount}`);
                        
                        // 3초 후 테스트 진행 상황 시뮬레이션
                        setTimeout(() => {
                            const testProgressMessage = `[POWER_TABLE_RESET] ${JSON.stringify({
                                action: 'test_progress',
                                cycle: 1,
                                totalCycles: 3,
                                testPhase: 'high_temp',
                                currentTestNumber: 3,
                                totalTestCount: 5,
                                testStatus: 'ON',
                                timestamp: new Date().toISOString(),
                                message: '테스트용 사이클 1: 고온 테스트 3/5 실행 중'
                            })}`;
                            
                            let sentCount = 0;
                            wss.clients.forEach(client => {
                                if (client.readyState === 1) { // WebSocket.OPEN
                                    client.send(testProgressMessage);
                                    sentCount++;
                                }
                            });
                            console.log(`[CycleTest] 테스트 진행 상황 메시지 전송 완료 - 클라이언트 수: ${sentCount}`);
                        }, 3000);
                    }, 2000);
                    
                } catch (error) {
                    console.error(`[CycleTest] 메시지 전송 실패:`, error);
                }
            } else {
                console.log("📥 Unknown message type:", decodeWebSocket[0]);
            }
        } catch (error) {
            console.error("❌ [Backend WS Server] Error processing message:", error);
            ws.send(`Error: ${error.message}`);
        }
    });
    
    ws.on('close', () => {
        console.log("🔌 [Backend WS Server] Client disconnected");
    });
    
    ws.on('error', (error) => {
        console.error("❌ [Backend WS Server] WebSocket error:", error);
    });
});

console.log(`🚀 [Backend WS Server] WebSocket server running on port ${LOCAL_WS_PORT}`);
console.log(`🔌 [Backend WS Server] WebSocket server ready for connections`);