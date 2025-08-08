// $sudo dmesg | grep tty 
//const WEBSOCKET_SERVER_URL = 'ws://192.168.1.82:8080'; // 5 story
//const WEBSOCKET_SERVER_URL = 'ws://172.30.1.69:8080'; // 6 stroy adelpia lab
const WEBSOCKET_SERVER_URL = 'ws://localhost:8081';
//const WEBSOCKET_SERVER_URL = 'ws://192.168.219.107:8080'; //  Shaha

/*
제품명	     제품번호	                검사날짜	   
SSPC 25A - 62520204	 25040001	2025-04-21 9://const WEBSOCKET_SERVER_URL = 'ws://192.168.1.82:8080'; // 5 story
29	  

2.3.1	2.3.2	2.4.1	2.4.2	2.5.1	2.5.2	2.6.1	2.6.2	2.6.3	2.6.4	2.6.5	2.7	
17.94	 0.02 0.05 4.97	 4.97 0.04	10 1535	 465 253	186  0.40	        

검사결과	작업자
양품	장인아
*/
/*
#1 RELAY ON : 010600010100D99A   OFF : 010600010200D96A
#2 RELAY ON : 010600020100299A   OFF : 010600020200296A
#3 RELAY ON : 010600030100785A   OFF : 01060003020078AA
#4 RELAY ON : 010600040100C99B   OFF : 010600040200C96B
#5 RELAY ON : 010600050100985B   OFF : 01060005020098AB

#6 RELAY ON : 020600010100D9A9   OFF: 020600010200D959
#7 RELAY ON : 02060002010029A9   OFF: 0206000202002959
#8 RELAY ON : 0206000301007869   OFF: 0206000302007899
#9 RELAY ON : 020600040100C9A8   OFF: 020600040200C958
#10 RELAY ON : 0206000501009868   OFF: 0206000502009898
*/
import Link from 'next/link';

// Theme is now handled in _app.js for proper SSR

// import * as React from 'react';
import React,{useState, useEffect, useRef} from 'react';



import Image from "next/image";
import { Geist, Geist_Mono } from "next/font/google";
import styles from "/styles/Home.module.css";
import SetVolt from "/components/SetVolt/SetVolt";
import RelayOnOff from "/components/RelayOn/RelayOnOff";
import Button from '@mui/material/Button';

import TextButton from "/components/TextButton/TextButton";
import TestProcess from "/components/TestProcess/TestProcess";
import TestResult from "/components/TestResult/TestResult";
import DeviceSelect from "/components/DeviceSelect/DeviceSelect";
import ReadVolt from "/components/ReadVolt/ReadVolt";
import SystemSet from "/components/SystemSet/SystemSet";
import ReadChamber from "/components/ReadChamber/ReadChamber";
import HighTempSettingPanel from "/components/high-temp-setting-panel/HighTempSettingPanel";
import LowTempSettingPanel from "/components/low-temp-setting-panel/LowTempSettingPanel";
import OutVoltSettingPanel from "/components/OutVoltSettingPanel/OutVoltSettingPanel";

import UsbPortSelect from "/components/UsbPortSelect/UsbPortSelect";
import PowerSwitch from "/components/PowerButton/PowerSwitch";
import GroupImage from "/components/GroupImage/GroupImage";
import dynamic from 'next/dynamic';
import { parsePowerDataFile } from '../lib/parsePowerData';
import ProductInput from "/components/SystemSet/ProductInput";
import OptionSet1 from "/components/OptionSet1/OptionSet1";
import LogoImage from "/components/LogoImage/LogoImage";
import DebugLogoImage from "/components/LogoImage/DebugLogoImage";
import DelaySettingsPanel from "/components/delay-settings-panel/DelaySettingsPanel";
import TestSystemButton from "/components/TestSystem/TestSystemButton";
import ChannelVoltageSettings from "/components/ChannelVoltageSettings/ChannelVoltageSettings";
const PowerTable = dynamic(() => import('../components/power-table/PowerTable'), { ssr: false });
// import WebSocketClient from "/components/WebSocketClient/WebSocketClient";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function Home(props) {

