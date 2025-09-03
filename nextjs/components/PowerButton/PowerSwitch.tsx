import React, { useState, useEffect } from 'react';

interface PowerSwitchProps {
  wsConnection?: WebSocket | null;
}

function PowerSwitch({ wsConnection }: PowerSwitchProps) {
  const [isOn, setIsOn] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isStopping, setIsStopping] = useState(false);

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
        } else if (message.includes('STOPPING - Processing stop request')) {
          // 중지 처리 중 상태
          setIsStopping(true);
          setErrorMessage('중지 처리중...');
          console.log('🔌 PowerSwitch: 중지 처리 중 상태 감지');
        } else if (message.includes('OFF - Machine running: false')) {
          setIsOn(false);
          setIsStopping(false);
          setErrorMessage(null); // 에러 메시지 초기화
          
          // 파워스위치 OFF 시 즉시 UI 업데이트
          console.log('🔌 PowerSwitch: 파워스위치 OFF 상태 감지 - UI 즉시 업데이트');
        } else if (message.includes('STATUS - Machine running: true')) {
          setIsOn(true);
          setErrorMessage(null); // 에러 메시지 초기화
        } else if (message.includes('STATUS - Machine running: false')) {
          setIsOn(false);
          setErrorMessage(null); // 에러 메시지 초기화
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
        } else if (message.includes('PROCESS_STOPPED:')) {
          setIsOn(false);
          setErrorMessage(null);
        } else if (message.includes('Process stop requested')) {
          // 프로세스 중지 요청 감지
          setIsOn(false);
          setErrorMessage('프로세스 중지 요청됨 - 안전하게 종료 중...');
          
          // 5초 후 메시지 제거
          setTimeout(() => {
            setErrorMessage(null);
          }, 5000);
        } else if (message.includes('Error: Power switch failed')) {
          // 파워스위치 에러 처리 - 더 사용자 친화적인 메시지로 변경
          setIsOn(false);
          setErrorMessage('파워스위치 상태 변경 중 오류가 발생했습니다');
          
          // 5초 후 메시지 제거
          setTimeout(() => {
            setErrorMessage(null);
          }, 5000);
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
    
    // OFF로 변경할 때 중지 처리 중 상태로 설정
    if (!newState && isOn) {
      setIsStopping(true);
      setErrorMessage('중지 처리중...');
    } else {
      setIsOn(newState);
      setIsStopping(false);
      setErrorMessage(null); // 클릭 시 에러 메시지 초기화
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
    </div>
  );
}

export default PowerSwitch;