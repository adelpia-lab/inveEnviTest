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
import TimeModePopup from "/components/TimeModePopup/TimeModePopup";
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
const [isTimeModePopupOpen, setIsTimeModePopupOpen] = useState(false);
const [isMeasurementActive, setIsMeasurementActive] = useState(false);
const [hasUserInteracted, setHasUserInteracted] = useState(false);
const [showExitConfirmModal, setShowExitConfirmModal] = useState(false);
const [pendingExit, setPendingExit] = useState(false);
const [timeProgress, setTimeProgress] = useState(null);
const [testStartTime, setTestStartTime] = useState(null);
const [fixedTotalMinutes, setFixedTotalMinutes] = useState(null);

// fixedTotalMinutes를 안전하게 설정하는 함수 (한 번만 설정 가능)
const setFixedTotalMinutesSafe = (value) => {
  if (fixedTotalMinutes !== null) {
    console.log('🔒 BLOCKED: Attempt to change fixedTotalMinutes from', fixedTotalMinutes, 'to', value, '- REJECTED');
    return;
  }
  console.log('🔒 Setting fixedTotalMinutes to:', value, '- This value will NEVER change');
  setFixedTotalMinutes(value);
};

// 디버깅을 위한 로그
console.log('🔌 Main: channelVoltages 상태:', channelVoltages);

// 시간 진행 상황 계산 함수
const calculateTimeProgress = () => {
  if (!testStartTime || !fixedTotalMinutes || fixedTotalMinutes <= 0) {
    console.log('⚠️ Cannot calculate time progress - missing required values:', {
      testStartTime: !!testStartTime,
      fixedTotalMinutes: fixedTotalMinutes
    });
    return null;
  }
  
  const currentTime = Date.now();
  const elapsedTime = currentTime - testStartTime;
  const elapsedMinutes = Math.floor(elapsedTime / (1000 * 60));
  const remainingMinutes = Math.max(0, fixedTotalMinutes - elapsedMinutes);
  const progressPercentage = Math.min(100, Math.floor((elapsedMinutes / fixedTotalMinutes) * 100));
  
  // 진행 상황에 따른 phase 결정
  let phase = 'waiting';
  if (elapsedMinutes === 0) {
    phase = 'starting';
  } else if (remainingMinutes <= 0) {
    phase = 'completed';
  } else {
    phase = 'waiting';
  }
  
  const result = {
    phase: phase,
    startTime: testStartTime,
    currentTime: currentTime,
    elapsedTime: elapsedTime,
    totalDuration: fixedTotalMinutes * 60 * 1000,
    remainingTime: remainingMinutes * 60 * 1000,
    elapsedMinutes: elapsedMinutes,
    remainingMinutes: remainingMinutes,
    totalMinutes: fixedTotalMinutes, // 항상 고정값 사용 - 절대 변경되지 않음
    progressPercentage: progressPercentage,
    timestamp: new Date().toISOString()
  };
  
  // 디버깅 로그 (너무 자주 출력되지 않도록 10초마다)
  if (elapsedMinutes % 10 === 0 || elapsedMinutes < 5) {
    console.log('⏰ Local calculation (FIXED totalMinutes):', {
      fixedTotalMinutes: fixedTotalMinutes,
      elapsedMinutes: elapsedMinutes,
      remainingMinutes: remainingMinutes,
      progressPercentage: progressPercentage
    });
  }
  
  return result;
};

