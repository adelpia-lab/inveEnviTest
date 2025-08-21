import React from 'react';

/**
 * 간단한 LogoImage 컴포넌트
 * 복잡한 스타일링 없이 기본적인 이미지 표시
 */
interface SimpleLogoImageProps {
  src: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
}

const SimpleLogoImage: React.FC<SimpleLogoImageProps> = ({
  src,
  alt,
  className = '',
  style = {}
}) => {
  const imageStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'contain', // cover 대신 contain 사용
    ...style
  };

  return (
    <div className={className} style={{ width: '100%', height: '100%' }}>
      <img 
        src={src} 
        alt={alt} 
        style={imageStyle}
        onLoad={() => console.log(`✅ SimpleLogoImage 로드 성공: ${src}`)}
        onError={() => console.error(`❌ SimpleLogoImage 로드 실패: ${src}`)}
      />
    </div>
  );
};

export default SimpleLogoImage; 