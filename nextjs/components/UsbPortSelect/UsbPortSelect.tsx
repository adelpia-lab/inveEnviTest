import React, { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Typography from '@mui/material/Typography';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import { useIsClient } from '../../lib/useIsClient';

interface UsbPortSelectProps {
  wsConnection?: WebSocket;
  onSelectionChange?: (deviceType: string, port: string) => void;
}

type DeviceType = 'chamber' | 'power' | 'load' | 'relay';

interface DevicePorts {
  chamber: string;
  power: string;
  load: string;
  relay: string;
}

const AVAILABLE_PORTS = ['COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'COM10', 'COM11', 'COM12', 'COM13', 'COM14', 'COM15', 'COM16', 'COM17', 'COM18', 'COM19', 'COM20'];

// 영문 키를 한글 표시명으로 매핑
const DEVICE_DISPLAY_NAMES: Record<DeviceType, string> = {
  chamber: '챔버',
  power: '파워',
  load: '로드',
  relay: '릴레이'
};

export default function UsbPortSelect({ wsConnection, onSelectionChange }: UsbPortSelectProps) {
  // Initialize with empty state - will be populated from server
  const [devicePorts, setDevicePorts] = useState<DevicePorts>({
    chamber: '',
    power: '',
    load: '',
    relay: ''
  });
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tempDevicePorts, setTempDevicePorts] = useState<DevicePorts>({
    chamber: '',
    power: '',
    load: '',
    relay: ''
  });
  const [isInitialized, setIsInitialized] = useState(false);
  const isClient = useIsClient();

  // Only load from localStorage if server hasn't provided initial settings
  useEffect(() => {
    if (!isClient || isInitialized) return;
    loadSavedPorts();
  }, [isClient, isInitialized]);

  // WebSocket 메시지 리스너 설정
  useEffect(() => {
    // console.log("🔌 UsbPortSelect: WebSocket connection check");
    // console.log("🔌 UsbPortSelect: wsConnection object:", wsConnection);
    // console.log("🔌 UsbPortSelect: wsConnection readyState:", wsConnection ? wsConnection.readyState : 'No connection');
    
    if (!wsConnection) {
      // console.log("❌ UsbPortSelect: No WebSocket connection available");
      return;
    }

    // 연결 상태가 OPEN이 아닌 경우 대기
    if (wsConnection.readyState !== WebSocket.OPEN) {
      // console.log("⏳ UsbPortSelect: WebSocket not ready, waiting for connection...");
      return;
    }

    // console.log("🔌 UsbPortSelect: Setting up WebSocket message listener for USB port settings");

    const handleMessage = (event) => {
      const message = event.data;
      // console.log("📥 UsbPortSelect received WebSocket message:", message);
      
      // 서버에서 초기 USB 포트 설정 응답 처리 (연결 시 자동 전송)
      if (typeof message === 'string' && message.startsWith('Initial USB port settings:')) {
        // console.log("📥 Processing initial USB port settings message from server");
        // console.log("📥 Raw message:", message);
        
        try {
          const match = message.match(/Initial USB port settings: (.*)/);
          if (match && match[1]) {
            // console.log("📥 Extracted JSON string:", match[1]);
            const initialData = JSON.parse(match[1]);
            // console.log('📥 Parsed initial USB port settings:', initialData);
            
            // 모든 필요한 기기가 포함되어 있는지 확인
            const requiredDevices: DeviceType[] = ['chamber', 'power', 'load', 'relay'];
            const hasAllDevices = requiredDevices.every(device => 
              initialData.hasOwnProperty(device) && 
              typeof initialData[device] === 'string' &&
              AVAILABLE_PORTS.includes(initialData[device])
            );
            
            if (hasAllDevices) {
              // console.log('📥 Received valid initial USB port settings from server:', initialData);
              
              // 서버에서 받은 초기 데이터로 상태 업데이트
              setDevicePorts(initialData);
              setTempDevicePorts(initialData);
              setIsInitialized(true); // Mark as initialized
              
              // localStorage에도 저장
              if (typeof window !== 'undefined') {
                localStorage.setItem('usbPortSettings', JSON.stringify(initialData));
                // console.log('💾 Updated localStorage with server data:', initialData);
              }
              
              // console.log('✅ Initial USB port settings loaded successfully from server');
            } else {
              // console.log('❌ Server returned invalid USB port settings, using default');
              
              // 기본값 사용 (한글 키가 있거나 영문 키가 누락된 경우)
              const defaultData: DevicePorts = {
                chamber: '',
                power: '',
                load: '',
                relay: ''
              };
              
              // console.log('🔄 Using default settings:', defaultData);
              
              setDevicePorts(defaultData);
              setTempDevicePorts(defaultData);
              setIsInitialized(true); // Mark as initialized
              
              // localStorage에도 저장
              if (typeof window !== 'undefined') {
                localStorage.setItem('usbPortSettings', JSON.stringify(defaultData));
                // console.log('💾 Updated localStorage with default data:', defaultData);
              }
            }
                      } else {
              // console.log('❌ No initial USB port settings found on server');
              console.error('Invalid USB port settings format received from server');
              setIsInitialized(true);
            }
        } catch (error) {
          // console.error('❌ Failed to parse initial USB port settings from server:', error);
          console.error('Failed to parse initial USB port settings from server:', error);
          setIsInitialized(true);
        }
      }
      // 서버에서 USB 포트 설정 저장 확인 메시지 수신
      else if (typeof message === 'string' && message.startsWith('USB port settings saved:')) {
        try {
          const match = message.match(/USB port settings saved: (.*)/);
          if (match && match[1]) {
            const savedData = JSON.parse(match[1]);
            // console.log('📥 Received USB port settings save confirmation from server:', savedData);
            
            // 성공 상태 설정
            setIsSaved(true);
            setError(null);
            setIsLoading(false);
            // console.log('✅ USB port settings save confirmed by server');
            
            // 2초 후 다이얼로그 닫기
            setTimeout(() => {
              setIsSaved(false);
              handleClose();
            }, 2000);
          }
        } catch (error) {
          // console.error('❌ Failed to parse USB port settings save confirmation:', error);
          setError('서버 응답을 처리하는 중 오류가 발생했습니다.');
          setIsLoading(false);
        }
      }
      // 서버에서 USB 포트 설정 저장 에러 메시지 수신
      else if (typeof message === 'string' && message.startsWith('Error: Failed to save USB port settings')) {
        // console.error('❌ Server returned error for USB port settings save:', message);
        setError('서버에 저장하는 중 오류가 발생했습니다.');
        setIsLoading(false);
      }
      // 기타 서버 에러 메시지 수신
      else if (typeof message === 'string' && message.startsWith('Error:')) {
        // console.error('❌ Server returned error:', message);
        setError('서버 오류가 발생했습니다.');
        setIsLoading(false);
      }
    };

    wsConnection.addEventListener('message', handleMessage);
    return () => wsConnection.removeEventListener('message', handleMessage);
  }, [wsConnection]);

  const loadSavedPorts = () => {
    try {
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem('usbPortSettings');
        if (saved) {
          const parsed = JSON.parse(saved);
          // console.log('📖 Loaded USB port settings from localStorage:', parsed);
          
          // Validate that saved ports are compatible with available ports
          const isValidPorts = Object.values(parsed).every(port => 
            AVAILABLE_PORTS.includes(port as string)
          );
          
          if (isValidPorts) {
            setDevicePorts(parsed);
            setTempDevicePorts(parsed);
          }
        }
        setIsInitialized(true);
      }
    } catch (error) {
      console.error('Failed to load saved USB port settings:', error);
      setIsInitialized(true);
    }
  };

  const handleOpen = () => {
    setTempDevicePorts(devicePorts);
    setError(null);
    setIsSaved(false);
    setIsOpen(true);
  };

  const handleClose = () => {
    setIsOpen(false);
    setError(null);
    setIsSaved(false);
  };

  const handlePortChange = (deviceType: DeviceType, port: string) => {
    setTempDevicePorts(prev => ({
      ...prev,
      [deviceType]: port
    }));
  };

  const validatePorts = (): { isValid: boolean; errors: string[] } => {
    const errors: string[] = [];
    const usedPorts = new Map<string, string>(); // port -> device mapping
    
    Object.entries(tempDevicePorts).forEach(([device, port]) => {
      if (port === '') { // 빈 문자열은 유효하지 않은 포트로 간주
        errors.push(`${device} 포트를 선택해야 합니다.`);
      } else if (usedPorts.has(port)) {
        const conflictingDevice = usedPorts.get(port);
        errors.push(`${device}와 ${conflictingDevice}가 같은 포트(${port})를 사용하고 있습니다.`);
      } else {
        usedPorts.set(port, device);
      }
    });
    
    return {
      isValid: errors.length === 0,
      errors
    };
  };

  const handleSave = async () => {
    // console.log("=== SAVE button clicked - saving USB port settings ===");
    // console.log("Current USB port settings:", tempDevicePorts);
    // console.log("WebSocket connection object:", wsConnection);
    // console.log("WebSocket readyState:", wsConnection ? wsConnection.readyState : 'No connection');
    // console.log("WebSocket URL:", wsConnection ? wsConnection.url : 'No connection');
    
    // WebSocket 연결 상태 확인
    if (!wsConnection) {
      // console.error('❌ No WebSocket connection available');
      setError('서버 연결이 없습니다. 페이지를 새로고침하세요.');
      return;
    }
    
    // console.log("WebSocket readyState constants:");
    // console.log("- CONNECTING (0):", WebSocket.CONNECTING);
    // console.log("- OPEN (1):", WebSocket.OPEN);
    // console.log("- CLOSING (2):", WebSocket.CLOSING);
    // console.log("- CLOSED (3):", WebSocket.CLOSED);
    // console.log("Current state:", wsConnection.readyState);
    
    if (wsConnection.readyState !== WebSocket.OPEN) {
      // console.error('❌ WebSocket is not open. Current state:', wsConnection.readyState);
      let stateMessage = '';
      switch (wsConnection.readyState) {
        case WebSocket.CONNECTING:
          stateMessage = '연결 중';
          break;
        case WebSocket.CLOSING:
          stateMessage = '연결 종료 중';
          break;
        case WebSocket.CLOSED:
          stateMessage = '연결 종료됨';
          break;
        default:
          stateMessage = `알 수 없는 상태 (${wsConnection.readyState})`;
      }
      
      // 연결 중이거나 연결 종료 중인 경우 잠시 대기
      if (wsConnection.readyState === WebSocket.CONNECTING || wsConnection.readyState === WebSocket.CLOSING) {
        // console.log('⏳ Waiting for WebSocket connection to stabilize...');
        setError(`서버 연결 중입니다. (${stateMessage}) 잠시 후 다시 시도해주세요.`);
        
        // 2초 후 다시 시도
        setTimeout(() => {
          if (wsConnection.readyState === WebSocket.OPEN) {
            // console.log('✅ WebSocket connection is now ready, retrying save...');
            setError(null);
            handleSave();
          } else {
            setError(`서버 연결이 불안정합니다. (${stateMessage}) 페이지를 새로고침하세요.`);
          }
        }, 2000);
        return;
      }
      
      setError(`서버 연결이 끊어졌습니다. (${stateMessage}) 페이지를 새로고침하세요.`);
      return;
    }
    
    // 입력값 검증
    const validation = validatePorts();
    if (!validation.isValid) {
      setError(validation.errors.join(', '));
      return;
    }
    
    setError(null);
    setIsLoading(true);
    // console.log('✅ Validation passed, saving USB port settings...');
    
    try {
      // 1. localStorage에 저장
      if (typeof window !== 'undefined') {
        localStorage.setItem('usbPortSettings', JSON.stringify(tempDevicePorts));
        // console.log("✅ USB port settings saved to localStorage:", tempDevicePorts);
      }
      
      // 2. WebSocket을 통해 서버에 저장
      const message = `[SAVE_USB_PORT_SETTINGS] ${JSON.stringify(tempDevicePorts)}`;
      // console.log("📤 Sending USB port settings to server:", message);
      wsConnection.send(message);
      // console.log("📤 Message sent successfully");
      
      // 3. 상태 업데이트 (서버 응답을 기다리지 않고 즉시 업데이트)
      setDevicePorts(tempDevicePorts);
      
      // 4. 상위 컴포넌트 콜백 호출
      Object.entries(tempDevicePorts).forEach(([deviceType, port]) => {
        onSelectionChange?.(deviceType, port);
      });
      
      // console.log("✅ Local state updated, waiting for server confirmation...");
      
      // 서버 응답을 기다리기 위해 다이얼로그를 즉시 닫지 않음
      // 서버에서 성공/실패 응답이 오면 handleMessage에서 처리됨
      
    } catch (error) {
      // console.error('❌ Failed to save USB port settings:', error);
      setError('저장 중 오류가 발생했습니다.');
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setTempDevicePorts(devicePorts);
    setError(null);
    setIsSaved(false);
    handleClose();
  };

  return (
    <Box
      sx={{
        margin: "0 auto 1em auto",
        alignItems: 'center',
        backgroundColor: 'darkmode.background',
        p: 1,
        justifyContent: 'auto',
        maxHeight: '280px',
        overflow: 'hidden',
      }}
    >
      <Typography variant="h6" component="span" color="white" sx={{ mr: 1, mb: 1, display: 'block' }}>
        USB 포트 설정
      </Typography>
      
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <Button
          variant="outlined"
          onClick={handleOpen}
          sx={{
            '&:hover': {
              backgroundColor: '#64B5F6',
            },
            width: '100%',
            mb: 0.5,
            py: 0.75,
          }}
        >
          USB 포트 설정 변경
        </Button>
        
        <Paper sx={{ p: 1, backgroundColor: '#2D2D2D', border: '1px solid #424242' }}>
          <Typography variant="body2" color="white" sx={{ mb: 0.5 }}>
            현재 설정:
          </Typography>
          {!isInitialized ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CircularProgress size={16} sx={{ color: '#90CAF9' }} />
              <Typography variant="body2" color="#90CAF9" sx={{ fontSize: '0.8rem' }}>
                서버에서 설정을 불러오는 중...
              </Typography>
            </Box>
          ) : (
            <>
              <Typography variant="body2" color="#90CAF9" sx={{ fontSize: '0.8rem' }}>
                챔버: {devicePorts.chamber || '설정되지 않음'}
              </Typography>
              <Typography variant="body2" color="#90CAF9" sx={{ fontSize: '0.8rem' }}>
                파워: {devicePorts.power || '설정되지 않음'}
              </Typography>
              <Typography variant="body2" color="#90CAF9" sx={{ fontSize: '0.8rem' }}>
                로드: {devicePorts.load || '설정되지 않음'}
              </Typography>
              <Typography variant="body2" color="#90CAF9" sx={{ fontSize: '0.8rem' }}>
                릴레이: {devicePorts.relay || '설정되지 않음'}
              </Typography>
            </>
          )}
        </Paper>
      </Box>

      <Dialog
        open={isOpen}
        onClose={handleClose}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            backgroundColor: '#1D1D1D',
            color: '#E0E0E0',
            maxHeight: '80vh',
          }
        }}
      >
        <DialogTitle sx={{ 
          backgroundColor: '#30394D',
          color: '#E0E0E0',
          borderBottom: '1px solid #424242',
          py: 1.5,
        }}>
          USB 포트 설정
        </DialogTitle>
        
        <DialogContent sx={{ pt: 1.5, pb: 1 }}>
          <Typography variant="body2" color="#B0B0B0" sx={{ mb: 2 }}>
            각 기기의 USB 포트를 선택하세요. 중복된 포트는 사용할 수 없습니다.
            <Box component="span" sx={{ display: 'block', mt: 1, fontSize: '0.85rem', color: '#90CAF9' }}>
              사용 가능한 포트: COM1-COM20
            </Box>
          </Typography>

          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 2 }}>
            {(['chamber', 'power', 'load', 'relay'] as DeviceType[]).map((deviceType) => (
              <Box key={deviceType}>
                <FormControl fullWidth>
                  <InputLabel 
                    sx={{ 
                      color: '#E0E0E0',
                      '&.Mui-focused': {
                        color: '#90CAF9'
                      }
                    }}
                  >
                    {DEVICE_DISPLAY_NAMES[deviceType]}
                  </InputLabel>
                  <Select
                    value={tempDevicePorts[deviceType]}
                    onChange={(e) => handlePortChange(deviceType, e.target.value)}
                    sx={{
                      color: '#E0E0E0',
                      '& .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#424242',
                      },
                      '&:hover .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#90CAF9',
                      },
                      '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#90CAF9',
                      },
                      '& .MuiSvgIcon-root': {
                        color: '#E0E0E0',
                      }
                    }}
                  >
                    {AVAILABLE_PORTS.map((port) => (
                      <MenuItem 
                        key={port} 
                        value={port}
                        sx={{
                          color: '#E0E0E0',
                          '&:hover': {
                            backgroundColor: '#2D2D2D',
                          },
                          '&.Mui-selected': {
                            backgroundColor: '#30394D',
                            '&:hover': {
                              backgroundColor: '#30394D',
                            }
                          }
                        }}
                      >
                        {port}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
            ))}
          </Box>

          {error && (
            <Alert severity="error" sx={{ mt: 2, backgroundColor: '#2D2D2D', color: '#F44336' }}>
              {error}
            </Alert>
          )}

          {isSaved && (
            <Alert severity="success" sx={{ mt: 2, backgroundColor: '#2D2D2D', color: '#4CAF50' }}>
              USB 포트 설정이 성공적으로 저장되었습니다!
            </Alert>
          )}
        </DialogContent>

        <DialogActions sx={{ 
          backgroundColor: '#30394D',
          borderTop: '1px solid #424242',
          p: 1.5
        }}>
          <Button
            onClick={handleCancel}
            disabled={isLoading}
            sx={{
              color: '#B0B0B0',
              '&:hover': {
                backgroundColor: 'rgba(176, 176, 176, 0.1)',
              },
              '&:disabled': {
                color: '#666666',
              }
            }}
          >
            취소
          </Button>
          <Button
            onClick={handleSave}
            variant="contained"
            disabled={isLoading}
            sx={{
              backgroundColor: '#90CAF9',
              color: '#121212',
              '&:hover': {
                backgroundColor: '#64B5F6',
              },
              '&:disabled': {
                backgroundColor: '#666666',
                color: '#999999',
              }
            }}
          >
            {isLoading ? (
              <>
                <CircularProgress size={16} sx={{ mr: 1, color: '#999999' }} />
                저장 중...
              </>
            ) : (
              '저장'
            )}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
} 