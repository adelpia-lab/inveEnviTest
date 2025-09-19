// components/TestCompleteModal/TestCompleteModal.tsx
'use client';
import React from 'react';

interface TestCompleteModalProps {
  isVisible: boolean;
  onClose: () => void;
  testType?: string;
  cycleCount?: number;
  completionTime?: string;
}

export default function TestCompleteModal({ 
  isVisible, 
  onClose,
  testType = '환경 시험',
  cycleCount = 0,
  completionTime = new Date().toLocaleString('ko-KR')
}: TestCompleteModalProps) {
  console.log('🎉 TestCompleteModal: isVisible =', isVisible);
  
  if (!isVisible) return null;

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999
      }}
    >
      <div 
        style={{
          backgroundColor: '#23242a',
          borderRadius: '12px',
          padding: '40px',
          maxWidth: '500px',
          width: '90%',
          margin: '0 16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: '1px solid #374151',
          animation: 'modalSlideIn 0.3s ease-out'
        }}
      >
        {/* 아이콘과 제목 */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div 
            style={{
              margin: '0 auto 20px',
              width: '80px',
              height: '80px',
              backgroundColor: '#f0fdf4',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <svg 
              style={{ width: '40px', height: '40px', color: '#16a34a' }}
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" 
              />
            </svg>
          </div>
          <h2 style={{ 
            fontSize: '24px', 
            fontWeight: 'bold', 
            color: 'white', 
            marginBottom: '12px' 
          }}>
            🎉 테스트 완료!
          </h2>
          <p style={{ 
            color: '#d1d5db', 
            fontSize: '16px',
            lineHeight: '1.6',
            marginBottom: '8px'
          }}>
            {testType} 프로세스가 성공적으로 완료되었습니다.
          </p>
          {cycleCount > 0 && (
            <p style={{ 
              color: '#9ca3af', 
              fontSize: '14px',
              marginBottom: '8px'
            }}>
              총 {cycleCount}개 사이클 완료
            </p>
          )}
          <p style={{ 
            color: '#6b7280', 
            fontSize: '12px'
          }}>
            완료 시간: {completionTime}
          </p>
        </div>

        {/* 테스트 완료 정보 */}
        <div style={{
          backgroundColor: '#1f2937',
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '32px',
          border: '1px solid #374151'
        }}>
          <h3 style={{
            color: '#f3f4f6',
            fontSize: '16px',
            fontWeight: '600',
            marginBottom: '12px',
            textAlign: 'center'
          }}>
            📊 테스트 요약
          </h3>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ color: '#9ca3af', fontSize: '14px' }}>테스트 유형:</span>
            <span style={{ color: '#f3f4f6', fontSize: '14px', fontWeight: '500' }}>{testType}</span>
          </div>
          {cycleCount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ color: '#9ca3af', fontSize: '14px' }}>완료 사이클:</span>
              <span style={{ color: '#f3f4f6', fontSize: '14px', fontWeight: '500' }}>{cycleCount}개</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#9ca3af', fontSize: '14px' }}>상태:</span>
            <span style={{ color: '#16a34a', fontSize: '14px', fontWeight: '500' }}>✅ 성공</span>
          </div>
        </div>

        {/* 버튼 영역 */}
        <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
          <button
            onClick={onClose}
            style={{
              padding: '14px 32px',
              backgroundColor: '#16a34a',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s',
              minWidth: '120px'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = '#15803d';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = '#16a34a';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            확인
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes modalSlideIn {
          from {
            opacity: 0;
            transform: scale(0.9) translateY(-20px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
