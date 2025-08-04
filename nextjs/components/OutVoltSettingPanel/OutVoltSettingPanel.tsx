import React, { useState, useEffect } from 'react';
import { Button, Switch } from '@mui/material';

const DEFAULT_VOLTAGES = [24.0, 18.0, 30.0, 0.0];

/**
 * 출력 전압 설정 패널 (배열 기반)
 * @param wsConnection WebSocket 인스턴스 (옵션)
 */
export default function OutVoltSettingPanel({ wsConnection }: { wsConnection?: WebSocket | null }) {
  // 입력 전압 값 4개를 배열로 관리
  const [voltages, setVoltages] = useState<number[]>(DEFAULT_VOLTAGES);
  // 토글 상태는 항상 false로 시작, 저장/로드/전송에서 제외
  const [isOutVoltEnabled, setIsOutVoltEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // 서버에서 배열 수신 시 input에 분배
  useEffect(() => {
    if (!wsConnection) return;
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.startsWith('Initial out volt settings: ')) {
        try {
          const arr = JSON.parse(message.replace('Initial out volt settings: ', ''));
          if (Array.isArray(arr) && arr.length === 4) {
            setVoltages(arr);
            setIsOutVoltEnabled(false); // 항상 false로 시작
          }
        } catch (e) {
          setVoltages(DEFAULT_VOLTAGES);
          setIsOutVoltEnabled(false);
        }
      } else if (message.startsWith('Out volt settings saved: ')) {
        setIsLoading(false);
        setError(null);
      } else if (message.startsWith('Error: ')) {
        setError(message.replace('Error: ', ''));
        setIsLoading(false);
      }
    };
    wsConnection.addEventListener('message', handleMessage);
    return () => wsConnection.removeEventListener('message', handleMessage);
  }, [wsConnection]);

  // 입력값 변경 핸들러
  const handleVoltageChange = (idx: number, value: number) => {
    setVoltages(prev => prev.map((v, i) => (i === idx ? value : v)));
  };

  // 저장 버튼 클릭 시 배열만 소켓 전송
  const handleSave = () => {
    // 값 검증: -30~30
    if (!voltages.every(v => typeof v === 'number' && v >= -30 && v <= 30)) {
      setError('입력값을 확인하세요.');
      return;
    }
    setError(null);
    setIsLoading(true);
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
      wsConnection.send(`[SAVE_OUT_VOLT_SETTINGS] ${JSON.stringify(voltages)}`);
    } else {
      setError('서버 연결이 없습니다.');
      setIsLoading(false);
    }
  };

  return (
    <div className="w-[260px] h-[240px] bg-white rounded-xl shadow flex flex-col items-center justify-between p-3 box-border text-gray-800" style={{ fontFamily: 'inherit', marginTop: '15px', marginLeft: '5px' }}>
      {/* 입력 전압 설정 + 토글 */}
      <div className="flex items-center w-full justify-between mb-2">
        <span className="font-medium px-2 py-1" style={{ fontSize: '1.5rem' }}>입력 전압 설정</span>
        <Switch checked={isOutVoltEnabled} onChange={e => setIsOutVoltEnabled(e.target.checked)} sx={{'& .MuiSwitch-switchBase.Mui-checked': {color: '#9333ea','&:hover': {backgroundColor: 'rgba(147, 51, 234, 0.08)',},},'& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {backgroundColor: '#9333ea',},}} />
      </div>
      {/* 입력 전압 1~4 */}
      {[0, 1, 2, 3].map(idx => (
        <div key={idx} className="flex items-center w-full justify-between mb-2">
          <span className="font-medium px-2 py-1 mb-2" style={{ fontSize: '1.2rem' }}>{`입력전압${idx + 1}`}</span>
          <input
            type="number"
            step="0.1"
            className="text-right border border-gray-400 rounded px-1 py-0.5 focus:outline-none focus:ring-2 focus:ring-purple-400"
            value={voltages[idx]}
            min={-50}
            max={50}
            onChange={e => handleVoltageChange(idx, Number(e.target.value))}
            disabled={!isOutVoltEnabled}
            style={{ fontSize: '1.5rem', width: '80px', minWidth: '80px', maxWidth: '80px' }}
          />
          <span style={{ fontSize: '1.2rem' }}>Volt</span>
        </div>
      ))}
      {/* 에러 메시지 */}
      {error && <div className="text-red-500 mb-1" style={{ fontSize: '1.5rem' }}>{error}</div>}
      {/* SAVE 버튼 */}
      <Button variant="outlined" onClick={handleSave} size="large" sx={{ width: '120px' }} disabled={!isOutVoltEnabled || isLoading}>
        {isLoading ? 'SAVING...' : 'SAVE'}
      </Button>
    </div>
  );
} 