// 시간 진행 상황 업데이트를 위한 useEffect
useEffect(() => {
  if (!testStartTime || !fixedTotalMinutes || fixedTotalMinutes <= 0) return;
  
  const interval = setInterval(() => {
    const newTimeProgress = calculateTimeProgress();
    if (newTimeProgress) {
      setTimeProgress(newTimeProgress);
    }
  }, 1000); // 1초마다 업데이트
  
  return () => clearInterval(interval);
}, [testStartTime, fixedTotalMinutes]);

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
      // 측정 상태 추적
      if (event.data.includes('ON - Machine running: true') || event.data.includes('STATUS - Machine running: true')) {
        console.log('🔌 Main: 측정 시작 - isMeasurementActive: true');
        setIsMeasurementActive(true);
        // 시간 모드 테스트가 아닌 경우에만 기본 상황창 표시 (시간 모드 테스트는 TEST_PROGRESS에서 처리)
        if (!event.data.includes('시간 모드 테스트 프로세스')) {
          // fixedTotalMinutes가 이미 설정되어 있으면 서버 데이터 무시
          if (fixedTotalMinutes) {
            console.log('🔒 BLOCKED: Main handler - fixedTotalMinutes already set, ignoring server data');
            return;
          }
          const currentTime = Date.now();
          setTestStartTime(currentTime);
          // 서버에서 계산된 실제 총 시간을 기다리기 위해 초기값만 설정
          setTimeProgress({
            phase: 'starting',
            startTime: currentTime,
            currentTime: currentTime,
            elapsedTime: 0,
            totalDuration: 0,
            remainingTime: 0,
            elapsedMinutes: 0,
            remainingMinutes: 0,
            totalMinutes: 0,
            progressPercentage: 0,
            timestamp: new Date().toISOString()
          });
        }
      } else if (event.data.includes('OFF - Machine running: false') || event.data.includes('STATUS - Machine running: false') || 
                 event.data.includes('PROCESS_COMPLETED') || event.data.includes('PROCESS_STOPPED:')) {
        console.log('🔌 Main: 측정 중단 - isMeasurementActive: false');
        setIsMeasurementActive(false);
        // 테스트 중지 시 시간 진행 상황 초기화
        setTimeProgress(null);
        setTestStartTime(null);
        setFixedTotalMinutes(null);
      }
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
    // [TIME_MODE_SAVED] 메시지 처리
    else if (typeof event.data === 'string' && event.data.startsWith('[TIME_MODE_SAVED]')) {
      try {
        const match = event.data.match(/\[TIME_MODE_SAVED\] (.*)/);
        if (match && match[1]) {
          const timeModeData = JSON.parse(match[1]);
          console.log('📥 TimeMode settings saved successfully:', timeModeData);
          
          // localStorage에 저장
          if (typeof window !== 'undefined') {
            localStorage.setItem('timeModeSettings', JSON.stringify(timeModeData));
            console.log('💾 TimeMode settings saved to localStorage:', timeModeData);
          }
          
          // 팝업 닫기
          handleTimeModeClose();
        }
      } catch (err) {
        console.error('Failed to parse TimeMode saved data:', err);
      }
    }
    // [TIME_MODE_DATA] 메시지 처리 - 서버에서 읽어온 TimeMode 데이터
    else if (typeof event.data === 'string' && event.data.startsWith('[TIME_MODE_DATA]')) {
      try {
        const match = event.data.match(/\[TIME_MODE_DATA\] (.*)/);
        if (match && match[1]) {
          const timeModeData = JSON.parse(match[1]);
          console.log('📥 TimeMode data received from server:', timeModeData);
          
          // localStorage에 저장
          if (typeof window !== 'undefined') {
            localStorage.setItem('timeModeSettings', JSON.stringify(timeModeData));
            console.log('💾 TimeMode settings saved to localStorage:', timeModeData);
          }
        }
      } catch (err) {
        console.error('Failed to parse TimeMode data:', err);
      }
    }
    // [TIME_PROGRESS] 메시지 처리 - 시간 진행 상황 업데이트
    else if (typeof event.data === 'string' && event.data.startsWith('[TIME_PROGRESS]')) {
      try {
        const match = event.data.match(/\[TIME_PROGRESS\] (.*)/);
        if (match && match[1]) {
          const timeProgressData = JSON.parse(match[1]);
          console.log('⏰ Time progress received:', timeProgressData);
          
          // fixedTotalMinutes가 이미 설정되어 있으면 서버 메시지 완전 무시
          if (fixedTotalMinutes) {
            console.log('🔒 BLOCKED: Server TIME_PROGRESS message ignored - using fixed totalMinutes:', fixedTotalMinutes);
            console.log('🔒 Server tried to send totalMinutes:', timeProgressData.totalMinutes, '- REJECTED');
            return; // 서버 메시지 완전 무시
          }
          
          // 서버에서 받은 totalMinutes가 있으면 고정값으로 설정 (한 번만 설정)
          if (timeProgressData.totalMinutes && timeProgressData.totalMinutes > 0) {
            console.log('🔒 Setting fixed total minutes from server:', timeProgressData.totalMinutes);
            console.log('🔒 This value will NEVER change during the test session');
            setFixedTotalMinutesSafe(timeProgressData.totalMinutes);
          }
          
          // 서버에서 받은 startTime이 있으면 테스트 시작 시간으로 설정
          if (timeProgressData.startTime && !testStartTime) {
            setTestStartTime(timeProgressData.startTime);
          }
          
          // 첫 번째 서버값 사용 (totalMinutes는 나중에 고정값으로 덮어쓸 예정)
          console.log('📡 Using first server data - fixedTotalMinutes not set yet');
          setTimeProgress(timeProgressData);
        }
      } catch (err) {
        console.error('Failed to parse time progress data:', err);
      }
    }
    // [TEST_COMPLETED] 메시지 처리 - 테스트 완료 시 시간 진행 상황 초기화
    else if (typeof event.data === 'string' && event.data.startsWith('[TEST_COMPLETED]')) {
      console.log('🔌 Test completed message received:', event.data);
      setTimeProgress(null);
      setTestStartTime(null);
      setFixedTotalMinutes(null);
    }
    // [TEST_PROGRESS] 메시지 처리 - 테스트 시작 시 상황창 표시
    else if (typeof event.data === 'string' && event.data.startsWith('[TEST_PROGRESS]')) {
      console.log('🔌 Test progress message received:', event.data);
      
      // 테스트 시작 메시지인지 확인
      if (event.data.includes('테스트 시작 - 시간 모드 테스트 프로세스')) {
        console.log('🔌 Time mode test process started - showing progress window');
        // 테스트 시작 시 즉시 기본 시간 진행 상황 표시
        // fixedTotalMinutes가 이미 설정되어 있으면 서버 데이터 무시
        if (fixedTotalMinutes) {
          console.log('🔒 BLOCKED: TEST_PROGRESS handler - fixedTotalMinutes already set, ignoring server data');
          return;
        }
        const currentTime = Date.now();
        setTestStartTime(currentTime);
        // 서버에서 계산된 실제 총 시간을 기다리기 위해 초기값만 설정
        setTimeProgress({
          phase: 'starting',
          startTime: currentTime,
          currentTime: currentTime,
          elapsedTime: 0,
          totalDuration: 0,
          remainingTime: 0,
          elapsedMinutes: 0,
          remainingMinutes: 0,
          totalMinutes: 0,
          progressPercentage: 0,
          timestamp: new Date().toISOString()
        });
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
    // 채널 전압 저장 완료 메시지 처리
    else if (typeof event.data === 'string' && event.data.startsWith('[CHANNEL_VOLTAGES_SAVED]')) {
      try {
        const match = event.data.match(/\[CHANNEL_VOLTAGES_SAVED\] (\[.*\])/);
        if (match && match[1]) {
          const voltages = JSON.parse(match[1]);
          if (Array.isArray(voltages) && voltages.length === 4) {
            console.log('📥 Main: 채널 전압 저장 완료, 파워 테이블 업데이트:', voltages);
            setChannelVoltages(voltages);
            
            // 채널 전압 변경 시 파워 테이블 강제 업데이트를 위한 메시지 전송
            if (ws.current && ws.current.readyState === WebSocket.OPEN) {
              const updateMessage = `[POWER_TABLE_FORCE_UPDATE] ${JSON.stringify(voltages)}`;
              ws.current.send(updateMessage);
              console.log('📤 Main: 파워 테이블 강제 업데이트 메시지 전송:', updateMessage);
            }
          }
        }
      } catch (err) {
        console.error('Failed to parse saved channel voltages:', err);
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
              // 측정 상태 추적
              if (event.data.includes('ON - Machine running: true') || event.data.includes('STATUS - Machine running: true')) {
                setIsMeasurementActive(true);
                // 시간 모드 테스트가 아닌 경우에만 기본 상황창 표시 (시간 모드 테스트는 TEST_PROGRESS에서 처리)
                if (!event.data.includes('시간 모드 테스트 프로세스')) {
                  // fixedTotalMinutes가 이미 설정되어 있으면 서버 데이터 무시
                  if (fixedTotalMinutes) {
                    console.log('🔒 BLOCKED: Reconnection handler - fixedTotalMinutes already set, ignoring server data');
                    return;
                  }
                  const currentTime = Date.now();
                  setTimeProgress({
                    phase: 'starting',
                    startTime: currentTime,
                    currentTime: currentTime,
                    elapsedTime: 0,
                    totalDuration: 0,
                    remainingTime: 0,
                    elapsedMinutes: 0,
                    remainingMinutes: 0,
                    totalMinutes: 0,
                    progressPercentage: 0,
                    timestamp: new Date().toISOString()
                  });
                }
              } else if (event.data.includes('OFF - Machine running: false') || event.data.includes('STATUS - Machine running: false') || 
                         event.data.includes('PROCESS_COMPLETED') || event.data.includes('PROCESS_STOPPED:')) {
                setIsMeasurementActive(false);
                // 테스트 중지 시 시간 진행 상황 초기화
                setTimeProgress(null);
              }
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
             // [TIME_MODE_SAVED] 메시지 처리
             else if (typeof event.data === 'string' && event.data.startsWith('[TIME_MODE_SAVED]')) {
               try {
                 const match = event.data.match(/\[TIME_MODE_SAVED\] (.*)/);
                 if (match && match[1]) {
                   const timeModeData = JSON.parse(match[1]);
                   console.log('📥 TimeMode settings saved successfully (reconnection):', timeModeData);
                   
                   // localStorage에 저장
                   if (typeof window !== 'undefined') {
                     localStorage.setItem('timeModeSettings', JSON.stringify(timeModeData));
                     console.log('💾 TimeMode settings saved to localStorage (reconnection):', timeModeData);
                   }
                   
                   // 팝업 닫기
                   handleTimeModeClose();
                 }
               } catch (err) {
                 console.error('Failed to parse TimeMode saved data (reconnection):', err);
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
          // 채널 전압 저장 완료 메시지 처리 (재연결)
          else if (typeof event.data === 'string' && event.data.startsWith('[CHANNEL_VOLTAGES_SAVED]')) {
            try {
              const match = event.data.match(/\[CHANNEL_VOLTAGES_SAVED\] (\[.*\])/);
              if (match && match[1]) {
                const voltages = JSON.parse(match[1]);
                if (Array.isArray(voltages) && voltages.length === 4) {
                  console.log('📥 Main: 채널 전압 저장 완료, 파워 테이블 업데이트 (재연결):', voltages);
                  setChannelVoltages(voltages);
                  
                  // 채널 전압 변경 시 파워 테이블 강제 업데이트를 위한 메시지 전송
                  if (ws.current && ws.current.readyState === WebSocket.OPEN) {
                    const updateMessage = `[POWER_TABLE_FORCE_UPDATE] ${JSON.stringify(voltages)}`;
                    ws.current.send(updateMessage);
                    console.log('📤 Main: 파워 테이블 강제 업데이트 메시지 전송 (재연결):', updateMessage);
                  }
                }
              }
            } catch (err) {
              console.error('Failed to parse saved channel voltages (reconnection):', err);
            }
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
            // 측정 상태 추적
            if (event.data.includes('ON - Machine running: true') || event.data.includes('STATUS - Machine running: true')) {
              setIsMeasurementActive(true);
              // 시간 모드 테스트가 아닌 경우에만 기본 상황창 표시 (시간 모드 테스트는 TEST_PROGRESS에서 처리)
              if (!event.data.includes('시간 모드 테스트 프로세스')) {
                // fixedTotalMinutes가 이미 설정되어 있으면 서버 데이터 무시
                if (fixedTotalMinutes) {
                  console.log('🔒 BLOCKED: Auto-reconnection handler - fixedTotalMinutes already set, ignoring server data');
                  return;
                }
                const currentTime = Date.now();
                setTimeProgress({
                  phase: 'starting',
                  startTime: currentTime,
                  currentTime: currentTime,
                  elapsedTime: 0,
                  totalDuration: 0,
                  remainingTime: 0,
                  elapsedMinutes: 0,
                  remainingMinutes: 0,
                  totalMinutes: 0,
                  progressPercentage: 0,
                  timestamp: new Date().toISOString()
                });
              }
            } else if (event.data.includes('OFF - Machine running: false') || event.data.includes('STATUS - Machine running: false') || 
                       event.data.includes('PROCESS_COMPLETED') || event.data.includes('PROCESS_STOPPED:')) {
              setIsMeasurementActive(false);
              // 테스트 중지 시 시간 진행 상황 초기화
              setTimeProgress(null);
            }
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
           // [TIME_MODE_SAVED] 메시지 처리
           else if (typeof event.data === 'string' && event.data.startsWith('[TIME_MODE_SAVED]')) {
             try {
               const match = event.data.match(/\[TIME_MODE_SAVED\] (.*)/);
               if (match && match[1]) {
                 const timeModeData = JSON.parse(match[1]);
                 console.log('📥 TimeMode settings saved successfully (auto-reconnection):', timeModeData);
                 
                 if (typeof window !== 'undefined') {
                   localStorage.setItem('timeModeSettings', JSON.stringify(timeModeData));
                   console.log('💾 TimeMode settings saved to localStorage (auto-reconnection):', timeModeData);
                 }
                 
                 // 팝업 닫기
                 handleTimeModeClose();
               }
             } catch (err) {
               console.error('Failed to parse TimeMode saved data (auto-reconnection):', err);
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
          // 채널 전압 저장 완료 메시지 처리 (자동재연결)
          else if (typeof event.data === 'string' && event.data.startsWith('[CHANNEL_VOLTAGES_SAVED]')) {
            try {
              const match = event.data.match(/\[CHANNEL_VOLTAGES_SAVED\] (\[.*\])/);
              if (match && match[1]) {
                const voltages = JSON.parse(match[1]);
                if (Array.isArray(voltages) && voltages.length === 4) {
                  console.log('📥 Main: 채널 전압 저장 완료, 파워 테이블 업데이트 (자동재연결):', voltages);
                  setChannelVoltages(voltages);
                  
                  // 채널 전압 변경 시 파워 테이블 강제 업데이트를 위한 메시지 전송
                  if (ws.current && ws.current.readyState === WebSocket.OPEN) {
                    const updateMessage = `[POWER_TABLE_FORCE_UPDATE] ${JSON.stringify(voltages)}`;
                    ws.current.send(updateMessage);
                    console.log('📤 Main: 파워 테이블 강제 업데이트 메시지 전송 (자동재연결):', updateMessage);
                  }
                }
              }
            } catch (err) {
              console.error('Failed to parse saved channel voltages (auto-reconnection):', err);
            }
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

// 사용자 상호작용 감지를 위한 useEffect (강화된 버전)
useEffect(() => {
  const handleUserInteraction = () => {
    setHasUserInteracted(true);
    console.log('🔌 Main: 사용자 상호작용 감지됨 - beforeunload 이벤트 활성화');
  };

  if (typeof window !== 'undefined') {
    // 다양한 사용자 상호작용 이벤트 감지
    window.addEventListener('click', handleUserInteraction, { once: true });
    window.addEventListener('keydown', handleUserInteraction, { once: true });
    window.addEventListener('mousemove', handleUserInteraction, { once: true });
    window.addEventListener('touchstart', handleUserInteraction, { once: true });
    
    // 페이지 로드 후 1초 뒤에 자동으로 상호작용 활성화 (테스트용)
    const autoActivate = setTimeout(() => {
      if (!hasUserInteracted) {
        console.log('🔌 Main: 자동으로 사용자 상호작용 활성화 (테스트용)');
        setHasUserInteracted(true);
      }
    }, 1000);

    return () => {
      clearTimeout(autoActivate);
    };
  }

  return () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('click', handleUserInteraction);
      window.removeEventListener('keydown', handleUserInteraction);
      window.removeEventListener('mousemove', handleUserInteraction);
      window.removeEventListener('touchstart', handleUserInteraction);
    }
  };
}, [hasUserInteracted]);

// 강력한 페이지 닫기 방지 시스템 (최신 브라우저 대응)
useEffect(() => {
  const handleBeforeUnload = (event) => {
    console.log('🔌 Main: beforeunload 이벤트 발생');
    
    if (!hasUserInteracted) {
      console.log('🔌 Main: 사용자 상호작용이 없어서 팝업을 표시하지 않음');
      return;
    }
    
    // 커스텀 모달 즉시 표시
    setShowExitConfirmModal(true);
    setPendingExit(true);
    
    // 브라우저 기본 팝업도 시도
    const message = isMeasurementActive 
      ? '현재 측정이 진행 중입니다. 정말로 페이지를 닫으시겠습니까?'
      : '정말로 페이지를 닫으시겠습니까?';
    
    event.preventDefault();
    event.returnValue = message;
    return message;
  };

  const handleKeyDown = (event) => {
    // 페이지 닫기 단축키 감지
    if ((event.altKey && event.key === 'F4') || 
        (event.ctrlKey && (event.key === 'w' || event.key === 'q'))) {
      if (hasUserInteracted) {
        event.preventDefault();
        setShowExitConfirmModal(true);
        setPendingExit(true);
      }
    }
  };

  // 페이지 숨김 감지
  const handleVisibilityChange = () => {
    if (document.hidden && hasUserInteracted && !showExitConfirmModal) {
      console.log('🔌 Main: 페이지가 숨겨짐 - 확인 모달 표시');
      setShowExitConfirmModal(true);
      setPendingExit(true);
    }
  };

  if (typeof window !== 'undefined') {
    // 기본 이벤트들
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // 레거시 방식
    window.onbeforeunload = handleBeforeUnload;
  }
  
  return () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.onbeforeunload = null;
    }
  };
}, [isMeasurementActive, hasUserInteracted, showExitConfirmModal]);

// 사용자 상호작용 기반 경고 시스템 (최신 브라우저 대응)
useEffect(() => {
  console.log('🔌 Main: 경고 시스템 초기화 - hasUserInteracted:', hasUserInteracted);
  
  // 사용자가 페이지를 떠나려고 할 때 즉시 감지
  const handleBeforeUnload = (event) => {
    console.log('🔌 Main: beforeunload 이벤트 발생!');
    console.log('🔌 Main: hasUserInteracted:', hasUserInteracted);
    console.log('🔌 Main: isMeasurementActive:', isMeasurementActive);
    
    if (!hasUserInteracted) {
      console.log('🔌 Main: 사용자 상호작용이 없어서 경고를 표시하지 않음');
      return;
    }
    
    console.log('🔌 Main: 경고 모달 표시 시도');
    
    // 즉시 커스텀 모달 표시
    setShowExitConfirmModal(true);
    setPendingExit(true);
    
    // 브라우저 기본 팝업도 시도
    const message = isMeasurementActive 
      ? '현재 측정이 진행 중입니다. 정말로 페이지를 닫으시겠습니까?'
      : '정말로 페이지를 닫으시겠습니까?';
    
    console.log('🔌 Main: 브라우저 기본 팝업 메시지:', message);
    
    event.preventDefault();
    event.returnValue = message;
    return message;
  };

  // 키보드 단축키 감지
  const handleKeyDown = (event) => {
    if ((event.altKey && event.key === 'F4') || 
        (event.ctrlKey && (event.key === 'w' || event.key === 'q'))) {
      console.log('🔌 Main: 페이지 닫기 단축키 감지:', event.key);
      if (hasUserInteracted) {
        event.preventDefault();
        setShowExitConfirmModal(true);
        setPendingExit(true);
      }
    }
  };

  // 페이지 숨김 감지 (탭 전환 등)
  const handleVisibilityChange = () => {
    console.log('🔌 Main: visibilitychange 이벤트 - document.hidden:', document.hidden);
    if (document.hidden && hasUserInteracted && !showExitConfirmModal) {
      console.log('🔌 Main: 페이지가 숨겨짐 - 확인 모달 표시');
      setShowExitConfirmModal(true);
      setPendingExit(true);
    }
  };

  if (typeof window !== 'undefined') {
    console.log('🔌 Main: 이벤트 리스너 등록 중...');
    
    // 이벤트 리스너 등록
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // 레거시 방식
    window.onbeforeunload = handleBeforeUnload;
    
    console.log('🔌 Main: 이벤트 리스너 등록 완료');
  }

  return () => {
    if (typeof window !== 'undefined') {
      console.log('🔌 Main: 이벤트 리스너 정리 중...');
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.onbeforeunload = null;
    }
  };
}, [isMeasurementActive, hasUserInteracted, showExitConfirmModal]);

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
	const [selectedDevices, setSelectedDevices] = useState([0]); // 선택된 디바이스 인덱스 배열 (기본값: #1 Device)

  const handleSelectionFromDeviceSelect = (selectedDeviceIndices) => {
    console.log("DeviceSelect: 선택된 디바이스 인덱스:", selectedDeviceIndices);
    setSelectedDevices(selectedDeviceIndices);
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

  // TimeModePopup handlers
  const handleTimeModeButtonClick = () => {
    console.log('TimeMode button clicked, opening popup');
    setIsTimeModePopupOpen(true);
  };

  const handleTimeModeSave = (timeValues, isTimeModeEnabled) => {
    console.log('TimeMode: 저장된 시간 값들:', timeValues);
    console.log('TimeMode: 활성화 상태:', isTimeModeEnabled);
    
    // 시간 값과 활성화 상태를 함께 서버로 전송
    const timeModeSettings = {
      ...timeValues,
      isTimeModeEnabled: isTimeModeEnabled
    };
    
    const messageWithIdentifier = `[TIME_MODE] ${JSON.stringify(timeModeSettings)}`;
    sendWebSocketMessage(messageWithIdentifier);
    
    // localStorage에도 저장
    if (typeof window !== 'undefined') {
      localStorage.setItem('timeModeSettings', JSON.stringify(timeModeSettings));
      console.log('TimeMode: localStorage에 설정 저장됨:', timeModeSettings);
    }
  };

  const handleTimeModeClose = () => {
    setIsTimeModePopupOpen(false);
  };

  // 페이지 닫기 확인 모달 핸들러
  const handleExitConfirm = () => {
    console.log('🔌 Main: 사용자가 페이지 닫기를 확인함');
    setShowExitConfirmModal(false);
    setPendingExit(false);
    // 실제로 페이지를 닫기
    if (typeof window !== 'undefined') {
      window.close();
    }
  };

  const handleExitCancel = () => {
    console.log('🔌 Main: 사용자가 페이지 닫기를 취소함');
    setShowExitConfirmModal(false);
    setPendingExit(false);
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
            <DeviceSelect 
              initialValue="#1 Device" 
              onSelectionChange={handleSelectionFromDeviceSelect} 
              wsConnection={ws.current}
              onTimeModeClick={handleTimeModeButtonClick}
            />
          </div>
          <div className={styles.bodyItem}>
            <PowerTable 
              groups={props.powerGroups || []} 
              wsConnection={ws.current} 
              channelVoltages={channelVoltages} // 동적으로 받은 channelVoltages 설정값
              selectedDevices={selectedDevices} // 선택된 디바이스 인덱스 배열
            />
            {/* 디버깅용 정보 표시 - 숨김 처리 */}
            {/* <div style={{ 
              position: 'absolute', 
              top: '10px', 
              left: '10px', 
              backgroundColor: 'rgba(0,0,0,0.8)', 
              color: 'white', 
              padding: '5px', 
              fontSize: '10px',
              borderRadius: '4px'
            }}>
              ChannelVoltages: {JSON.stringify(channelVoltages)}<br/>
              SelectedDevices: {JSON.stringify(selectedDevices)}
            </div> */}
            {/* 시간 진행 상황 표시 */}
            {timeProgress && (
              <div style={{
                position: 'fixed',
                bottom: '20px',
                right: '20px',
                backgroundColor: 'rgba(0,0,0,0.9)',
                color: 'white',
                padding: '15px',
                fontSize: '14px',
                borderRadius: '8px',
                border: '2px solid #90CAF9',
                minWidth: '300px',
                zIndex: 1000
              }}>
                 <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
                   <span style={{ fontSize: '18px', marginRight: '8px' }}>⏰</span>
                   <span style={{ fontWeight: 'bold', color: '#90CAF9' }}>
                     {timeProgress.phase === 'starting' ? '시작 중' :
                      timeProgress.phase === 'waiting' ? '대기 중' : 
                      timeProgress.phase === 'temperature_waiting' ? '온도 대기 중' : 
                      '진행 중'}
                   </span>
                 </div>
                
                 <div style={{ marginBottom: '8px' }}>
                   <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                     <span>경과 시간:</span>
                     <span style={{ color: '#4CAF50', fontWeight: 'bold' }}>
                       {timeProgress.elapsedMinutes}분
                     </span>
                   </div>
                   <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                     <span>남은 시간:</span>
                     <span style={{ color: '#FF9800', fontWeight: 'bold' }}>
                       {timeProgress.remainingMinutes}분
                     </span>
                   </div>
                   <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                     <span>총 예상 시간:</span>
                     <span style={{ color: '#2196F3', fontWeight: 'bold' }}>
                       {timeProgress.totalMinutes}분
                     </span>
                   </div>
                 </div>
                
                {/* 진행률 바 */}
                <div style={{ marginBottom: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                    <span>진행률:</span>
                    <span style={{ color: '#90CAF9', fontWeight: 'bold' }}>
                      {timeProgress.progressPercentage}%
                    </span>
                  </div>
                  <div style={{
                    width: '100%',
                    height: '8px',
                    backgroundColor: 'rgba(255,255,255,0.2)',
                    borderRadius: '4px',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      width: `${timeProgress.progressPercentage}%`,
                      height: '100%',
                      backgroundColor: '#4CAF50',
                      transition: 'width 0.3s ease'
                    }} />
                  </div>
                </div>
                
                <div style={{ fontSize: '12px', color: '#B0B0B0', textAlign: 'center' }}>
                  {new Date(timeProgress.timestamp).toLocaleTimeString()}
                </div>
              </div>
            )}

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
            <div className={styles.footerItem} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', padding: '4px 10px 10px 10px' }}> 
              <ProductInput wsConnection={ws.current} /> 
              <DelaySettingsPanel wsConnection={ws.current} />
              <ChannelVoltageSettings wsConnection={ws.current} />
              <TestSystemButton wsConnection={ws.current} />
            </div>
            <div className={styles.footerItem} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '4px 10px 10px 10px' }}> 
              <OutVoltSettingPanel wsConnection={ws.current} />            
            </div>
            <div className={styles.footerItem} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '4px 10px 10px 10px' }}> 
              {/* <SetVolt initialValue="PowerOff" onSelectionChange={ handleSelectionFromVoltSelect } /> */}
              <HighTempSettingPanel wsConnection={ws.current} />
            </div>
            <div className={styles.footerItem} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '4px 10px 10px 10px' }}>          
              <LowTempSettingPanel wsConnection={ws.current} />
            </div>
            <div className={styles.footerItem} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '4px 10px 10px 10px' }}> 
              <UsbPortSelect wsConnection={ws.current} onSelectionChange={handleUsbPortSelection} />
            </div>
        </footer>

        {/* TimeModePopup Modal */}
        <TimeModePopup
          isOpen={isTimeModePopupOpen}
          onClose={handleTimeModeClose}
          onSave={handleTimeModeSave}
          wsConnection={ws.current}
        />

        {/* 페이지 닫기 확인 모달 */}
        {showExitConfirmModal && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 9999
          }}>
            <div style={{
              backgroundColor: '#1D1D1D',
              padding: '30px',
              borderRadius: '10px',
              border: '2px solid #90CAF9',
              maxWidth: '400px',
              textAlign: 'center',
              color: '#E0E0E0'
            }}>
              <h3 style={{ marginBottom: '20px', color: '#90CAF9' }}>
                {isMeasurementActive ? '⚠️ 측정 진행 중 - 브라우저 닫기' : '⚠️ 브라우저 닫기'}
              </h3>
              <p style={{ marginBottom: '30px', fontSize: '16px' }}>
                {isMeasurementActive 
                  ? '현재 측정이 진행 중입니다.\n정말로 브라우저를 닫으시겠습니까?'
                  : '정말로 브라우저를 닫으시겠습니까?'
                }
              </p>
              <div style={{ display: 'flex', gap: '15px', justifyContent: 'center' }}>
                <button
                  onClick={handleExitConfirm}
                  style={{
                    backgroundColor: '#f44336',
                    color: 'white',
                    border: 'none',
                    padding: '10px 20px',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 'bold'
                  }}
                >
                  닫기
                </button>
                <button
                  onClick={handleExitCancel}
                  style={{
                    backgroundColor: '#4CAF50',
                    color: 'white',
                    border: 'none',
                    padding: '10px 20px',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 'bold'
                  }}
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
  );
}

export async function getServerSideProps() {
  const powerGroups = await parsePowerDataFile();
  return { props: { powerGroups } };
}
