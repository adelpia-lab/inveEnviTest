'use client';
import React, { useState, useEffect, useMemo } from 'react';

interface TimeProgressWindowProps {
  isVisible: boolean;
  testDuration: number; // 총 테스트 시간 (분)
  testStartTime: number | null; // 테스트 시작 시간
}

export default function TimeProgressWindow({
  isVisible,
  testDuration,
  testStartTime
}: TimeProgressWindowProps) {
  const [currentTime, setCurrentTime] = useState(Date.now());

  // 시간 계산 함수를 useMemo로 최적화
  const timeData = useMemo(() => {
    if (!testStartTime || testDuration <= 0) {
      return null;
    }
    
    const elapsedTime = currentTime - testStartTime;
    const elapsedMinutes = Math.floor(elapsedTime / (1000 * 60));
    const remainingMinutes = Math.max(0, testDuration - elapsedMinutes);
    const progressPercentage = Math.min(100, Math.max(0, (elapsedTime / (testDuration * 60 * 1000)) * 100));
    
    return {
      elapsedMinutes,
      remainingMinutes,
      totalMinutes: testDuration,
      progressPercentage
    };
  }, [currentTime, testStartTime, testDuration]);

  // 실시간 업데이트를 위한 useEffect
  useEffect(() => {
    if (!isVisible || !testStartTime || testDuration <= 0) return;
    
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000); // 1초마다 업데이트
    
    return () => clearInterval(interval);
  }, [isVisible, testStartTime, testDuration]);

  // 시간진행 윈도우가 표시되지 않으면 null 반환
  if (!isVisible) {
    return null;
  }

  if (!timeData) {
    return null;
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      backgroundColor: 'rgba(0,0,0,0.9)',
      color: 'white',
      padding: '15px',
      fontSize: '14px',
      borderRadius: '8px',
      border: '2px solid #90CAF9',
      minWidth: '300px',
      zIndex: 1000
    }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
        <span style={{ fontSize: '18px', marginRight: '8px' }}>⏰</span>
        <span style={{ fontWeight: 'bold', color: '#90CAF9' }}>
          테스트 진행 중
        </span>
      </div>
      
      <div style={{ marginBottom: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
          <span>경과 시간:</span>
          <span style={{ color: '#4CAF50', fontWeight: 'bold' }}>
            {timeData.elapsedMinutes}분
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
          <span>남은 시간:</span>
          <span style={{ color: '#FF9800', fontWeight: 'bold' }}>
            {timeData.remainingMinutes}분
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
          <span>총 예상 시간:</span>
          <span style={{ color: '#2196F3', fontWeight: 'bold' }}>
            {timeData.totalMinutes}분
          </span>
        </div>
      </div>
      
      {/* 진행률 바 */}
      <div style={{ marginBottom: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
          <span>진행률:</span>
          <span style={{ color: '#90CAF9', fontWeight: 'bold' }}>
            {Math.round(timeData.progressPercentage)}%
          </span>
        </div>
        <div style={{
          width: '100%',
          height: '8px',
          backgroundColor: 'rgba(255,255,255,0.2)',
          borderRadius: '4px',
          overflow: 'hidden'
        }}>
          <div style={{
            width: `${timeData.progressPercentage}%`,
            height: '100%',
            backgroundColor: '#4CAF50',
            transition: 'width 0.3s ease'
          }} />
        </div>
      </div>
      
      <div style={{ fontSize: '12px', color: '#B0B0B0', textAlign: 'center' }}>
        {new Date(currentTime).toLocaleTimeString()}
      </div>
    </div>
  );
}