const [isConnected, setIsConnected] = useState(false);
const [messageInput, setMessageInput] = useState('');
const [receivedMessages, setReceivedMessages] = useState([]);
const [status, setStatus] = useState('연결 대기 중...');
const ws = useRef(null);
const [voltages, setVoltages] = useState([0, 0, 0, 0, 0]);
const [temperature, setTemperature] = useState(null);
const [isWaitingChamberResponse, setIsWaitingChamberResponse] = useState(false);
const [channelVoltages, setChannelVoltages] = useState([5, 15, -15, 24]); // 기본값 설정

  // WebSocket 연결 상태 확인 함수
  const isWebSocketReady = () => {
    const isReady = ws.current && ws.current.readyState === WebSocket.OPEN;
    // console.log('WebSocket ready check:', {
    //   hasConnection: !!ws.current,
    //   readyState: ws.current ? ws.current.readyState : 'No connection',
    //   isReady: isReady
    // });
    return isReady;
  };

// 안전한 메시지 전송 함수
const sendWebSocketMessage = (message) => {
  if (!isWebSocketReady()) {
    console.error('WebSocket이 연결되지 않았습니다. 연결 상태:', ws.current ? ws.current.readyState : 'No connection');
    return false;
  }
  
  try {
    ws.current.send(message);
    // console.log('WebSocket 메시지 전송 성공:', message);
    return true;
  } catch (error) {
    console.error('WebSocket 메시지 전송 실패:', error);
    return false;
  }
};

