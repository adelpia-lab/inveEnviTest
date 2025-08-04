import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

function VoltageDisplay({ channel, voltage }: { channel: number, voltage: number | null }) {
  const formattedVoltage =
    typeof voltage === 'number' ? voltage.toFixed(2) : '--.--';
  const prefixText = `CH${channel}`;
  const suffixText = `VOLT`;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'baseline',
        height: '40px',
        // border: '1px solid', // 테마 색상을 따르도록 border 색상 제거
        borderColor: 'divider', // 구분선 색상 사용 (다크 모드에 맞게 자동 조정)
        borderRadius: '5px',
        backgroundColor: 'background.adelpia', // 테마의 paper 배경색 사용
        // p: 2,
        justifyContent: 'center',
      }}
    >
      <Typography variant="h6" component="span" color="primary" sx={{ mr: 1 }}>
        {prefixText}
      </Typography>
      <Box
        sx={{
          width:`100px`,
          border: '2px solid',
          borderColor: 'primary.main',
          borderRadius: '4px',
          px: 1.5,
          // py: 0.0,
          backgroundColor: 'background.default', 
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Typography variant="h6" component="span" color="text.primary">
          {formattedVoltage}
        </Typography>
      </Box>
      <Typography variant="h6" component="span" color="primary" sx={{ ml: 1 }}>
        {suffixText}
      </Typography>
    </Box>
  );
}

interface ReadVoltProps {
  onReadClick?: () => void;
  voltages?: number[];
}

export default function ReadVolt({ onReadClick, voltages }: ReadVoltProps) {
  const handleReadClick = () => {
    if (onReadClick) {
      onReadClick();
    }
  };

  // 5채널 값, 없으면 '--.--' 표시
  const safeVoltages = voltages && voltages.length === 5 ? voltages : [null, null, null, null, null];

  return (
    <Box >
    <Box
      sx={{
        display: 'flex',
        alignItems: 'baseline',
        height: '40px',
        margin : '1em auto',
        borderColor: 'divider', // 구분선 색상 사용 (다크 모드에 맞게 자동 조정)
        borderRadius: '5px',
        backgroundColor: 'background.adelpia', // 테마의 paper 배경색 사용
        p: 2,
        justifyContent: 'center',
      }}
    >
        <Typography variant="h6" component="span" color="white" sx={{ mr: 1 }}>
        채널전압
      </Typography>
      <Button variant='outlined' onClick={handleReadClick}> READ </Button> 
      </Box>     
        {safeVoltages.map((v, i) => (
          <VoltageDisplay key={i} channel={i+1} voltage={v} />
        ))}
    </Box>
  );
}