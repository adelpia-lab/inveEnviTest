import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

/**
 * TemperatureDisplay component
 * Displays temperature in a format similar to voltage display
 */
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
        backgroundColor: 'background.adelpia',
        justifyContent: 'center',
        p: 1,
      }}
    >
      <Typography variant="body1" component="span" color="primary" sx={{ mr: 1 }}>
        {prefixText}
      </Typography>
      <Box
        sx={{
          width: `80px`,
          border: '2px solid',
          borderColor: 'primary.main',
          borderRadius: '4px',
          px: 1,
          backgroundColor: 'background.default', 
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Typography variant="body1" component="span" color="text.primary">
          {formattedTemperature}
        </Typography>
      </Box>
      <Typography variant="body1" component="span" color="primary" sx={{ ml: 1 }}>
        {suffixText}
      </Typography>
    </Box>
  );
}

/**
 * ReadChamber component
 * Displays the read chamber interface with temperature display
 */
interface ReadChamberProps {
  onReadClick?: () => void;
  temperature?: number;
}

export default function ReadChamber({ onReadClick, temperature }: ReadChamberProps) {
  const handleReadClick = () => {
    if (onReadClick) {
      onReadClick();
    }
  };

  // Convert undefined to null for consistency
  const safeTemperature = temperature ?? null;

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'baseline',
          height: '30px',
          margin: '5px auto',
          borderColor: 'divider',
          borderRadius: '5px',
          backgroundColor: 'background.adelpia',
          p: 1,
          justifyContent: 'center',
        }}
      >
        <Typography variant="h6" component="span" color="white" sx={{ mr: 1 }}>
          챔버읽기
        </Typography>
        <Button 
          variant="outlined" 
          onClick={handleReadClick}
          size="small"
          sx={{ width: '80px' }}
        >
          READ
        </Button>
      </Box>
      <TemperatureDisplay temperature={safeTemperature} />
    </Box>
  );
}
