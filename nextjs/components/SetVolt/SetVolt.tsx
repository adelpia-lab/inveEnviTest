
import React, { useState } from 'react';
//import * as React from 'react';
import Box from '@mui/material/Box';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormControl from '@mui/material/FormControl';
import FormLabel from '@mui/material/FormLabel';
import Typography from '@mui/material/Typography';

export default function SetVolt({initialValue, onSelectionChange}) {

  const [selectedValue, setSelectedValue] = useState(initialValue || "PowerOff");

  const handleRadioGroupChange = (event) => {
    const newValue = event.target.value;
    setSelectedValue(newValue); // 내부 상태 업데이트

    // 상위 컴포넌트로 변경된 값 전달
    if (onSelectionChange) {
      onSelectionChange(newValue);
    }
    console.log("SetVolt: 값이 변경되었습니다:", newValue);
  };

  return (
    <Box
     sx={{
        margin: "1em auto",
        alignItems: 'center',
        backgroundColor: 'background.adelpia', // 테마의 paper 배경색 사용
        p: 1,
        justifyContent: 'center',
      }}
    >
      <Typography variant="h6" component="span" color="white" sx={{ mr: 1 }}>
        전압설정
      </Typography>
  <FormControl>
      <RadioGroup  row
        aria-labelledby="demo-row-radio-buttons-group-label"
        name="row-radio-buttons-group"
        value={selectedValue}
        onChange={handleRadioGroupChange} 
      >
        <FormControlLabel value="PowerOff" control={<Radio />} label="PowerOff" />
        <FormControlLabel value="DC+18V"   control={<Radio />} label="DC+18V" />
        <FormControlLabel value="DC+24V"   control={<Radio />} label="DC+24V" />
        <FormControlLabel value="DC+30V"   control={<Radio />} label="DC+30V"  />
      </RadioGroup>
    </FormControl>
    </Box>
  );
}


