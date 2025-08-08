// UsbPortSettingsSelectDialog.jsx
import React, { useState } from 'react';
import {
  Button,
  Box,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

export default function UsbPortSettingsSelectDialog() {
  const [open, setOpen] = useState(false);

  // COM1부터 COM20까지의 옵션 생성
  const comPortOptions = Array.from({ length: 20 }, (_, i) => `COM${i + 1}`);

  const portLabels = ['POWER', 'LOAD', 'RELAY', 'VOLT'];

  const [usbPortSelections, setUsbPortSelections] = useState(Array(portLabels.length).fill(''));

  const handleClickOpen = () => {
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
  };

  const handlePortSelectionChange = (index, event) => {
    const newSelections = [...usbPortSelections];
    newSelections[index] = event.target.value;
    setUsbPortSelections(newSelections);
  };

  const handleSaveSettings = () => {
    console.log("저장된 USB PORT 선택 (레이블 포함):", usbPortSelections.map((selection, index) => ({
      label: portLabels[index],
      value: selection
    })));
    alert('콘솔을 확인하여 저장된 USB PORT 선택 설정을 확인하세요.');
    handleClose();
  };

  return (
    <Box sx={{ p: 1, textAlign: 'center', mt: 4, display: 'flex', justifyContent: 'center' }}>
      <Button 
        variant="outlined" 
        onClick={handleClickOpen} 
        size="large"
        sx={{ width: '120px' }}
      >
        USBSet
      </Button>

      <Dialog
        open={open}
        onClose={handleClose}
        aria-labelledby="usb-port-select-dialog-title"
        fullWidth
        maxWidth="md"
      >
        <DialogTitle id="usb-port-select-dialog-title">
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>[전원, 로드, 릴레이, 챔버]의 USB Port 설정</span>
            <IconButton
              aria-label="close"
              onClick={handleClose}
              sx={{
                color: (theme) => theme.palette.grey[500],
              }}
            >
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 4 }}>
            {usbPortSelections.map((selection, index) => (
              <Box key={index}>
                <FormControl sx={{maxWidth:"md"}} fullWidth variant="outlined">
                  <InputLabel sx={{maxWidth:"md"}} id={`usb-port-${index}-label`} shrink={true}>
                    {portLabels[index]}
                  </InputLabel>
                  <Select
                    labelId={`usb-port-${index}-label`}
                    id={`usb-port-${index}-select`}
                    value={selection}
                    label={portLabels[index]}
                    onChange={(event) => handlePortSelectionChange(index, event)}
                  >
                    <MenuItem value="">
                      <em>선택 안 함</em>
                    </MenuItem>
                    {comPortOptions.map((option) => (
                      <MenuItem key={option} value={option}>
                        {option}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
            ))}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} color="error">
            취소
          </Button>
          <Button onClick={handleSaveSettings} color="primary" variant="contained">
            설정 저장
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
