// components/MeasurementStopConfirm/MeasurementStopConfirm.tsx
'use client';
import React from 'react';

interface MeasurementStopConfirmProps {
  isVisible: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function MeasurementStopConfirm({ 
  isVisible, 
  onConfirm, 
  onCancel 
}: MeasurementStopConfirmProps) {
  console.log('🔌 MeasurementStopConfirm: isVisible =', isVisible);
  
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
          borderRadius: '8px',
          padding: '32px',
          maxWidth: '400px',
          width: '90%',
          margin: '0 16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: '1px solid #374151'
        }}
      >
        {/* 아이콘과 제목 */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div 
            style={{
              margin: '0 auto 16px',
              width: '64px',
              height: '64px',
              backgroundColor: '#fef2f2',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <svg 
              style={{ width: '32px', height: '32px', color: '#dc2626' }}
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 19.5c-.77.833.192 2.5 1.732 2.5z" 
              />
            </svg>
          </div>
          <h3 style={{ 
            fontSize: '20px', 
            fontWeight: 'bold', 
            color: 'white', 
            marginBottom: '8px' 
          }}>
            측정 중단 확인
          </h3>
          <p style={{ 
            color: '#d1d5db', 
            fontSize: '14px',
            lineHeight: '1.5'
          }}>
            현재 측정이 진행 중입니다.<br/>
            측정을 중단하시겠습니까?
          </p>
        </div>

        {/* 버튼 영역 */}
        <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '12px 24px',
              backgroundColor: '#4b5563',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'background-color 0.2s'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#374151'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#4b5563'}
          >
            NO (계속)
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: '12px 24px',
              backgroundColor: '#dc2626',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'background-color 0.2s'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#b91c1c'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#dc2626'}
          >
            YES (중단)
          </button>
        </div>
      </div>
    </div>
  );
}
