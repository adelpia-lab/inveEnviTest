import React, { useState, useEffect } from 'react';
import { z } from 'zod';
import { Button, Switch, Typography } from '@mui/material';

// Zod 스키마 정의
const highTempSchema = z.object({
  highTemp: z.boolean(), // 새 토글 항목
  targetTemp: z.number().min(50).max(99),
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
  // localStorage에서 저장된 값을 가져오거나 기본값 사용
  const getStoredHighTempSettings = (): HighTempSetting => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('highTempSettings');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          const result = highTempSchema.safeParse(parsed);
          if (result.success) {
            // console.log('💾 Loaded high temp settings from localStorage:', parsed);
            return parsed;
          }
        } catch (error) {
          // console.error('Failed to parse stored high temp settings:', error);
        }
      }
    }
    // 기본값 - highTemp off 상태
    const defaultSettings: HighTempSetting = {
      highTemp: false, // 새 토글 항목, 기본값 false
      targetTemp: 75,
      waitTime: 200,
      readCount: 10,
    };
    // console.log('💾 Using default high temp settings:', defaultSettings);
    return defaultSettings;
  };

  // UI 토글 상태 (렌더링용, 저장X)
  const [isHighTempEnabled, setIsHighTempEnabled] = useState(false); // 항상 false로 시작
  const [form, setForm] = useState<HighTempSetting>(() => {
    const initialSettings = getStoredHighTempSettings();
    return initialSettings;
  });
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false); // 초기값을 false로 변경
  const [isSaved, setIsSaved] = useState(false);

  // 컴포넌트 마운트 시 저장된 값 로드 및 백엔드에서 설정 가져오기
  useEffect(() => {
    // console.log("🚀 HighTempSettingPanel component mounting - waiting for server initial state...");
    // console.log("🔌 WebSocket connection provided:", wsConnection ? 'Yes' : 'No');
    
    // 먼저 localStorage에서 임시로 로드
    const storedSettings = getStoredHighTempSettings();
    // console.log("💾 Loaded high temp settings from localStorage as fallback:", storedSettings);
    
    // 고온 측정 선택을 강제로 off 상태로 설정
    const safeSettings = {
      ...storedSettings,
      highTemp: false // 강제로 off 상태로 설정
    };
    // console.log('🔄 Setting initial high temp settings with forced off state:', safeSettings);
    setForm(safeSettings);
    
    // 서버에서 자동으로 초기 상태를 전송하므로 로딩 상태만 설정
    if (wsConnection) {
      // console.log("🔌 WebSocket readyState:", wsConnection.readyState);
      if (wsConnection.readyState === WebSocket.OPEN) {
        // console.log('🔌 WebSocket connected, waiting for initial high temp settings from server...');
        setIsLoading(true);
        
        // 5초 후에도 응답이 없으면 로딩 상태 해제
        setTimeout(() => {
          setIsLoading(false);
          // console.log('⏰ Timeout reached, using localStorage data');
        }, 5000);
      } else if (wsConnection.readyState === WebSocket.CONNECTING) {
        // console.log('🔌 WebSocket connecting, waiting for connection...');
        setIsLoading(true);
        
        // 연결 대기 중에도 5초 타임아웃 설정
        setTimeout(() => {
          setIsLoading(false);
          // console.log('⏰ Connection timeout, using localStorage data');
        }, 5000);
      } else {
        // console.log('❌ WebSocket not ready, using localStorage data only');
        // console.log('❌ WebSocket readyState:', wsConnection.readyState);
        setIsLoading(false);
      }
    } else {
      // console.log('❌ No WebSocket connection available, using localStorage data only');
      setIsLoading(false);
    }
  }, [wsConnection]);

  // WebSocket 메시지 리스너 설정
  useEffect(() => {
    if (!wsConnection) {
      // console.log("❌ HighTempSettingPanel: No WebSocket connection available");
      return;
    }

    // console.log("🔌 HighTempSettingPanel: Setting up WebSocket message listener for high temp settings");

    const handleMessage = (event) => {
      const message = event.data;
      // console.log("📥 HighTempSettingPanel received WebSocket message:", message);
      
      // 서버에서 초기 고온 설정 응답 처리 (연결 시 자동 전송)
      if (typeof message === 'string' && message.startsWith('Initial high temp settings:')) {
        // console.log("📥 Processing initial high temp settings message from server");
        // console.log("📥 Raw message:", message);
        
        try {
          const match = message.match(/Initial high temp settings: (.*)/);
          if (match && match[1]) {
            // console.log("📥 Extracted JSON string:", match[1]);
            const initialSettings = JSON.parse(match[1]);
            // console.log('📥 Parsed initial settings:', initialSettings);
            
            const result = highTempSchema.safeParse(initialSettings);
            if (result.success) {
              // console.log('📥 Received valid initial high temp settings from server:', initialSettings);
              
              // 서버에서 받은 초기 데이터로 상태 업데이트 (고온 측정 선택은 강제로 off)
              const safeServerSettings = {
                ...initialSettings,
                highTemp: false // 서버 데이터도 강제로 off 상태로 설정
              };
              // console.log('🔄 Setting form to server data with forced off state:', safeServerSettings);
              setForm(safeServerSettings);
              
              // localStorage에도 저장 (고온 측정 선택은 강제로 off)
              if (typeof window !== 'undefined') {
                localStorage.setItem('highTempSettings', JSON.stringify(safeServerSettings));
                // console.log('💾 Updated localStorage with forced off state:', safeServerSettings);
              }
              
              // 로딩 상태 해제
              setIsLoading(false);
              // console.log('✅ Initial high temp settings loaded successfully from server');
            } else {
              // console.log('❌ Server returned invalid high temp settings, using default');
              setIsLoading(false);
            }
          } else {
            // console.log('❌ No initial high temp settings found on server, using default');
            setIsLoading(false);
          }
        } catch (error) {
          // console.error('❌ Failed to parse initial high temp settings from server:', error);
          // console.error('❌ Error details:', error.message);
          setIsLoading(false);
        }
      }
      
      // 고온 설정 저장 확인 응답 처리
      if (typeof message === 'string' && message.startsWith('High temp settings saved:')) {
        // console.log("✅ Processing high temp settings saved confirmation from server");
        try {
          const match = message.match(/High temp settings saved: (.*)/);
          if (match && match[1]) {
            const savedSettings = JSON.parse(match[1]);
            // console.log('✅ High temp settings successfully saved to server:', savedSettings);
            setIsSaved(true);
            // 3초 후 저장 상태 리셋
            setTimeout(() => {
              setIsSaved(false);
            }, 3000);
          }
        } catch (error) {
          // console.error('❌ Failed to parse high temp settings saved response from server:', error);
        }
      }
      
      // 에러 메시지 처리
      if (typeof message === 'string' && message.startsWith('Error:')) {
        // console.error('Server returned error:', message);
      }
    };

    wsConnection.addEventListener('message', handleMessage);
    
    return () => {
      // console.log("HighTempSettingPanel: Removing WebSocket message listener");
      wsConnection.removeEventListener('message', handleMessage);
    };
  }, [wsConnection]);

  // form 상태 변화 추적
  useEffect(() => {
    // console.log('🔄 Form state changed:', form);
    // console.log('🔄 isHighTempEnabled:', isHighTempEnabled);
    // console.log('🔄 isLoading:', isLoading);
    // console.log('🔄 SAVE button disabled:', !isHighTempEnabled || isLoading);
  }, [form, isLoading, isHighTempEnabled]);

  // 토글 스위치 핸들러 (UI용)
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

  const handleSave = () => {
    // 저장 시 highTemp만 저장, isHighTempEnabled는 저장X
    const result = highTempSchema.safeParse(form);
    if (!result.success) {
      setError('입력값을 확인하세요.');
      return;
    }
    setError(null);
    // 1. localStorage에 저장
    if (typeof window !== 'undefined') {
      localStorage.setItem('highTempSettings', JSON.stringify(form));
    }
    // 2. 서버에 저장
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
      try {
        const message = `[SAVE_HIGH_TEMP_SETTINGS] ${JSON.stringify(form)}`;
        wsConnection.send(message);
      } catch (error) {
        // console.error('❌ Failed to send message to server:', error);
        // console.warn('❌ WebSocket connection may be unstable');
        
        // 연결 상태 재확인
        if (wsConnection) {
          // console.warn('❌ Current WebSocket state:', wsConnection.readyState);
          // console.warn('❌ WebSocket readyState values: CONNECTING=0, OPEN=1, CLOSING=2, CLOSED=3');
        }
      }
    } else {
      // console.warn('❌ WebSocket not connected - cannot save to server');
      // console.warn('❌ WebSocket state:', wsConnection ? wsConnection.readyState : 'No connection');
      // console.warn('❌ WebSocket readyState values: CONNECTING=0, OPEN=1, CLOSING=2, CLOSED=3');
      
      // 연결이 끊어진 경우 재연결 시도 안내
      if (wsConnection && wsConnection.readyState === WebSocket.CLOSED) {
        // console.warn('❌ WebSocket connection is closed. Please refresh the page to reconnect.');
      }
    }
    
    // 3. 상위 컴포넌트 콜백 호출
    onSave?.(form);
    // console.log("📋 HighTempSettingPanel: Settings saved successfully");
    
    // 4. 저장 상태 표시
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
        {/* 고온 측정토글 - 고온측정설정이 true일 때만 활성화 */}
        <span className="font-medium px-2 py-1" style={{ fontSize: '1.2rem' }}>고온측정</span>
        <Switch
          checked={form.highTemp}
          onChange={e => handleChange('highTemp', e.target.checked)}
          disabled={!isHighTempEnabled}
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
        <span className="font-medium px-2 py-1 mb-2" style={{ fontSize: '1.2rem' }}>고온 설정</span>
        <input
          type="number"
          className="text-right border border-gray-400 rounded px-1 py-0.5 focus:outline-none focus:ring-2 focus:ring-purple-400"
          value={form.targetTemp}
          min={50}
          max={99}
          onChange={e => handleChange('targetTemp', Number(e.target.value))}
          disabled={!isHighTempEnabled}
          style={{ fontSize: '1.5rem', width: '80px', minWidth: '80px', maxWidth: '80px' }}
        />
        <span style={{ fontSize: '1.2rem' }}>℃</span>
      </div>

      {/* 대기 시간 */}
      <div className="flex items-center w-full justify-between mb-2">
        <span className="font-medium px-2 py-1" style={{ fontSize: '1.2rem' }}>대기 시간</span>
        <input
            type="number"
            className="text-right border border-gray-400 rounded px-1 py-0.5 focus:outline-none focus:ring-2 focus:ring-purple-400"
            value={form.waitTime}
            min={1}
            max={999}
            onChange={e => handleChange('waitTime', Number(e.target.value))}
            disabled={!isHighTempEnabled}
            style={{ fontSize: '1.5rem', width: '80px', minWidth: '80px', maxWidth: '80px' }}
        />
          <span style={{ fontSize: '1.2rem' }}>분</span>
      </div>

      {/* 읽기 횟수 */}
      <div className="flex items-center w-full justify-between mb-2">
      <span className="font-medium px-2 py-1" style={{ fontSize: '1.2rem' }}>ON/OFF</span>
          <input
            type="number"
            className="text-right border border-gray-400 rounded px-1 py-0.5 focus:outline-none focus:ring-2 focus:ring-purple-400"
            value={form.readCount}
            min={1}
            max={10}
            onChange={e => handleChange('readCount', Number(e.target.value))}
            disabled={!isHighTempEnabled} 
            style={{ fontSize: '1.5rem', width: '80px', minWidth: '80px', maxWidth: '80px' }}
            />
          <span style={{ fontSize: '1.2rem' }}>회</span>
    </div>

    {/* 상태 메시지 */}
    <div className="flex items-center justify-center mb-2">
      {isLoading && (
        <Typography 
          variant="caption" 
          color="info.main" 
          sx={{ fontSize: '0.8rem' }}
        >
          로딩 중...
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
    
    {/* SAVE 버튼 */}
    <Button
      variant="outlined" 
      onClick={handleSave}
      size="large"
      sx={{ 
        width: '120px',
        opacity: (!isHighTempEnabled || isLoading) ? 0.3 : 1, // 더 투명하게
        cursor: (!isHighTempEnabled || isLoading) ? 'not-allowed' : 'pointer',
        backgroundColor: (!isHighTempEnabled || isLoading) ? '#e0e0e0' : 'transparent', // 더 회색으로
        color: (!isHighTempEnabled || isLoading) ? '#666' : 'inherit', // 더 어둡게
        pointerEvents: (!isHighTempEnabled || isLoading) ? 'none' : 'auto' // 클릭 완전 차단
      }}
      disabled={!isHighTempEnabled || isLoading} 
    >
      SAVE
    </Button>
  </div>
);
} 