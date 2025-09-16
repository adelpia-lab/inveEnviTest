import React, { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { useIsClient } from '../../lib/useIsClient';

export default function DeviceSelect({initialValue, onSelectionChange, wsConnection, onTimeModeClick}) {
  const devices = [
    { value: "#1 Device", label: "#1", index: 0 },
    { value: "#2 Device", label: "#2", index: 1 },
    { value: "#3 Device", label: "#3", index: 2 },
    { value: "#4 Device", label: "#4", index: 3 },
    { value: "#5 Device", label: "#5", index: 4 },
    { value: "#6 Device", label: "#6", index: 5 },
    { value: "#7 Device", label: "#7", index: 6 },
    { value: "#8 Device", label: "#8", index: 7 },
    { value: "#9 Device", label: "#9", index: 8 },
    { value: "#10 Device", label: "#A", index: 9 }
  ];

  // Default states - same for server and client
  const defaultStates = [true, false, false, false, false, false, false, false, false, false];

  // Initialize state with default values to prevent hydration mismatch
  const [deviceStates, setDeviceStates] = useState<boolean[]>(defaultStates);
  const [tempDeviceStates, setTempDeviceStates] = useState<boolean[]>(defaultStates);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isReading, setIsReading] = useState(false);
  const [isSimulationEnabled, setIsSimulationEnabled] = useState(false);
  const isClient = useIsClient();

  // Load stored values from localStorage only after client-side hydration
  useEffect(() => {
    if (!isClient) return;

    const loadStoredDeviceStates = () => {
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('deviceStates');
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            // 배열 형태로 저장된 경우
            if (Array.isArray(parsed) && parsed.length === 10) {
              return parsed;
            }
            // 기존 객체 형태로 저장된 경우 (마이그레이션)
            else if (typeof parsed === 'object' && parsed !== null) {
              // console.log('🔄 Migrating from object format to array format');
              const arrayFormat = devices.map(device => parsed[device.value] || false);
              // console.log('🔄 Migrated device states:', arrayFormat);
              return arrayFormat;
            }
          } catch (error) {
            console.error('Failed to parse stored device states:', error);
          }
        }
      }
      return defaultStates;
    };

    const storedStates = loadStoredDeviceStates();
    setDeviceStates(storedStates);
    setTempDeviceStates(storedStates);
    setIsLoading(false);
  }, [isClient]);

  // WebSocket message handler
  useEffect(() => {
    if (!wsConnection) return;

    const handleMessage = (event) => {
      const message = event.data;
      
      // Handle device states response from server
      if (typeof message === 'string' && message.startsWith('Initial device states:')) {
        try {
          const match = message.match(/Initial device states: (.*)/);
          if (match && match[1]) {
            const serverStates = JSON.parse(match[1]);
            if (Array.isArray(serverStates) && serverStates.length === 10) {
              console.log('📥 Received device states from server:', serverStates);
              setDeviceStates(serverStates);
              setTempDeviceStates(serverStates);
              // Update localStorage with server data
              if (typeof window !== 'undefined') {
                localStorage.setItem('deviceStates', JSON.stringify(serverStates));
              }
            }
          }
        } catch (error) {
          console.error('Failed to parse device states from server:', error);
        }
      }
      
      // Handle device states saved confirmation
      if (typeof message === 'string' && message.startsWith('Device states saved:')) {
        try {
          const match = message.match(/Device states saved: (.*)/);
          if (match && match[1]) {
            const savedStates = JSON.parse(match[1]);
            console.log('✅ Device states saved on server:', savedStates);
          }
        } catch (error) {
          console.error('Failed to parse saved device states:', error);
        }
      }
      
      // Handle simulation status updates
      if (typeof message === 'string' && message.startsWith('[SIMULATION_STATUS]')) {
        try {
          const match = message.match(/\[SIMULATION_STATUS\] (.*)/);
          if (match && match[1]) {
            const simulationStatus = match[1] === 'true';
            console.log('🔄 Received simulation status from server:', simulationStatus);
            setIsSimulationEnabled(simulationStatus);
          }
        } catch (error) {
          console.error('Failed to parse simulation status from server:', error);
        }
      }
      
      // Handle error messages
      if (typeof message === 'string' && message.startsWith('Error:')) {
        console.error('❌ Server error:', message);
      }
    };

    wsConnection.addEventListener('message', handleMessage);
    return () => {
      wsConnection.removeEventListener('message', handleMessage);
    };
  }, [wsConnection]);

  const handleCheckboxChange = (deviceIndex) => {
    if (isSelectionMode) {
      setTempDeviceStates(prev => {
        const newStates = [...prev];
        newStates[deviceIndex] = !newStates[deviceIndex];
        // console.log(`🔄 Updated tempDeviceStates[${deviceIndex}] to ${newStates[deviceIndex]}`);
        return newStates;
      });
    }
  };

  const handleSelectButtonClick = () => {
    setIsSelectionMode(true);
    setTempDeviceStates([...deviceStates]);
  };

  const handleReadButtonClick = () => {
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
      setIsReading(true);
      // Request device states from server
      wsConnection.send('[DEVICE_READ]');
      console.log('📤 Requesting device states from server');
      
      // Reset reading state after 3 seconds
      setTimeout(() => {
        setIsReading(false);
      }, 3000);
    }
  };

  const handleAcceptClick = () => {
    // console.log("=== Accept button clicked - saving device states (array) ===");
    // console.log("Current tempDeviceStates (array):", tempDeviceStates);
    // console.log("WebSocket connection status:", wsConnection ? wsConnection.readyState : 'No connection');
    
    // 1. 로컬 상태 업데이트
    setDeviceStates([...tempDeviceStates]);
    setIsSelectionMode(false);
    setIsSaved(true);
    
    // 2. localStorage에 배열 형태로 저장
    if (typeof window !== 'undefined') {
      localStorage.setItem('deviceStates', JSON.stringify(tempDeviceStates));
      // console.log("✅ Device states saved to localStorage (array):", tempDeviceStates);
    }
    
    // 3. WebSocket을 통해 서버에 전송 - Fix: Send device indices instead of device names
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
      const selectedDeviceIndices = tempDeviceStates
        .map((isSelected, index) => isSelected ? index : null)
        .filter(index => index !== null);
      
      const message = `[DEVICE_SELECT] ${JSON.stringify(selectedDeviceIndices)}`;
      wsConnection.send(message);
      console.log("📤 Sent device selection to server:", message);
    }
    
    // 4. 상위 컴포넌트 콜백 호출 - 선택된 디바이스 인덱스 배열 전달
    if (onSelectionChange) {
      const selectedDeviceIndices = tempDeviceStates
        .map((isSelected, index) => isSelected ? index : null)
        .filter(index => index !== null);
      onSelectionChange(selectedDeviceIndices);
    }
    
    // 5. 저장 상태 표시 (3초 후 자동 해제)
    setTimeout(() => {
      setIsSaved(false);
    }, 3000);
  };

  const handleCancelClick = () => {
    setIsSelectionMode(false);
    setTempDeviceStates([...deviceStates]);
  };

  const handleSimulationToggle = () => {
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
      const newSimulationState = !isSimulationEnabled;
      const message = `[SIMULATION_TOGGLE] ${newSimulationState}`;
      wsConnection.send(message);
      console.log('📤 Toggling simulation mode:', message);
    }
  };

  const isDeviceSelected = (deviceIndex) => {
    const isSelected = isSelectionMode ? 
      tempDeviceStates[deviceIndex] : 
      deviceStates[deviceIndex];
    
    return isSelected;
  };

  // Don't render until client-side hydration is complete
  if (!isClient) {
    return (
      <Box
        sx={{
          margin: "0 0.5em 0.5em 0.5em",
          alignItems: 'center',
          backgroundColor: 'darkmode.background',
          p: 0.5,
          justifyContent: 'auto',
          maxHeight: '540px',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 0.5 }}>
          <Typography variant="caption" color="info.main" sx={{ fontSize: '0.7rem' }}>
            로딩 중...
          </Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box
     sx={{
        margin: "0 0.5em 0.5em 0.5em",
        alignItems: 'center',
        backgroundColor: 'darkmode.background',
        p: 0.5, // 패딩 줄임
        justifyContent: 'auto',
        maxHeight: '540px',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 0.5, gap: 1 }}> {/* 마진 줄임 */}
        {!isSelectionMode ? (
          <>
            <Button 
              variant="outlined" 
              color="primary" 
              onClick={handleSelectButtonClick}
              size="small"
              disabled={isLoading}
              sx={{ py: 0.5 }} // 버튼 높이 줄임
            >
              선택
            </Button>
            <Button 
              variant="outlined" 
              color="secondary" 
              onClick={handleReadButtonClick}
              size="small"
              disabled={isLoading || isReading}
              sx={{ py: 0.5 }} // 버튼 높이 줄임
            >
              {isReading ? '읽는 중...' : 'READ'}
            </Button>

          </>
        ) : null}
        {isLoading && (
          <Typography 
            variant="caption" 
            color="info.main" 
            sx={{ ml: 1, fontSize: '0.7rem' }}
          >
            로딩 중...
          </Typography>
        )}
        {isSaved && (
          <Typography 
            variant="caption" 
            color="success.main" 
            sx={{ ml: 1, fontSize: '0.7rem' }}
          >
            저장됨 ✓
          </Typography>
        )}
      </Box>

      <Box sx={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(2, 1fr)', // 2열 그리드로 변경
        gap: 0.5, // 간격 줄임
        maxHeight: '400px',
        overflow: 'auto'
      }}>
        {devices.map((device) => {
          const isSelected = isDeviceSelected(device.index);
          
          return (
            <FormControlLabel
              key={device.value} // Use stable key
              control={
                <Checkbox
                  checked={isSelected}
                  onChange={() => handleCheckboxChange(device.index)}
                  disabled={!isSelectionMode || isLoading}
                  size="small" // 체크박스 크기 줄임
                  sx={{
                    color: 'white',
                    '&.Mui-checked': {
                      color: 'primary.main',
                    },
                    padding: '2px', // 패딩 줄임
                  }}
                />
              }
              label={device.label}
              sx={{
                color: 'white',
                fontSize: '0.75rem', // 폰트 크기 줄임
                minWidth: 'fit-content',
                margin: 0, // 마진 제거
                padding: '2px', // 패딩 줄임
              }}
            />
          );
        })}
      </Box>
      
      {/* 시뮬레이션 토글 버튼과 TimeMode 버튼을 inner grid로 배치 */}
      <Box sx={{ 
        display: 'grid',
        gridTemplateColumns: '1fr 1fr', // 2열 그리드
        gap: 1,
        mt: 1,
        mb: 1
      }}>
        <Button 
          variant={isSimulationEnabled ? "contained" : "outlined"}
          color={isSimulationEnabled ? "warning" : "info"}
          onClick={handleSimulationToggle}
          size="small"
          disabled={!wsConnection || wsConnection.readyState !== WebSocket.OPEN}
          sx={{ 
            py: 0.5,
            px: 1,
            fontSize: '0.7rem',
            fontWeight: 'bold'
          }}
        >
          {isSimulationEnabled ? '시뮬레이션 ON' : '시뮬레이션 OFF'}
        </Button>
        <Button 
          variant="outlined"
          color="primary"
          onClick={() => {
            console.log('TimeMode button clicked in DeviceSelect');
            if (onTimeModeClick) {
              onTimeModeClick();
            } else {
              console.error('onTimeModeClick prop is not provided');
            }
          }}
          size="small"
          sx={{ 
            py: 0.5,
            px: 1,
            fontSize: '0.7rem',
            fontWeight: 'bold'
          }}
        >
          TimeMode
        </Button>
      </Box>

      {isSelectionMode && (
        <Box sx={{ 
          display: 'flex', 
          flexDirection: 'row', // 가로 배치로 변경
          gap: 1, 
          mt: 1, // 마진 줄임
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <Button 
            variant="contained" 
            color="error" 
            onClick={handleCancelClick}
            size="small"
            sx={{ width: '80px', py: 0.5 }} // 버튼 크기 줄임
          >
            Cancel
          </Button>
          <Button 
            variant="contained" 
            color="success" 
            onClick={handleAcceptClick}
            size="small"
            sx={{ width: '80px', py: 0.5 }} // 버튼 크기 줄임
          >
            Accept
          </Button>
        </Box>
      )}
    </Box>
  );
}


