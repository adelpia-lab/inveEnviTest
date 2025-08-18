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

  
  console.log('🔌 PowerTable: 컴포넌트 렌더링됨');
  console.log('🔌 PowerTable: props 확인:', { groups: groups?.length, wsConnection: !!wsConnection, channelVoltages });
  console.log('🔌 PowerTable: channelVoltages 상세:', channelVoltages);
  
  // channelVoltages 변경 추적
  useEffect(() => {
    console.log('🔌 PowerTable: channelVoltages 변경됨:', channelVoltages);
  }, [channelVoltages]);
  
  const group = groups[0]; // 첫 번째 그룹만 사용
  if (!group) return <div className="text-red-400">데이터 없음</div>;

  // 출력 전압 표시 함수
  const getOutputVoltageDisplay = (outputValue: string) => {
    console.log(`🔌 PowerTable: getOutputVoltageDisplay 호출 - outputValue: ${outputValue}, channelVoltages:`, channelVoltages);
    
    // 기존 출력값을 channelVoltages 인덱스로 매핑
    let channelIndex = 0;
    if (outputValue === '+5') channelIndex = 0;
    else if (outputValue === '+15') channelIndex = 1;
    else if (outputValue === '-15') channelIndex = 2;
    else if (outputValue === '+24') channelIndex = 3;
    
    // channelVoltages에서 해당 인덱스의 값을 가져와서 표시
    const voltage = channelVoltages[channelIndex];
    console.log(`🔌 PowerTable: channelIndex: ${channelIndex}, voltage: ${voltage}`);
    
    if (voltage !== undefined) {
      const result = voltage > 0 ? `+${voltage}` : `${voltage}`;
      console.log(`🔌 PowerTable: 변환 결과: ${outputValue} -> ${result}`);
      return result;
    }
    
    // fallback: 기존 값 사용
    console.log(`🔌 PowerTable: fallback 사용: ${outputValue}`);
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

  // WebSocket 메시지 수신 처리
  useEffect(() => {
    console.log('🔌 PowerTable: useEffect 실행됨');
    console.log('🔌 PowerTable: wsConnection 상태:', wsConnection);
    
    if (!wsConnection) {
      console.log('🔌 PowerTable: WebSocket 연결이 없습니다.');
      return;
    }

    console.log('🔌 PowerTable: WebSocket 메시지 리스너 등록됨');

    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      console.log('📥 PowerTable: 메시지 수신:', message);
      
      // 전압 업데이트 메시지 처리
      if (typeof message === 'string' && message.startsWith('[VOLTAGE_UPDATE]')) {
        try {
          console.log('📥 PowerTable: [VOLTAGE_UPDATE] 메시지 감지');
          const match = message.match(/\[VOLTAGE_UPDATE\] (.+)/);
          if (match && match[1]) {
            console.log('📥 PowerTable: JSON 파싱 시작:', match[1]);
            const voltageUpdate: VoltageData = JSON.parse(match[1]);
            console.log('📥 PowerTable: 전압 업데이트 수신:', voltageUpdate);
            
            // 각 채널의 전압 데이터를 저장
            voltageUpdate.channels.forEach(channel => {
              // 디바이스 번호와 채널 번호를 기반으로 키 생성
              const key = `device${channel.device}_test${voltageUpdate.voltageTest}_channel${channel.channel}`;
              const displayValue = channel.voltage === 'error' ? '-.-' : 
                typeof channel.voltage === 'number' ? `${channel.voltage.toFixed(2)}V` : '-.-';
              
              setVoltageData(prev => {
                const newData = {
                  ...prev,
                  [key]: displayValue
                };
                console.log(`📊 PowerTable: 전압 데이터 저장 - Key: ${key}, Value: ${displayValue}`);
                console.log(`📊 PowerTable: 업데이트된 전체 데이터:`, newData);
                return newData;
              });
              
              console.log(`📊 PowerTable: 전압 데이터 저장 - Device ${channel.device}, Channel ${channel.channel}, Value: ${displayValue}`);
            });
            
            console.log('📊 PowerTable: 전압 데이터 저장 완료:', voltageUpdate);
          } else {
            console.error('PowerTable: [VOLTAGE_UPDATE] 메시지 형식 오류 - 매치 실패');
          }
        } catch (error) {
          console.error('PowerTable: 전압 업데이트 파싱 오류:', error);
          console.error('PowerTable: 원본 메시지:', message);
        }
      }
      
      // 파워스위치 온 메시지 처리 - 전압 데이터 초기화
      if (typeof message === 'string' && message.includes('[POWER_SWITCH]') && message.includes('ON')) {
        console.log('🔌 PowerTable: 파워스위치 ON - 전압 데이터 초기화');
        setVoltageData({});
        setProcessLogs([]); // 프로세스 로그도 초기화
      }
      
      // 챔버 온도 업데이트 메시지 처리
      if (typeof message === 'string' && message.startsWith('[CHAMBER_TEMPERATURE]')) {
        try {
          const match = message.match(/\[CHAMBER_TEMPERATURE\] (.+)/);
          if (match && match[1]) {
            const temperature = parseFloat(match[1]);
            if (!isNaN(temperature)) {
              setChamberTemperature(temperature);
              console.log(`🌡️ PowerTable: 챔버 온도 업데이트: ${temperature}°C`);
            }
          }
        } catch (error) {
          console.error('PowerTable: 챔버 온도 파싱 오류:', error);
        }
      }
      
      // 프로세스 로그 메시지 처리
      if (typeof message === 'string' && message.startsWith('[PROCESS_LOG]')) {
        try {
          const match = message.match(/\[PROCESS_LOG\] (.+)/);
          if (match && match[1]) {
            const logMessage = match[1];
            setProcessLogs(prev => {
              const newLogs = [...prev, logMessage];
              // 최대 10개의 로그만 유지
              return newLogs.slice(-10);
            });
            console.log(`📝 PowerTable: 프로세스 로그 수신: ${logMessage}`);
          }
        } catch (error) {
          console.error('PowerTable: 프로세스 로그 파싱 오류:', error);
        }
      }

    };

    wsConnection.addEventListener('message', handleMessage);
    return () => wsConnection.removeEventListener('message', handleMessage);
  }, [wsConnection]);

  // 전압 데이터 표시 함수
  const getVoltageDisplay = (device: number, test: number, channel: number) => {
    const key = `device${device}_test${test}_channel${channel}`;
    const voltage = voltageData[key];
    if (voltage && voltage !== '-.-') {
      return voltage;
    }
    return '-.-';
  };



  return (
    <div className="w-full h-full bg-[#181A20] rounded-lg shadow-md p-2" style={{ 
      width: '100%', 
      height: '100%',
      display: 'grid',
      gridTemplateRows: '50px 1fr',
      gridTemplateAreas: '"header" "table"',
      gap: '10px'
    }}>
      {/* 상단 정보 - 한 줄에 배치 */}
      <div className="flex items-center justify-between px-2" style={{ 
        display: 'flex', 
        flexWrap: 'nowrap', 
        gap: '20px', 
        gridArea: 'header',
        backgroundColor: '#23242a',
        borderRadius: '8px',
        padding: '10px'
      }}>
        <div className="text-lg font-semibold text-blue-200">온도: <span className="text-white">
          {chamberTemperature !== null ? `${chamberTemperature.toFixed(2)}°C` : `${group.temperature}°C`}
        </span></div>
        
        {/* 프로세스 로그 표시 영역 */}
        <div className="flex-1 overflow-hidden">
          <div className="text-xs text-gray-300" style={{ 
            maxHeight: '40px',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden'
          }}>
            {processLogs.length > 0 ? (
              processLogs.slice(-2).map((log, index) => (
                <div key={index} className="mb-1">
                  {log}
                </div>
              ))
            ) : (
              <div className="text-gray-500">대기 중...</div>
            )}
          </div>
        </div>
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
                  
                  // 디버깅용 로그 (개발 중에만 사용)
                  if (realTimeVoltage !== '-.-') {
                    console.log(`🔍 PowerTable: Device ${deviceNumber}, Test ${testNumber}, Channel ${channelNumber} = ${realTimeVoltage} (Row: ${row.input}/${row.output})`);
                  } else {
                    console.log(`🔍 PowerTable: Device ${deviceNumber}, Test ${testNumber}, Channel ${channelNumber} = 기본값 사용 (Row: ${row.input}/${row.output})`);
                  }
                  
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