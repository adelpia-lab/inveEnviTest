import React from 'react';

interface GroupImageProps {
  className?: string;
  style?: React.CSSProperties;
}

const GroupImage: React.FC<GroupImageProps> = ({ className, style }) => {
  return (
    <img 
      src="/img/Group38.png" 
      alt="Adel Logo" 
      className={className}
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'contain',
        position: 'relative',
        margin: 0,
        padding: 0,
        ...style
      }}
    />
  );
};

export default GroupImage; 