import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormControl from '@mui/material/FormControl';
import FormLabel from '@mui/material/FormLabel';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Paper from '@mui/material/Paper';
import Grid from '@mui/material/Grid';

export default function OptionSet1() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Box
      sx={{
        margin: "0 auto 1em auto",
        alignItems: 'center',
        backgroundColor: 'darkmode.background',
        p: 1,
        justifyContent: 'auto',
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Button
          variant="outlined"
          sx={{
            '&:hover': {
              backgroundColor: '#64B5F6',
            },
            width: '100%',
            mb: 1,
          }}
        >
          측정변수설정1
        </Button>
      </Box>
    </Box>
  );
} 