// components/power-table/PowerTable.tsx
'use client';
import React, { useState, useEffect } from 'react';
import type { PowerDataGroup } from '../../lib/parsePowerData';

interface PowerTableProps {
  groups: PowerDataGroup[];
  wsConnection?: WebSocket | null;
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

export default function PowerTable({ groups, wsConnection }: PowerTableProps) {
  const [voltageData, setVoltageData] = useState<{ [key: string]: string }>({});

  
  console.log('🔌 PowerTable: 컴포넌트 렌더링됨');
  console.log('🔌 PowerTable: props 확인:', { groups: groups?.length, wsConnection: !!wsConnection });
  
  const group = groups[0]; // 첫 번째 그룹만 사용
  if (!group) return <div className="text-red-400">데이터 없음</div>;

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
      }
      
      // 개발용 테스트 메시지 처리 (실제 하드웨어 없이 테스트용)
      if (typeof message === 'string' && message.startsWith('[TEST_VOLTAGE_UPDATE]')) {
        try {
          const match = message.match(/\[TEST_VOLTAGE_UPDATE\] (.+)/);
          if (match && match[1]) {
            const testData = JSON.parse(match[1]);
            console.log('🧪 PowerTable: 테스트 전압 데이터 수신:', testData);
            handleTestVoltageUpdate(testData);
          }
        } catch (error) {
          console.error('PowerTable: 테스트 전압 업데이트 파싱 오류:', error);
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

  // 개발용 테스트 함수
  const sendTestVoltageData = () => {
    alert('🧪 테스트 버튼이 클릭되었습니다! 전압 데이터를 업데이트합니다.');
    console.log('🧪 PowerTable: 테스트 버튼 클릭됨');
    
    // 여러 디바이스에 대한 테스트 데이터 생성
    const testDataArray = [
      {
        device: 1,
        voltageTest: 1,
        channels: [
          { device: 1, channel: 1, voltage: 5.12, expected: 5.0, result: 'G', voltageWithComparison: '5.12V|G' },
          { device: 1, channel: 2, voltage: 15.08, expected: 15.0, result: 'G', voltageWithComparison: '15.08V|G' },
          { device: 1, channel: 3, voltage: -14.95, expected: -15.0, result: 'G', voltageWithComparison: '-14.95V|G' },
          { device: 1, channel: 4, voltage: 24.02, expected: 24.0, result: 'G', voltageWithComparison: '24.02V|G' }
        ],
        inputVoltage: 18,
        rowIndex: 0,
        testIndex: 0
      },
      {
        device: 2,
        voltageTest: 1,
        channels: [
          { device: 2, channel: 1, voltage: 5.15, expected: 5.0, result: 'G', voltageWithComparison: '5.15V|G' },
          { device: 2, channel: 2, voltage: 15.12, expected: 15.0, result: 'G', voltageWithComparison: '15.12V|G' },
          { device: 2, channel: 3, voltage: -15.03, expected: -15.0, result: 'G', voltageWithComparison: '-15.03V|G' },
          { device: 2, channel: 4, voltage: 23.98, expected: 24.0, result: 'G', voltageWithComparison: '23.98V|G' }
        ],
        inputVoltage: 18,
        rowIndex: 1,
        testIndex: 0
      }
    ];
    
    // WebSocket을 통해 테스트 메시지 전송 (선택사항)
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
      testDataArray.forEach((testData, index) => {
        const testMessage = `[TEST_VOLTAGE_UPDATE] ${JSON.stringify(testData)}`;
        wsConnection.send(testMessage);
        console.log(`🧪 WebSocket을 통해 테스트 메시지 전송 ${index + 1}:`, testMessage);
      });
    }
    
    // 직접 테스트 데이터를 처리
    console.log('🧪 PowerTable: 직접 테스트 데이터 처리');
    testDataArray.forEach((testData, index) => {
      console.log(`🧪 테스트 데이터 ${index + 1} 처리:`, testData);
      handleTestVoltageUpdate(testData);
    });
  };
  
  // 테스트 전압 업데이트 처리 함수
  const handleTestVoltageUpdate = (testData: any) => {
    console.log('🧪 PowerTable: 테스트 전압 데이터 직접 처리:', testData);
    
    // 각 채널의 전압 데이터를 저장
    testData.channels.forEach((channel: any) => {
      const key = `device${channel.device}_test${testData.voltageTest}_channel${channel.channel}`;
      const displayValue = channel.voltage === 'error' ? '-.-' : 
        typeof channel.voltage === 'number' ? `${channel.voltage.toFixed(2)}V` : '-.-';
      
      setVoltageData(prev => {
        const newData = {
          ...prev,
          [key]: displayValue
        };
        console.log(`🧪 PowerTable: 전압 데이터 업데이트 - Key: ${key}, Value: ${displayValue}`);
        console.log(`🧪 PowerTable: 전체 전압 데이터:`, newData);
        return newData;
      });
      
      console.log(`🧪 PowerTable: 테스트 전압 데이터 저장 - Device ${channel.device}, Channel ${channel.channel}, Value: ${displayValue}`);
    });
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
        gap: '40px', 
        gridArea: 'header',
        backgroundColor: '#23242a',
        borderRadius: '8px',
        padding: '10px'
      }}>
        <div className="text-lg font-semibold text-blue-200">온도: <span className="text-white">{group.temperature}°C</span></div>
        {/* 개발용 테스트 버튼 */}
        <button
          onClick={sendTestVoltageData}
          style={{
            backgroundColor: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            padding: '4px 8px',
            fontSize: '12px',
            cursor: 'pointer',
            marginRight: '8px'
          }}
        >
          🧪 테스트
        </button>
        <button
          onClick={() => {
            alert('🔍 상태확인 버튼이 클릭되었습니다! 콘솔을 확인하세요.');
            console.log('🔍 PowerTable: 상태확인 버튼 클릭됨');
            console.log('🔍 PowerTable: 현재 전압 데이터 상태:', voltageData);
            console.log('🔍 PowerTable: WebSocket 연결 상태:', wsConnection?.readyState);
            console.log('🔍 PowerTable: WebSocket 연결 객체:', wsConnection);
            console.log('🔍 PowerTable: 전압 데이터 키 개수:', Object.keys(voltageData).length);
            console.log('🔍 PowerTable: 전압 데이터 키들:', Object.keys(voltageData));
          }}
          style={{
            backgroundColor: '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            padding: '4px 8px',
            fontSize: '12px',
            cursor: 'pointer'
          }}
        >
          🔍 상태확인
        </button>
        {/* 상태 표시 영역 */}
        <div style={{
          backgroundColor: 'rgba(0,0,0,0.8)',
          color: 'white',
          padding: '4px 8px',
          fontSize: '10px',
          borderRadius: '4px',
          marginLeft: '8px'
        }}>
          데이터: {Object.keys(voltageData).length}개
        </div>
        <button
          onClick={() => {
            const testKey = `device1_test1_channel1`;
            const testValue = `테스트_${Date.now()}`;
            setVoltageData(prev => ({
              ...prev,
              [testKey]: testValue
            }));
            alert(`테스트 데이터 추가됨: ${testKey} = ${testValue}`);
          }}
          style={{
            backgroundColor: '#FF9800',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            padding: '4px 8px',
            fontSize: '12px',
            cursor: 'pointer',
            marginLeft: '8px'
          }}
        >
          ➕ 테스트데이터
        </button>
        <button
          onClick={() => {
            setVoltageData({});
            alert('전압 데이터가 초기화되었습니다!');
          }}
          style={{
            backgroundColor: '#F44336',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            padding: '4px 8px',
            fontSize: '12px',
            cursor: 'pointer',
            marginLeft: '8px'
          }}
        >
          🔄 초기화
        </button>

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
                <td className="px-1 py-0 whitespace-nowrap text-right" style={{ fontSize: '18px' }}>{row.output}</td>
                {row.devs.map((v, i) => {
                  // 실시간 전압 데이터가 있으면 표시, 없으면 기본값 사용
                  const deviceNumber = i + 1; // 디바이스 번호 (1-10)
                  
                  // 현재 행의 출력값을 기반으로 채널 번호 결정
                  let channelNumber = 1;
                  if (row.output === '+5') channelNumber = 1;
                  else if (row.output === '+15') channelNumber = 2;
                  else if (row.output === '-15') channelNumber = 3;
                  else if (row.output === '+24') channelNumber = 4;
                  
                  // 현재 행의 입력값을 기반으로 테스트 번호 결정
                  let testNumber = 1;
                  if (row.input === '+18') testNumber = 1;
                  else if (row.input === '+24') testNumber = 2;
                  else if (row.input === '+30') testNumber = 3;
                  
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