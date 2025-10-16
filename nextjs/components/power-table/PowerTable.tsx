// components/power-table/PowerTable.tsx
'use client';
import React, { useState, useEffect, useCallback, JSX } from 'react';
import type { PowerDataGroup } from '../../lib/parsePowerData';

interface PowerTableProps {
  groups: PowerDataGroup[];
  wsConnection?: WebSocket | null;
  channelVoltages?: number[]; // 채널 전압 설정 추가
  selectedDevices?: number[]; // 선택된 디바이스 인덱스 배열
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

export default function PowerTable({ groups, wsConnection, channelVoltages = [220], selectedDevices = [1, 2, 3] }: PowerTableProps) {
  // selectedDevices props 검증 및 정규화
  const normalizedSelectedDevices = React.useMemo(() => {
    // props로 전달된 selectedDevices가 유효하지 않으면 기본값 사용
    if (!selectedDevices || !Array.isArray(selectedDevices) || selectedDevices.length === 0) {
      console.warn('🔌 PowerTable: selectedDevices가 유효하지 않음, 기본값 [1,2,3] 사용');
      return [1, 2, 3];
    }
    
    // [0]이 포함되어 있으면 [1,2,3]으로 변환
    if (selectedDevices.includes(0)) {
      console.warn('🔌 PowerTable: selectedDevices에 0이 포함됨, [1,2,3]으로 변환');
      return [1, 2, 3];
    }
    
    // 1,2,3 범위 내의 값만 필터링
    const validDevices = selectedDevices.filter(device => device >= 1 && device <= 3);
    if (validDevices.length === 0) {
      console.warn('🔌 PowerTable: 유효한 디바이스가 없음, 기본값 [1,2,3] 사용');
      return [1, 2, 3];
    }
    
    return validDevices;
  }, [selectedDevices]);
  
  // 디버깅을 위한 로그
  console.log('🔌 PowerTable: 컴포넌트 렌더링, channelVoltages:', channelVoltages);
  console.log('🔌 PowerTable: 원본 selectedDevices:', selectedDevices);
  console.log('🔌 PowerTable: 정규화된 selectedDevices:', normalizedSelectedDevices);
  // 누적 전압 데이터 상태
  const [accumulatedVoltageData, setAccumulatedVoltageData] = useState<AccumulatedTableData>({});
  
  // 서버에서 보내는 voltagTable 데이터를 직접 저장하는 상태
  const [voltagTableData, setVoltagTableData] = useState<any[][][][] | null>(null);
  
  // 테이블 완성도 추적 상태
  const [tableCompletionStatus, setTableCompletionStatus] = useState<{
    totalCells: number;
    filledCells: number;
    completionPercentage: number;
    isComplete: boolean;
    lastUpdate?: number;
    lastForceUpdate?: number;
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
      // 3 x 선택된 기기수 x ON/Off 횟수로 총 셀 수 계산
      const testCount = 3; // 3개 전압 테스트 (24V, 18V, 30V)
      const selectedDeviceCount = normalizedSelectedDevices.length; // 정규화된 선택된 기기 수
      const onOffCount = 10; // ON/Off 횟수 (1st~10th)
      const totalCells = testCount * selectedDeviceCount * onOffCount;
      let filledCells = 0;
      let validDataCount = 0;
      
      // voltagTableData가 있으면 이를 기준으로 계산 (실제 테이블 구조와 일치)
      if (voltagTableData && Array.isArray(voltagTableData)) {
        console.log('🔌 PowerTable: voltagTableData 기준으로 진행상황 계산');
        
        voltagTableData.forEach((voltageData: any[], voltageIndex: number) => {
          voltageData.forEach((productData: any[], productIndex: number) => {
            // 정규화된 선택된 기기에 해당하는 제품만 처리
            if (normalizedSelectedDevices.includes(productIndex + 1)) {
              productData.forEach((measurementData: any[], measurementIndex: number) => {
                measurementData.forEach((channelData: any, channelIndex: number) => {
                  if (channelData && typeof channelData === 'string' && channelData !== '' && channelData !== '-.-') {
                    filledCells++;
                    
                    // 유효한 전압 데이터인지 확인
                    if (channelData.includes('|')) {
                      // "221V|G" 형식에서 전압값 추출
                      const voltageMatch = channelData.match(/^([\d.-]+)V/);
                      if (voltageMatch) {
                        const voltageValue = parseFloat(voltageMatch[1]);
                        if (!isNaN(voltageValue) && voltageValue >= 0.1 && voltageValue <= 300) {
                          validDataCount++;
                        }
                      }
                    } else if (channelData.endsWith('V')) {
                      // "221V" 형식
                      const voltageValue = parseFloat(channelData.replace('V', ''));
                      if (!isNaN(voltageValue) && voltageValue >= 0.1 && voltageValue <= 300) {
                        validDataCount++;
                      }
                    }
                  }
                });
              });
            }
          });
        });
      } else {
        // voltagTableData가 없으면 기존 방식으로 계산 (fallback)
        console.log('🔌 PowerTable: accumulatedVoltageData 기준으로 진행상황 계산 (fallback)');
        
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
        
        // 정규화된 선택된 기기들만 처리
        normalizedSelectedDevices.forEach(deviceIndex => {
          const deviceKey = `device${deviceIndex}`;
          const deviceData = data[deviceKey];
          
          if (deviceData && typeof deviceData === 'object') {
            Object.values(deviceData).forEach(testData => {
              if (testData && typeof testData === 'object') {
                Object.values(testData).forEach(channelData => {
                  if (channelData && channelData !== '-.-' && channelData !== '') {
                    filledCells++;
                    // 유효한 전압 데이터인지 확인 (숫자+V 형식)
                    if (typeof channelData === 'string' && channelData.match(/^[\d.-]+V$/)) {
                      // 전압값 범위 검증 (0.1V ~ 300V)
                      const voltageValue = parseFloat(channelData.replace('V', ''));
                      if (!isNaN(voltageValue) && voltageValue >= 0.1 && voltageValue <= 300) {
                        validDataCount++;
                      }
                    }
                  }
                });
              }
            });
          }
        });
      }
      
      // 완성도 계산
      const completionPercentage = totalCells > 0 ? (filledCells / totalCells) * 100 : 0;
      const validDataPercentage = totalCells > 0 ? (validDataCount / totalCells) * 100 : 0;
      
      // 완성 조건: 95% 이상의 셀이 채워지고, 90% 이상이 유효한 데이터여야 함
      const minRequiredCells = Math.ceil(totalCells * 0.8); // 최소 80% 이상의 셀이 채워져야 함
      const isComplete = completionPercentage >= 95 && validDataPercentage >= 90 && filledCells >= minRequiredCells;
      
      console.log(`🔌 PowerTable: 진행상황 계산 결과 - 총 셀: ${totalCells}, 채워진 셀: ${filledCells}, 완성도: ${completionPercentage.toFixed(1)}%`);
      
      return {
        totalCells,
        filledCells,
        completionPercentage,
        isComplete
      };
    } catch (error) {
      console.error('PowerTable: calculateTableCompletion 오류:', error);
      return {
        totalCells: 3 * normalizedSelectedDevices.length * 10, // 3 x 정규화된 선택된 기기수 x ON/Off 횟수
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
      
      // 디바이스 번호 검증 (1-3)
      if (newData.device < 1 || newData.device > 3) {
        console.warn(`PowerTable: 잘못된 디바이스 번호: ${newData.device} (1-3만 허용)`);
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
            // 채널 번호 검증 (1만 허용)
            if (!channel.channel || channel.channel < 1 || channel.channel > 1) {
              console.warn(`PowerTable: 잘못된 채널 번호: ${channel.channel} (1만 허용)`);
              return;
            }
            
            const channelKey = `channel${channel.channel}`;
            let displayValue = '-.-';
            
            if (channel.voltage === 'error') {
              displayValue = '-.-';
            } else if (typeof channel.voltage === 'number') {
              // 전압값 범위 검증 (-100V ~ 100V로 확장하여 -15 채널 지원)
              if (channel.voltage >= -300 && channel.voltage <= 300) {
                displayValue = `${channel.voltage.toFixed(2)}V`;
              } else {
                console.warn(`PowerTable: 전압값 범위 오류: ${channel.voltage}V`);
                displayValue = '-.-';
              }
            } else {
              displayValue = '-.-';
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
    setVoltagTableData(null);
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
  }, [accumulatedVoltageData, voltagTableData, isTableStable, normalizedSelectedDevices]);

  // channelVoltages 변경 추적 및 테이블 강제 업데이트
  useEffect(() => {
    console.log('🔌 PowerTable: channelVoltages 변경됨:', channelVoltages);
    // 채널 전압이 변경되면 테이블을 강제로 다시 렌더링하여 GOOD/NO GOOD 판단 업데이트
    setLastTableUpdate(Date.now());
    
    // 채널 전압이 변경되면 기존 테이블 데이터를 새로운 전압 기준으로 재계산
    if (Object.keys(accumulatedVoltageData).length > 0) {
      console.log('🔄 PowerTable: 채널 전압 변경으로 인한 테이블 데이터 재계산');
      // 테이블 상태를 강제로 업데이트하여 GOOD/NO GOOD 판단을 새로 수행
      setTableCompletionStatus(prev => ({
        ...prev,
        // 강제 리렌더링을 위해 상태 업데이트
        lastUpdate: Date.now()
      }));
    }
  }, [channelVoltages, accumulatedVoltageData]);

  // normalizedSelectedDevices 변경 추적 및 테이블 강제 업데이트
  useEffect(() => {
    console.log('🔌 PowerTable: normalizedSelectedDevices 변경됨:', normalizedSelectedDevices);
    // 정규화된 선택된 디바이스가 변경되면 테이블을 강제로 다시 렌더링하여 GOOD/NO GOOD 판단 업데이트
    setLastTableUpdate(Date.now());
    
    // 정규화된 선택된 디바이스가 변경되면 기존 테이블 데이터를 새로운 선택 기준으로 재계산
    if (Object.keys(accumulatedVoltageData).length > 0) {
      console.log('🔄 PowerTable: 정규화된 선택된 디바이스 변경으로 인한 테이블 데이터 재계산');
      // 테이블 상태를 강제로 업데이트하여 GOOD/NO GOOD 판단을 새로 수행
      setTableCompletionStatus(prev => ({
        ...prev,
        // 강제 리렌더링을 위해 상태 업데이트
        lastUpdate: Date.now()
      }));
    }
  }, [normalizedSelectedDevices, accumulatedVoltageData]);
  
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

  // 출력 전압 표시 함수 - 1채널로 수정
  const getOutputVoltageDisplay = useCallback((outputValue: string) => {
    //console.log(`🔌 PowerTable: getOutputVoltageDisplay 호출 - outputValue: ${outputValue}, channelVoltages:`, channelVoltages);
    
    // 채널 1개만 사용하므로 첫 번째 채널 전압값 사용
    if (channelVoltages && channelVoltages.length > 0) {
      const voltage = channelVoltages[0]; // 첫 번째 채널 전압값만 사용
      //console.log(`🔌 PowerTable: 채널 1 전압값: ${voltage}`);
      
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
    }
    
    // fallback: 기존 값 사용
    //console.log(`🔌 PowerTable: fallback 사용: ${outputValue}`);
    return outputValue;
  }, [channelVoltages]); // channelVoltages가 변경될 때마다 함수 재생성

  // 출력값으로부터 채널 번호를 결정하는 함수 - 1채널로 수정
  const getChannelNumberFromOutput = useCallback((outputValue: string) => {
    // 채널 1개만 사용하므로 항상 채널 1 반환
    if (channelVoltages && channelVoltages.length > 0) {
      const voltage = channelVoltages[0]; // 첫 번째 채널 전압값만 사용
      const expectedOutput = voltage > 0 ? `+${voltage}` : `${voltage}`;
      
      // 다양한 형식의 출력값과 매칭
      if (outputValue === expectedOutput || 
          outputValue === `+${voltage}` || 
          outputValue === `${voltage}` ||
          outputValue === voltage.toString()) {
        return 1; // 채널 번호는 항상 1
      }
    }
    
    return 1; // 기본값으로 채널 1 반환
  }, [channelVoltages]); // channelVoltages가 변경될 때마다 함수 재생성

  // GOOD/NO GOOD 판단 함수
  const determineGoodNoGood = useCallback((deviceNumber: number, testNumber: number, channelNumber: number, measuredVoltage: string) => {
    try {
      // 측정된 전압값이 유효하지 않으면 NO GOOD
      if (!measuredVoltage || measuredVoltage === '-.-' || measuredVoltage === '') {
        return 'NO GOOD';
      }

      // 측정된 전압값에서 숫자 부분 추출
      const voltageMatch = measuredVoltage.match(/^([\d.-]+)V$/);
      if (!voltageMatch) {
        return 'NO GOOD';
      }

      const measuredValue = parseFloat(voltageMatch[1]);
      if (isNaN(measuredValue)) {
        return 'NO GOOD';
      }

      // 해당 채널의 설정된 전압값 가져오기
      const expectedVoltage = channelVoltages[0];
      if (expectedVoltage === undefined || expectedVoltage === null) {
        return 'NO GOOD';
      }

      // 허용 오차 범위 (±5%)
      const tolerance = expectedVoltage * 0.05;
      const minVoltage = expectedVoltage - tolerance;
      const maxVoltage = expectedVoltage + tolerance;

      // 측정값이 허용 범위 내에 있는지 확인
      if (measuredValue >= minVoltage && measuredValue <= maxVoltage) {
        return 'GOOD';
      } else {
        return 'NO GOOD';
      }
    } catch (error) {
      console.error(`PowerTable: GOOD/NO GOOD 판단 오류 - device: ${deviceNumber}, test: ${testNumber}, channel: ${channelNumber}`, error);
      return 'NO GOOD';
    }
  }, [channelVoltages]); // channelVoltages가 변경될 때마다 함수 재생성


  // 누적된 전압 데이터 표시 함수 개선
  const getAccumulatedVoltageDisplay = (device: number, test: number, channel: number) => {
    try {
      // 입력값 검증 - Device 1-3, Test 1-3, Channel 1만 허용
      if (!device || !test || !channel || 
          device < 1 || device > 3 || 
          test < 1 || test > 3 || 
          channel < 1 || channel > 1) {
        // 디버그 로그를 줄이기 위해 조건부로만 출력
        if (process.env.NODE_ENV === 'development') {
          console.warn(`PowerTable: 잘못된 인덱스 - device: ${device}, test: ${test}, channel: ${channel}`);
        }
        return '-.-';
      }
      
      const deviceKey = `device${device}`;
      const testKey = `test${test}`;
      const channelKey = `channel${channel}`;
      
      const voltage = accumulatedVoltageData[deviceKey]?.[testKey]?.[channelKey];
      
      // 데이터가 없거나 비어있으면 기본값 반환
      if (!voltage || voltage === '' || voltage === '-.-') {
        return '-.-';
      }
      
      // 전압값이 유효한 형식인지 확인 (숫자+V 형식)
      if (typeof voltage === 'string' && voltage.match(/^[\d.-]+V$/)) {
        // 전압값 범위 검증 (-300V ~ 300V로 확장하여 다양한 전압 지원)
        const voltageValue = parseFloat(voltage.replace('V', ''));
        if (isNaN(voltageValue) || voltageValue < -300 || voltageValue > 300) {
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

    // 마지막으로 받은 테이블 데이터를 추적하여 중복 처리 방지
    let lastTableDataHash = '';

    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      
      // PowerTable에서 필요한 메시지만 처리
      // 1. 테스트 진행상황 메시지 처리
      if (typeof message === 'string' && message.startsWith('[TEST_PROGRESS]')) {
        try {
          const match = message.match(/\[TEST_PROGRESS\] (.+)/);
          if (match && match[1]) {
            const progressMessage = match[1];
            console.log('🔌 PowerTable: 테스트 진행상황 메시지 수신:', progressMessage);
            setTestProgressMessage(progressMessage);
            setIsTestProgressActive(true);
          }
        } catch (error) {
          console.error('PowerTable: 테스트 진행상황 메시지 파싱 오류:', error);
        }
        return; // 처리 완료 후 종료
      }
      
      // 2. 테스트 완료 메시지 처리
      if (typeof message === 'string' && message.startsWith('[TEST_COMPLETED]')) {
        try {
          const match = message.match(/\[TEST_COMPLETED\] (.+)/);
          if (match && match[1]) {
            const completeMessage = match[1];
            console.log('🔌 PowerTable: 테스트 완료 메시지 수신:', completeMessage);
            setTestProgressMessage(completeMessage);
            setIsTestProgressActive(true);
          }
        } catch (error) {
          console.error('PowerTable: 테스트 완료 메시지 파싱 오류:', error);
        }
        return; // 처리 완료 후 종료
      }
      
      // 3. 챔버 온도 업데이트
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
      
      // 4. PowerTable 전압 데이터 초기화 메시지 처리
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
                
                // PowerSwitch에 측정 시작 알림
                if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
                  const measurementMessage = `[MEASUREMENT_STATUS] STARTED`;
                  wsConnection.send(measurementMessage);
                  console.log('🔌 PowerTable: 측정 시작 메시지 전송');
                }
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
      
      // 3. 테이블 업데이트 메시지 처리 - 통합된 방식으로 변경
      if (typeof message === 'string' && (
        message.startsWith('[POWER_TABLE_UPDATE]') || 
        message.startsWith('[TABLE_DATA_RESPONSE]') || 
        message.startsWith('[POWER_TABLE_COMPLETE]')
      )) {
        try {
          let tableData: any;
          let messageType = '';
          
          // 메시지 타입에 따른 파싱
          if (message.startsWith('[POWER_TABLE_UPDATE]')) {
          const match = message.match(/\[POWER_TABLE_UPDATE\] (.+)/);
          if (match && match[1]) {
              tableData = JSON.parse(match[1]);
              messageType = 'POWER_TABLE_UPDATE';
            }
          } else if (message.startsWith('[TABLE_DATA_RESPONSE]')) {
            const match = message.match(/\[TABLE_DATA_RESPONSE\] (.+)/);
            if (match && match[1]) {
              tableData = JSON.parse(match[1]);
              messageType = 'TABLE_DATA_RESPONSE';
            }
          } else if (message.startsWith('[POWER_TABLE_COMPLETE]')) {
            const match = message.match(/\[POWER_TABLE_COMPLETE\] (.+)/);
            if (match && match[1]) {
              tableData = JSON.parse(match[1]);
              messageType = 'POWER_TABLE_COMPLETE';
            }
          }
          
          if (tableData) {
            // 중복 데이터 처리 방지: 데이터 해시 생성 및 비교
            const currentDataHash = JSON.stringify(tableData);
            if (currentDataHash === lastTableDataHash) {
              console.log(`🔌 PowerTable: ${messageType} 중복 데이터 무시`);
              return;
            }
            
            // 새로운 데이터인 경우 해시 업데이트
            lastTableDataHash = currentDataHash;
            
            //console.log(`🔌 PowerTable: ${messageType} 데이터 수신:`, tableData);
            
            // 서버에서 전달받은 테이블 데이터를 누적 데이터로 변환
            const newAccumulatedData: AccumulatedTableData = {};
            
            // 메시지 타입에 따른 데이터 구조 처리
            if (messageType === 'POWER_TABLE_UPDATE' && tableData.voltagTable && Array.isArray(tableData.voltagTable)) {
              // POWER_TABLE_UPDATE 형식 처리 - 순차적 voltagTable 포맷: [voltageIndex][productIndex][measurementIndex][channel]
              // voltageIndex: 테스트 번호 (0=24V, 1=18V, 2=30V)
              // productIndex: 제품 번호 (0=C005, 1=C006, 2=C007)
              // measurementIndex: 측정 순서 (0=1st, 1=2nd, ..., 9=10th)
              tableData.voltagTable.forEach((voltageData: any[], voltageIndex: number) => {
                voltageData.forEach((productData: any[], productIndex: number) => {
                  productData.forEach((measurementData: any[], measurementIndex: number) => {
                    // 순차적 매핑: productIndex를 deviceNumber로 사용
                    const deviceNumber = productIndex + 1; // Device 1,2,3 (C005, C006, C007)
                    const testNumber = voltageIndex + 1; // Test 1,2,3 (24V, 18V, 30V)
                    
                    if (!newAccumulatedData[`device${deviceNumber}`]) {
                      newAccumulatedData[`device${deviceNumber}`] = {};
                    }
                    if (!newAccumulatedData[`device${deviceNumber}`][`test${testNumber}`]) {
                      newAccumulatedData[`device${deviceNumber}`][`test${testNumber}`] = {};
                    }
                    
                    measurementData.forEach((channelData: any, channelIndex: number) => {
                      const channelNumber = channelIndex + 1;
                      
                      // channelData가 문자열인 경우 (예: "221V|G" 또는 "-.-") 처리
                      let displayValue = '-.-';
                      if (typeof channelData === 'string' && channelData !== '') {
                        if (channelData === '-.-') {
                          displayValue = '-.-';
                        } else if (channelData.includes('|')) {
                          // "221V|G" 형식에서 전압값만 추출
                          const voltageMatch = channelData.match(/^([\d.-]+)V/);
                          if (voltageMatch) {
                            displayValue = `${voltageMatch[1]}V`;
                          }
                        } else if (channelData.endsWith('V')) {
                          displayValue = channelData;
                        } else {
                          displayValue = '-.-';
                        }
                      }
                      
                      newAccumulatedData[`device${deviceNumber}`][`test${testNumber}`][`channel${channelNumber}`] = displayValue;
                    });
                  });
                });
              });
            } else if (messageType === 'TABLE_DATA_RESPONSE' && tableData.devices && Array.isArray(tableData.devices)) {
              // TABLE_DATA_RESPONSE 형식 처리
              tableData.devices.forEach((device: any) => {
                const deviceNumber = device.deviceNumber;
                newAccumulatedData[`device${deviceNumber}`] = {};
                
                device.tests.forEach((test: any) => {
                  const testNumber = test.testNumber;
                  newAccumulatedData[`device${deviceNumber}`][`test${testNumber}`] = {};
                  
                  test.channels.forEach((channel: any) => {
                    const channelNumber = channel.channelNumber;
                    
                    let displayValue = '-.-';
                    if (channel.status === 'completed' && channel.voltage !== null) {
                      displayValue = `${channel.voltage.toFixed(2)}V`;
                    }
                    
                    newAccumulatedData[`device${deviceNumber}`][`test${testNumber}`][`channel${channelNumber}`] = displayValue;
                  });
                });
              });
            } else if (messageType === 'POWER_TABLE_COMPLETE' && tableData.voltagTable && Array.isArray(tableData.voltagTable)) {
              // POWER_TABLE_COMPLETE 형식 처리 - 순차적 voltagTable 포맷: [voltageIndex][productIndex][measurementIndex][channel]
              // voltageIndex: 테스트 번호 (0=24V, 1=18V, 2=30V)
              // productIndex: 제품 번호 (0=C005, 1=C006, 2=C007)
              // measurementIndex: 측정 순서 (0=1st, 1=2nd, ..., 9=10th)
              tableData.voltagTable.forEach((voltageData: any[], voltageIndex: number) => {
                voltageData.forEach((productData: any[], productIndex: number) => {
                  productData.forEach((measurementData: any[], measurementIndex: number) => {
                    // 순차적 매핑: productIndex를 deviceNumber로 사용
                    const deviceNumber = productIndex + 1; // Device 1,2,3 (C005, C006, C007)
                    const testNumber = voltageIndex + 1; // Test 1,2,3 (24V, 18V, 30V)
                    
                    if (!newAccumulatedData[`device${deviceNumber}`]) {
                      newAccumulatedData[`device${deviceNumber}`] = {};
                    }
                    if (!newAccumulatedData[`device${deviceNumber}`][`test${testNumber}`]) {
                      newAccumulatedData[`device${deviceNumber}`][`test${testNumber}`] = {};
                    }
                    
                    measurementData.forEach((channelData: any, channelIndex: number) => {
                      const channelNumber = channelIndex + 1;
                      
                      // channelData가 문자열인 경우 (예: "221V|G") 전압값만 추출
                      let displayValue = '-.-';
                      if (typeof channelData === 'string' && channelData !== '') {
                        if (channelData === '-.-') {
                          displayValue = '-.-';
                        } else if (channelData.includes('|')) {
                          // "221V|G" 형식에서 전압값만 추출
                          const voltageMatch = channelData.match(/^([\d.-]+)V/);
                          if (voltageMatch) {
                            displayValue = `${voltageMatch[1]}V`;
                          }
                        } else if (channelData.endsWith('V')) {
                          displayValue = channelData;
                        } else {
                          displayValue = '-.-';
                        }
                      }
                      
                      newAccumulatedData[`device${deviceNumber}`][`test${testNumber}`][`channel${channelNumber}`] = displayValue;
                    });
                  });
                });
              });
            }
              
              // 누적 데이터 업데이트
              setAccumulatedVoltageData(newAccumulatedData);
              
              // 서버에서 보내는 voltagTable 데이터도 저장
              if (tableData.voltagTable && Array.isArray(tableData.voltagTable)) {
                setVoltagTableData(tableData.voltagTable);
                console.log(`✅ PowerTable: ${messageType}으로 voltagTable 데이터 저장 완료`);
              }
              
            console.log(`✅ PowerTable: ${messageType}으로 누적 데이터 업데이트 완료`);
            
            // 테이블 완성도 정보 업데이트 (POWER_TABLE_UPDATE와 POWER_TABLE_COMPLETE에서만)
            if ((messageType === 'POWER_TABLE_UPDATE' || messageType === 'POWER_TABLE_COMPLETE') && 
                tableData.completionPercentage !== undefined) {
              // 3 x 정규화된 선택된 기기수 x ON/Off 횟수로 계산
              const testCount = 3; // 3개 전압 테스트
              const selectedDeviceCount = normalizedSelectedDevices.length; // 정규화된 선택된 기기 수
              const onOffCount = 10; // ON/Off 횟수 (1st~10th)
              const dynamicTotalCells = testCount * selectedDeviceCount * onOffCount;
              setTableCompletionStatus({
                totalCells: tableData.totalCells || dynamicTotalCells,
                filledCells: tableData.completedCells || 0,
                completionPercentage: tableData.completionPercentage || 0,
                isComplete: tableData.completionPercentage >= 95
              });
            }
          }
          
        } catch (error) {
          console.error('PowerTable: 테이블 데이터 파싱 오류:', error);
        }
        return; // 처리 완료 후 종료
      }
      
      // 4. 실시간 전압 업데이트 메시지 처리 - 매 전압 측정마다 테이블 리플래시
      if (typeof message === 'string' && message.startsWith('[REALTIME_VOLTAGE_UPDATE]')) {
        try {
          const match = message.match(/\[REALTIME_VOLTAGE_UPDATE\] (.+)/);
          if (match && match[1]) {
            const realtimeUpdate = JSON.parse(match[1]);
            
            console.log(`🔌 PowerTable: 실시간 전압 업데이트 - Device ${realtimeUpdate.deviceNumber}, Test ${realtimeUpdate.testNumber}`);
            
            // 실시간 업데이트 데이터를 누적 데이터로 변환
            const voltageUpdate: VoltageData = {
              device: realtimeUpdate.deviceNumber,
              voltageTest: realtimeUpdate.testNumber,
              channels: [{
                device: realtimeUpdate.deviceNumber,
                channel: 1,
                voltage: realtimeUpdate.voltage,
                expected: 0, // 서버에서 계산됨
                result: realtimeUpdate.voltageWithComparison.includes('|G') ? 'G' : 'N',
                voltageWithComparison: realtimeUpdate.voltageWithComparison
              }],
              inputVoltage: 0, // 서버에서 계산됨
              rowIndex: 0,
              testIndex: realtimeUpdate.testNumber
            };
            
            // 전압 데이터를 누적 방식으로 처리
            accumulateVoltageData(voltageUpdate);
            
            // 테이블 강제 리플래시를 위한 상태 업데이트
            setLastTableUpdate(Date.now());
            setTableCompletionStatus(prev => ({
              ...prev,
              lastUpdate: Date.now()
            }));
            
          }
        } catch (error) {
          console.error('PowerTable: 실시간 전압 업데이트 파싱 오류:', error);
        }
        return; // 처리 완료 후 종료
      }
      
      // 4-1. 전압 업데이트 메시지 처리 - 누적 방식으로 변경 (기존 호환성 유지)
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
      
      // 5. 파워스위치 메시지 처리
      if (typeof message === 'string' && message.includes('[POWER_SWITCH]')) {
        if (message.includes('STOPPING - Processing stop request')) {
          // 중지 처리 중 메시지 표시
          setTestProgressMessage('중지 처리중...');
          setIsTestProgressActive(true);
          console.log('🔌 PowerTable: 파워스위치 중지 처리 중 상태 감지');
        } else if (message.includes('OFF - Machine running: false')) {
          // 파워스위치 OFF 시 테스트 진행상황 메시지 초기화
          if (message.includes('Test completed')) {
            // 테스트 완료 시
            setTestProgressMessage('테스트 완료 - 중단 시작 대기중');
            
            // PowerSwitch에 측정 완료 알림
            if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
              const measurementMessage = `[MEASUREMENT_STATUS] COMPLETED`;
              wsConnection.send(measurementMessage);
              console.log('🔌 PowerTable: 측정 완료 메시지 전송');
            }
          } else {
            // 일반 중지 시
            setTestProgressMessage('중단 시작 대기중');
            
            // PowerSwitch에 측정 중단 알림
            if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
              const measurementMessage = `[MEASUREMENT_STATUS] STOPPED`;
              wsConnection.send(measurementMessage);
              console.log('🔌 PowerTable: 측정 중단 메시지 전송');
            }
          }
          setIsTestProgressActive(true);
          console.log('🔌 PowerTable: 파워스위치 OFF 상태 감지 - 중단 시작 대기중 메시지 표시');
        }
        return; // 처리 완료 후 종료
      }
      
      // 5-1. 측정 상태 메시지 처리 - PowerSwitch에 전달
      if (typeof message === 'string' && message.includes('[MEASUREMENT_STATUS]')) {
        // PowerSwitch 컴포넌트에서 처리하므로 여기서는 로그만 출력
        console.log('🔌 PowerTable: 측정 상태 메시지 수신:', message);
        return; // 처리 완료 후 종료
      }
      
      // 6. 파워 테이블 강제 업데이트 메시지 처리
      if (typeof message === 'string' && message.startsWith('[POWER_TABLE_FORCE_UPDATE]')) {
        try {
          const match = message.match(/\[POWER_TABLE_FORCE_UPDATE\] (\[.*\])/);
          if (match && match[1]) {
            const newVoltages = JSON.parse(match[1]);
            if (Array.isArray(newVoltages) && newVoltages.length === 4) {
              console.log('🔄 PowerTable: 강제 업데이트 메시지 수신, 채널 전압 변경:', newVoltages);
              // 채널 전압이 변경되었으므로 테이블을 강제로 다시 렌더링
              setLastTableUpdate(Date.now());
              
              // 기존 테이블 데이터가 있다면 GOOD/NO GOOD 판단을 새로 수행
              if (Object.keys(accumulatedVoltageData).length > 0) {
                console.log('🔄 PowerTable: 기존 테이블 데이터 재계산 시작');
                // 테이블 완성도 상태를 강제로 업데이트하여 리렌더링 유발
                setTableCompletionStatus(prev => ({
                  ...prev,
                  lastForceUpdate: Date.now()
                }));
              }
            }
          }
        } catch (error) {
          console.error('PowerTable: 강제 업데이트 메시지 파싱 오류:', error);
        }
        return; // 처리 완료 후 종료
      }
      
      // 7. 기타 메시지는 무시 (PowerTable에서 처리하지 않음)
    };

    wsConnection.addEventListener('message', handleMessage);
    
    return () => {
      wsConnection.removeEventListener('message', handleMessage);
    };
  }, [wsConnection, accumulateVoltageData]);

  // 초기화 메시지 타입에 따른 텍스트 반환 함수
  const getActionTypeText = (message: string) => {
    if (message.includes('단일 페이지')) return '단일페이지 초기화';
    if (message.includes('사이클')) return '사이클 초기화';
    return '일반 초기화';
  };
  
  // 현재 테이블 데이터 가져오기 함수
  const getCurrentTableData = () => {
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
      const getTableMessage = `[TABLE_DATA_GET]`;
      wsConnection.send(getTableMessage);
      console.log('📊 PowerTable: 현재 테이블 데이터 요청 전송');
    } else {
      console.warn('📊 PowerTable: 테이블 데이터 요청: WebSocket 연결이 없습니다.');
    }
  };

