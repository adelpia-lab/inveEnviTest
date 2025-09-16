'use client';

import React, { useState, useEffect } from 'react';

interface TimeModePopupProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (timeValues: Record<string, string>) => void;
  wsConnection?: WebSocket | null;
}

const TimeModePopup: React.FC<TimeModePopupProps> = ({ isOpen, onClose, onSave, wsConnection }) => {
  const [timeValues, setTimeValues] = useState({
    T1: '',
    T2: '',
    T3: '',
    T4: '',
    T5: '',
    T6: '',
    T7: '',
    T8: ''
  });
  const [isLoading, setIsLoading] = useState(false);

  // 컴포넌트 마운트 시 localStorage에서 초기값 로드
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('timeModeSettings');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          console.log('TimeModePopup: localStorage에서 TimeMode 설정 로드:', parsed);
          setTimeValues({
            T1: parsed.T1 ? String(parsed.T1) : '',
            T2: parsed.T2 ? String(parsed.T2) : '',
            T3: parsed.T3 ? String(parsed.T3) : '',
            T4: parsed.T4 ? String(parsed.T4) : '',
            T5: parsed.T5 ? String(parsed.T5) : '',
            T6: parsed.T6 ? String(parsed.T6) : '',
            T7: parsed.T7 ? String(parsed.T7) : '',
            T8: parsed.T8 ? String(parsed.T8) : ''
          });
        } catch (error) {
          console.error('TimeModePopup: localStorage 파싱 실패:', error);
        }
      }
    }
  }, []);

  // WebSocket 메시지 수신 처리 (다른 컴포넌트들과 같은 패턴)
  useEffect(() => {
    if (!wsConnection) return;

    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      
      // TimeMode 데이터 수신
      if (typeof message === 'string' && message.startsWith('[TIME_MODE_DATA]')) {
        try {
          const match = message.match(/\[TIME_MODE_DATA\] (.*)/);
          if (match && match[1]) {
            const serverData = JSON.parse(match[1]);
            console.log('TimeModePopup: 서버에서 TimeMode 데이터 수신:', serverData);
            
            const newTimeValues = {
              T1: serverData.T1 ? String(serverData.T1) : '',
              T2: serverData.T2 ? String(serverData.T2) : '',
              T3: serverData.T3 ? String(serverData.T3) : '',
              T4: serverData.T4 ? String(serverData.T4) : '',
              T5: serverData.T5 ? String(serverData.T5) : '',
              T6: serverData.T6 ? String(serverData.T6) : '',
              T7: serverData.T7 ? String(serverData.T7) : '',
              T8: serverData.T8 ? String(serverData.T8) : ''
            };
            
            setTimeValues(newTimeValues);
            setIsLoading(false);
            console.log('TimeModePopup: TimeMode 데이터 업데이트 완료:', newTimeValues);
          }
        } catch (error) {
          console.error('TimeModePopup: TimeMode 데이터 파싱 실패:', error);
          setIsLoading(false);
        }
      }
    };

    wsConnection.addEventListener('message', handleMessage);

    return () => {
      wsConnection.removeEventListener('message', handleMessage);
    };
  }, [wsConnection]);

  // 팝업이 열릴 때 자동으로 서버에서 데이터 읽기
  useEffect(() => {
    if (isOpen && wsConnection && wsConnection.readyState === WebSocket.OPEN) {
      console.log('TimeModePopup: 팝업 열림 - 서버에서 TimeMode 데이터 자동 읽기');
      setIsLoading(true);
      
      try {
        wsConnection.send('[READ_TIME_MODE]');
        console.log('TimeModePopup: 서버에 TimeMode 읽기 요청 전송');
      } catch (error) {
        console.error('TimeModePopup: 자동 읽기 요청 실패:', error);
        setIsLoading(false);
      }
    }
  }, [isOpen, wsConnection]);

  // 디버깅 로그
  console.log('TimeModePopup render:', { isOpen });

  const handleInputChange = (key: string, value: string) => {
    setTimeValues(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSave = () => {
    onSave(timeValues);
    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  const handleRead = () => {
    console.log('TimeModePopup: READ 버튼 클릭 - 서버에서 데이터 읽기 시도');
    
    if (!wsConnection || wsConnection.readyState !== WebSocket.OPEN) {
      console.error('TimeModePopup: WebSocket 연결이 없거나 열려있지 않음');
      alert('서버 연결이 없습니다. WebSocket 연결을 확인해주세요.');
      return;
    }

    setIsLoading(true);
    console.log('TimeModePopup: 로딩 상태 활성화');
    
    try {
      wsConnection.send('[READ_TIME_MODE]');
      console.log('TimeModePopup: 서버에 TimeMode 읽기 요청 전송 성공');
    } catch (error) {
      console.error('TimeModePopup: 메시지 전송 실패:', error);
      setIsLoading(false);
      alert('메시지 전송에 실패했습니다.');
    }
  };

  if (!isOpen) {
    console.log('TimeModePopup: isOpen is false, not rendering');
    return null;
  }

  console.log('TimeModePopup: Rendering popup');

  return (
    <div 
      style={{ 
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100000
      }}
    >
      <div 
        style={{ 
          width: '1024px',
          height: '800px',
          backgroundColor: '#1f2937',
          borderRadius: '8px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid #374151'
        }}
      >
        {/* Background Image */}
        <div 
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundImage: 'url(/img/timeOp.png)',
            backgroundSize: '100% auto',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            opacity: 0.2,
            zIndex: 1
          }}
        />

        {/* Content Overlay */}
        <div 
          style={{ 
            position: 'relative',
            zIndex: 10,
            height: '100%',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {/* Header */}
          <div 
            style={{ 
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '16px 24px',
              backgroundColor: 'rgba(31, 41, 55, 0.95)',
              borderBottom: '1px solid #4b5563',
              minHeight: '60px'
            }}
          >
            <h2 style={{ 
              fontSize: '20px',
              fontWeight: 'bold',
              color: '#f9fafb',
              margin: 0
            }}>
              Timer Mode 구간별 시간 설정
            </h2>
            <button
              onClick={handleCancel}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                fontSize: '24px',
                fontWeight: 'bold',
                color: '#9ca3af',
                cursor: 'pointer',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#374151';
                e.currentTarget.style.color = '#f3f4f6';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = '#9ca3af';
              }}
            >
              ×
            </button>
          </div>

          {/* Main Content Area - Time Inputs Only */}
          <div 
            style={{ 
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px',
              minHeight: '0',
              overflow: 'auto'
            }}
          >
            {/* Time Input Grid */}
            <div style={{ 
              display: 'grid',
              gridTemplateColumns: 'repeat(8, 1fr)',
              gap: '12px',
              width: '100%'
            }}>
              {Array.from({ length: 8 }, (_, index) => {
                const timeKey = `T${index + 1}`;
                return (
                  <div key={timeKey} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <label 
                      style={{ 
                        fontSize: '14px',
                        fontWeight: 'bold',
                        color: '#f9fafb',
                        marginBottom: '8px',
                        padding: '4px 12px',
                        backgroundColor: 'rgba(55, 65, 81, 0.8)',
                        borderRadius: '4px',
                        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.3)'
                      }}
                    >
                      {timeKey}
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="number"
                        value={timeValues[timeKey as keyof typeof timeValues]}
                        onChange={(e) => handleInputChange(timeKey, e.target.value)}
                        placeholder="분"
                        style={{
                          width: '80px',
                          height: '40px',
                          padding: '0 12px',
                          textAlign: 'center',
                          border: '2px solid #6b7280',
                          borderRadius: '8px',
                          backgroundColor: 'rgba(55, 65, 81, 0.8)',
                          color: '#f9fafb',
                          fontSize: '14px',
                          fontWeight: '500',
                          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.3)',
                          outline: 'none'
                        }}
                        onFocus={(e) => {
                          e.target.style.borderColor = '#60a5fa';
                        }}
                        onBlur={(e) => {
                          e.target.style.borderColor = '#6b7280';
                        }}
                        min="0"
                        step="1"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Instructions - Separate Area */}
          <div 
            style={{ 
              border: '2px solid #4b5563',
              borderRadius: '8px',
              padding: '16px',
              margin: '0 24px 50px 24px',
              backgroundColor: 'rgba(55, 65, 81, 0.8)',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.3)'
            }}
          >
            <h3 style={{ 
              fontSize: '16px',
              fontWeight: 'bold',
              color: '#60a5fa',
              marginBottom: '8px',
              margin: '0 0 8px 0'
            }}>사용 안내</h3>
            <ul style={{ 
              fontSize: '14px',
              color: '#93c5fd',
              margin: 0,
              paddingLeft: '16px'
            }}>
              <li style={{ marginBottom: '4px' }}>• T1~T8 구간별 시간을 분 단위로 입력하세요</li>
              <li style={{ marginBottom: '4px' }}>• Timer Mode로 동작할 때만 적용됩니다</li>
              <li> default : T1[10]: T2[105]: T3[240]: T4[110]: T5[240]: T6[110]: T7[50]: T8[20]</li>
            </ul>
          </div>

          {/* Footer with Buttons - Fixed at bottom */}
          <div 
            style={{ 
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '16px',
              padding: '24px',
              backgroundColor: 'rgba(31, 41, 55, 0.95)',
              borderTop: '1px solid #4b5563',
              minHeight: '80px',
              position: 'relative',
              zIndex: 20,
              boxShadow: '0 -4px 6px -1px rgba(0, 0, 0, 0.3)'
            }}
          >
            {/* Left side - READ button */}
            <button
              onClick={handleRead}
              disabled={isLoading}
              style={{
                padding: '12px 24px',
                backgroundColor: isLoading ? '#6b7280' : '#10b981',
                color: 'white',
                borderRadius: '8px',
                border: 'none',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
                fontSize: '16px',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.3)',
                transition: 'all 0.2s',
                opacity: isLoading ? 0.6 : 1
              }}
              onMouseEnter={(e) => {
                if (!isLoading) {
                  e.currentTarget.style.backgroundColor = '#059669';
                }
              }}
              onMouseLeave={(e) => {
                if (!isLoading) {
                  e.currentTarget.style.backgroundColor = '#10b981';
                }
              }}
            >
              {isLoading ? '읽는 중...' : 'READ'}
            </button>

            {/* Right side - CANCEL and SAVE buttons */}
            <div style={{ display: 'flex', gap: '16px' }}>
              <button
                onClick={handleCancel}
                style={{
                  padding: '12px 32px',
                  border: '2px solid #6b7280',
                  color: '#f3f4f6',
                  borderRadius: '8px',
                  backgroundColor: '#374151',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '16px',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.3)',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#4b5563';
                  e.currentTarget.style.borderColor = '#9ca3af';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#374151';
                  e.currentTarget.style.borderColor = '#6b7280';
                }}
              >
                CANCEL
              </button>
              <button
                onClick={handleSave}
                style={{
                  padding: '12px 32px',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '16px',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.3)',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#2563eb';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#3b82f6';
                }}
              >
                SAVE
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TimeModePopup;
