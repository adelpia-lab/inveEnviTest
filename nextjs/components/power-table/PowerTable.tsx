// components/power-table/PowerTable.tsx
'use client';
import React, { useState, useEffect } from 'react';
import type { PowerDataGroup } from '../../lib/parsePowerData';

interface PowerTableProps {
  groups: PowerDataGroup[];
  wsConnection?: WebSocket | null;
  channelVoltages?: number[]; // 채널 전압 설정 추가
}

interface VoltageData {
  device: number;
  voltageTest: number;
  channels: Array<{
    device: number;
    channel: number;
    voltage: number | string;
    expected: number;
    result: string;
    voltageWithComparison: string;
  }>;
  inputVoltage: number;
  rowIndex: number;
  testIndex: number;
}

export default function PowerTable({ groups, wsConnection, channelVoltages = [5, 15, -15, 24] }: PowerTableProps) {
  const [voltageData, setVoltageData] = useState<{ [key: string]: string }>({});
  const [chamberTemperature, setChamberTemperature] = useState<number | null>(null);
  const [processLogs, setProcessLogs] = useState<string[]>([]);
  const [currentCycle, setCurrentCycle] = useState<number | null>(null);
  const [cycleMessage, setCycleMessage] = useState<string>('');
  
  // 사이클 및 테스트 진행 상황 추적을 위한 상태 변수들
  const [totalCycles, setTotalCycles] = useState<number>(0);
  const [testPhase, setTestPhase] = useState<'high_temp' | 'low_temp' | 'none'>('none');
  const [currentTestNumber, setCurrentTestNumber] = useState<number>(0);
  const [totalTestCount, setTotalTestCount] = useState<number>(0);
  const [testStatus, setTestStatus] = useState<'ON' | 'OFF' | 'none'>('none');
  
  //console.log('🔌 PowerTable: 컴포넌트 렌더링됨');
  //console.log('🔌 PowerTable: props 확인:', { groups: groups?.length, wsConnection: !!wsConnection, channelVoltages });
  //console.log('🔌 PowerTable: channelVoltages 상세:', channelVoltages);
  
  // channelVoltages 변경 추적
  useEffect(() => {
    //console.log('🔌 PowerTable: channelVoltages 변경됨:', channelVoltages);
  }, [channelVoltages]);
  
  // 컴포넌트 마운트 시 초기 상태 강제 설정
  useEffect(() => {
    //console.log('🔌 PowerTable: 컴포넌트 마운트 - 초기 상태 강제 설정');
    
    // 모든 상태를 초기값으로 강제 설정
    setVoltageData({});
    setProcessLogs([]);
    setCurrentCycle(null);
    setCycleMessage('');
    setTotalCycles(0);
    setTestPhase('none');
    setCurrentTestNumber(0);
    setTotalTestCount(0);
    setTestStatus('none');
    
    //console.log('✅ PowerTable: 초기 상태 강제 설정 완료');
  }, [wsConnection]);
  
  // 상태 변경 감지를 위한 useEffect
  useEffect(() => {
  }, [currentCycle, totalCycles, testPhase, currentTestNumber, totalTestCount, testStatus, cycleMessage]);
  
  const group = groups[0]; // 첫 번째 그룹만 사용
  if (!group) return <div className="text-red-400">데이터 없음</div>;

  // 출력 전압 표시 함수
  const getOutputVoltageDisplay = (outputValue: string) => {
    //console.log(`🔌 PowerTable: getOutputVoltageDisplay 호출 - outputValue: ${outputValue}, channelVoltages:`, channelVoltages);
    
    // 기존 출력값을 channelVoltages 인덱스로 매핑
    let channelIndex = 0;
    if (outputValue === '+5') channelIndex = 0;
    else if (outputValue === '+15') channelIndex = 1;
    else if (outputValue === '-15') channelIndex = 2;
    else if (outputValue === '+24') channelIndex = 3;
    
    // channelVoltages에서 해당 인덱스의 값을 가져와서 표시
    const voltage = channelVoltages[channelIndex];
    //console.log(`🔌 PowerTable: channelIndex: ${channelIndex}, voltage: ${voltage}`);
    
    if (voltage !== undefined) {
      const result = voltage > 0 ? `+${voltage}` : `${voltage}`;
      // console.log(`🔌 PowerTable: 변환 결과: ${outputValue} -> ${result}`);
      return result;
    }
    
    // fallback: 기존 값 사용
    //console.log(`🔌 PowerTable: fallback 사용: ${outputValue}`);
    return outputValue;
  };

  // 출력값으로부터 채널 번호를 결정하는 함수
  const getChannelNumberFromOutput = (outputValue: string) => {
    // 기존 출력값과 새로운 출력값 모두 처리
    if (outputValue === '+5' || outputValue === `+${channelVoltages[0]}`) return 1;
    else if (outputValue === '+15' || outputValue === `+${channelVoltages[1]}`) return 2;
    else if (outputValue === '-15' || outputValue === `${channelVoltages[2]}`) return 3;
    else if (outputValue === '+24' || outputValue === `+${channelVoltages[3]}`) return 4;
    else return 1; // 기본값
  };

  // 전압 데이터 표시 함수
  const getVoltageDisplay = (device: number, test: number, channel: number) => {
    const key = `device${device}_test${test}_channel${channel}`;
    const voltage = voltageData[key];
    if (voltage && voltage !== '-.-') {
      return voltage;
    }
    return '-.-';
  };

  // 전압 데이터를 강제로 초기화하는 함수
  const resetVoltageData = () => {
    
    // 모든 상태 완전 초기화
    setVoltageData({});
    setProcessLogs([]);
    setCurrentCycle(null);
    setCycleMessage('');
    setTotalCycles(0);
    setTestPhase('none');
    setCurrentTestNumber(0);
    setTotalTestCount(0);
    setTestStatus('none');    
  };

  // WebSocket 메시지 수신 처리
  useEffect(() => {
    if (!wsConnection) {
      return;
    }

    if (wsConnection.readyState !== WebSocket.OPEN) {
      console.log('🔌 PowerTable: WebSocket이 아직 열리지 않았습니다. readyState:', wsConnection.readyState);
      return;
    }


    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      console.log('🔌 PowerTable: 메시지 수신:', message);
      
      // PowerTable 전압 데이터 초기화 메시지 처리
      if (typeof message === 'string' && message.startsWith('[POWER_TABLE_RESET]')) {
        try {
          
          const match = message.match(/\[POWER_TABLE_RESET\] (.+)/);
          if (match && match[1]) {
          
            const resetData = JSON.parse(match[1]);
            
            // 액션 타입에 따른 처리
            switch (resetData.action) {
              case 'reset':
                // 일반 초기화 - 모든 상태 초기화
                resetVoltageData();
                setCycleMessage(resetData.message || '');
                break;
                
              case 'cycle_reset':
                // 사이클 시작 - 전압 데이터 초기화하고 사이클 정보 설정
                resetVoltageData();
                setCurrentCycle(resetData.cycle || null);
                setTotalCycles(resetData.totalCycles || 0);
                setCycleMessage(resetData.message || '');
                setTestPhase('none');
                setCurrentTestNumber(0);
                setTotalTestCount(0);
                setTestStatus('none');
                break;
                
              case 'single_page_reset':
                // 단일 페이지 프로세스 - 전압 데이터 초기화
                resetVoltageData();
                setCurrentCycle(null);
                setTotalCycles(0);
                setCycleMessage(resetData.message || '');
                setTestPhase('none');
                setCurrentTestNumber(0);
                setTotalTestCount(0);
                setTestStatus('none');
                break;
                
              case 'test_start':
                // 테스트 시작 - 전압 데이터는 유지하고 테스트 정보만 업데이트
                setCurrentCycle(resetData.cycle || null);
                setTotalCycles(resetData.totalCycles || 0);
                setTestPhase(resetData.testPhase || 'none');
                setCurrentTestNumber(0);
                setTotalTestCount(resetData.totalTestCount || 0);
                setTestStatus(resetData.testStatus || 'none');
                setCycleMessage(resetData.message || '');
                break;
                
              case 'test_progress':
                // 테스트 진행 상황 - 전압 데이터는 유지하고 진행 상황만 업데이트
                setCurrentCycle(resetData.cycle || null);
                setTotalCycles(resetData.totalCycles || 0);
                setTestPhase(resetData.testPhase || 'none');
                setCurrentTestNumber(resetData.currentTestNumber || 0);
                setTotalTestCount(resetData.totalTestCount || 0);
                setTestStatus(resetData.testStatus || 'none');
                setCycleMessage(resetData.message || '');
                break;
                
              default:
                // 알 수 없는 액션 - 기본 초기화
                console.log('🔄 PowerTable: 알 수 없는 액션 - 기본 초기화 실행');
                resetVoltageData();
                setCycleMessage(resetData.message || '');
                console.log('✅ PowerTable: 기본 초기화 완료');
                break;
            }
            
          } else {
            console.error('🔄 PowerTable: [POWER_TABLE_RESET] 메시지 형식 오류 - 매치 실패');
            console.error('🔄 PowerTable: 원본 메시지:', message);
          }
        } catch (error) {
          console.error('PowerTable: PowerTable 메시지 파싱 오류:', error);
          console.error('PowerTable: 원본 메시지:', message);
        }
      }
      
      // 전압 업데이트 메시지 처리
      if (typeof message === 'string' && message.startsWith('[VOLTAGE_UPDATE]')) {
        try {
          console.log('🔌 PowerTable: 전압 업데이트 메시지 수신:', message);
          const match = message.match(/\[VOLTAGE_UPDATE\] (.+)/);
          if (match && match[1]) {
            const voltageUpdate: VoltageData = JSON.parse(match[1]);
            console.log('🔌 PowerTable: 파싱된 전압 데이터:', voltageUpdate);
            
            // 각 채널의 전압 데이터를 저장
            voltageUpdate.channels.forEach(channel => {
              const key = `device${channel.device}_test${voltageUpdate.voltageTest}_channel${channel.channel}`;
              const displayValue = channel.voltage === 'error' ? '-.-' : 
                typeof channel.voltage === 'number' ? `${channel.voltage.toFixed(2)}V` : '-.-';
              
              console.log(`🔌 PowerTable: 채널 데이터 저장 - key: ${key}, value: ${displayValue}`);
              
              setVoltageData(prev => {
                const newData = {
                  ...prev,
                  [key]: displayValue
                };
                console.log(`🔌 PowerTable: 전압 데이터 업데이트 - 이전: ${Object.keys(prev).length}개, 현재: ${Object.keys(newData).length}개`);
                return newData;
              });
            });
          }
        } catch (error) {
          console.error('PowerTable: 전압 업데이트 파싱 오류:', error);
          console.error('PowerTable: 원본 메시지:', message);
        }
      }
      
      // 프로세스 로그 메시지 처리
      if (typeof message === 'string' && message.startsWith('[PROCESS_LOG]')) {
        try {
          console.log('🔌 PowerTable: 프로세스 로그 메시지 수신:', message);
          const match = message.match(/\[PROCESS_LOG\] (.+)/);
          if (match && match[1]) {
            const logMessage = match[1];
            console.log('🔌 PowerTable: 로그 메시지 추가:', logMessage);
            setProcessLogs(prev => {
              const newLogs = [...prev, logMessage];
              return newLogs.slice(-5); // 최대 5개의 로그만 유지
            });
          }
        } catch (error) {
          console.error('PowerTable: 프로세스 로그 파싱 오류:', error);
          console.error('PowerTable: 원본 메시지:', message);
        }
      }
      
      // 챔버 온도 업데이트 메시지 처리
      if (typeof message === 'string' && message.startsWith('[CHAMBER_TEMPERATURE]')) {
        try {
          console.log('🔌 PowerTable: 챔버 온도 메시지 수신:', message);
          const match = message.match(/\[CHAMBER_TEMPERATURE] (.+)/);
          if (match && match[1]) {
            const temperature = parseFloat(match[1]);
            if (!isNaN(temperature)) {
              console.log('🔌 PowerTable: 챔버 온도 업데이트:', temperature);
              setChamberTemperature(temperature);
            }
          }
        } catch (error) {
          console.error('PowerTable: 챔버 온도 파싱 오류:', error);
          console.error('PowerTable: 원본 메시지:', message);
        }
      }
    };

    wsConnection.addEventListener('message', handleMessage);
    
    // 연결 상태 변경 이벤트 리스너 추가
    const handleOpen = () => {
      console.log('🔌 PowerTable: WebSocket 연결됨');
    };
    
    const handleClose = () => {
      console.log('🔌 PowerTable: WebSocket 연결 끊어짐');
    };
    
    const handleError = (error) => {
      console.error('🔌 PowerTable: WebSocket 오류:', error);
    };
    
    wsConnection.addEventListener('open', handleOpen);
    wsConnection.addEventListener('close', handleClose);
    wsConnection.addEventListener('error', handleError);
    
    return () => {
      wsConnection.removeEventListener('message', handleMessage);
      wsConnection.removeEventListener('open', handleOpen);
      wsConnection.removeEventListener('close', handleClose);
      wsConnection.removeEventListener('error', handleError);
    };
  }, [wsConnection]);

  // 초기화 메시지 타입에 따른 텍스트 반환 함수
  const getActionTypeText = (message: string) => {
    if (message.includes('단일 페이지')) return '단일페이지 초기화';
    if (message.includes('사이클')) return '사이클 초기화';
    return '일반 초기화';
  };
  
  // 테스트용 메시지 전송 함수
  const sendTestMessage = () => {
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
      const testMessage = `[POWER_TABLE_RESET] ${JSON.stringify({
        action: 'test_start',
        cycle: 1,
        totalCycles: 3,
        testPhase: 'high_temp',
        currentTestNumber: 2,
        totalTestCount: 5,
        testStatus: 'ON',
        timestamp: new Date().toISOString(),
        message: '테스트용 메시지 - 고온 테스트 2/5 실행 중'
      })}`;
      
      wsConnection.send(testMessage);
    } else {
      console.warn('🧪 PowerTable: WebSocket 연결이 없습니다.');
    }
  };

  // 전압 업데이트 테스트 함수
  const sendVoltageTestMessage = () => {
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
      const testVoltageMessage = `[VOLTAGE_UPDATE] ${JSON.stringify({
        device: 1,
        voltageTest: 1,
        channels: [
          { device: 1, channel: 1, voltage: 5.12, expected: 5.0, result: 'PASS', voltageWithComparison: '5.12V' },
          { device: 1, channel: 2, voltage: 15.08, expected: 15.0, result: 'PASS', voltageWithComparison: '15.08V' },
          { device: 1, channel: 3, voltage: -14.95, expected: -15.0, result: 'PASS', voltageWithComparison: '-14.95V' },
          { device: 1, channel: 4, voltage: 24.02, expected: 24.0, result: 'PASS', voltageWithComparison: '24.02V' }
        ],
        inputVoltage: 24,
        rowIndex: 0,
        testIndex: 0
      })}`;
      
      wsConnection.send(testVoltageMessage);
      console.log('🧪 PowerTable: 테스트 전압 메시지 전송:', testVoltageMessage);
    } else {
      console.warn('🧪 PowerTable: WebSocket 연결이 없습니다.');
    }
  };

  return (
    <div className="w-full h-full bg-[#181A20] rounded-lg shadow-md p-2" style={{ 
      width: '100%', 
      height: '100%',
      display: 'grid',
      gridTemplateRows: '100px 1fr',
      gridTemplateAreas: '"header" "table"',
      gap: '10px'
    }}>
      {/* 상단 정보 영역 - 그리드 영역 */}
      <div className="flex flex-col gap-3 px-2" style={{ 
        gridArea: 'header',
        backgroundColor: '#23242a',
        borderRadius: '8px',
        padding: '15px'
      }}>
        {/* 첫 번째 줄: 온도, 사이클, 테스트 진행 상황 */}
        <div className="flex items-center justify-between gap-4">
          {/* 온도 표시 */}
          <div className="text-lg font-semibold text-blue-200">
            🌡️ 온도: <span className="text-white">
              {chamberTemperature !== null ? `${chamberTemperature.toFixed(2)}°C` : `${group.temperature}°C`}
            </span>
          </div>
          
          {/* 사이클 정보 표시 */}
          {currentCycle && totalCycles > 0 ? (
            <div className="text-lg font-semibold text-green-200">
              🔄 사이클: <span className="text-white">{currentCycle}</span> / <span className="text-white">{totalCycles}</span>
            </div>
          ) : (
            <div className="text-lg font-semibold text-gray-400">
              🔄 사이클: <span className="text-white">대기 중</span>
            </div>
          )}
          
          {/* 테스트 진행 상황 표시 */}
          {testPhase !== 'none' && totalTestCount > 0 ? (
            <span className={`px-3 py-2 rounded-lg text-white font-medium ${
              testPhase === 'high_temp' ? 'bg-red-600' : 'bg-blue-600'
            }`}>
              {testPhase === 'high_temp' ? '🔥 고온' : '❄️ 저온'}: ({currentTestNumber} / {totalTestCount})
            </span>
          ) : (
            <span className="px-3 py-2 rounded-lg text-gray-400 bg-gray-600 font-medium">
              ⏳ 테스트 대기
            </span>
          )}
          
          {/* 테스트 상태 표시 */}
          {testStatus !== 'none' ? (
            <span className={`px-3 py-2 rounded-lg text-white font-medium ${
              testStatus === 'ON' ? 'bg-green-600' : 'bg-red-600'
            }`}>
              {testStatus === 'ON' ? '🟢 실행중' : '🔴 중지됨'}
            </span>
          ) : (
            <span className="px-3 py-2 rounded-lg text-gray-400 bg-gray-600 font-medium">
              ⏸️ 대기
            </span>
          )}
          
          {/* 초기화 상태 표시 */}
          <div className="text-sm text-gray-300">
            📊 전압: <span className="text-white font-medium">
              {Object.keys(voltageData).length === 0 ? '초기화됨' : `${Object.keys(voltageData).length}개`}
            </span>
            {Object.keys(voltageData).length > 0 && (
              <span className="text-xs text-blue-300 ml-2">
                (최근: {Object.values(voltageData).slice(-3).join(', ')})
              </span>
            )}
          </div>
        </div>
        
        {/* 두 번째 줄: 현재 진행 상황 메시지와 테스트 버튼 */}
        <div className="flex items-center justify-between">
          {/* 현재 진행 상황 메시지 */}
          <div className="flex-1">
            {cycleMessage ? (
              <div className="text-green-300 font-medium text-center py-2 px-4 bg-green-900 bg-opacity-30 rounded-lg">
                📢 {cycleMessage}
              </div>
            ) : (
              <div className="text-gray-500 text-center py-2 px-4 bg-gray-800 bg-opacity-30 rounded-lg">
                ⏳ 대기 중...
              </div>
            )}
          </div>
          
          {/* 테스트 버튼들 */}
          <div className="flex gap-2">
            <button
              onClick={sendTestMessage}
              className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded-md transition-colors font-medium"
              title="테스트 메시지 전송"
            >
              🧪 테스트
            </button>
            <button
              onClick={sendVoltageTestMessage}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-md transition-colors font-medium"
              title="전압 테스트 메시지 전송"
            >
              ⚡ 전압
            </button>
          </div>
        </div>
        
        {/* 세 번째 줄: 디버깅용 상태 표시 (개발 중에만) */}
        <div className="text-xs text-gray-500 text-center">
          Debug: C:{currentCycle || 'N'}, T:{totalCycles || 'N'}, P:{testPhase || 'none'}, N:{currentTestNumber || 'N'}, C:{totalTestCount || 'N'}, S:{testStatus || 'none'}
          <br />
          WS: {wsConnection ? (wsConnection.readyState === WebSocket.OPEN ? '🟢 연결됨' : '🔴 연결안됨') : '❌ 없음'}
        </div>
        
        {/* 네 번째 줄: 프로세스 로그 표시 */}
        {processLogs.length > 0 && (
          <div className="text-xs text-yellow-300 bg-yellow-900 bg-opacity-30 rounded-lg p-2 max-h-20 overflow-y-auto">
            <div className="font-medium mb-1">📋 최근 로그:</div>
            {processLogs.map((log, index) => (
              <div key={index} className="text-xs">
                {log}
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* 테이블 컨테이너 - 그리드 영역 */}
      <div className="overflow-x-auto" style={{ 
        width: '100%', 
        gridArea: 'table',
        backgroundColor: '#1a1b20',
        borderRadius: '8px',
        padding: '10px'
      }}>
        <table className="w-full text-xs sm:text-sm md:text-base text-left text-gray-300 border-separate border-spacing-0" style={{ width: '100%', tableLayout: 'fixed' }}>
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#23242a]">
              <th className="px-1 py-0" style={{ width: '8%', fontSize: '20px' }}>입력</th>
              <th className="px-1 py-0" style={{ width: '8%', fontSize: '20px' }}>출력</th>
              {Array.from({ length: 10 }, (_, i) => (
                <th key={i} className="px-1 py-0" style={{ width: '6%', fontSize: '20px' }}>dev{String(i+1).padStart(2,'0')}</th>
              ))}
              <th className="px-1 py-0" style={{ width: '8%', fontSize: '20px' }}>GOOD</th>
            </tr>
          </thead>
          <tbody>
            {group.rows.map((row, idx) => (
              <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#3a3a3a' : '#1a1a1a' }}>
                <td className="px-1 py-0 whitespace-nowrap text-right" style={{ fontSize: '18px' }}>{row.input}</td>
                <td className="px-1 py-0 whitespace-nowrap text-right" style={{ fontSize: '18px' }}>{getOutputVoltageDisplay(row.output)}</td>
                {row.devs.map((v, i) => {
                  // 실시간 전압 데이터가 있으면 표시, 없으면 기본값 사용
                  const deviceNumber = i + 1; // 디바이스 번호 (1-10)
                  
                  // 현재 행의 출력값을 기반으로 채널 번호 결정
                  const channelNumber = getChannelNumberFromOutput(row.output);
                  
                  // 현재 행의 입력값을 기반으로 테스트 번호 결정 (서버의 outVoltSettings [24, 18, 30, 0] 순서에 맞춤)
                  let testNumber = 1;
                  if (row.input === '+24') testNumber = 1;  // 첫 번째: 24V
                  else if (row.input === '+18') testNumber = 2;  // 두 번째: 18V
                  else if (row.input === '+30') testNumber = 3;  // 세 번째: 30V
                  
                  const realTimeVoltage = getVoltageDisplay(deviceNumber, testNumber, channelNumber);
                  
                  return (
                    <td key={i} className="px-1 py-0 whitespace-nowrap text-right" style={{ fontSize: '18px' }}>
                      {realTimeVoltage !== '-.-' ? realTimeVoltage : '-.-'}
                    </td>
                  );
                })}
                <td className="px-1 py-0 whitespace-nowrap text-center" style={{ fontSize: '18px' }}>{row.good}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
} 