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

// 누적 테이블 데이터 인터페이스
interface AccumulatedTableData {
  [deviceKey: string]: {
    [testKey: string]: {
      [channelKey: string]: string;
    };
  };
}

export default function PowerTable({ groups, wsConnection, channelVoltages = [5, 15, -15, 24] }: PowerTableProps) {
  // 누적 전압 데이터 상태
  const [accumulatedVoltageData, setAccumulatedVoltageData] = useState<AccumulatedTableData>({});
  
  // 테이블 완성도 추적 상태
  const [tableCompletionStatus, setTableCompletionStatus] = useState<{
    totalCells: number;
    filledCells: number;
    completionPercentage: number;
    isComplete: boolean;
  }>({
    totalCells: 0,
    filledCells: 0,
    completionPercentage: 0,
    isComplete: false
  });

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
  
  // 테스트 진행상황 메시지 보호를 위한 상태
  const [testProgressMessage, setTestProgressMessage] = useState<string>('');
  const [isTestProgressActive, setIsTestProgressActive] = useState<boolean>(false);
  
  // 테이블 상태 관리 개선
  const [isTableStable, setIsTableStable] = useState<boolean>(true);
  const [lastTableUpdate, setLastTableUpdate] = useState<number>(Date.now());
  
  // 테이블 완성도 계산 함수 개선
  const calculateTableCompletion = (data: AccumulatedTableData) => {
    try {
      const totalCells = 10 * 3 * 4; // 10개 디바이스 * 3개 테스트 * 4개 채널
      let filledCells = 0;
      let validDataCount = 0;
      
      // 데이터 구조 검증
      if (!data || typeof data !== 'object') {
        console.warn('PowerTable: 잘못된 데이터 구조:', data);
        return {
          totalCells,
          filledCells: 0,
          completionPercentage: 0,
          isComplete: false
        };
      }
      
      Object.values(data).forEach(deviceData => {
        if (deviceData && typeof deviceData === 'object') {
          Object.values(deviceData).forEach(testData => {
            if (testData && typeof testData === 'object') {
              Object.values(testData).forEach(channelData => {
                if (channelData && channelData !== '-.-' && channelData !== '') {
                  filledCells++;
                  // 유효한 전압 데이터인지 확인 (숫자+V 형식)
                  if (typeof channelData === 'string' && channelData.match(/^[\d.-]+V$/)) {
                    // 전압값 범위 검증 (0.1V ~ 100V)
                    const voltageValue = parseFloat(channelData.replace('V', ''));
                    if (!isNaN(voltageValue) && voltageValue >= 0.1 && voltageValue <= 100) {
                      validDataCount++;
                    }
                  }
                }
              });
            }
          });
        }
      });
      
      // 완성도 계산 개선: 유효한 데이터가 90% 이상이고 최소 100개 이상의 셀이 채워져야 완성으로 간주
      const completionPercentage = (filledCells / totalCells) * 100;
      const validDataPercentage = (validDataCount / totalCells) * 100;
      
      // 완성 조건 강화: 95% 이상의 셀이 채워지고, 90% 이상이 유효한 데이터여야 함
      const isComplete = completionPercentage >= 95 && validDataPercentage >= 90 && filledCells >= 100;
      
      return {
        totalCells,
        filledCells,
        completionPercentage,
        isComplete
      };
    } catch (error) {
      console.error('PowerTable: calculateTableCompletion 오류:', error);
      return {
        totalCells: 120,
        filledCells: 0,
        completionPercentage: 0,
        isComplete: false
      };
    }
  };

  // 전압 데이터 누적 함수 개선
  const accumulateVoltageData = (newData: VoltageData) => {
    try {
      // 입력 데이터 검증
      if (!newData || !newData.device || !newData.voltageTest || !newData.channels) {
        console.warn('PowerTable: 잘못된 전압 데이터 형식:', newData);
        return;
      }
      
      // 디바이스 번호 검증 (1-10)
      if (newData.device < 1 || newData.device > 10) {
        console.warn(`PowerTable: 잘못된 디바이스 번호: ${newData.device}`);
        return;
      }
      
      // 테스트 번호 검증 (1-3)
      if (newData.voltageTest < 1 || newData.voltageTest > 3) {
        console.warn(`PowerTable: 잘못된 테스트 번호: ${newData.voltageTest}`);
        return;
      }
      
      // 디버깅을 위한 로그 (특히 -15 채널에 대해)
      if (process.env.NODE_ENV === 'development') {
        console.log(`PowerTable: accumulateVoltageData - Device: ${newData.device}, Test: ${newData.voltageTest}`);
        console.log(`PowerTable: Channels data:`, newData.channels);
      }
      
      setAccumulatedVoltageData(prevData => {
        const updatedData = { ...prevData };
        
        // 디바이스 키가 없으면 생성
        if (!updatedData[`device${newData.device}`]) {
          updatedData[`device${newData.device}`] = {};
        }
        
        // 테스트 키가 없으면 생성
        if (!updatedData[`device${newData.device}`][`test${newData.voltageTest}`]) {
          updatedData[`device${newData.device}`][`test${newData.voltageTest}`] = {};
        }
        
        // 각 채널 데이터 누적
        newData.channels.forEach(channel => {
          try {
            // 채널 번호 검증 (1-4)
            if (!channel.channel || channel.channel < 1 || channel.channel > 4) {
              console.warn(`PowerTable: 잘못된 채널 번호: ${channel.channel}`);
              return;
            }
            
            const channelKey = `channel${channel.channel}`;
            let displayValue = '-.-';
            
            if (channel.voltage === 'error') {
              displayValue = '-.-';
            } else if (typeof channel.voltage === 'number') {
              // 전압값 범위 검증 (-100V ~ 100V로 확장하여 -15 채널 지원)
              if (channel.voltage >= -100 && channel.voltage <= 100) {
                displayValue = `${channel.voltage.toFixed(2)}V`;
              } else {
                console.warn(`PowerTable: 전압값 범위 오류: ${channel.voltage}V`);
                displayValue = '-.-';
              }
            } else {
              displayValue = '-.-';
            }
            
            // 디버깅을 위한 로그 (특히 -15 채널에 대해)
            if (process.env.NODE_ENV === 'development' && channel.channel === 3) {
              console.log(`PowerTable: Channel 3 (-15) - Device: ${newData.device}, Test: ${newData.voltageTest}, Voltage: ${channel.voltage}, Display: ${displayValue}`);
              console.log(`PowerTable: Channel 3 (-15) - 원본 데이터:`, channel);
              console.log(`PowerTable: Channel 3 (-15) - 누적 데이터 구조:`, updatedData[`device${newData.device}`]?.[`test${newData.voltageTest}`]);
            }
            
            updatedData[`device${newData.device}`][`test${newData.voltageTest}`][channelKey] = displayValue;
          } catch (channelError) {
            console.error(`PowerTable: 채널 데이터 처리 오류:`, channelError);
          }
        });
        
        return updatedData;
      });
      
      // 테이블 업데이트 시간 기록
      setLastTableUpdate(Date.now());
    } catch (error) {
      console.error('PowerTable: accumulateVoltageData 오류:', error);
    }
  };

  // 테이블 초기화 함수 개선
  const resetTable = () => {
    console.log('🔄 PowerTable: 테이블 초기화 실행');
    setAccumulatedVoltageData({});
    setTableCompletionStatus({
      totalCells: 0,
      filledCells: 0,
      completionPercentage: 0,
      isComplete: false
    });
    setIsTableStable(false);
    
    // 1초 후 테이블 상태를 안정화
    setTimeout(() => {
      setIsTableStable(true);
    }, 1000);
  };

  // 테이블 완성도 모니터링 개선
  useEffect(() => {
    const completion = calculateTableCompletion(accumulatedVoltageData);
    setTableCompletionStatus(completion);
    
    // 테이블이 완성되고 안정적인 상태일 때만 초기화 고려
    if (completion.isComplete && isTableStable) {
      console.log('✅ PowerTable: 테이블 완성! 초기화 대기 중...');
      
      // 테이블 완성 후 5초 대기 (기존 2초에서 증가)
      setTimeout(() => {
        // 테이블이 여전히 완성된 상태인지 재확인
        const currentCompletion = calculateTableCompletion(accumulatedVoltageData);
        if (currentCompletion.isComplete) {
          console.log('✅ PowerTable: 테이블 완성 상태 유지 확인됨. 초기화 실행');
          resetTable();
        } else {
          console.log('⚠️ PowerTable: 테이블 완성 상태가 변경됨. 초기화 취소');
        }
      }, 5000);
    }
  }, [accumulatedVoltageData, isTableStable]);

  // channelVoltages 변경 추적
  useEffect(() => {
    //console.log('🔌 PowerTable: channelVoltages 변경됨:', channelVoltages);
  }, [channelVoltages]);
  
  // 컴포넌트 마운트 시 초기 상태 강제 설정
  useEffect(() => {
    //console.log('🔌 PowerTable: 컴포넌트 마운트 - 초기 상태 강제 설정');
    
    // 모든 상태를 초기값으로 강제 설정
    resetTable();
    setProcessLogs([]);
    setCurrentCycle(null);
    setCycleMessage('');
    setTotalCycles(0);
    setTestPhase('none');
    setCurrentTestNumber(0);
    setTotalTestCount(0);
    setTestStatus('none');
    setTestProgressMessage('');
    setIsTestProgressActive(false);
    
    //console.log('✅ PowerTable: 초기 상태 강제 설정 완료');
  }, [wsConnection]);

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
      // 음수 값 처리 개선
      let result;
      if (voltage === 0) {
        result = '0';
      } else if (voltage > 0) {
        result = `+${voltage}`;
      } else {
        result = `${voltage}`; // 음수는 그대로 표시 (예: -15)
      }
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
    // channelVoltages 배열: [5, 15, -15, 24]
    if (outputValue === '+5' || outputValue === `+${channelVoltages[0]}` || outputValue === '5') return 1;
    else if (outputValue === '+15' || outputValue === `+${channelVoltages[1]}` || outputValue === '15') return 2;
    else if (outputValue === '-15' || outputValue === `${channelVoltages[2]}` || outputValue === '-15') return 3;  // -15 처리 개선
    else if (outputValue === '+24' || outputValue === `+${channelVoltages[3]}` || outputValue === '24') return 4;
    else {
      // 디버깅을 위한 로그 추가
      console.warn(`PowerTable: 알 수 없는 출력값: ${outputValue}, channelVoltages:`, channelVoltages);
      return 1; // 기본값
    }
  };

  // 누적된 전압 데이터 표시 함수 개선
  const getAccumulatedVoltageDisplay = (device: number, test: number, channel: number) => {
    try {
      // 입력값 검증
      if (!device || !test || !channel || 
          device < 1 || device > 10 || 
          test < 1 || test > 3 || 
          channel < 1 || channel > 4) {
        console.warn(`PowerTable: 잘못된 인덱스 - device: ${device}, test: ${test}, channel: ${channel}`);
        return '-.-';
      }
      
      const deviceKey = `device${device}`;
      const testKey = `test${test}`;
      const channelKey = `channel${channel}`;
      
      const voltage = accumulatedVoltageData[deviceKey]?.[testKey]?.[channelKey];
      
      // 디버깅을 위한 로그 (특히 -15 채널에 대해)
      if (process.env.NODE_ENV === 'development' && channel === 3) {
        console.log(`PowerTable: getAccumulatedVoltageDisplay - Device: ${device}, Test: ${test}, Channel: ${channel}`);
        console.log(`PowerTable: Keys - deviceKey: ${deviceKey}, testKey: ${testKey}, channelKey: ${channelKey}`);
        console.log(`PowerTable: Found voltage: ${voltage}`);
        console.log(`PowerTable: Full device data:`, accumulatedVoltageData[deviceKey]);
      }
      
      // 데이터가 없거나 비어있으면 기본값 반환
      if (!voltage || voltage === '' || voltage === '-.-') {
        return '-.-';
      }
      
      // 전압값이 유효한 형식인지 확인 (숫자+V 형식)
      if (typeof voltage === 'string' && voltage.match(/^[\d.-]+V$/)) {
        // 전압값 범위 검증 (-100V ~ 100V로 확장하여 -15 채널 지원)
        const voltageValue = parseFloat(voltage.replace('V', ''));
        if (isNaN(voltageValue) || voltageValue < -100 || voltageValue > 100) {
          console.warn(`PowerTable: 전압값 범위 오류 - ${voltage}`);
          return '-.-';
        }
        return voltage;
      }
      
      // 유효하지 않은 데이터는 기본값 반환
      console.warn(`PowerTable: 유효하지 않은 전압 데이터 형식 - ${voltage}`);
      return '-.-';
    } catch (error) {
      console.error(`PowerTable: getAccumulatedVoltageDisplay 오류 - device: ${device}, test: ${test}, channel: ${channel}`, error);
      return '-.-';
    }
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
      
      // PowerTable에서 필요한 메시지만 처리
      // 1. 챔버 온도 업데이트
      if (typeof message === 'string' && message.startsWith('[CHAMBER_TEMPERATURE]')) {
        try {
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
        }
        return; // 처리 완료 후 종료
      }
      
      // 2. PowerTable 전압 데이터 초기화 메시지 처리
      if (typeof message === 'string' && message.startsWith('[POWER_TABLE_RESET]')) {
        try {
          
          const match = message.match(/\[POWER_TABLE_RESET\] (.+)/);
          if (match && match[1]) {
          
            const resetData = JSON.parse(match[1]);
            
            // 액션 타입에 따른 처리
            switch (resetData.action) {
              case 'reset':
                // 일반 초기화 - 모든 상태 초기화 (테스트 진행상황 메시지는 보호)
                resetTable();
                setCycleMessage(resetData.message || '');
                break;
                
              case 'cycle_reset':
                // 사이클 시작 - 전압 데이터 초기화하고 사이클 정보 설정
                resetTable();
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
                resetTable();
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
                
                // 테스트 진행상황 메시지 처리
                if (resetData.message) {
                  setTestProgressMessage(resetData.message);
                  setIsTestProgressActive(true);
                }
                break;
                
              default:
                // 알 수 없는 액션 - 기본 초기화 (테스트 진행상황 메시지는 보호)
                console.log('🔄 PowerTable: 알 수 없는 액션 - 기본 초기화 실행');
                resetTable();
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
          
          // 메시지 형식이 맞지 않으면 원본 메시지를 그대로 표시
          setTestProgressMessage(message);
          setIsTestProgressActive(true);
        }
        return; // 처리 완료 후 종료
      }
      
      // 3. 전압 업데이트 메시지 처리 - 누적 방식으로 변경
      if (typeof message === 'string' && message.startsWith('[VOLTAGE_UPDATE]')) {
        try {
          const match = message.match(/\[VOLTAGE_UPDATE\] (.+)/);
          if (match && match[1]) {
            const voltageUpdate: VoltageData = JSON.parse(match[1]);
            
            console.log(`🔌 PowerTable: 전압 데이터 누적 업데이트 - Device ${voltageUpdate.device}, Test ${voltageUpdate.voltageTest}`);
            
            // 전압 데이터를 누적 방식으로 처리
            accumulateVoltageData(voltageUpdate);
            
          }
        } catch (error) {
          console.error('PowerTable: 전압 업데이트 파싱 오류:', error);
        }
        return; // 처리 완료 후 종료
      }
      
      // 3-1. 전체 테이블 완성 메시지 처리 - 수정됨
      if (typeof message === 'string' && message.startsWith('[POWER_TABLE_COMPLETE]')) {
        try {
          const match = message.match(/\[POWER_TABLE_COMPLETE\] (.+)/);
          if (match && match[1]) {
            const completeTableData = JSON.parse(match[1]);
            
            console.log('🔌 PowerTable: 전체 테이블 완성 데이터 수신:', completeTableData);
            
            // 서버에서 전달받은 테이블 데이터를 누적 데이터로 변환
            const newAccumulatedData: AccumulatedTableData = {};
            
            if (completeTableData.tableData && Array.isArray(completeTableData.tableData)) {
              completeTableData.tableData.forEach((deviceData: any[], deviceIndex: number) => {
                const deviceNumber = deviceIndex + 1;
                newAccumulatedData[`device${deviceNumber}`] = {};
                
                deviceData.forEach((testData: any[], testIndex: number) => {
                  const testNumber = testIndex + 1;
                  newAccumulatedData[`device${deviceNumber}`][`test${testNumber}`] = {};
                  
                  testData.forEach((channelData: any, channelIndex: number) => {
                    const channelNumber = channelIndex + 1;
                    
                    // channelData가 문자열인 경우 (예: "5.2V|G") 전압값만 추출
                    let displayValue = '-.-';
                    if (typeof channelData === 'string' && channelData !== '') {
                      const voltageMatch = channelData.match(/^([\d.-]+)V/);
                      if (voltageMatch) {
                        displayValue = `${voltageMatch[1]}V`;
                      }
                    }
                    
                    newAccumulatedData[`device${deviceNumber}`][`test${testNumber}`][`channel${channelNumber}`] = displayValue;
                  });
                });
              });
              
              // 누적 데이터 업데이트
              setAccumulatedVoltageData(newAccumulatedData);
              console.log('✅ PowerTable: 서버 테이블 데이터로 누적 데이터 업데이트 완료');
              
              // 테이블 완성 메시지 수신 후 자동 초기화 방지
              setIsTableStable(false);
              setTimeout(() => {
                setIsTableStable(true);
              }, 3000);
            }
            
          }
        } catch (error) {
          console.error('PowerTable: 전체 테이블 완성 데이터 파싱 오류:', error);
        }
        return; // 처리 완료 후 종료
      }
      
      // 4. 프로세스 로그 메시지 처리
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
        return; // 처리 완료 후 종료
      }
      
      // 5. Power Switch 상태 메시지 처리
      if (typeof message === 'string' && message.startsWith('[POWER_SWITCH]')) {
        console.log('🔌 PowerTable: Power Switch 메시지 수신 (무시):', message);
        return; // 처리 완료 후 종료
      }
      
      // 6. 시뮬레이션 상태 메시지 처리
      if (typeof message === 'string' && message.startsWith('[SIMULATION_STATUS]')) {
        console.log('🔌 PowerTable: 시뮬레이션 상태 메시지 수신 (무시):', message);
        return; // 처리 완료 후 종료
      }
      
      // 7. 기타 초기화 메시지들은 무시 (PowerTable과 관련없음)
      if (typeof message === 'string' && (
        message.startsWith('Initial high temp settings') ||
        message.startsWith('Initial low temp settings') ||
        message.startsWith('Initial product input') ||
        message.startsWith('Initial USB port settings') ||
        message.startsWith('Initial out volt settings') ||
        message.startsWith('Initial channel voltages') ||
        message.startsWith('Initial getTableOption') ||
        message.startsWith('Initial device states') ||
        message.startsWith('Delay settings') ||
        message.startsWith('Device states saved') ||
        message.includes('Echo from Backend WS Server')
      )) {
        console.log('🔌 PowerTable: 관련없는 초기화 메시지 무시:', message.substring(0, 50) + '...');
        return; // 처리 완료 후 종료
      }
      
      // 8. 처리되지 않은 메시지는 로그로만 기록
      console.log('🔌 PowerTable: 처리되지 않은 메시지 (무시):', message);
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

  // 데모 테이블 완성 데이터 생성 함수
  const generateDemoCompleteTable = () => {
    const demoTableData = {
      timestamp: new Date().toISOString(),
      totalDevices: 10,
      totalTests: 3,
      totalChannels: 4,
      tableData: Array.from({ length: 10 }, (_, deviceIndex) =>
        Array.from({ length: 3 }, (_, testIndex) =>
          Array.from({ length: 4 }, (_, channelIndex) => {
            // 각 채널에 대해 랜덤한 전압값 생성
            const baseVoltages = [5, 15, -15, 24];
            const voltage = baseVoltages[channelIndex] + (Math.random() - 0.5) * 0.2;
            return `${voltage.toFixed(2)}V|G`;
          })
        )
      ),
      summary: {
        totalCells: 120,
        completedCells: 120,
        status: 'completed'
      }
    };

    // 데모 데이터를 누적 데이터로 변환하여 표시
    const newAccumulatedData: AccumulatedTableData = {};
    
    demoTableData.tableData.forEach((deviceData: any[], deviceIndex: number) => {
      const deviceNumber = deviceIndex + 1;
      newAccumulatedData[`device${deviceNumber}`] = {};
      
      deviceData.forEach((testData: any[], testIndex: number) => {
        const testNumber = testIndex + 1;
        newAccumulatedData[`device${deviceNumber}`][`test${testNumber}`] = {};
        
        testData.forEach((channelData: any, channelIndex: number) => {
          const channelNumber = channelIndex + 1;
          
          // channelData에서 전압값 추출
          let displayValue = '-.-';
          if (typeof channelData === 'string' && channelData !== '') {
            const voltageMatch = channelData.match(/^([\d.-]+)V/);
            if (voltageMatch) {
              displayValue = `${voltageMatch[1]}V`;
            }
          }
          
          newAccumulatedData[`device${deviceNumber}`][`test${testNumber}`][`channel${channelNumber}`] = displayValue;
        });
      });
    });
    
    setAccumulatedVoltageData(newAccumulatedData);
    console.log('🧪 PowerTable: 데모 테이블 데이터 생성 완료');
  };

  return (
    <div className="w-full h-full bg-[#181A20] rounded-lg shadow-md p-2" style={{ 
      width: '100%', 
      height: '100%',
      display: 'grid',
      gridTemplateRows: 'auto auto 1fr',
      gridTemplateAreas: '"header" "progress" "table"',
      gap: '10px'
    }}>
      {/* 상단 정보 영역 - 그리드 영역 */}
      <div className="px-2" style={{ 
        gridArea: 'header',
        backgroundColor: '#23242a',
        borderRadius: '8px',
        padding: '15px'
      }}>
        {/* 온도와 테스트 진행상황을 가로로 배치 - 완전히 다른 접근법 */}
        <div style={{ 
          width: '100%',
          height: 'auto',
          display: 'table',
          tableLayout: 'fixed'
        }}>
          <div style={{ 
            display: 'table-row'
          }}>
            {/* 온도 표시 - 좌측 셀 */}
            <div style={{ 
              display: 'table-cell',
              width: '30%',
              verticalAlign: 'middle',
              paddingRight: '20px'
            }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '18px',
                fontWeight: '600',
                color: '#90CAF9',
                backgroundColor: 'rgba(30, 58, 138, 0.3)',
                borderRadius: '8px',
                padding: '8px 16px'
              }}>
                <span style={{ color: '#F472B6' }}>🌡️</span>
                <span>온도: <span style={{ color: '#FFFFFF', fontWeight: '700' }}>
                  {chamberTemperature !== null ? `${chamberTemperature.toFixed(2)}°C` : `${group.temperature}°C`}
                </span></span>
              </div>
            </div>
            
            {/* 테스트 진행 상황 표시 - 우측 셀 */}
            <div style={{ 
              display: 'table-cell',
              width: '70%',
              verticalAlign: 'middle',
              textAlign: 'center'
            }}>
              {isTestProgressActive && testProgressMessage ? (
                <div style={{
                  display: 'inline-block',
                  fontSize: '18px',
                  fontWeight: '600',
                  color: '#86EFAC',
                  backgroundColor: 'rgba(20, 83, 45, 0.3)',
                  borderRadius: '8px',
                  padding: '8px 16px'
                }}>
                  <span style={{ color: '#F472B6' }}>📢</span> {testProgressMessage}
                </div>
              ) : (
                <div style={{
                  display: 'inline-block',
                  fontSize: '18px',
                  fontWeight: '600',
                  color: '#9CA3AF',
                  backgroundColor: 'rgba(31, 41, 55, 0.3)',
                  borderRadius: '8px',
                  padding: '8px 16px'
                }}>
                  <span style={{ color: '#F472B6' }}>⏳</span> 테스트 대기 중
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 테이블 진행 상황 표시 영역 */}
      <div className="px-2" style={{ 
        gridArea: 'progress',
        backgroundColor: '#23242a',
        borderRadius: '8px',
        padding: '10px'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '16px',
          color: '#E5E7EB'
        }}>
          <span>📊 테이블 진행 상황:</span>
          <span>
            {tableCompletionStatus.filledCells} / {tableCompletionStatus.totalCells} 셀 완성
            <span style={{ color: '#60A5FA', marginLeft: '10px' }}>
              ({tableCompletionStatus.completionPercentage?.toFixed(1)}%)
            </span>
            {tableCompletionStatus.isComplete && (
              <span style={{ color: '#10B981', marginLeft: '10px' }}>
                ✅ 완성! {isTableStable ? '5초 후 초기화' : '초기화 대기 중...'}
              </span>
            )}
          </span>
        </div>
        {/* 진행률 바 */}
        <div style={{
          width: '100%',
          height: '8px',
          backgroundColor: '#374151',
          borderRadius: '4px',
          marginTop: '8px',
          overflow: 'hidden'
        }}>
          <div style={{
            width: `${(tableCompletionStatus.filledCells / tableCompletionStatus.totalCells) * 100}%`,
            height: '100%',
            backgroundColor: tableCompletionStatus.isComplete ? '#10B981' : '#3B82F6',
            transition: 'width 0.3s ease'
          }} />
        </div>
        
        {/* 테스트 버튼들 */}
        <div style={{
          display: 'flex',
          gap: '10px',
          marginTop: '10px',
          justifyContent: 'center'
        }}>
          <button
            onClick={sendTestMessage}
            style={{
              padding: '6px 12px',
              backgroundColor: '#3B82F6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            🧪 테스트 메시지
          </button>
          <button
            onClick={sendVoltageTestMessage}
            style={{
              padding: '6px 12px',
              backgroundColor: '#10B981',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            ⚡ 전압 테스트
          </button>
          <button
            onClick={generateDemoCompleteTable}
            style={{
              padding: '6px 12px',
              backgroundColor: '#F59E0B',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            🎯 데모 테이블
          </button>
          <button
            onClick={resetTable}
            style={{
              padding: '6px 12px',
              backgroundColor: '#EF4444',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            🔄 테이블 초기화
          </button>
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
                  try {
                    // 누적된 전압 데이터를 사용하여 표시
                    const deviceNumber = i + 1; // 디바이스 번호 (1-10)
                    
                    // 현재 행의 출력값을 기반으로 채널 번호 결정
                    const channelNumber = getChannelNumberFromOutput(row.output);
                    
                    // 현재 행의 입력값을 기반으로 테스트 번호 결정 (서버의 outVoltSettings [24, 18, 30, 0] 순서에 맞춤)
                    let testNumber = 1;
                    if (row.input === '+24') testNumber = 1;  // 첫 번째: 24V
                    else if (row.input === '+18') testNumber = 2;  // 두 번째: 18V
                    else if (row.input === '+30') testNumber = 3;  // 세 번째: 30V
                    
                    const accumulatedVoltage = getAccumulatedVoltageDisplay(deviceNumber, testNumber, channelNumber);
                    
                    // 디버깅을 위한 로그 (개발 중에만 사용)
                    if (process.env.NODE_ENV === 'development' && (deviceNumber <= 3 || channelNumber === 3)) {
                      console.log(`PowerTable: Device ${deviceNumber}, Test ${testNumber}, Channel ${channelNumber}, Output: ${row.output}, Input: ${row.input}, Voltage: ${accumulatedVoltage}`);
                      
                      // -15 채널에 대한 추가 디버깅
                      if (channelNumber === 3) {
                        console.log(`PowerTable: -15 채널 디버깅 - Device ${deviceNumber}, Test ${testNumber}`);
                        console.log(`PowerTable: -15 채널 누적 데이터:`, accumulatedVoltageData[`device${deviceNumber}`]?.[`test${testNumber}`]?.[`channel${channelNumber}`]);
                      }
                    }
                    
                    return (
                      <td key={i} className="px-1 py-0 whitespace-nowrap text-right" style={{ fontSize: '18px' }}>
                        {accumulatedVoltage}
                      </td>
                    );
                  } catch (error) {
                    console.error(`PowerTable: 디바이스 ${i+1} 데이터 표시 오류:`, error);
                    return (
                      <td key={i} className="px-1 py-0 whitespace-nowrap text-right" style={{ fontSize: '18px', color: '#EF4444' }}>
                        ERROR
                      </td>
                    );
                  }
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
