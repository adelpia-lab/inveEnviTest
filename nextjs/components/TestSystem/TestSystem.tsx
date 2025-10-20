import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Alert,
  IconButton,
  TextField
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';

// 온도 표시 컴포넌트
function TemperatureDisplay({ temperature }: { temperature: number | null }) {
  const formattedTemperature =
    typeof temperature === 'number' ? temperature.toFixed(1) : '--.-';
  const prefixText = `CHAMBER`;
  const suffixText = `°C`;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'baseline',
        height: '30px',
        borderColor: 'divider',
        borderRadius: '5px',
        backgroundColor: '#30394D',
        justifyContent: 'center',
        p: 1,
        mt: 1,
      }}
    >
      <Typography variant="body1" component="span" color="primary" sx={{ mr: 1, color: '#90CAF9' }}>
        {prefixText}
      </Typography>
      <Box
        sx={{
          width: `80px`,
          border: '2px solid',
          borderColor: '#90CAF9',
          borderRadius: '4px',
          px: 1,
          backgroundColor: '#1e1e1e', 
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Typography variant="body1" component="span" color="text.primary" sx={{ color: '#ffffff' }}>
          {formattedTemperature}
        </Typography>
      </Box>
      <Typography variant="body1" component="span" color="primary" sx={{ ml: 1, color: '#90CAF9' }}>
        {suffixText}
      </Typography>
    </Box>
  );
}

// 전압 표시 컴포넌트
function VoltageDisplay({ voltage }: { voltage: number | null }) {
  const formattedVoltage =
    typeof voltage === 'number' ? voltage.toFixed(3) : '--.---';
  const prefixText = `VOLTAGE`;
  const suffixText = `V`;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'baseline',
        height: '30px',
        borderColor: 'divider',
        borderRadius: '5px',
        backgroundColor: '#30394D',
        justifyContent: 'center',
        p: 1,
        mt: 1,
      }}
    >
      <Typography variant="body1" component="span" color="primary" sx={{ mr: 1, color: '#90CAF9' }}>
        {prefixText}
      </Typography>
      <Box
        sx={{
          width: `80px`,
          border: '2px solid',
          borderColor: '#90CAF9',
          borderRadius: '4px',
          px: 1,
          backgroundColor: '#1e1e1e', 
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Typography variant="body1" component="span" color="text.primary" sx={{ color: '#ffffff' }}>
          {formattedVoltage}
        </Typography>
      </Box>
      <Typography variant="body1" component="span" color="primary" sx={{ ml: 1, color: '#90CAF9' }}>
        {suffixText}
      </Typography>
    </Box>
  );
}

interface TestSystemProps {
  open: boolean;
  onClose: () => void;
  onExited?: () => void; // 추가
  wsConnection: WebSocket | null;
}

interface PortTestResult {
  port: number;
  status: 'idle' | 'testing' | 'success' | 'error';
  message: string;
  responseTime?: number;
  type: 'chamber' | 'power' | 'load' | 'relay';
  temperature?: number | null;
  voltage?: number; // Add voltage field for power tests
  deviceNumber?: number; // Add device number field for relay tests
  channel?: number; // Add channel field for load tests
  measuredVoltage?: number | null; // Add measured voltage field for load tests
}

