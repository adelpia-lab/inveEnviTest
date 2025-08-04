import React, { useState, useRef } from 'react';
import { Button, Box } from '@mui/material';
import { Science as ScienceIcon } from '@mui/icons-material';
import TestSystem from './TestSystem';

interface TestSystemButtonProps {
  wsConnection: WebSocket | null;
}

const TestSystemButton: React.FC<TestSystemButtonProps> = ({ wsConnection }) => {
  const [isTestSystemOpen, setIsTestSystemOpen] = useState(false);
  const [shouldRestoreFocus, setShouldRestoreFocus] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleOpenTestSystem = () => {
    setIsTestSystemOpen(true);
  };

  const handleCloseTestSystem = () => {
    setIsTestSystemOpen(false);
    setShouldRestoreFocus(true);
  };

  const handleDialogExited = () => {
    if (shouldRestoreFocus) {
      setTimeout(() => {
        buttonRef.current?.focus();
        setShouldRestoreFocus(false);
      }, 50); // Delay to ensure aria-hidden is removed
    }
  };

  return (
    <Box>
      <Button
        ref={buttonRef}
        variant="contained"
        startIcon={<ScienceIcon />}
        onClick={handleOpenTestSystem}
        sx={{
          backgroundColor: '#9c27b0',
          color: '#ffffff',
          '&:hover': {
            backgroundColor: '#7b1fa2'
          },
          borderRadius: '8px',
          padding: '8px 16px',
          textTransform: 'none',
          fontWeight: 500
        }}
      >
        시스템 테스트
      </Button>

      <TestSystem
        open={isTestSystemOpen}
        onClose={handleCloseTestSystem}
        onExited={handleDialogExited}
        wsConnection={wsConnection}
      />
    </Box>
  );
};

export default TestSystemButton; 