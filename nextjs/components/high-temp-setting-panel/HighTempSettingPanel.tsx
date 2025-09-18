import React, { useState, useEffect } from 'react';
import { z } from 'zod';
import { Button, Switch, Typography } from '@mui/material';

// Zod 스키마 정의
const highTempSchema = z.object({
  highTemp: z.boolean(), // 새 토글 항목
  targetTemp: z.number().min(-99).max(99),
  waitTime: z.number().min(1).max(999),
  readCount: z.number().min(1).max(10),
});

type HighTempSetting = z.infer<typeof highTempSchema>;

/**
 * 고온 측정 설정 패널
 * @param onSave 저장 시 호출되는 콜백 (옵션)
 * @param wsConnection WebSocket 연결 객체
 */
export default function HighTempSettingPanel({ 
  onSave, 
  wsConnection 
}: { 
  onSave?: (data: HighTempSetting) => void;
  wsConnection?: WebSocket;
}) {
  // 기본값 설정 (서버에서 받을 때까지 사용)
  const defaultSettings: HighTempSetting = {
    highTemp: false,
    targetTemp: 75,
    waitTime: 200,
    readCount: 10,
  };

  // UI 토글 상태 (렌더링용, 저장X) - 항상 활성화
  const [isHighTempEnabled, setIsHighTempEnabled] = useState(true); // 항상 활성화
  const [form, setForm] = useState<HighTempSetting>(defaultSettings);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // 컴포넌트 마운트 시 서버에서 초기 설정 가져오기
  useEffect(() => {
    console.log("🚀 HighTempSettingPanel component mounting");
    console.log("🔌 WebSocket connection provided:", wsConnection ? 'Yes' : 'No');
    
    // 서버에서 자동으로 초기 상태를 전송하므로 대기
    if (wsConnection) {
      console.log("🔌 WebSocket readyState:", wsConnection.readyState);
      if (wsConnection.readyState === WebSocket.OPEN) {
        console.log('🔌 WebSocket connected, waiting for initial high temp settings from server...');
        
        // 서버에서 자동으로 초기 설정을 전송하므로 즉시 처리 가능
        // 5초 후에도 응답이 없으면 기본값 사용
        const timeoutId = setTimeout(() => {
          console.log('⏰ Timeout reached, using default settings');
        }, 5000);
        
        // 컴포넌트 언마운트 시 타임아웃 정리
        return () => clearTimeout(timeoutId);
      } else if (wsConnection.readyState === WebSocket.CONNECTING) {
        console.log('🔌 WebSocket connecting, waiting for connection...');
        
        // 연결 대기 중에도 5초 타임아웃 설정
        const timeoutId = setTimeout(() => {
          console.log('⏰ Connection timeout, using default settings');
        }, 5000);
        
        // 컴포넌트 언마운트 시 타임아웃 정리
        return () => clearTimeout(timeoutId);
      } else {
        console.log('❌ WebSocket not ready, using default settings');
        console.log('❌ WebSocket readyState:', wsConnection.readyState);
      }
    } else {
      console.log('❌ No WebSocket connection available, using default settings');
    }
  }, [wsConnection]);

  // WebSocket 메시지 리스너 설정
  useEffect(() => {
    if (!wsConnection) {
      console.log("❌ HighTempSettingPanel: No WebSocket connection available");
      return;
    }

    console.log("🔌 HighTempSettingPanel: Setting up WebSocket message listener for high temp settings");

    const handleMessage = (event) => {
      const message = event.data;
      
      // 고온 설정과 관련된 메시지만 처리
      if (typeof message === 'string' && (
        message.startsWith('Initial high temp settings:') ||
        message.startsWith('High temp settings read:') ||
        message.startsWith('High temp settings saved:') ||
        message.startsWith('Error:')
      )) {
        console.log("📥 HighTempSettingPanel received relevant WebSocket message:", message);
      } else {
        // 관련 없는 메시지는 즉시 무시
        return;
      }
      
      // 서버에서 초기 고온 설정 응답 처리 (연결 시 자동 전송)
      if (typeof message === 'string' && message.startsWith('Initial high temp settings:')) {
        console.log("📥 Processing initial high temp settings message from server");
        console.log("📥 Raw message:", message);
        
        try {
          const match = message.match(/Initial high temp settings: (.*)/);
          if (match && match[1]) {
            console.log("📥 Extracted JSON string:", match[1]);
            const initialSettings = JSON.parse(match[1]);
            console.log('📥 Parsed initial settings:', initialSettings);
            
            const result = highTempSchema.safeParse(initialSettings);
            if (result.success) {
              console.log('📥 Received valid initial high temp settings from server:', initialSettings);
              setForm(initialSettings);
              setIsInitialized(true);
              console.log('✅ Initial high temp settings loaded successfully from server');
            } else {
              console.log('❌ Server returned invalid high temp settings, using default');
            }
          } else {
            console.log('❌ No initial high temp settings found on server, using default');
          }
        } catch (error) {
          console.error('❌ Failed to parse initial high temp settings from server:', error);
          console.error('❌ Error details:', error.message);
        }
        return; // 처리 완료 후 종료
      }
      
      // READ 버튼으로 서버에서 설정 읽기 응답 처리
      if (typeof message === 'string' && message.startsWith('High temp settings read:')) {
        console.log("📥 Processing high temp settings read response from server");
        try {
          const match = message.match(/High temp settings read: (.*)/);
          if (match && match[1]) {
            const readSettings = JSON.parse(match[1]);
            console.log('📥 Received high temp settings from server:', readSettings);
            
            const result = highTempSchema.safeParse(readSettings);
            if (result.success) {
              setForm(readSettings);
              setIsReading(false);
              console.log('✅ High temp settings loaded successfully from server');
            } else {
              console.log('❌ Server returned invalid high temp settings');
              setIsReading(false);
            }
          }
        } catch (error) {
          console.error('❌ Failed to parse high temp settings read response from server:', error);
          setIsReading(false);
        }
        return; // 처리 완료 후 종료
      }
      
      // 고온 설정 저장 확인 응답 처리
      if (typeof message === 'string' && message.startsWith('High temp settings saved:')) {
        console.log("✅ Processing high temp settings saved confirmation from server");
        try {
          const match = message.match(/High temp settings saved: (.*)/);
          if (match && match[1]) {
            const savedSettings = JSON.parse(match[1]);
            console.log('✅ High temp settings successfully saved to server:', savedSettings);
            setIsSaved(true);
            // 3초 후 저장 상태 리셋
            setTimeout(() => {
              setIsSaved(false);
            }, 3000);
          }
        } catch (error) {
          console.error('❌ Failed to parse high temp settings saved response from server:', error);
        }
        return; // 처리 완료 후 종료
      }
      
      // 에러 메시지 처리
      if (typeof message === 'string' && message.startsWith('Error:')) {
        console.error('Server returned error:', message);
        setError(message.replace('Error:', '').trim());
        setTimeout(() => setError(null), 5000);
        return; // 처리 완료 후 종료
      }
      
      // 처리되지 않은 메시지는 로그로만 기록
      console.log('🔌 HighTempSettingPanel: 처리되지 않은 메시지 (무시):', message);
    };

    wsConnection.addEventListener('message', handleMessage);
    
    return () => {
      console.log("HighTempSettingPanel: Removing WebSocket message listener");
      wsConnection.removeEventListener('message', handleMessage);
    };
  }, [wsConnection]);

  // form 상태 변화 추적
  useEffect(() => {
    console.log('🔄 Form state changed:', form);
    console.log('🔄 isHighTempEnabled:', isHighTempEnabled);
  }, [form, isHighTempEnabled]);

  // 토글 스위치 핸들러 (UI용) - 항상 활성화 상태 유지
  const handleHighTempToggle = (checked: boolean) => {
    setIsHighTempEnabled(checked);
  };

  // 기존 handleChange는 highTemp 등 저장용 항목만 처리
  const handleChange = (key: keyof HighTempSetting, value: any) => {
    setForm((prev) => {
      const newForm = { ...prev, [key]: value };
      return newForm;
    });
  };

  // READ 버튼 핸들러 - 서버에서 설정 읽기
  const handleRead = () => {
    if (!wsConnection || wsConnection.readyState !== WebSocket.OPEN) {
      console.warn('❌ WebSocket not connected - cannot read from server');
      setError('WebSocket 연결이 없습니다. 페이지를 새로고침하세요.');
      return;
    }

    setIsReading(true);
    setError(null);
    
    try {
      const message = `[READ_HIGH_TEMP_SETTINGS]`;
      wsConnection.send(message);
      console.log('📤 Sent READ_HIGH_TEMP_SETTINGS command to server');
    } catch (error) {
      console.error('❌ Failed to send READ command to server:', error);
      setIsReading(false);
      setError('서버와의 통신에 실패했습니다.');
    }
  };

  const handleSave = () => {
    // 저장 시 highTemp만 저장, isHighTempEnabled는 저장X
    const result = highTempSchema.safeParse(form);
    if (!result.success) {
      setError('입력값을 확인하세요.');
      return;
    }
    setError(null);
    
    // 서버에 저장
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
      try {
        const message = `[SAVE_HIGH_TEMP_SETTINGS] ${JSON.stringify(form)}`;
        wsConnection.send(message);
        console.log('📤 Sent high temp settings to server:', form);
      } catch (error) {
        console.error('❌ Failed to send message to server:', error);
        console.warn('❌ WebSocket connection may be unstable');
        
        // 연결 상태 재확인
        if (wsConnection) {
          console.warn('❌ Current WebSocket state:', wsConnection.readyState);
          console.warn('❌ WebSocket readyState values: CONNECTING=0, OPEN=1, CLOSING=2, CLOSED=3');
        }
      }
    } else {
      console.warn('❌ WebSocket not connected - cannot save to server');
      console.warn('❌ WebSocket state:', wsConnection ? wsConnection.readyState : 'No connection');
      console.warn('❌ WebSocket readyState values: CONNECTING=0, OPEN=1, CLOSING=2, CLOSED=3');
      
      // 연결이 끊어진 경우 재연결 시도 안내
      if (wsConnection && wsConnection.readyState === WebSocket.CLOSED) {
        console.warn('❌ WebSocket connection is closed. Please refresh the page to reconnect.');
      }
    }
    
    // 상위 컴포넌트 콜백 호출
    onSave?.(form);
    console.log("📋 HighTempSettingPanel: Settings saved successfully");
    
    // 저장 상태 표시
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  return (
    <div
      className="w-[260px] h-[240px] bg-white rounded-xl shadow flex flex-col items-center justify-between p-3 box-border text-gray-800"
      style={{ fontFamily: 'inherit', marginTop: '15px', marginLeft: '5px' }}
    >
      <div className="flex items-center w-full justify-between mb-2">
        <span className="font-medium px-2 py-1" style={{ fontSize: '1.5rem' }}>고온측정설정 </span>
        <Switch
          checked={isHighTempEnabled}
          onChange={e => handleHighTempToggle(e.target.checked)}
          sx={{
            '& .MuiSwitch-switchBase.Mui-checked': {
              color: '#9333ea',
              '&:hover': { backgroundColor: 'rgba(147, 51, 234, 0.08)' },
            },
            '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
              backgroundColor: '#9333ea',
            },
          }}
        />
      </div>
  
  
      <div className="flex items-center w-full justify-between mb-2 gap-2">
        {/* 고온 측정토글 - 저장된 상태 표시 */}
        <span className="font-medium px-2 py-1" style={{ fontSize: '1.2rem' }}>고온측정</span>
        <Switch
          key={`high-temp-switch-${form.highTemp}`}
          checked={Boolean(form.highTemp)}
          onChange={e => handleChange('highTemp', e.target.checked)}
          sx={{
            '& .MuiSwitch-switchBase.Mui-checked': {
              color: '#9333ea',
              '&:hover': { backgroundColor: 'rgba(147, 51, 234, 0.08)' },
            },
            '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
              backgroundColor: '#9333ea',
            },
          }}
        />
      </div>
      {/* 고온 설정 */}
      <div className="flex items-center w-full justify-between mb-2 gap-2">
        <span className="font-medium px-2 py-1 mb-2" style={{ fontSize: '1.1rem' }}>고온 설정</span>
        <input
          type="number"
          className="text-right border border-gray-400 rounded px-1 py-0.5 focus:outline-none focus:ring-2 focus:ring-purple-400"
          value={form.targetTemp}
          min={-99}
          max={99}
          onChange={e => handleChange('targetTemp', Number(e.target.value))}
          disabled={!isHighTempEnabled}
          style={{ fontSize: '1.3rem', width: '80px', minWidth: '80px', maxWidth: '80px', height: 'calc(100% - 2px)' }}
        />
        <span style={{ fontSize: '1.1rem' }}>℃</span>
      </div>

      {/* 대기 시간 */}
      <div className="flex items-center w-full justify-between mb-2">
        <span className="font-medium px-2 py-1" style={{ fontSize: '1.1rem' }}>대기 시간</span>
        <input
            type="number"
            className="text-right border border-gray-400 rounded px-1 py-0.5 focus:outline-none focus:ring-2 focus:ring-purple-400"
            value={form.waitTime}
            min={1}
            max={999}
            onChange={e => handleChange('waitTime', Number(e.target.value))}
            disabled={!isHighTempEnabled}
            style={{ fontSize: '1.3rem', width: '80px', minWidth: '80px', maxWidth: '80px', height: 'calc(100% - 2px)' }}
        />
          <span style={{ fontSize: '1.1rem' }}>분</span>
      </div>

      {/* 읽기 횟수 */}
      <div className="flex items-center w-full justify-between mb-2">
      <span className="font-medium px-2 py-1" style={{ fontSize: '1.1rem' }}>ON/OFF</span>
          <input
            type="number"
            className="text-right border border-gray-400 rounded px-1 py-0.5 focus:outline-none focus:ring-2 focus:ring-purple-400"
            value={form.readCount}
            min={1}
            max={10}
            onChange={e => handleChange('readCount', Number(e.target.value))}
            disabled={!isHighTempEnabled} 
            style={{ fontSize: '1.3rem', width: '80px', minWidth: '80px', maxWidth: '80px', height: 'calc(100% - 2px)' }}
            />
          <span style={{ fontSize: '1.1rem' }}>회</span>
    </div>

    {/* 상태 메시지 */}
    <div className="flex items-center justify-center mb-2">
      {!isInitialized && (
        <Typography 
          variant="caption" 
          color="info.main" 
          sx={{ fontSize: '0.8rem' }}
        >
          서버에서 설정 로드 중...
        </Typography>
      )}
      {isReading && (
        <Typography 
          variant="caption" 
          color="info.main" 
          sx={{ fontSize: '0.8rem' }}
        >
          서버에서 설정 읽는 중...
        </Typography>
      )}
      {isSaved && (
        <Typography 
          variant="caption" 
          color="success.main" 
          sx={{ fontSize: '0.8rem' }}
        >
          저장됨 ✓
        </Typography>
      )}
      {error && (
        <Typography 
          variant="caption" 
          color="error.main" 
          sx={{ fontSize: '0.8rem' }}
        >
          {error}
        </Typography>
      )}
    </div>
    
    {/* READ & SAVE 버튼 */}
    <div className="flex gap-2">
      <Button
        variant="outlined" 
        onClick={handleRead}
        size="large"
        disabled={isReading || !isHighTempEnabled}
        sx={{ 
          width: '60px',
          opacity: (isReading || !isHighTempEnabled) ? 0.3 : 1,
          cursor: (isReading || !isHighTempEnabled) ? 'not-allowed' : 'pointer',
          backgroundColor: (isReading || !isHighTempEnabled) ? '#e0e0e0' : 'transparent',
          color: (isReading || !isHighTempEnabled) ? '#666' : 'inherit',
          pointerEvents: (isReading || !isHighTempEnabled) ? 'none' : 'auto'
        }}
      >
        READ
      </Button>
      <Button
        variant="outlined" 
        onClick={handleSave}
        size="large"
        sx={{ 
          width: '60px',
          opacity: (isLoading || !isHighTempEnabled) ? 0.3 : 1,
          cursor: (isLoading || !isHighTempEnabled) ? 'not-allowed' : 'pointer',
          backgroundColor: (isLoading || !isHighTempEnabled) ? '#e0e0e0' : 'transparent',
          color: (isLoading || !isHighTempEnabled) ? '#666' : 'inherit',
          pointerEvents: (isLoading || !isHighTempEnabled) ? 'none' : 'auto'
        }}
        disabled={isLoading || !isHighTempEnabled} 
      >
        SAVE
      </Button>
    </div>
  </div>
);
} 