const TestSystem: React.FC<TestSystemProps> = ({ open, onClose, onExited, wsConnection }) => {
  const [portTests, setPortTests] = useState<PortTestResult[]>([
    { port: 1, status: 'idle', message: '대기 중', type: 'chamber' },
    { port: 2, status: 'idle', message: '대기 중', type: 'power', voltage: 18.0 },
    { port: 3, status: 'idle', message: '대기 중', type: 'load', channel: 1, measuredVoltage: null },
    { port: 4, status: 'idle', message: '대기 중', type: 'relay', deviceNumber: 1 }
  ]);
  


  // WebSocket 메시지 처리
  useEffect(() => {
    if (!wsConnection) return;

    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      
      // 테스트 시스템과 관련된 메시지만 처리
      if (typeof data === 'string' && (
        data.includes('[RELAY_ON]') || 
        data.includes('[RELAY_OFF]') ||
        data.includes('[CHAMBER_TEST]') || 
        data.includes('[POWER_TEST]') || 
        data.includes('[LOAD_TEST]') || 
        data.includes('[RELAY_TEST]') ||
        data.includes('[CHAMBER_TEMPERATURE]') ||
        data.includes('LoadVoltage:') ||
        data.includes('Temperature:')
      )) {
        console.log(`🔍 [TestSystem] Received relevant WebSocket message: ${data}`);
      } else {
        // 관련 없는 메시지는 무시
        return;
      }
      
      // Relay ON/OFF 응답 처리 (우선 처리)
      if (data.includes('[RELAY_ON]') || data.includes('[RELAY_OFF]')) {
        const action = data.includes('[RELAY_ON]') ? 'ON' : 'OFF';
        console.log(`🔍 [TestSystem] Processing relay ${action} message: ${data}`);
        
        const match = data.match(/\[RELAY_(ON|OFF)\] PORT:(\d+) STATUS:(success|error) MESSAGE:(.*)/);
        if (!match) {
          // 더 유연한 정규식으로 재시도
          const flexibleMatch = data.match(/\[RELAY_(ON|OFF)\].*PORT:(\d+).*STATUS:(success|error).*MESSAGE:(.*)/);
          if (flexibleMatch) {
            const port = parseInt(flexibleMatch[2]);
            const status = flexibleMatch[3] as 'success' | 'error';
            const message = flexibleMatch[4];
            
            console.log(`🔍 [TestSystem] Relay ${action} response (flexible): Port ${port}, Status ${status}, Message: ${message}`);
            console.log(`🔍 [TestSystem] Flexible match groups:`, flexibleMatch);
            
            setPortTests(prev => {
              console.log(`🔍 [TestSystem] Updating port tests for port ${port} (flexible)`);
              return prev.map(test => 
                test.port === port 
                  ? { ...test, status, message }
                  : test
              );
            });
            return;
          }
        }
        if (match) {
          const port = parseInt(match[2]); // PORT 번호
          const status = match[3] as 'success' | 'error'; // STATUS
          const message = match[4]; // MESSAGE
          
          console.log(`🔍 [TestSystem] Relay ${action} response: Port ${port}, Status ${status}, Message: ${message}`);
          console.log(`🔍 [TestSystem] Match groups:`, match);
          
          setPortTests(prev => {
            console.log(`🔍 [TestSystem] Updating port tests for port ${port}`);
            return prev.map(test => 
              test.port === port 
                ? { ...test, status, message }
                : test
            );
          });
        } else {
          console.log(`🔍 [TestSystem] Relay ${action} message not matched: ${data}`);
          console.log(`🔍 [TestSystem] Trying to match pattern: [RELAY_${action}] PORT:(\\d+) STATUS:(success|error) MESSAGE:(.+)`);
        }
        return; // Relay 메시지 처리 후 종료
      }
      
      // 포트 테스트 응답 처리
      if (data.includes('[CHAMBER_TEST]') || data.includes('[POWER_TEST]') || 
          data.includes('[LOAD_TEST]') || data.includes('[RELAY_TEST]')) {
        
        console.log(`🔍 [TestSystem] Processing test message: ${data}`);
        
        // 각 테스트 타입별로 개별 처리
        if (data.includes('[CHAMBER_TEST]')) {
          const match = data.match(/\[CHAMBER_TEST\] PORT:(\d+) STATUS:(success|error) MESSAGE:(.+)/);
          if (match) {
            const port = parseInt(match[1]);
            const status = match[2] as 'success' | 'error';
            const message = match[3];
            
            console.log(`🔍 [TestSystem] Chamber test response: Port ${port}, Status ${status}, Message: ${message}`);
            
            setPortTests(prev => prev.map(test => 
              test.port === port 
                ? { ...test, status, message }
                : test
            ));
          }
        }
        
        if (data.includes('[POWER_TEST]')) {
          const match = data.match(/\[POWER_TEST\] PORT:(\d+) STATUS:(success|error) MESSAGE:(.+)/);
          if (match) {
            const port = parseInt(match[1]);
            const status = match[2] as 'success' | 'error';
            const message = match[3];
            
            console.log(`🔍 [TestSystem] Power test response: Port ${port}, Status ${status}, Message: ${message}`);
            
            setPortTests(prev => prev.map(test => 
              test.port === port 
                ? { ...test, status, message }
                : test
            ));
          }
        }
        
        if (data.includes('[LOAD_TEST]')) {
          const match = data.match(/\[LOAD_TEST\] PORT:(\d+) STATUS:(success|error) MESSAGE:(.+)/);
          if (match) {
            const port = parseInt(match[1]);
            const status = match[2] as 'success' | 'error';
            const message = match[3];
            
            console.log(`🔍 [TestSystem] Load test response: Port ${port}, Status ${status}, Message: ${message}`);
            
            setPortTests(prev => prev.map(test => 
              test.port === port 
                ? { ...test, status, message }
                : test
            ));
          } else {
            console.log(`🔍 [TestSystem] Load test message not matched: ${data}`);
          }
        }
        
        if (data.includes('[RELAY_TEST]')) {
          const match = data.match(/\[RELAY_TEST\] PORT:(\d+) STATUS:(success|error) MESSAGE:(.+)/);
          if (match) {
            const port = parseInt(match[1]);
            const status = match[2] as 'success' | 'error';
            const message = match[3];
            
            console.log(`🔍 [TestSystem] Relay test response: Port ${port}, Status ${status}, Message: ${message}`);
            
            setPortTests(prev => prev.map(test => 
              test.port === port 
                ? { ...test, status, message }
                : test
            ));
          }
        }
      }
      
      // 전압 데이터 처리 (로드 테스트용)
      if (data.includes('LoadVoltage:')) {
        try {
          const voltageMatch = data.match(/LoadVoltage: (.+)/);
          if (voltageMatch) {
            const voltageData = JSON.parse(voltageMatch[1]);
            if (voltageData && typeof voltageData.port === 'number' && typeof voltageData.voltage === 'number') {
              setPortTests(prev => prev.map(test => 
                test.port === voltageData.port && test.type === 'load'
                  ? { ...test, measuredVoltage: voltageData.voltage }
                  : test
              ));
            }
          }
        } catch (error) {
          console.error('전압 데이터 파싱 오류:', error);
        }
      }
      
      // 온도 데이터 처리 - [CHAMBER_TEMPERATURE] 메시지 처리
      if (data.includes('[CHAMBER_TEMPERATURE]')) {
        try {
          const tempMatch = data.match(/\[CHAMBER_TEMPERATURE\] (.+)/);
          if (tempMatch) {
            const temperature = parseFloat(tempMatch[1]);
            if (!isNaN(temperature)) {
              console.log(`🌡️ [TestSystem] Received chamber temperature: ${temperature}°C`);
              setPortTests(prev => prev.map(test => 
                test.type === 'chamber' 
                  ? { ...test, temperature: temperature }
                  : test
              ));
            }
          }
        } catch (error) {
          console.error('온도 데이터 파싱 오류:', error);
        }
      }
      
      // 기존 Temperature: 메시지 처리 (하위 호환성)
      if (data.includes('Temperature:')) {
        try {
          const tempMatch = data.match(/Temperature: (.+)/);
          if (tempMatch) {
            const tempData = JSON.parse(tempMatch[1]);
            if (tempData && typeof tempData.temperature === 'number') {
              setPortTests(prev => prev.map(test => 
                test.type === 'chamber' 
                  ? { ...test, temperature: tempData.temperature }
                  : test
              ));
            }
          }
        } catch (error) {
          console.error('온도 데이터 파싱 오류:', error);
        }
      }
      

    };

    wsConnection.addEventListener('message', handleMessage);
    return () => wsConnection.removeEventListener('message', handleMessage);
  }, [wsConnection]);

  // 개별 포트 테스트 실행
  const runSinglePortTest = async (portNumber: number) => {
    if (!wsConnection || wsConnection.readyState !== WebSocket.OPEN) {
      alert('WebSocket 연결이 없습니다.');
      return;
    }

    // 해당 포트만 테스트 중 상태로 설정
    setPortTests(prev => prev.map(test => 
      test.port === portNumber 
        ? { ...test, status: 'testing', message: '테스트 중...' }
        : test
    ));

    // 포트 타입에 따라 다른 테스트 명령 전송
    const portTest = portTests.find(test => test.port === portNumber);
    if (portTest) {
      let message = '';
      switch (portTest.type) {
        case 'chamber':
          message = `[CHAMBER_TEST] PORT:${portNumber}`;
          break;
        case 'power':
          // Power test now includes voltage setting
          const voltage = portTest.voltage || 18.0;
          message = `[POWER_TEST] PORT:${portNumber} VOLTAGE:${voltage}`;
          break;
        case 'load':
          // Load test now includes channel selection
          const channel = portTest.channel || 1;
          message = `[LOAD_TEST] PORT:${portNumber} CHANNEL:${channel}`;
          break;
        case 'relay':
          // Relay test now includes device number
          const deviceNumber = portTest.deviceNumber || 1;
          message = `[RELAY_TEST] PORT:${portNumber} DEVICE:${deviceNumber}`;
          break;
        default:
          message = `[PORT_TEST] PORT:${portNumber}`;
      }
      wsConnection.send(message);
    }
  };

  // 릴레이 ON/OFF 테스트 실행
  const runRelayTest = async (portNumber: number, action: 'ON' | 'OFF') => {
    if (!wsConnection || wsConnection.readyState !== WebSocket.OPEN) {
      alert('WebSocket 연결이 없습니다.');
      return;
    }

    console.log(`🔍 [TestSystem] Sending relay ${action} command for port ${portNumber}`);

    // 해당 포트만 테스트 중 상태로 설정
    setPortTests(prev => prev.map(test => 
      test.port === portNumber 
        ? { ...test, status: 'testing', message: `${action} 실행 중...` }
        : test
    ));

    const portTest = portTests.find(test => test.port === portNumber);
    if (portTest && portTest.type === 'relay') {
      const deviceNumber = portTest.deviceNumber || 1;
      const message = `[RELAY_${action}] PORT:${portNumber} DEVICE:${deviceNumber}`;
      console.log(`🔍 [TestSystem] Sending message: ${message}`);
      wsConnection.send(message);
    } else {
      console.error(`🔍 [TestSystem] Port test not found or not relay type for port ${portNumber}`);
    }
  };





  // 포트 테스트 결과 색상 결정
  const getStatusColor = (status: PortTestResult['status']) => {
    switch (status) {
      case 'success': return 'success';
      case 'error': return 'error';
      case 'testing': return 'warning';
      default: return 'default';
    }
  };



  // Voltage input change handler
  const handleVoltageChange = (portNumber: number, value: string) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue >= -30.0 && numValue <= 30.0) {
      setPortTests(prev => prev.map(test => 
        test.port === portNumber 
          ? { ...test, voltage: numValue }
          : test
      ));
    }
  };

  // Device number input change handler
  const handleDeviceNumberChange = (portNumber: number, value: string) => {
    const numValue = parseInt(value);
    if (!isNaN(numValue) && numValue >= 1 && numValue <= 10) {
      setPortTests(prev => prev.map(test => 
        test.port === portNumber 
          ? { ...test, deviceNumber: numValue }
          : test
      ));
    }
  };

  // Channel selection change handler for load tests
  const handleChannelChange = (portNumber: number, value: string) => {
    const numValue = parseInt(value);
    if (!isNaN(numValue) && numValue >= 1 && numValue <= 5) {
      setPortTests(prev => prev.map(test => 
        test.port === portNumber 
          ? { ...test, channel: numValue }
          : test
      ));
    }
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        style: {
          backgroundColor: '#1e1e1e',
          color: '#ffffff',
          borderRadius: '12px'
        }
      }}
      TransitionProps={onExited ? { onExited } : undefined}
    >
      <DialogTitle sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        borderBottom: '1px solid #333'
      }}>
        시스템 테스트
        <IconButton onClick={onClose} sx={{ color: '#ffffff' }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ mt: 2 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* 통신포트 테스트 섹션 */}
          <Box>
            <Typography variant="subtitle1" sx={{ mb: 2, color: '#ffffff' }}>
              통신포트 테스트
            </Typography>
            <Box sx={{ 
              display: 'grid', 
              gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' },
              gap: 2 
            }}>
              {portTests.map((test) => (
                                  <Card key={test.port} sx={{ 
                    backgroundColor: '#2a2a2a',
                    border: '1px solid #333'
                  }}>
                    <CardContent sx={{ textAlign: 'center', py: 2 }}>
                      <Typography variant="body1" sx={{ color: '#ffffff', mb: 1 }}>
                        {test.type === 'chamber' ? '챔버' : 
                         test.type === 'power' ? '파워' :
                         test.type === 'load' ? '로드' : '릴레이'}
                      </Typography>
                      {test.status === 'testing' && (
                        <CircularProgress size={20} sx={{ mb: 1 }} />
                      )}
                      <Chip
                        label={test.message}
                        color={getStatusColor(test.status)}
                        size="small"
                        sx={{ width: '100%', mb: 1 }}
                      />
                      {test.type === 'chamber' && (
                        <TemperatureDisplay temperature={test.temperature ?? null} />
                      )}
                                          {/* Voltage input for power type */}
                    {test.type === 'power' && (
                      <Box sx={{ mb: 1 }}>
                        <TextField
                          type="number"
                          label="전압 (V)"
                          value={test.voltage || 18.0}
                          onChange={(e) => handleVoltageChange(test.port, e.target.value)}
                          inputProps={{
                            step: 0.1,
                            min: -30.0,
                            max: 30.0
                          }}
                          size="small"
                          sx={{
                            width: '100%',
                            '& .MuiOutlinedInput-root': {
                              color: '#ffffff',
                              '& fieldset': {
                                borderColor: '#666',
                              },
                              '&:hover fieldset': {
                                borderColor: '#999',
                              },
                              '&.Mui-focused fieldset': {
                                borderColor: '#90CAF9',
                              },
                            },
                            '& .MuiInputLabel-root': {
                              color: '#999',
                              '&.Mui-focused': {
                                color: '#90CAF9',
                              },
                            },
                          }}
                        />
                      </Box>
                    )}
                    {/* Device number input for relay type */}
                    {test.type === 'relay' && (
                      <Box sx={{ mb: 1 }}>
                        <TextField
                          type="number"
                          label="기기 번호"
                          value={test.deviceNumber || 1}
                          onChange={(e) => handleDeviceNumberChange(test.port, e.target.value)}
                          inputProps={{
                            min: 1,
                            max: 10
                          }}
                          size="small"
                          sx={{
                            width: '100%',
                            '& .MuiOutlinedInput-root': {
                              color: '#ffffff',
                              '& fieldset': {
                                borderColor: '#666',
                              },
                              '&:hover fieldset': {
                                borderColor: '#999',
                              },
                              '&.Mui-focused fieldset': {
                                borderColor: '#90CAF9',
                              },
                            },
                            '& .MuiInputLabel-root': {
                              color: '#999',
                              '&.Mui-focused': {
                                color: '#90CAF9',
                              },
                            },
                          }}
                        />
                      </Box>
                    )}
                    {/* Channel selection and voltage display for load type */}
                    {test.type === 'load' && (
                      <Box sx={{ mb: 1 }}>
                        <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                          <TextField
                            type="number"
                            label="채널"
                            value={test.channel || 1}
                            onChange={(e) => handleChannelChange(test.port, e.target.value)}
                            inputProps={{
                              min: 1,
                              max: 5
                            }}
                            size="small"
                            sx={{
                              flex: 1,
                              '& .MuiOutlinedInput-root': {
                                color: '#ffffff',
                                '& fieldset': {
                                  borderColor: '#666',
                                },
                                '&:hover fieldset': {
                                  borderColor: '#999',
                                },
                                '&.Mui-focused fieldset': {
                                  borderColor: '#90CAF9',
                                },
                              },
                              '& .MuiInputLabel-root': {
                                color: '#999',
                                '&.Mui-focused': {
                                  color: '#90CAF9',
                                },
                              },
                            }}
                          />
                          <Box sx={{ 
                            flex: 1, 
                            display: 'flex', 
                            alignItems: 'center',
                            border: '1px solid #666',
                            borderRadius: '4px',
                            px: 1,
                            backgroundColor: '#1e1e1e'
                          }}>
                            <Typography variant="body2" sx={{ color: '#ffffff' }}>
                              {test.measuredVoltage !== null && test.measuredVoltage !== undefined ? `${test.measuredVoltage.toFixed(3)}V` : '--.---V'}
                            </Typography>
                          </Box>
                        </Box>

                        {/* Display measured voltage using VoltageDisplay component */}
                        {test.measuredVoltage !== null && test.measuredVoltage !== undefined && (
                          <VoltageDisplay voltage={test.measuredVoltage} />
                        )}
                      </Box>
                    )}
                      {test.type === 'relay' ? (
                        <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                          <Button
                            variant="contained"
                            size="small"
                            onClick={() => runRelayTest(test.port, 'ON')}
                            disabled={test.status === 'testing'}
                            sx={{ 
                              backgroundColor: '#2e7d32',
                              color: '#ffffff',
                              '&:hover': { backgroundColor: '#1b5e20' },
                              '&:disabled': { backgroundColor: '#666' },
                              flex: 1
                            }}
                          >
                            ON
                          </Button>
                          <Button
                            variant="contained"
                            size="small"
                            onClick={() => runRelayTest(test.port, 'OFF')}
                            disabled={test.status === 'testing'}
                            sx={{ 
                              backgroundColor: '#d32f2f',
                              color: '#ffffff',
                              '&:hover': { backgroundColor: '#c62828' },
                              '&:disabled': { backgroundColor: '#666' },
                              flex: 1
                            }}
                          >
                            OFF
                          </Button>
                        </Box>
                      ) : (
                        <Button
                          variant="contained"
                          size="small"
                          onClick={() => runSinglePortTest(test.port)}
                          disabled={test.status === 'testing'}
                          sx={{ 
                            backgroundColor: '#1976d2',
                            color: '#ffffff',
                            '&:hover': { backgroundColor: '#1565c0' },
                            '&:disabled': { backgroundColor: '#666' },
                            mt: 1,
                            width: '100%'
                          }}
                        >
                          RUN
                        </Button>
                      )}
                    </CardContent>
                  </Card>
              ))}
            </Box>
          </Box>


        </Box>
      </DialogContent>

      <DialogActions sx={{ p: 3, borderTop: '1px solid #333' }}>
        <Button 
          onClick={onClose}
          sx={{ 
            color: '#ffffff',
            borderColor: '#666',
            '&:hover': { borderColor: '#999' }
          }}
        >
          닫기
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default TestSystem; 