  // 테이블 데이터 초기화 함수
  const resetTableData = () => {
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
      const resetTableMessage = `[TABLE_DATA_RESET]`;
      wsConnection.send(resetTableMessage);
      console.log('🔄 PowerTable: 테이블 데이터 초기화 요청 전송');
    } else {
      console.warn('🔄 PowerTable: 테이블 초기화: WebSocket 연결이 없습니다.');
    }
  };

  // 데모 테이블 완성 데이터 생성 함수 - 새로운 voltagTable 포맷 적용
  const generateDemoCompleteTable = useCallback(() => {
    console.log('🧪 PowerTable: 데모 테이블 생성 시작 (새로운 voltagTable 포맷)');
    console.log('🧪 PowerTable: 현재 channelVoltages prop:', channelVoltages);
    console.log('🧪 PowerTable: 정규화된 선택된 디바이스:', normalizedSelectedDevices);
    
    // channelVoltages가 유효한지 확인 (채널 1개로 변경)
    if (!channelVoltages || !Array.isArray(channelVoltages) || channelVoltages.length < 1) {
      console.error('🧪 PowerTable: channelVoltages가 유효하지 않음, 기본값 사용');
      const defaultVoltages = [220]; // 채널 1개 기본값
      channelVoltages = defaultVoltages;
    }
    
    // 4채널 배열이 전달되더라도 첫 번째 채널만 사용
    const singleChannelVoltage = channelVoltages[0] || 220;
    console.log('🧪 PowerTable: 단일 채널 전압값 사용:', singleChannelVoltage);
    
    // 순차적 voltagTable 포맷으로 데모 데이터 생성
    const testCount = 3; // 3개 전압 테스트
    const selectedDeviceCount = normalizedSelectedDevices.length; // 정규화된 선택된 기기 수
    const onOffCount = 10; // ON/Off 횟수 (1st~10th)
    const totalCells = testCount * selectedDeviceCount * onOffCount;
    
    const demoTableData = {
      timestamp: new Date().toISOString(),
      totalDevices: selectedDeviceCount, // 선택된 기기 수
      totalTests: testCount,   // 3개 전압 테스트
      totalChannels: 1, // 채널 1개
      completionPercentage: 100.0,
      completedCells: totalCells, // 3 x 선택된 기기수 x ON/Off 횟수
      totalCells: totalCells,
      // 순차적 voltagTable 포맷: [voltageIndex][productIndex][measurementIndex][channel]
      // voltageIndex: 테스트 번호 (0=24V, 1=18V, 2=30V)
      // productIndex: 제품 번호 (0=C005, 1=C006, 2=C007)
      // measurementIndex: 측정 순서 (0=1st, 1=2nd, ..., 9=10th)
      voltagTable: Array(3).fill(null).map((_, voltageIndex) => 
        Array(selectedDeviceCount).fill(null).map((_, productIndex) => 
          Array(10).fill(null).map((_, measurementIndex) => 
            Array(1).fill(null).map((_, channelIndex) => {
              // 단일 채널 전압값을 사용하여 랜덤한 전압값 생성
              const voltage = singleChannelVoltage + (Math.random() - 0.5) * 10; // ±5V 범위
              const comparisonResult = Math.random() > 0.1 ? 'G' : 'N'; // 90% 확률로 GOOD
              const truncatedVoltage = Math.floor(voltage);
              
              console.log(`🧪 PowerTable: Product ${productIndex + 1} (C00${5 + productIndex}), Test ${voltageIndex + 1}, Measurement ${measurementIndex + 1} - 전압: ${truncatedVoltage}V, 결과: ${comparisonResult}`);
              return `${truncatedVoltage}V|${comparisonResult}`;
            })
          )
        )
      ),
      summary: {
        totalCells: totalCells,
        completedCells: totalCells,
        status: 'completed'
      }
    };

    // 데모 데이터를 누적 데이터로 변환하여 표시
    const newAccumulatedData: AccumulatedTableData = {};
    
    // 순차적 voltagTable 포맷에서 누적 데이터로 변환
    demoTableData.voltagTable.forEach((voltageData: any[], voltageIndex: number) => {
      voltageData.forEach((productData: any[], productIndex: number) => {
        const deviceNumber = productIndex + 1; // productIndex를 deviceNumber로 사용
        if (!newAccumulatedData[`device${deviceNumber}`]) {
          newAccumulatedData[`device${deviceNumber}`] = {};
        }
        
        const testNumber = voltageIndex + 1; // voltageIndex가 testNumber가 됨
        if (!newAccumulatedData[`device${deviceNumber}`][`test${testNumber}`]) {
          newAccumulatedData[`device${deviceNumber}`][`test${testNumber}`] = {};
        }
        
        productData.forEach((measurementData: any[], measurementIndex: number) => {
          measurementData.forEach((channelData: any, channelIndex: number) => {
            const channelNumber = channelIndex + 1;
            
            // channelData가 "221V|G" 형식이므로 전압값만 추출
            let displayValue = '-.-';
            if (typeof channelData === 'string' && channelData !== '') {
              if (channelData === '-.-') {
                displayValue = '-.-';
              } else if (channelData.includes('|')) {
                // "221V|G" 형식에서 전압값만 추출
                const voltageMatch = channelData.match(/^([\d.-]+)V/);
                if (voltageMatch) {
                  displayValue = `${voltageMatch[1]}V`;
                }
              } else if (channelData.endsWith('V')) {
                displayValue = channelData;
              } else {
                displayValue = '-.-';
              }
            }
            
            newAccumulatedData[`device${deviceNumber}`][`test${testNumber}`][`channel${channelNumber}`] = displayValue;
          });
        });
      });
    });
    
    setAccumulatedVoltageData(newAccumulatedData);
    
    // voltagTable 데이터도 저장
    setVoltagTableData(demoTableData.voltagTable);
    
    // 테이블 완성도 상태도 업데이트 (3 x 선택된 기기수 x ON/Off 횟수)
    setTableCompletionStatus({
      totalCells: totalCells, // 3 x 선택된 기기수 x ON/Off 횟수
      filledCells: totalCells,
      completionPercentage: 100,
      isComplete: true
    });
    
    console.log('🧪 PowerTable: 데모 테이블 데이터 생성 완료 (새로운 voltagTable 포맷)');
    console.log('🧪 PowerTable: 사용된 channelVoltages:', channelVoltages);
    console.log('🧪 PowerTable: 생성된 누적 데이터 샘플:', Object.keys(newAccumulatedData).slice(0, 2));
  }, [channelVoltages, normalizedSelectedDevices]); // channelVoltages와 normalizedSelectedDevices가 변경될 때마다 함수 재생성

  // A.Q.L 판단 함수 - 한 행의 모든 전압값을 검사하여 채널 전압 설정값의 ±5% 범위 확인
  const determineAQL = useCallback((inputVoltage: string, productIndex: number) => {
    try {
      // channelVoltages prop에서 채널 전압 설정값 가져오기
      const channelVoltage = channelVoltages && channelVoltages.length > 0 ? channelVoltages[0] : 221;
      
      if (!channelVoltage || channelVoltage <= 0) {
        return 'A'; // 유효하지 않은 채널 전압
      }

      // 5% 허용 오차 계산
      const tolerance = channelVoltage * 0.05;
      const minAllowedVoltage = channelVoltage - tolerance; // 전압설정값 - (전압설정값 x 0.05)
      const maxAllowedVoltage = channelVoltage + tolerance; // 전압설정값 + (전압설정값 x 0.05)

      // 해당 행의 모든 측정값(1st~10th) 검사
      for (let measurementIndex = 0; measurementIndex < 10; measurementIndex++) {
        let displayValue = '-.-';
        
        // voltagTable 데이터가 있으면 직접 사용
        if (voltagTableData && voltagTableData.length > 0) {
          // INPUT 전압에 따른 테스트 번호 결정
          let testNumber = 1;
          if (inputVoltage === '24V') testNumber = 1;
          else if (inputVoltage === '18V') testNumber = 2;
          else if (inputVoltage === '30V') testNumber = 3;
          
          if (voltagTableData[testNumber - 1] && 
              voltagTableData[testNumber - 1][productIndex] && 
              voltagTableData[testNumber - 1][productIndex][measurementIndex]) {
            const channelData = voltagTableData[testNumber - 1][productIndex][measurementIndex][0];
            
            if (typeof channelData === 'string' && channelData !== '' && channelData !== '-.-') {
              if (channelData.includes('|')) {
                // "221V|G" 형식에서 전압값만 추출
                const voltageMatch = channelData.match(/^([\d.-]+)V/);
                if (voltageMatch) {
                  const voltageValue = parseFloat(voltageMatch[1]);
                  if (!isNaN(voltageValue)) {
                    displayValue = voltageValue.toString();
                  }
                }
              } else if (channelData.endsWith('V')) {
                const voltageValue = parseFloat(channelData.replace('V', ''));
                if (!isNaN(voltageValue)) {
                  displayValue = voltageValue.toString();
                }
              }
            }
          }
        } else {
          // voltagTable 데이터가 없으면 기존 누적 데이터 사용 (fallback)
          const deviceNumber = productIndex + 1;
          let testNumber = 1;
          if (inputVoltage === '24V') testNumber = 1;
          else if (inputVoltage === '18V') testNumber = 2;
          else if (inputVoltage === '30V') testNumber = 3;
          
          const accumulatedVoltage = getAccumulatedVoltageDisplay(deviceNumber, testNumber, 1);
          
          if (accumulatedVoltage && accumulatedVoltage !== '-.-' && accumulatedVoltage !== '') {
            const voltageMatch = accumulatedVoltage.match(/^([\d.-]+)V$/);
            if (voltageMatch) {
              const voltageValue = parseFloat(voltageMatch[1]);
              if (!isNaN(voltageValue)) {
                displayValue = voltageValue.toString();
              }
            }
          }
        }

        // 전압값이 유효하고 허용 범위를 벗어나는지 확인
        if (displayValue !== '-.-' && displayValue !== '') {
          const measuredVoltage = parseFloat(displayValue);
          if (!isNaN(measuredVoltage)) {
            // 측정값이 허용 범위(전압설정값 ± 5%)를 벗어나면 NG
            if (measuredVoltage < minAllowedVoltage || measuredVoltage > maxAllowedVoltage) {
              return 'NG'; // 허용 범위를 벗어나는 값이 하나라도 있으면 NG
            }
          }
        }
      }

      // 모든 측정값이 허용 범위 내에 있거나 유효하지 않은 경우
      return 'G';
    } catch (error) {
      console.error(`PowerTable: A.Q.L 판단 오류 - inputVoltage: ${inputVoltage}, productIndex: ${productIndex}`, error);
      return 'A'; // 오류 시 기본값
    }
  }, [voltagTableData, getAccumulatedVoltageDisplay, channelVoltages]); // voltagTableData, getAccumulatedVoltageDisplay, channelVoltages가 변경될 때마다 함수 재생성

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
        {/* 온도와 테스트 진행상황, 그리고 테스트 버튼들을 가로로 배치 */}
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
              width: '25%',
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
            
            {/* 테스트 진행 상황 표시 - 중앙 셀 */}
            <div style={{ 
              display: 'table-cell',
              width: '45%',
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

            {/* 테스트 버튼들 - 우측 셀 */}
            <div style={{ 
              display: 'table-cell',
              width: '30%',
              verticalAlign: 'middle',
              textAlign: 'right'
            }}>
              <div style={{
                display: 'flex',
                gap: '8px',
                justifyContent: 'flex-end'
              }}>
                
                
                
                <button
                  onClick={generateDemoCompleteTable}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#F59E0B',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  🎯 데모 테이블
                </button>
                <button
                  onClick={getCurrentTableData}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#06B6D4',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  📊 데이터 요청
                </button>
                <button
                  onClick={resetTableData}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#F97316',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  🔄 서버 초기화
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
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  🔄 테이블 초기화
                </button>
              </div>
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
        

      </div>
      
      {/* 테이블 컨테이너 - 그리드 영역 */}
      <div className="overflow-x-auto overflow-y-auto" style={{ 
        width: '100%', 
        gridArea: 'table',
        backgroundColor: '#1a1b20',
        borderRadius: '8px',
        padding: '10px',
        maxHeight: 'calc(100vh - 300px)', /* 최대 높이 설정으로 스크롤 가능하게 함 */
        minHeight: '400px', /* 최소 높이 보장 */
        /* 스크롤바 스타일링 */
        scrollbarWidth: 'thin',
        scrollbarColor: '#4a5568 #2d3748'
      }}>
        <table className="w-full text-xs sm:text-sm md:text-base text-left text-gray-300 border-separate border-spacing-0" style={{ width: '100%', tableLayout: 'fixed' }}>
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#23242a]" style={{ height: '36px' }}>
              <th className="px-1 py-0" style={{ width: '8%', fontSize: '16px', height: '36px' }}>INPUT</th>
              <th className="px-1 py-0" style={{ width: '8%', fontSize: '16px', height: '36px' }}>제품번호</th>
              {Array.from({ length: 10 }, (_, i) => (
                <th key={i} className="px-1 py-0" style={{ width: '6%', fontSize: '16px', height: '36px' }}>{i+1}st</th>
              ))}
              <th className="px-1 py-0" style={{ width: '8%', fontSize: '16px', height: '36px' }}>A.Q.L</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              // 새로운 테이블 구조를 위한 데이터 생성
              const tableRows: JSX.Element[] = [];
              const inputVoltages = ['24V', '18V', '30V'];
              const productNumbers = ['C005', 'C006', 'C007'];
              
              inputVoltages.forEach((inputVoltage, inputIndex) => {
                productNumbers.forEach((productNumber, productIndex) => {
                  const rowIndex = inputIndex * 3 + productIndex;
                  const isFirstProduct = productIndex === 0;
                  
                  tableRows.push(
                    <tr key={`${inputVoltage}-${productNumber}`} style={{ 
                      backgroundColor: rowIndex % 2 === 0 ? '#3a3a3a' : '#1a1a1a', 
                      height: '31px' 
                    }}>
                      {/* INPUT 열 - 첫 번째 제품에서만 표시하고 세로 병합 */}
                      {isFirstProduct ? (
                        <td 
                          className="px-1 py-0 whitespace-nowrap text-center" 
                          style={{ 
                            fontSize: '16px', 
                            height: '93px', // 3행 높이
                            verticalAlign: 'middle'
                          }}
                          rowSpan={3}
                        >
                          {inputVoltage}
                        </td>
                      ) : null}
                      
                      {/* 제품번호 열 */}
                      <td className="px-1 py-0 whitespace-nowrap text-center" style={{ fontSize: '16px', height: '31px' }}>
                        {productNumber}
                      </td>
                      
                      {/* 1st~10th 열 - 측정값 표시 (순차적으로) */}
                      {Array.from({ length: 10 }, (_, i) => {
                        try {
                          // 각 열(1st~10th)이 해당하는 measurementIndex의 데이터를 표시
                          // i는 0~9 (1st~10th 열에 해당)
                          const measurementIndex = i; // 0=1st, 1=2nd, ..., 9=10th
                          
                          // productIndex를 deviceNumber로 사용
                          const deviceNumber = productIndex + 1; // Device 1,2,3 (C005, C006, C007)
                          
                          // INPUT 전압에 따른 테스트 번호 결정
                          let testNumber = 1;
                          if (inputVoltage === '24V') testNumber = 1;
                          else if (inputVoltage === '18V') testNumber = 2;
                          else if (inputVoltage === '30V') testNumber = 3;
                          
                          // 채널 번호는 1로 고정 (첫 번째 채널만 사용)
                          const channelNumber = 1;
                          
                          // 서버에서 보내는 voltagTable 구조: [voltageIndex][productIndex][measurementIndex][channel]
                          // 각 열(1st~10th)이 해당하는 measurementIndex의 데이터를 표시
                          
                          let displayValue = '-.-';
                          
                          // voltagTable 데이터가 있으면 직접 사용
                          if (voltagTableData && voltagTableData[testNumber - 1] && voltagTableData[testNumber - 1][productIndex] && voltagTableData[testNumber - 1][productIndex][measurementIndex]) {
                            const channelData = voltagTableData[testNumber - 1][productIndex][measurementIndex][0]; // 채널 1개만 사용
                            
                            if (typeof channelData === 'string' && channelData !== '' && channelData !== '-.-') {
                              if (channelData.includes('|')) {
                                // "221V|G" 형식에서 전압값만 추출
                                const voltageMatch = channelData.match(/^([\d.-]+)V/);
                                if (voltageMatch) {
                                  const voltageValue = parseFloat(voltageMatch[1]);
                                  if (!isNaN(voltageValue)) {
                                    displayValue = Math.round(voltageValue).toString();
                                  }
                                }
                              } else if (channelData.endsWith('V')) {
                                const voltageValue = parseFloat(channelData.replace('V', ''));
                                if (!isNaN(voltageValue)) {
                                  displayValue = Math.round(voltageValue).toString();
                                }
                              }
                            }
                          } else {
                            // voltagTable 데이터가 없으면 기존 누적 데이터 사용 (fallback)
                            const accumulatedVoltage = getAccumulatedVoltageDisplay(deviceNumber, testNumber, channelNumber);
                            
                            if (accumulatedVoltage && accumulatedVoltage !== '-.-' && accumulatedVoltage !== '') {
                              const voltageMatch = accumulatedVoltage.match(/^([\d.-]+)V$/);
                              if (voltageMatch) {
                                const voltageValue = parseFloat(voltageMatch[1]);
                                if (!isNaN(voltageValue)) {
                                  displayValue = Math.round(voltageValue).toString();
                                }
                              }
                            }
                          }
                          
                          return (
                            <td key={i} className="px-1 py-0 whitespace-nowrap text-center" style={{ fontSize: '16px', height: '31px' }}>
                              {displayValue}
                            </td>
                          );
                        } catch (error) {
                          console.error(`PowerTable: 측정값 ${i+1} 데이터 표시 오류:`, error);
                          return (
                            <td key={i} className="px-1 py-0 whitespace-nowrap text-center" style={{ fontSize: '16px', height: '31px', color: '#EF4444' }}>
                              ERROR
                            </td>
                          );
                        }
                      })}
                      
                      {/* A.Q.L 열 */}
                      {(() => {
                        const aqlResult = determineAQL(inputVoltage, productIndex);
                        return (
                          <td className="px-1 py-0 whitespace-nowrap text-center" style={{ 
                            fontSize: '16px', 
                            height: '31px',
                            color: aqlResult === 'NG' ? '#EF4444' : '#10B981',
                            fontWeight: 'bold'
                          }}>
                            {aqlResult}
                          </td>
                        );
                      })()}
                    </tr>
                  );
                });
              });
              
              return tableRows;
            })()}
          </tbody>
        </table>
      </div>
    </div>
  );
}
