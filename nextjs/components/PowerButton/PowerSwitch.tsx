import React, { useState, useEffect } from 'react';
import MeasurementStopConfirm from '../MeasurementStopConfirm/MeasurementStopConfirm';
import TestCompleteModal from '../TestCompleteModal/TestCompleteModal';

interface PowerSwitchProps {
  wsConnection?: WebSocket | null;
}

function PowerSwitch({ wsConnection }: PowerSwitchProps) {
  const [isOn, setIsOn] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isStopping, setIsStopping] = useState(false);
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [isMeasurementActive, setIsMeasurementActive] = useState(false);
  const [showTestCompleteModal, setShowTestCompleteModal] = useState(false);
  const [testCompleteData, setTestCompleteData] = useState({
    testType: '환경 시험',
    cycleCount: 0,
    completionTime: ''
  });

  // WebSocket 메시지 수신 처리
  useEffect(() => {
    if (!wsConnection) return;

    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      
      // Power switch 상태 메시지 처리
      if (typeof message === 'string' && message.includes('[POWER_SWITCH]')) {
        if (message.includes('ON - Machine running: true')) {
          setIsOn(true);
          setIsStopping(false);
          setErrorMessage(null); // 에러 메시지 초기화
          setIsMeasurementActive(true); // 측정 시작
        } else if (message.includes('STOPPING - Processing stop request')) {
          // 중지 처리 중 상태
          setIsStopping(true);
          setErrorMessage('중지 처리중...');
          console.log('🔌 PowerSwitch: 중지 처리 중 상태 감지');
        } else if (message.includes('OFF - Machine running: false')) {
          setIsOn(false);
          setIsStopping(false);
          setErrorMessage(null); // 에러 메시지 초기화
          setIsMeasurementActive(false); // 측정 중단
          
          // 파워스위치 OFF 시 즉시 UI 업데이트
          console.log('🔌 PowerSwitch: 파워스위치 OFF 상태 감지 - UI 즉시 업데이트');
          
          // 테스트 완료로 인한 OFF인지 확인
          if (message.includes('Test completed')) {
            console.log('🎉 PowerSwitch: 테스트 완료로 인한 파워스위치 OFF 감지');
            // 테스트 완료 모달은 별도 메시지에서 처리
          }
        } else if (message.includes('STATUS - Machine running: true')) {
          setIsOn(true);
          setErrorMessage(null); // 에러 메시지 초기화
          setIsMeasurementActive(true); // 측정 시작
        } else if (message.includes('STATUS - Machine running: false')) {
          setIsOn(false);
          setErrorMessage(null); // 에러 메시지 초기화
          setIsMeasurementActive(false); // 측정 중단
        } else if (message.includes('PROCESS_ERROR:')) {
          // 프로세스 에러 처리
          const errorMatch = message.match(/PROCESS_ERROR: (.+)/);
          if (errorMatch) {
            const errorMsg = errorMatch[1];
            setErrorMessage(errorMsg);
            setIsOn(false); // 에러 발생 시 OFF 상태로 변경
            
            // 10초 후 에러 메시지 자동 제거
            setTimeout(() => {
              setErrorMessage(null);
            }, 10000);
          }
        } else if (message.includes('PROCESS_COMPLETED')) {
          setIsOn(false);
          setErrorMessage(null);
          setIsMeasurementActive(false); // 측정 완료
        } else if (message.includes('PROCESS_STOPPED:')) {
          setIsOn(false);
          setErrorMessage(null);
          setIsMeasurementActive(false); // 측정 중단
        } else if (message.includes('Process stop requested')) {
          // 프로세스 중지 요청 감지
          setIsOn(false);
          setErrorMessage('프로세스 중지 요청됨 - 안전하게 종료 중...');
          setIsMeasurementActive(false); // 측정 중단
          
          // 5초 후 메시지 제거
          setTimeout(() => {
            setErrorMessage(null);
          }, 5000);
        } else if (message.includes('Error: Power switch failed')) {
          // 파워스위치 에러 처리 - 더 사용자 친화적인 메시지로 변경
          setIsOn(false);
          setErrorMessage('파워스위치 상태 변경 중 오류가 발생했습니다');
          setIsMeasurementActive(false); // 측정 중단
          
          // 5초 후 메시지 제거
          setTimeout(() => {
            setErrorMessage(null);
          }, 5000);
        }
      }
      
      // 측정 중단 확인을 위한 추가 메시지 처리
      if (typeof message === 'string' && message.includes('[MEASUREMENT_STATUS]')) {
        if (message.includes('STARTED')) {
          setIsMeasurementActive(true);
          console.log('🔌 PowerSwitch: 측정 시작 감지');
        } else if (message.includes('STOPPED') || message.includes('COMPLETED')) {
          setIsMeasurementActive(false);
          console.log('🔌 PowerSwitch: 측정 중단/완료 감지');
        }
      }
      
      // 테스트 완료 데이터 메시지 처리
      if (typeof message === 'string' && message.includes('[TEST_COMPLETE_DATA]')) {
        try {
          const dataMatch = message.match(/\[TEST_COMPLETE_DATA\] (.+)/);
          if (dataMatch) {
            const data = JSON.parse(dataMatch[1]);
            console.log('🎉 PowerSwitch: 테스트 완료 데이터 수신:', data);
            
            setTestCompleteData({
              testType: data.testType || '환경 시험',
              cycleCount: data.cycleCount || 0,
              completionTime: data.completionTime ? new Date(data.completionTime).toLocaleString('ko-KR') : new Date().toLocaleString('ko-KR')
            });
            
            // 테스트 완료 모달 표시
            setShowTestCompleteModal(true);
          }
        } catch (error) {
          console.error('🔌 PowerSwitch: 테스트 완료 데이터 파싱 오류:', error);
        }
      }
    };

    wsConnection.addEventListener('message', handleMessage);
    
    return () => {
      wsConnection.removeEventListener('message', handleMessage);
    };
  }, [wsConnection]);

  const handleClick = () => {
    const newState = !isOn;
    
    // OFF로 변경할 때 측정이 진행 중이면 확인 팝업 표시
    if (!newState && isOn) {
      // 임시로 항상 팝업 표시 (테스트용)
      console.log('🔌 PowerSwitch: 측정 중단 확인 팝업 표시');
      setShowStopConfirm(true);
      return;
    }
    
    // ON으로 변경하거나 측정이 진행 중이 아닐 때는 바로 처리
    if (newState) {
      setIsOn(newState);
      setIsStopping(false);
      setErrorMessage(null);
      setIsMeasurementActive(true);
    } else {
      // OFF로 변경할 때 중지 처리 중 상태로 설정
      setIsStopping(true);
      setErrorMessage('중지 처리중...');
      setIsMeasurementActive(false);
    }
    
    // WebSocket 메시지 전송
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
      const message = `[POWER_SWITCH] ${newState ? 'ON' : 'OFF'}`;
      wsConnection.send(message);
      
      // 파워스위치가 ON될 때 전압 데이터 초기화 메시지 브로드캐스트
      if (newState) {
        const resetMessage = `[POWER_SWITCH] ON - Voltage data reset`;
        wsConnection.send(resetMessage);
      }
    }
  };

  // 측정 중단 확인 팝업의 YES 버튼 핸들러
  const handleConfirmStop = () => {
    console.log('🔌 PowerSwitch: YES (중단) 선택');
    setShowStopConfirm(false);
    
    // 측정 중단 처리
    setIsOn(false);
    setIsStopping(true);
    setErrorMessage('중지 처리중...');
    setIsMeasurementActive(false);
    
    // WebSocket 메시지 전송
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
      const message = `[POWER_SWITCH] OFF`;
      wsConnection.send(message);
    }
  };

  // 측정 중단 확인 팝업의 NO 버튼 핸들러
  const handleCancelStop = () => {
    console.log('🔌 PowerSwitch: NO (계속) 선택');
    setShowStopConfirm(false);
    // 팝업만 닫고 측정은 계속 진행
  };

  // 테스트 완료 모달 닫기 핸들러
  const handleCloseTestCompleteModal = () => {
    console.log('🎉 PowerSwitch: 테스트 완료 모달 닫기');
    setShowTestCompleteModal(false);
  };

  // 디버깅을 위한 상태 로그
  console.log('🔌 PowerSwitch: 렌더링 상태 - isOn:', isOn, 'showStopConfirm:', showStopConfirm, 'isMeasurementActive:', isMeasurementActive);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <button 
        onClick={handleClick} 
        style={{ 
          background: 'none', 
          border: 'none', 
          padding: 0, 
          cursor: 'pointer',
          width: '98%',
          height: '98%',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          overflow: 'hidden'
        }}
      >
        <img
          src={isOn ? '/img/powerOn.png' : '/img/powerOff.png'}
          alt="Power Button"
          style={{ 
            width: '100%', 
            height: '100%',
            objectFit: 'contain',
            opacity: isStopping ? 0.5 : 1,
            transition: 'opacity 0.3s ease'
          }}
        />
      </button>
      
      {/* 에러 메시지 및 중지 처리 중 메시지 표시 */}
      {errorMessage && (
        <div style={{
          position: 'absolute',
          top: '-60px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: isStopping ? '#ffa500' : '#ff4444',
          color: 'white',
          padding: '8px 12px',
          borderRadius: '6px',
          fontSize: '12px',
          maxWidth: '200px',
          textAlign: 'center',
          zIndex: 1000,
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          animation: isStopping ? 'blink 1s infinite' : 'none'
        }}>
          {isStopping ? '⏳' : '⚠️'} {errorMessage}
        </div>
      )}
      
      <style jsx>{`
        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0.3; }
        }
      `}</style>
      
      {/* 측정 중단 확인 팝업 */}
      {showStopConfirm && (
        <MeasurementStopConfirm
          isVisible={showStopConfirm}
          onConfirm={handleConfirmStop}
          onCancel={handleCancelStop}
        />
      )}
      
      {/* 테스트 완료 모달 */}
      {showTestCompleteModal && (
        <TestCompleteModal
          isVisible={showTestCompleteModal}
          onClose={handleCloseTestCompleteModal}
          testType={testCompleteData.testType}
          cycleCount={testCompleteData.cycleCount}
          completionTime={testCompleteData.completionTime}
        />
      )}
    </div>
  );
}

export default PowerSwitch;