useEffect(() => {
  // 이미 연결이 있으면 새로 연결하지 않음
  if (ws.current && ws.current.readyState === WebSocket.OPEN) {
    // console.log('WebSocket 이미 연결되어 있음');
    return;
  }

  // 컴포넌트 마운트 시 WebSocket 연결 시도
  // console.log('WebSocket 연결 시도 중...');
  // console.log('WebSocket URL:', WEBSOCKET_SERVER_URL);
  ws.current = new WebSocket(WEBSOCKET_SERVER_URL);
  // console.log('WebSocket 객체 생성됨:', ws.current);

  // 연결 성공 시
  ws.current.onopen = () => {
    // console.log('✅ WebSocket 서버에 연결되었습니다.');
    // console.log('✅ WebSocket URL:', WEBSOCKET_SERVER_URL);
    // console.log('✅ WebSocket readyState:', ws.current.readyState);
    setIsConnected(true);
    setStatus('연결됨');
    setReceivedMessages(prev => [...prev, '--- 서버에 연결되었습니다! ---']);
  };

  // 메시지 수신 시
  ws.current.onmessage = (event) => {
    // console.log('메시지 수신:', event.data);
    
    // [POWER_SWITCH] 메시지 처리
    if (typeof event.data === 'string' && event.data.includes('[POWER_SWITCH]')) {
      console.log('🔌 Power switch message received:', event.data);
      // PowerSwitch 컴포넌트에서 처리하므로 여기서는 로그만 출력
    }
    // [SAVE_PRODUCT_INPUT] 메시지 처리
    else if (typeof event.data === 'string' && event.data.startsWith('[SAVE_PRODUCT_INPUT]')) {
      try {
        const match = event.data.match(/\[SAVE_PRODUCT_INPUT\] (.*)/);
        if (match && match[1]) {
          const productData = JSON.parse(match[1]);
          // console.log('📥 Received product input data from server:', productData);
          
          // localStorage에 저장
          if (typeof window !== 'undefined') {
            localStorage.setItem('productInput', JSON.stringify(productData));
            // console.log('💾 Product input saved to localStorage from server:', productData);
          }
          
          // 성공 메시지를 ProductInput 컴포넌트로 전송
          const successMessage = `[PRODUCT_INPUT_SAVED] ${JSON.stringify(productData)}`;
          ws.current.send(successMessage);
          // console.log('📤 Sent success confirmation to ProductInput component');
        }
      } catch (err) {
        console.error('Failed to parse product input data:', err);
      }
    }
    // [Voltage data: ...] 메시지 파싱
    else if (typeof event.data === 'string' && event.data.startsWith('Voltage data:')) {
      try {
        const match = event.data.match(/Voltage data: (\[.*\])/);
        if (match && match[1]) {
          const arr = JSON.parse(match[1]);
          if (Array.isArray(arr) && arr.length === 5 && arr.every(v => typeof v === 'number')) {
            setVoltages(arr);
          } else {
            console.error('Voltage data is not a valid array:', arr);
          }
        }
      } catch (err) {
        console.error('Failed to parse voltage data:', err);
      }
    } else if (typeof event.data === 'string' && event.data.startsWith('Temperature:')) {
      try {
        // console.log("Temperature: " + event.data);
        const match = event.data.match(/Temperature: ([\d.]+)/);
        if (match && match[1]) {
          const temp = parseFloat(match[1]);
          if (!isNaN(temp)) {
            // console.log("Temperature data: " + temp);
            setTemperature(temp);
          } else {
            console.error('Temperature data is not a valid number:', match[1]);
          }
        }
      } catch (err) {
          console.error('Failed to parse temperature data:', err);
      }
    }
    // [VOLTAGE_UPDATE] 메시지 처리 - PowerTable 컴포넌트로 전달
    else if (typeof event.data === 'string' && event.data.startsWith('[VOLTAGE_UPDATE]')) {
      console.log('📥 Main: 전압 업데이트 메시지 수신:', event.data);
      console.log('📥 Main: 메시지 길이:', event.data.length);
      console.log('📥 Main: 메시지 타입:', typeof event.data);
      // PowerTable 컴포넌트에서 처리하므로 여기서는 로그만 출력
    }
    // [TEST_VOLTAGE_UPDATE] 메시지 처리 - PowerTable 컴포넌트로 전달
    else if (typeof event.data === 'string' && event.data.startsWith('[TEST_VOLTAGE_UPDATE]')) {
      console.log('🧪 Main: 테스트 전압 업데이트 메시지 수신:', event.data);
      // PowerTable 컴포넌트에서 처리하므로 여기서는 로그만 출력
    }
    // Initial channel voltages 메시지 처리
    else if (typeof event.data === 'string' && event.data.startsWith('Initial channel voltages:')) {
      try {
        const match = event.data.match(/Initial channel voltages: (\[.*\])/);
        if (match && match[1]) {
          const voltages = JSON.parse(match[1]);
          if (Array.isArray(voltages) && voltages.length === 4) {
            console.log('📥 Main: 채널 전압 설정 수신 전:', channelVoltages);
            setChannelVoltages(voltages);
            console.log('📥 Main: 채널 전압 설정 수신 후:', voltages);
          }
        }
      } catch (err) {
        console.error('Failed to parse channel voltages:', err);
      }
    }
    //setReceivedMessages(prev => [...prev, event.data]);
  };

  // 에러 발생 시
  ws.current.onerror = (error) => {
    console.error('WebSocket 에러 발생:', error);
    console.error('WebSocket URL:', WEBSOCKET_SERVER_URL);
    console.error('WebSocket readyState:', ws.current ? ws.current.readyState : 'No connection');
    setStatus(`에러: ${error.message || '알 수 없는 오류'} - URL: ${WEBSOCKET_SERVER_URL}`);
    setIsConnected(false);
  };

  // 연결 종료 시
  ws.current.onclose = (event) => {
    // console.log('WebSocket 연결이 종료되었습니다. Code:', event.code, 'Reason:', event.reason);
    setIsConnected(false);
    setStatus('연결 종료됨. 재연결 시도 중...');
    
    // 모든 종료에 대해 재연결 시도 (정상 종료도 포함)
    // console.log('WebSocket 재연결 시도...');
    setTimeout(() => {
      if (ws.current && ws.current.readyState === WebSocket.CLOSED) {
        // console.log('WebSocket 재연결 시도...');
        try {
          ws.current = new WebSocket(WEBSOCKET_SERVER_URL);
          
          // 재연결 시 이벤트 핸들러 다시 설정
          ws.current.onopen = () => {
            // console.log('✅ WebSocket 재연결 성공');
            setIsConnected(true);
            setStatus('재연결됨');
          };
          
          ws.current.onmessage = (event) => {
            // console.log('재연결 후 메시지 수신:', event.data);
            // 기존 메시지 처리 로직과 동일하게 처리
            
            // [POWER_SWITCH] 메시지 처리
            if (typeof event.data === 'string' && event.data.includes('[POWER_SWITCH]')) {
              console.log('🔌 Power switch message received (reconnection):', event.data);
              // PowerSwitch 컴포넌트에서 처리하므로 여기서는 로그만 출력
            }
            // [SAVE_PRODUCT_INPUT] 메시지 처리
            else if (typeof event.data === 'string' && event.data.startsWith('[SAVE_PRODUCT_INPUT]')) {
              try {
                const match = event.data.match(/\[SAVE_PRODUCT_INPUT\] (.*)/);
                if (match && match[1]) {
                  const productData = JSON.parse(match[1]);
                  // console.log('📥 Received product input data from server (reconnection):', productData);
                  
                  // localStorage에 저장
                  if (typeof window !== 'undefined') {
                    localStorage.setItem('productInput', JSON.stringify(productData));
                    // console.log('💾 Product input saved to localStorage from server (reconnection):', productData);
                  }
                  
                  // 성공 메시지를 ProductInput 컴포넌트로 전송
                  const successMessage = `[PRODUCT_INPUT_SAVED] ${JSON.stringify(productData)}`;
                  ws.current.send(successMessage);
                  // console.log('📤 Sent success confirmation to ProductInput component (reconnection)');
                }
              } catch (err) {
                console.error('Failed to parse product input data (reconnection):', err);
              }
            }
            // [Voltage data: ...] 메시지 파싱
            else if (typeof event.data === 'string' && event.data.startsWith('Voltage data:')) {
              try {
                const match = event.data.match(/Voltage data: (\[.*\])/);
                if (match && match[1]) {
                  const arr = JSON.parse(match[1]);
                  if (Array.isArray(arr) && arr.length === 5 && arr.every(v => typeof v === 'number')) {
                    setVoltages(arr);
                  }
                }
              } catch (err) {
                console.error('Failed to parse voltage data:', err);
              }
            } else if (typeof event.data === 'string' && event.data.startsWith('Temperature:')) {
              try {
                const match = event.data.match(/Temperature: ([\d.]+)/);
                if (match && match[1]) {
                  const temp = parseFloat(match[1]);
                  if (!isNaN(temp)) {
                    setTemperature(temp);
                  }
                }
              } catch (err) {
                console.error('Failed to parse temperature data:', err);
              }
            }
            // [VOLTAGE_UPDATE] 메시지 처리 - PowerTable 컴포넌트로 전달
            else if (typeof event.data === 'string' && event.data.startsWith('[VOLTAGE_UPDATE]')) {
              console.log('📥 Main: 전압 업데이트 메시지 수신 (재연결):', event.data);
              // PowerTable 컴포넌트에서 처리하므로 여기서는 로그만 출력
            }
            // [TEST_VOLTAGE_UPDATE] 메시지 처리 - PowerTable 컴포넌트로 전달
            else if (typeof event.data === 'string' && event.data.startsWith('[TEST_VOLTAGE_UPDATE]')) {
              console.log('🧪 Main: 테스트 전압 업데이트 메시지 수신 (재연결):', event.data);
              // PowerTable 컴포넌트에서 처리하므로 여기서는 로그만 출력
            }
          };
          
          ws.current.onclose = (event) => {
            // console.log('WebSocket 재연결 후 종료. Code:', event.code, 'Reason:', event.reason);
            setIsConnected(false);
            setStatus('재연결 실패');
          };
          
          ws.current.onerror = (error) => {
            console.error('WebSocket 재연결 에러:', error);
            setIsConnected(false);
            setStatus('재연결 에러');
          };
        } catch (error) {
          console.error('WebSocket 재연결 실패:', error);
        }
      }
    }, 1000); // 1초 후 재연결 시도
  };

  // WebSocket 연결 상태 주기적 확인
  const connectionCheckInterval = setInterval(() => {
    if (ws.current && ws.current.readyState === WebSocket.CLOSED) {
      // console.log('🔄 WebSocket connection lost, attempting to reconnect...');
      try {
        ws.current = new WebSocket(WEBSOCKET_SERVER_URL);
        
        ws.current.onopen = () => {
          // console.log('✅ WebSocket auto-reconnection successful');
          setIsConnected(true);
          setStatus('자동 재연결됨');
        };
        
        ws.current.onmessage = (event) => {
          // console.log('Auto-reconnected WebSocket message received:', event.data);
          // 기존 메시지 처리 로직과 동일하게 처리
          
          // [POWER_SWITCH] 메시지 처리
          if (typeof event.data === 'string' && event.data.includes('[POWER_SWITCH]')) {
            console.log('🔌 Power switch message received (auto-reconnection):', event.data);
            // PowerSwitch 컴포넌트에서 처리하므로 여기서는 로그만 출력
          }
          // [SAVE_PRODUCT_INPUT] 메시지 처리
          else if (typeof event.data === 'string' && event.data.startsWith('[SAVE_PRODUCT_INPUT]')) {
            try {
              const match = event.data.match(/\[SAVE_PRODUCT_INPUT\] (.*)/);
              if (match && match[1]) {
                const productData = JSON.parse(match[1]);
                // console.log('📥 Received product input data from server (auto-reconnection):', productData);
                
                if (typeof window !== 'undefined') {
                  localStorage.setItem('productInput', JSON.stringify(productData));
                  // console.log('💾 Product input saved to localStorage from server (auto-reconnection):', productData);
                }
                
                const successMessage = `[PRODUCT_INPUT_SAVED] ${JSON.stringify(productData)}`;
                ws.current.send(successMessage);
                // console.log('📤 Sent success confirmation to ProductInput component (auto-reconnection)');
              }
            } catch (err) {
              console.error('Failed to parse product input data (auto-reconnection):', err);
            }
          }
          else if (typeof event.data === 'string' && event.data.startsWith('Voltage data:')) {
            try {
              const match = event.data.match(/Voltage data: (\[.*\])/);
              if (match && match[1]) {
                const arr = JSON.parse(match[1]);
                if (Array.isArray(arr) && arr.length === 5 && arr.every(v => typeof v === 'number')) {
                  setVoltages(arr);
                }
              }
            } catch (err) {
              console.error('Failed to parse voltage data (auto-reconnection):', err);
            }
          } else if (typeof event.data === 'string' && event.data.startsWith('Temperature:')) {
            try {
              const match = event.data.match(/Temperature: ([\d.]+)/);
              if (match && match[1]) {
                const temp = parseFloat(match[1]);
                if (!isNaN(temp)) {
                  setTemperature(temp);
                }
              }
            } catch (err) {
              console.error('Failed to parse temperature data (auto-reconnection):', err);
            }
          }
          // [VOLTAGE_UPDATE] 메시지 처리 - PowerTable 컴포넌트로 전달
          else if (typeof event.data === 'string' && event.data.startsWith('[VOLTAGE_UPDATE]')) {
            console.log('📥 Main: 전압 업데이트 메시지 수신 (자동재연결):', event.data);
            // PowerTable 컴포넌트에서 처리하므로 여기서는 로그만 출력
          }
          // [TEST_VOLTAGE_UPDATE] 메시지 처리 - PowerTable 컴포넌트로 전달
          else if (typeof event.data === 'string' && event.data.startsWith('[TEST_VOLTAGE_UPDATE]')) {
            console.log('🧪 Main: 테스트 전압 업데이트 메시지 수신 (자동재연결):', event.data);
            // PowerTable 컴포넌트에서 처리하므로 여기서는 로그만 출력
          }
        };
        
        ws.current.onclose = (event) => {
          // console.log('Auto-reconnected WebSocket closed. Code:', event.code, 'Reason:', event.reason);
          setIsConnected(false);
          setStatus('자동 재연결 실패');
        };
        
        ws.current.onerror = (error) => {
          console.error('Auto-reconnected WebSocket error:', error);
          setIsConnected(false);
          setStatus('자동 재연결 에러');
        };
      } catch (error) {
        console.error('WebSocket auto-reconnection failed:', error);
      }
    }
  }, 5000); // 5초마다 연결 상태 확인

  // 컴포넌트 언마운트 시에만 WebSocket 연결 정리
  return () => {
    // console.log('컴포넌트 언마운트 - WebSocket 연결 정리');
    clearInterval(connectionCheckInterval);
    if (ws.current) {
      // 정상적인 종료 코드로 연결 닫기
      ws.current.close(1000, 'Component unmounting');
    }
  };
}, []); // 빈 배열은 컴포넌트 마운트 시 한 번만 실행되도록 합니다.
// 메시지 전송 핸들러
const sendMessage = () => {
  if (ws.current && ws.current.readyState === WebSocket.OPEN && messageInput.trim() !== '') {
    // console.log('메시지 전송:', messageInput);
    ws.current.send(messageInput);
    setMessageInput(''); // 입력 필드 초기화
  } else {
    setStatus('메시지를 보낼 수 없습니다. 연결 상태를 확인하세요.');
  }
};

	const [deviceSelectedValue, setDeviceSelectedValue] = useState('#1 Device');
	const [voltSelectValue, setVoltSelectedValue] = useState('PowerOff');

  const handleSelectionFromDeviceSelect = (newValue) => {
    // console.log("DeviceSelect: 하위 컴포넌트로부터 전달받은 값:", newValue);
    
    // DeviceSelect 컴포넌트는 이제 내부에서 직접 WebSocket을 통해 서버와 통신하므로
    // 이 콜백은 더 이상 사용되지 않습니다.
    // DeviceSelect 컴포넌트가 직접 [DEVICE_SELECT] 메시지를 전송합니다.
  };

  const handleSelectionFromVoltSelect = (newValue) => {
    // console.log("VoltSelect: 하위 컴포넌트로부터 전달받은 값:", newValue);
    const messageWithIdentifier = `[VOLT_SELECT] ${newValue}`;
    sendWebSocketMessage(messageWithIdentifier);
  };

  const handleTestProcessSelect = (newValue) => {
    // console.log("TestProcess: 하위 컴포넌트로부터 전달받은 값:", newValue);
    const messageWithIdentifier = `[TEST_PROCESS] ${newValue}`;
    sendWebSocketMessage(messageWithIdentifier);
  };

  const handleReadVoltClick = () => {
    // console.log("ReadVolt: READ 버튼이 클릭되었습니다.");
    const messageWithIdentifier = `[READ_VOLT] OK`;
    sendWebSocketMessage(messageWithIdentifier);
  };

  const handleReadChamberClick = () => {
    // console.log("ReadChamber: READ 버튼이 클릭되었습니다.");
    const messageWithIdentifier = `[READ_CHAMBER] OK`;
    if (sendWebSocketMessage(messageWithIdentifier)) {
      setIsWaitingChamberResponse(true); // 응답 대기 상태로 전환
    }
  };

  const handleTestButtonClick = () => {
    // console.log("SystemSet: TEST 버튼이 클릭되었습니다.");
    const messageWithIdentifier = `[TEST_BUTTON] OK`;
    sendWebSocketMessage(messageWithIdentifier);
  };

  const handleUsbPortSelection = (deviceType, port) => {
    // console.log(`UsbPortSelect: ${deviceType} 기기의 USB 포트가 ${port}로 설정되었습니다.`);
    // USB 포트 설정은 이제 컴포넌트 내부에서 WebSocket을 통해 직접 처리됩니다.
  };



  return (
    <div className={styles.container}>
        <header className={styles.header}>
            <div className={styles.headerItem}>
              <LogoImage 
                src="/img/adelLogo.png" 
                alt="Adel Logo" 
              />
            </div>
            <div className={styles.headerItem}> 아델피아랩 차기 전차  컨버터  환경 시험</div>

            <div className={styles.headerItem}>
              <div className={styles.boxJsk}>
                <div className={styles.loader8}></div>
              </div>
            </div>

            <div className={styles.headerItem} style={{ backgroundColor: 'black' }}>
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', width: '100%', overflow: 'hidden' }}>
                <PowerSwitch wsConnection={ws.current} />
              </div>
            </div>

        </header>

        <main className={styles.bodyContent}>
          <div className={styles.bodyItem}>
            <DeviceSelect initialValue="#1 Device" onSelectionChange={handleSelectionFromDeviceSelect} wsConnection={ws.current} />
          </div>
          <div className={styles.bodyItem}>
            <PowerTable 
              groups={props.powerGroups || []} 
              wsConnection={ws.current} 
              channelVoltages={channelVoltages} // 동적으로 받은 channelVoltages 설정값
            />
            {/* 디버깅용 정보 표시 */}
            <div style={{ 
              position: 'absolute', 
              top: '10px', 
              right: '10px', 
              backgroundColor: 'rgba(0,0,0,0.8)', 
              color: 'white', 
              padding: '5px', 
              fontSize: '10px',
              borderRadius: '4px'
            }}>
              WebSocket: {ws.current?.readyState === WebSocket.OPEN ? '🟢 연결됨' : '🔴 연결안됨'}
            </div>
          </div>
        </main>

        <footer className={styles.footer}>
            <div className={styles.footerItem} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', padding: '10px' }}> 
              <ProductInput wsConnection={ws.current} /> 
              <DelaySettingsPanel wsConnection={ws.current} />
              <ChannelVoltageSettings wsConnection={ws.current} />
              <TestSystemButton wsConnection={ws.current} />
            </div>
            <div className={styles.footerItem} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '10px' }}> 
              <OutVoltSettingPanel wsConnection={ws.current} />            
            </div>
            <div className={styles.footerItem} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '10px' }}> 
              {/* <SetVolt initialValue="PowerOff" onSelectionChange={ handleSelectionFromVoltSelect } /> */}
              <HighTempSettingPanel wsConnection={ws.current} />
            </div>
            <div className={styles.footerItem} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '10px' }}>          
              <LowTempSettingPanel wsConnection={ws.current} />
            </div>
            <div className={styles.footerItem} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '10px 10px 10px 10px', paddingTop: '12px' }}> 
              <UsbPortSelect wsConnection={ws.current} onSelectionChange={handleUsbPortSelection} />
            </div>
        </footer>
      </div>
  );
}

export async function getServerSideProps() {
  const powerGroups = await parsePowerDataFile();
  return { props: { powerGroups } };
}
