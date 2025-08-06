import React, { useState, useEffect } from 'react';

interface PowerSwitchProps {
  wsConnection?: WebSocket | null;
}

function PowerSwitch({ wsConnection }: PowerSwitchProps) {
  const [isOn, setIsOn] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // WebSocket 메시지 수신 처리
  useEffect(() => {
    if (!wsConnection) return;

    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      
      // Power switch 상태 메시지 처리
      if (typeof message === 'string' && message.includes('[POWER_SWITCH]')) {
        if (message.includes('ON - Machine running: true')) {
          setIsOn(true);
          setErrorMessage(null); // 에러 메시지 초기화
          console.log('🔌 Power switch status synced: ON');
        } else if (message.includes('OFF - Machine running: false')) {
          setIsOn(false);
          setErrorMessage(null); // 에러 메시지 초기화
          console.log('🔌 Power switch status synced: OFF');
        } else if (message.includes('STATUS - Machine running: true')) {
          setIsOn(true);
          setErrorMessage(null); // 에러 메시지 초기화
          console.log('🔌 Power switch status synced from server: ON');
        } else if (message.includes('STATUS - Machine running: false')) {
          setIsOn(false);
          setErrorMessage(null); // 에러 메시지 초기화
          console.log('🔌 Power switch status synced from server: OFF');
        } else if (message.includes('PROCESS_ERROR:')) {
          // 프로세스 에러 처리
          const errorMatch = message.match(/PROCESS_ERROR: (.+)/);
          if (errorMatch) {
            const errorMsg = errorMatch[1];
            setErrorMessage(errorMsg);
            setIsOn(false); // 에러 발생 시 OFF 상태로 변경
            console.error('❌ Process error received:', errorMsg);
            
            // 10초 후 에러 메시지 자동 제거
            setTimeout(() => {
              setErrorMessage(null);
            }, 10000);
          }
        } else if (message.includes('PROCESS_COMPLETED')) {
          setIsOn(false);
          setErrorMessage(null);
          console.log('✅ Process completed successfully');
        } else if (message.includes('PROCESS_STOPPED:')) {
          setIsOn(false);
          setErrorMessage(null);
          console.log('🛑 Process stopped by user');
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
    setIsOn(newState);
    setErrorMessage(null); // 클릭 시 에러 메시지 초기화
    
    // WebSocket 메시지 전송
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
      const message = `[POWER_SWITCH] ${newState ? 'ON' : 'OFF'}`;
      wsConnection.send(message);
      console.log(`🔌 Power switch ${newState ? 'ON' : 'OFF'} - Message sent:`, message);
      
      // 파워스위치가 ON될 때 전압 데이터 초기화 메시지 브로드캐스트
      if (newState) {
        const resetMessage = `[POWER_SWITCH] ON - Voltage data reset`;
        wsConnection.send(resetMessage);
        console.log('🔌 Power switch ON - 전압 데이터 초기화 메시지 전송');
      }
    } else {
      console.warn('WebSocket connection not available for power switch');
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
            objectFit: 'contain'
          }}
        />
      </button>
      
      {/* 에러 메시지 표시 */}
      {errorMessage && (
        <div style={{
          position: 'absolute',
          top: '-60px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: '#ff4444',
          color: 'white',
          padding: '8px 12px',
          borderRadius: '6px',
          fontSize: '12px',
          maxWidth: '200px',
          textAlign: 'center',
          zIndex: 1000,
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
        }}>
          ⚠️ {errorMessage}
        </div>
      )}
    </div>
  );
}

export default PowerSwitch;