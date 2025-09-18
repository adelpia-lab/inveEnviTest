import React, { useState, useEffect } from 'react';
import { z } from 'zod';
import { Button, Typography, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Box } from '@mui/material';

// Zod 스키마 정의
const delaySettingsSchema = z.object({
  onDelay: z.number().min(2).max(999),
  offDelay: z.number().min(2).max(999),
  cycleNumber: z.number().min(1).max(3),
});

type DelaySettings = z.infer<typeof delaySettingsSchema>;

// 기본값 정의
const DEFAULT_DELAY_SETTINGS: DelaySettings = {
  onDelay: 2,
  offDelay: 2,
  cycleNumber: 1,
};

interface DelaySettingsPanelProps {
  onSave?: (data: DelaySettings) => void;
  wsConnection?: WebSocket | null;
}

/**
 * 딜레이 설정 패널
 * @param onSave 저장 시 호출되는 콜백 (옵션)
 * @param wsConnection WebSocket 연결 (옵션)
 */
export default function DelaySettingsPanel({ onSave, wsConnection }: DelaySettingsPanelProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // localStorage에서 저장된 값을 가져오거나 기본값 사용
  const getStoredValues = (): DelaySettings => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('delaySettings');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          // 저장된 값이 유효한지 확인하고 기본값과 병합
          return {
            onDelay: parsed.onDelay ?? DEFAULT_DELAY_SETTINGS.onDelay,
            offDelay: parsed.offDelay ?? DEFAULT_DELAY_SETTINGS.offDelay,
            cycleNumber: parsed.cycleNumber ?? DEFAULT_DELAY_SETTINGS.cycleNumber,
          };
        } catch (error) {
          // Error handling silently
        }
      }
    }
    return DEFAULT_DELAY_SETTINGS;
  };

  const [form, setForm] = useState<DelaySettings>(getStoredValues);

  // 백엔드에서 딜레이 설정을 가져오는 함수
  const fetchDelaySettingsFromBackend = () => {
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
      setIsLoading(true);
      wsConnection.send('[GET_DELAY_SETTINGS] OK');
    }
  };

  // 컴포넌트 마운트 시 저장된 값 로드 및 백엔드에서 설정 가져오기
  useEffect(() => {
    setForm(getStoredValues());
    
    // 백엔드에서 설정 가져오기 시도
    if (wsConnection) {
      // WebSocket 연결이 준비될 때까지 대기
      const checkConnection = () => {
        if (wsConnection.readyState === WebSocket.OPEN) {
          fetchDelaySettingsFromBackend();
        } else if (wsConnection.readyState === WebSocket.CONNECTING) {
          // 연결 중이면 잠시 후 다시 시도
          setTimeout(checkConnection, 1000);
        }
      };
      checkConnection();
    }
  }, [wsConnection]);

  // WebSocket 메시지 리스너 설정
  useEffect(() => {
    if (!wsConnection) return;

    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      
      // 딜레이 설정 응답 처리
      if (typeof message === 'string' && message.startsWith('Delay settings:')) {
        try {
          const match = message.match(/Delay settings: (.*)/);
          if (match && match[1]) {
            const settings = JSON.parse(match[1]);
            if (settings.onDelay !== undefined && settings.offDelay !== undefined) {
              setForm(settings);
              // localStorage에도 저장
              if (typeof window !== 'undefined') {
                localStorage.setItem('delaySettings', JSON.stringify(settings));
              }
            }
          }
        } catch (error) {
          // Error handling silently
        }
        setIsLoading(false);
      }
      
      // 딜레이 설정 저장 응답 처리
      if (typeof message === 'string' && message.startsWith('Delay settings saved:')) {
        try {
          const match = message.match(/Delay settings saved: (.*)/);
          if (match && match[1]) {
            const settings = JSON.parse(match[1]);
            // localStorage에도 저장
            if (typeof window !== 'undefined') {
              localStorage.setItem('delaySettings', JSON.stringify(settings));
            }
            setError(null);
            setIsDialogOpen(false); // 성공 시 다이얼로그 닫기
          }
        } catch (error) {
          setError('저장 응답 처리 중 오류가 발생했습니다.');
        }
        setIsLoading(false);
      }
      
      // 딜레이 설정 저장 실패 응답 처리
      if (typeof message === 'string' && message.startsWith('Error:')) {
        setError('딜레이 설정 저장에 실패했습니다.');
        setIsLoading(false);
      }
    };

    wsConnection.addEventListener('message', handleMessage);
    
    return () => {
      wsConnection.removeEventListener('message', handleMessage);
    };
  }, [wsConnection]);

  const handleChange = (key: keyof DelaySettings, value: number) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    const result = delaySettingsSchema.safeParse(form);
    if (!result.success) {
      setError('입력값을 확인하세요. (2-999 SEC)');
      return;
    }
    setError(null);
    setIsLoading(true);
    
    // localStorage에 저장
    if (typeof window !== 'undefined') {
      localStorage.setItem('delaySettings', JSON.stringify(form));
    }
    
    // WebSocket을 통해 백엔드로 딜레이 설정 전송
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
      const delayMessage = `[DELAY_SETTINGS] ON_DELAY:${form.onDelay} OFF_DELAY:${form.offDelay} CYCLE:${form.cycleNumber}`;
      wsConnection.send(delayMessage);
    } else {
      setError('WebSocket 연결이 없습니다.');
      setIsLoading(false);
    }
    
    onSave?.(form);
    // 팝업은 응답을 받은 후 닫기로 변경
  };

  const handleCancel = () => {
    setIsDialogOpen(false);
    setError(null);
    // 저장된 값으로 폼 초기화
    setForm(getStoredValues());
  };

  const handleOpenDialog = () => {
    setIsDialogOpen(true);
    setError(null);
    // 다이얼로그 열 때 저장된 값으로 폼 초기화
    setForm(getStoredValues());
  };

  return (
    <>
      {/* 메인 버튼 */}
      <Box
        sx={{ p: 0.5, textAlign: 'center', mt: 1, display: 'flex', justifyContent: 'center', fontFamily: 'inherit' }}
      >
        <Button
          variant="outlined"
          onClick={handleOpenDialog}
          disabled={isLoading}
          sx={{ 
            width: '140px',
            mb: 1,
            py: 0.5,
            borderColor: '#64B5F6',
            color: '#64B5F6',
            '&:hover': {
              borderColor: '#42A5F5',
              backgroundColor: 'rgba(100, 181, 246, 0.1)'
            }
          }}
        >
          {isLoading ? '로딩...' : '딜레이/싸이클'}
        </Button>
      </Box>

      {/* 팝업 다이얼로그 */}
      <Dialog 
        open={isDialogOpen} 
        onClose={handleCancel}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            backgroundColor: '#1D1D1D',
            color: '#E0E0E0',
            borderRadius: '12px',
          }
        }}
      >
        <DialogTitle sx={{ 
          textAlign: 'center', 
          fontSize: '1.5rem',
          fontWeight: 'bold',
          borderBottom: '1px solid #333',
          pb: 2
        }}>
          딜레이 싸이클 설정
        </DialogTitle>
        
        <DialogContent sx={{ pt: 3 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* ON_DELAY */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography sx={{ fontSize: '1.2rem', fontWeight: 'medium' }}>
                ON_DELAY
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <TextField
                  type="number"
                  value={form.onDelay}
                  onChange={(e) => handleChange('onDelay', Number(e.target.value))}
                  inputProps={{
                    min: 2,
                    max: 999,
                    style: { 
                      fontSize: '1.5rem',
                      textAlign: 'right',
                      width: '80px'
                    }
                  }}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      '& fieldset': {
                        borderColor: '#666',
                      },
                      '&:hover fieldset': {
                        borderColor: '#9333ea',
                      },
                      '&.Mui-focused fieldset': {
                        borderColor: '#9333ea',
                      },
                    },
                    '& .MuiInputBase-input': {
                      color: '#E0E0E0',
                    },
                    width: '100px'
                  }}
                />
                <Typography sx={{ fontSize: '1.2rem' }}>sec</Typography>
              </Box>
            </Box>

            {/* OFF_DELAY */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography sx={{ fontSize: '1.2rem', fontWeight: 'medium' }}>
                OFF_DELAY
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <TextField
                  type="number"
                  value={form.offDelay}
                  onChange={(e) => handleChange('offDelay', Number(e.target.value))}
                  inputProps={{
                    min: 2,
                    max: 999,
                    style: { 
                      fontSize: '1.5rem',
                      textAlign: 'right',
                      width: '80px'
                    }
                  }}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      '& fieldset': {
                        borderColor: '#666',
                      },
                      '&:hover fieldset': {
                        borderColor: '#9333ea',
                      },
                      '&.Mui-focused fieldset': {
                        borderColor: '#9333ea',
                      },
                    },
                    '& .MuiInputBase-input': {
                      color: '#E0E0E0',
                    },
                    width: '100px'
                  }}
                />
                <Typography sx={{ fontSize: '1.2rem' }}>sec</Typography>
              </Box>
            </Box>

          {/* cycleNumber */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography sx={{ fontSize: '1.2rem', fontWeight: 'medium' }}>
                측정 싸이클 횟 수
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <TextField
                  type="number"
                  value={form.cycleNumber}
                  onChange={(e) => handleChange('cycleNumber', Number(e.target.value))}
                  inputProps={{
                    min: 1,
                    max: 3,
                    style: { 
                      fontSize: '1.5rem',
                      textAlign: 'right',
                      width: '80px'
                    }
                  }}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      '& fieldset': {
                        borderColor: '#666',
                      },
                      '&:hover fieldset': {
                        borderColor: '#9333ea',
                      },
                      '&.Mui-focused fieldset': {
                        borderColor: '#9333ea',
                      },
                    },
                    '& .MuiInputBase-input': {
                      color: '#E0E0E0',
                    },
                    width: '100px'
                  }}
                />
                <Typography sx={{ fontSize: '1.2rem' }}>회</Typography>
              </Box>
            </Box>

            {/* 에러 메시지 */}
            {error && (
              <Typography sx={{ 
                color: '#ef4444', 
                fontSize: '1rem',
                textAlign: 'center',
                mt: 1
              }}>
                {error}
              </Typography>
            )}
          </Box>
        </DialogContent>

        <DialogActions sx={{ 
          justifyContent: 'center', 
          gap: 2, 
          p: 3,
          borderTop: '1px solid #333'
        }}>
          <Button
            variant="outlined"
            onClick={handleCancel}
            disabled={isLoading}
            sx={{ 
              width: '100px',
              borderColor: '#666',
              color: '#E0E0E0',
              '&:hover': {
                borderColor: '#9333ea',
                backgroundColor: 'rgba(147, 51, 234, 0.1)',
              }
            }}
          >
            취소
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={isLoading}
            sx={{ 
              width: '100px',
              backgroundColor: '#9333ea',
              '&:hover': {
                backgroundColor: '#7c3aed',
              }
            }}
          >
            {isLoading ? '저장 중...' : 'SAVE'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
} 