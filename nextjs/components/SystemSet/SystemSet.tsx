import * as React from 'react';
import Stack from "@mui/material/Stack";
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import ProductInput from "./ProductInput";
import UsbPortSettingsSelectDialog from "./UsbPortSet";

interface SystemSetProps {
  onTestClick?: () => void;
  wsConnection?: WebSocket;
}

export default function SystemSet({ onTestClick, wsConnection }: SystemSetProps) {

  const handleTestClick = () => {
    if (onTestClick) {
      onTestClick();
    }
  };

  return (
    <Box
      sx={{
        margin: "1em auto",
        alignItems: 'center',
        backgroundColor: 'background.adelpia', // 테마의 paper 배경색 사용
        p: 1,
        justifyContent: 'center',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Typography variant="h6" component="span" color="white" sx={{ mr: 1 }}>
        테스터 설정
      </Typography>

      <Stack spacing={2} direction="column" sx={{ alignItems: 'center' }}>
        <ProductInput wsConnection={wsConnection} />
        <UsbPortSettingsSelectDialog />
        <Button 
          variant="outlined" 
          color="primary" 
          onClick={handleTestClick}
          size="large"
          sx={{ mt: 1, width: '120px' }}
        >
          TEST
        </Button>
      </Stack>
    </Box>
  );
}