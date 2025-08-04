import React, { useState } from 'react';

function PowerSwitch() {
  const [isOn, setIsOn] = useState(false);

  const handleClick = () => {
    setIsOn(!isOn);
  };

  return (
    <button 
      onClick={handleClick} 
      style={{ 
        background: 'none', 
        border: 'none', 
        padding: 0, 
        cursor: 'pointer',
        width: '98%',
        height: '98%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden'
      }}
    >
      <img
        src={isOn ? '/img/powerOn.png' : '/img/powerOff.png'}
        alt="Power Button"
        style={{ 
          width: '100%', 
          height: '100%',
          objectFit: 'contain'
        }}
      />
    </button>
  );
}

export default PowerSwitch;