import React, { useState, useEffect, useRef } from 'react';

/**
 * LogoImage 컴포넌트
 * 
 * @param {Object} props - 컴포넌트 속성
 * @param {string} props.src - 이미지 소스 경로
 * @param {string} props.alt - 이미지 대체 텍스트
 * @param {string} [props.className] - 추가 CSS 클래스명
 * @param {React.CSSProperties} [props.style] - 추가 인라인 스타일
 * @param {number} [props.widthScale=1.03] - 너비 스케일 (기본값: 103%)
 * @param {number} [props.heightScale=1.03] - 높이 스케일 (기본값: 103%)
 * @param {number} [props.offsetScale=0.015] - 오프셋 스케일 (기본값: 1.5%)
 */
interface LogoImageProps {
  src: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  widthScale?: number;
  heightScale?: number;
  offsetScale?: number;
}

const LogoImage: React.FC<LogoImageProps> = ({
  src,
  alt,
  className = '',
  style = {},
  widthScale = 1.03,
  heightScale = 1.03,
  offsetScale = 0.015
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const imgRef = useRef<HTMLImageElement>(null);

  // 이미지 로드 상태 확인 함수
  const checkImageLoaded = () => {
    if (imgRef.current) {
      const img = imgRef.current;
      // 이미지가 완전히 로드되었는지 확인
      if (img.complete && img.naturalWidth > 0) {
        setIsLoaded(true);
        setHasError(false);
        setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
        console.log(`✅ 이미지 이미 로드됨: ${src}`, {
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          displayWidth: img.width,
          displayHeight: img.height
        });
        return true;
      }
    }
    return false;
  };

  // 이미지 로드 성공 핸들러
  const handleLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
    const img = event.currentTarget;
    setIsLoaded(true);
    setHasError(false);
    setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    console.log(`✅ 이미지 로드 성공: ${src}`, {
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      displayWidth: img.width,
      displayHeight: img.height
    });
  };

  // 이미지 로드 실패 핸들러
  const handleError = (event: React.SyntheticEvent<HTMLImageElement>) => {
    setIsLoaded(false);
    setHasError(true);
    console.error(`❌ 이미지 로드 실패: ${src}`, {
      error: event,
      src: src,
      timestamp: new Date().toISOString()
    });
  };

  // 컴포넌트 마운트 시 이미지 상태 확인
  useEffect(() => {
    // 즉시 확인 (캐시된 이미지)
    if (checkImageLoaded()) {
      return;
    }

    // 약간의 지연 후 다시 확인
    const timer1 = setTimeout(() => {
      if (checkImageLoaded()) {
        return;
      }
      
      // 추가 지연 후 최종 확인
      const timer2 = setTimeout(() => {
        if (!checkImageLoaded()) {
          console.log(`⏳ 이미지 로딩 대기 중: ${src}`);
        }
      }, 200);

      return () => clearTimeout(timer2);
    }, 50);

    return () => clearTimeout(timer1);
  }, [src]);

  // 이미지 스타일 계산
  const imageStyle: React.CSSProperties = {
    width: `${widthScale * 100}%`,
    height: `${heightScale * 100}%`,
    objectFit: 'cover',
    position: 'absolute',
    top: `-${offsetScale * 100}%`,
    left: `-${offsetScale * 100}%`,
    margin: 0,
    padding: 0,
    ...style
  };

  // 컨테이너 스타일 - 명시적인 크기 설정
  const containerStyle: React.CSSProperties = {
    overflow: 'hidden',
    position: 'relative',
    width: '100%',        // 명시적 너비
    height: '100%',       // 명시적 높이
    minHeight: '60px',    // 최소 높이 보장
    minWidth: '60px',     // 최소 너비 보장
    display: 'flex',      // flexbox 사용
    alignItems: 'center', // 세로 중앙 정렬
    justifyContent: 'center' // 가로 중앙 정렬
  };

  // 디버깅 정보 출력
  useEffect(() => {
    console.log(`🔍 LogoImage 컴포넌트 렌더링:`, {
      src,
      alt,
      className,
      widthScale,
      heightScale,
      offsetScale,
      isLoaded,
      hasError
    });
  }, [src, alt, className, widthScale, heightScale, offsetScale, isLoaded, hasError]);

  return (
    <div className={className} style={containerStyle}>
      {/* 로딩 상태 표시 */}
      {!isLoaded && !hasError && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: '#666',
          fontSize: '12px',
          zIndex: 1
        }}>
          로딩 중...
        </div>
      )}
      
      {/* 에러 상태 표시 */}
      {hasError && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: '#ff4444',
          fontSize: '12px',
          textAlign: 'center',
          zIndex: 1
        }}>
          <div>❌ 이미지 로드 실패</div>
          <div style={{ fontSize: '10px', marginTop: '4px' }}>{src}</div>
        </div>
      )}
      
      <img 
        ref={imgRef}
        src={src} 
        alt={alt} 
        style={imageStyle}
        onLoad={handleLoad}
        onError={handleError}
        crossOrigin="anonymous" // CORS 이슈 방지
      />
      
      {/* 디버깅 정보 (개발 모드에서만 표시) */}
      {process.env.NODE_ENV === 'development' && (
        <div style={{
          position: 'absolute',
          bottom: '2px',
          right: '2px',
          fontSize: '8px',
          color: '#888',
          backgroundColor: 'rgba(0,0,0,0.7)',
          padding: '2px 4px',
          borderRadius: '2px',
          zIndex: 2
        }}>
         {/* {isLoaded ? '✅' : hasError ? '❌' : '⏳'} {imageDimensions.width}x{imageDimensions.height} */}
        </div>
      )}
    </div>
  );
};

export default LogoImage; 