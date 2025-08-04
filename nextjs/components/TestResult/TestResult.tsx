import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

function ResultDisplay({ pass }) {
  
  return (
      <Box
        sx={{
          width:`80px`,
          border: '2px solid',
          borderColor: 'primary.main',
          borderRadius: '4px',
          px: 0.5,
          backgroundColor: 'background.default', 
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin:"1px",
        }}
      >
        <Typography variant="body2" component="span" color="text.primary">
          { pass }
        </Typography>
      </Box>
  );
}

export default function ReadVolt() {
  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
    <Box
      sx={{
        display: 'flex',
        alignItems: 'baseline',
        height: '30px',
        margin : '5px auto',
        borderColor: 'divider',
        borderRadius: '5px',
        backgroundColor: 'background.adelpia',
        p: 1,
        justifyContent: 'center',
      }}
    >
        <Typography variant="h6" component="span" color="white" sx={{ mr: 1 }}>
        측정결과
      </Typography>
      <Button variant='outlined' size="small"> READ </Button> 
      </Box>
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
        height: '60px',
        margin : '5px auto',
        borderColor: 'divider',
        borderRadius: '5px',
        backgroundColor: 'background.adelpia',
        p: 1,
      }}
    >
        < ResultDisplay pass={"#1 PASS"} />
        < ResultDisplay pass={"#2 PASS"} />
        < ResultDisplay pass={"#3 PASS"} />
        < ResultDisplay pass={"#4 PASS"} />
        < ResultDisplay pass={"#5 PASS"} />
        < ResultDisplay pass={"#6 PASS"} />
        < ResultDisplay pass={"#7 PASS"} />
        < ResultDisplay pass={"#8 PASS"} />
        < ResultDisplay pass={"#9 PASS"} />
        < ResultDisplay pass={"#10 PASS"} />
      </Box>
      </Box>
  );
}