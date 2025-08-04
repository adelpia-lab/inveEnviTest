import * as React from 'react';
import FormGroup from '@mui/material/FormGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';

export function RelayCheckBox1() {
  return (
    <FormGroup>
      <FormControlLabel control={<Checkbox />} label="RELAY #1" />
      <FormControlLabel control={<Checkbox />} label="RELAY #2" />
      <FormControlLabel control={<Checkbox />} label="RELAY #3" />
      <FormControlLabel control={<Checkbox />} label="RELAY #4" />
      <FormControlLabel control={<Checkbox />} label="RELAY #5" />
      <FormControlLabel control={<Checkbox />} label="RELAYOFF" />
    </FormGroup>
  );
}

export function RelayCheckBox2() {
  return (
    <FormGroup>
      <FormControlLabel control={<Checkbox />} label="RELAY #6" />
      <FormControlLabel control={<Checkbox />} label="RELAY #7" />
      <FormControlLabel control={<Checkbox />} label="RELAY #8" />
      <FormControlLabel control={<Checkbox />} label="RELAY #9" />
      <FormControlLabel control={<Checkbox />} label="RELAY #10" />
    </FormGroup>
  );
}
