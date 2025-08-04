import React, { useState, useEffect } from 'react';

/**
 * 디버깅용 LogoImage 컴포넌트
 * 이미지가 보이지 않는 원인을 파악하기 위한 임시 컴포넌트
 */
const DebugLogoImage: React.FC = () => {
  const [testResults, setTestResults] = useState<string[]>([]);

  const addLog = (message: string) => {
    setTestResults(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
    console.log(message);
  };

  useEffect(() => {
    addLog('🔍 DebugLogoImage 컴포넌트 마운트됨');
    
    // 이미지 파일 존재 여부 확인
    const testImage = new Image();
    testImage.onload = () => {
      addLog(`✅ 이미지 로드 성공: /img/adelLogo.png (${testImage.naturalWidth}x${testImage.naturalHeight})`);
    };
    testImage.onerror = () => {
      addLog('❌ 이미지 로드 실패: /img/adelLogo.png');
    };
    testImage.src = '/img/adelLogo.png';
  }, []);

  return (
    <div style={{ 
      border: '2px solid red', 
      padding: '10px', 
      margin: '10px',
      backgroundColor: '#f0f0f0',
      color: '#000'
    }}>
      <h3>🔧 디버깅 정보</h3>
      
      {/* 기본 이미지 테스트 */}
      <div style={{ marginBottom: '20px' }}>
        <h4>1. 기본 이미지 테스트</h4>
        <img 
          src="/img/adelLogo.png" 
          alt="Basic Test" 
          style={{ 
            width: '100px', 
            height: '50px', 
            border: '1px solid blue',
            objectFit: 'contain'
          }}
          onLoad={() => addLog('✅ 기본 img 태그 로드 성공')}
          onError={() => addLog('❌ 기본 img 태그 로드 실패')}
        />
      </div>

      {/* 절대 위치 테스트 */}
      <div style={{ 
        position: 'relative', 
        width: '100px', 
        height: '50px', 
        border: '1px solid green',
        marginBottom: '20px',
        overflow: 'hidden'
      }}>
        <h4>2. 절대 위치 테스트</h4>
        <img 
          src="/img/adelLogo.png" 
          alt="Absolute Test" 
          style={{ 
            width: '103%',
            height: '103%',
            objectFit: 'cover',
            position: 'absolute',
            top: '-1.5%',
            left: '-1.5%',
            margin: 0,
            padding: 0
          }}
          onLoad={() => addLog('✅ 절대 위치 이미지 로드 성공')}
          onError={() => addLog('❌ 절대 위치 이미지 로드 실패')}
        />
      </div>

      {/* 로그 출력 */}
      <div style={{ 
        backgroundColor: '#000', 
        color: '#0f0', 
        padding: '10px', 
        fontSize: '12px',
        maxHeight: '200px',
        overflow: 'auto'
      }}>
        <h4>📋 디버그 로그</h4>
        {testResults.map((log, index) => (
          <div key={index}>{log}</div>
        ))}
      </div>
    </div>
  );
};

export default DebugLogoImage; 