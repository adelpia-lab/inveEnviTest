import { promises as fs } from 'fs';

const DELAY_SETTINGS_FILE = 'delay_settings.json';
const DEVICE_STATES_FILE = 'device_states.json';
const HIGH_TEMP_SETTINGS_FILE = 'high_temp_settings.json';
const LOW_TEMP_SETTINGS_FILE = 'low_temp_settings.json';
const PRODUCT_INPUT_FILE = 'product_input.json';
const USB_PORT_SETTINGS_FILE = 'usb_port_settings.json';
const OUT_VOLT_SETTINGS_FILE = 'out_volt_settings.json';
const CHANNEL_VOLTAGES_FILE = 'channel_voltages.json';

// 딜레이 설정을 파일에서 읽어오는 함수
async function loadDelaySettings() {
  try {
    const data = await fs.readFile(DELAY_SETTINGS_FILE, 'utf-8');
    const settings = JSON.parse(data);
    return {
      onDelay: settings.onDelay || 0,
      offDelay: settings.offDelay || 0,
      cycleNumber: settings.cycleNumber || 1
    };
  } catch (error) {
    return { onDelay: 0, offDelay: 0, cycleNumber: 1 };
  }
}

// 기기 상태를 파일에서 읽어오는 함수
async function loadDeviceStates() {
  try {
    const data = await fs.readFile(DEVICE_STATES_FILE, 'utf-8');
    const deviceStates = JSON.parse(data);
    
    if (Array.isArray(deviceStates) && deviceStates.length === 10) {
      return deviceStates;
    } else if (typeof deviceStates === 'object' && deviceStates !== null) {
      const expectedDevices = [
        "#1 Device", "#2 Device", "#3 Device", "#4 Device", "#5 Device",
        "#6 Device", "#7 Device", "#8 Device", "#9 Device", "#10 Device"
      ];
      
      const deviceStatesArray = expectedDevices.map(deviceName => {
        return deviceStates[deviceName] === true;
      });
      
      return deviceStatesArray;
    } else {
      return [true, false, false, false, false, false, false, false, false, false];
    }
  } catch (error) {
    return [true, false, false, false, false, false, false, false, false, false];
  }
}

// 고온 설정을 파일에서 읽어오는 함수
async function loadHighTempSettings() {
  try {
    const data = await fs.readFile(HIGH_TEMP_SETTINGS_FILE, 'utf-8');
    const settings = JSON.parse(data);
    return {
      highTemp: settings.highTemp || false,
      targetTemp: settings.targetTemp || 75,
      waitTime: settings.waitTime || 200,
      readCount: settings.readCount || 10
    };
  } catch (error) {
    return {
      highTemp: false,
      targetTemp: 75,
      waitTime: 200,
      readCount: 10
    };
  }
}

// 저온 설정을 파일에서 읽어오는 함수
async function loadLowTempSettings() {
  try {
    const data = await fs.readFile(LOW_TEMP_SETTINGS_FILE, 'utf-8');
    const settings = JSON.parse(data);
    return {
      lowTemp: settings.lowTemp || false,
      targetTemp: settings.targetTemp || -32,
      waitTime: settings.waitTime || 200,
      readCount: settings.readCount || 10
    };
  } catch (error) {
    return {
      lowTemp: false,
      targetTemp: -32,
      waitTime: 200,
      readCount: 10
    };
  }
}

// 제품 입력을 파일에서 읽어오는 함수
async function loadProductInput() {
  try {
    const data = await fs.readFile(PRODUCT_INPUT_FILE, 'utf-8');
    const productInput = JSON.parse(data);
    return {
      modelName: productInput.modelName || '',
      productNames: productInput.productNames || []
    };
  } catch (error) {
    return {
      modelName: '',
      productNames: []
    };
  }
}

// USB 포트 설정을 파일에서 읽어오는 함수
async function loadUsbPortSettings() {
  try {
    const data = await fs.readFile(USB_PORT_SETTINGS_FILE, 'utf-8');
    const settings = JSON.parse(data);
    return {
      portName: settings.portName || '',
      baudRate: settings.baudRate || 9600,
      dataBits: settings.dataBits || 8,
      stopBits: settings.stopBits || 1,
      parity: settings.parity || 'none'
    };
  } catch (error) {
    return {
      portName: '',
      baudRate: 9600,
      dataBits: 8,
      stopBits: 1,
      parity: 'none'
    };
  }
}

// 입력 전압 설정을 파일에서 읽어오는 함수
async function loadOutVoltSettings() {
  try {
    const data = await fs.readFile(OUT_VOLT_SETTINGS_FILE, 'utf-8');
    const settings = JSON.parse(data);
    if (!Array.isArray(settings) || settings.length !== 4) throw new Error('입력 전압 설정은 4개 요소의 배열이어야 합니다.');
    return settings;
  } catch (error) {
    return [18.0, 24.0, 30.0, 0.0];
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
    return channelVoltages;
  } catch (error) {
    return [5.0, 15.0, -15.0, 24.0];
  }
}

// getTableOption 객체를 모든 JSON 파일에서 읽어와서 초기화하는 함수
export async function loadGetTableOption() {
  try {
    console.log(`📖 Loading getTableOption from all JSON files...`);
    
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
    const getTableOption = {
      delaySettings,
      deviceStates,
      highTempSettings,
      lowTempSettings,
      productInput,
      usbPortSettings,
      outVoltSettings,
      channelVoltages
    };
    
    console.log(`✅ getTableOption loaded successfully:`, JSON.stringify(getTableOption, null, 2));
    return getTableOption;
  } catch (error) {
    console.error(`❌ Failed to load getTableOption: ${error.message}`);
    throw error;
  }
} 