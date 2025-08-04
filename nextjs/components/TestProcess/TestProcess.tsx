import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

type TestProcessProps = {
  onClick: (value: string) => void;
};

export default function TestProcess({ onClick }: TestProcessProps) {
  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'baseline',
          height: '40px',
          margin: '1em auto',
          borderColor: 'divider',
          borderRadius: '5px',
          backgroundColor: 'background.adelpia',
          p: 2,
          justifyContent: 'center',
        }}
      >
        <Typography variant="h6" component="span" color="white" sx={{ mr: 1 }}>
          테스터 진행 상황
        </Typography>
        <Button variant="outlined"> STOP </Button>
      </Box>
      <Button id="txtButton1" color="success" sx={{ height: "25px" }} onClick={() => onClick('#1 온도상승')}>#1 온도상승 30분 대기 완료</Button>
      <Button id="txtButton2" color="warning" sx={{ height: "25px" }} onClick={() => onClick('#2 고온시험')}>#2 고온(75도) +18V ON/OFF 시험 중 (5/10)</Button>
      <Button id="txtButton3" color="primary" sx={{ height: "25px" }} onClick={() => onClick('#3 고온시험')}>#3 고온(75도) +24V ON/OFF 시험((0/10)</Button>
      <Button id="txtButton4" color="primary" sx={{ height: "25px" }} onClick={() => onClick('#4 고온시험')}>#4 고온(75도) +30V ON/OFF 시험((0/10)</Button>
      <Button id="txtButton5" color="primary" sx={{ height: "25px" }} onClick={() => onClick('#5 저온하강')}>#5 저온 하강</Button>
      <Button id="txtButton6" color="primary" sx={{ height: "25px" }} onClick={() => onClick('#6 저온시험')}>#6 저온(-32도) +18V ON/OFF 시험(0/10)</Button>
      <Button id="txtButton7" color="primary" sx={{ height: "25px" }} onClick={() => onClick('#7 저온시험')}>#7 저온(-32도) +24V ON/OFF 시험(0/10)</Button>
      <Button id="txtButton8" color="primary" sx={{ height: "25px" }} onClick={() => onClick('#8 저온시험')}>#8 저온(-32도) +30V ON/OFF 시험</Button>
   </Box>
  );
}