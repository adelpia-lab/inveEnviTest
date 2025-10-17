// components/FolderSelectModal/FolderSelectModal.tsx
'use client';
import React, { useState, useEffect } from 'react';

interface FolderSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectFolder: (folderName: string) => void;
  wsConnection?: WebSocket | null;
}

export default function FolderSelectModal({ 
  isOpen, 
  onClose, 
  onSelectFolder, 
  wsConnection 
}: FolderSelectModalProps) {
  const [folderList, setFolderList] = useState<string[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // 모달이 열릴 때 폴더 목록 요청
  useEffect(() => {
    if (isOpen && wsConnection && wsConnection.readyState === WebSocket.OPEN) {
      setIsLoading(true);
      setError('');
      setSelectedFolder('');
      
      // 서버에 폴더 목록 요청
      wsConnection.send('[GENERATE_REPORT]');
      console.log('📁 FolderSelectModal: 폴더 목록 요청 전송');
    }
  }, [isOpen, wsConnection]);

  // WebSocket 메시지 처리
  useEffect(() => {
    if (!wsConnection || !isOpen) return;

    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      
      // Data 폴더 목록 수신
      if (typeof message === 'string' && message.startsWith('[DATA_FOLDER_LIST]')) {
        try {
          const match = message.match(/\[DATA_FOLDER_LIST\] (.*)/);
          if (match && match[1]) {
            const folders = JSON.parse(match[1]);
            setFolderList(folders);
            setIsLoading(false);
            console.log('📁 FolderSelectModal: 폴더 목록 수신:', folders);
          }
        } catch (error) {
          console.error('📁 FolderSelectModal: 폴더 목록 파싱 오류:', error);
          setError('폴더 목록을 불러오는데 실패했습니다.');
          setIsLoading(false);
        }
      }
      // 보고서 생성 완료
      else if (typeof message === 'string' && message.startsWith('[REPORT_GENERATED]')) {
        try {
          const match = message.match(/\[REPORT_GENERATED\] (.*)/);
          if (match && match[1]) {
            const result = JSON.parse(match[1]);
            console.log('📄 FolderSelectModal: 보고서 생성 완료:', result);
            alert(result.message);
            onClose();
          }
        } catch (error) {
          console.error('📄 FolderSelectModal: 보고서 생성 완료 메시지 파싱 오류:', error);
        }
      }
      // 보고서 생성 오류
      else if (typeof message === 'string' && message.startsWith('[REPORT_ERROR]')) {
        try {
          const match = message.match(/\[REPORT_ERROR\] (.*)/);
          if (match && match[1]) {
            const result = JSON.parse(match[1]);
            console.error('📄 FolderSelectModal: 보고서 생성 오류:', result);
            setError(result.message);
            setIsLoading(false);
          }
        } catch (error) {
          console.error('📄 FolderSelectModal: 보고서 생성 오류 메시지 파싱 오류:', error);
        }
      }
    };

    wsConnection.addEventListener('message', handleMessage);
    
    return () => {
      wsConnection.removeEventListener('message', handleMessage);
    };
  }, [wsConnection, isOpen, onClose]);

  const handleOkClick = () => {
    if (!selectedFolder) {
      setError('폴더를 선택해주세요.');
      return;
    }

    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
      setIsLoading(true);
      setError('');
      
      // 선택된 폴더로 보고서 생성 요청
      wsConnection.send(`[SELECT_FOLDER_FOR_REPORT] ${selectedFolder}`);
      console.log('📄 FolderSelectModal: 보고서 생성 요청 전송 - 폴더:', selectedFolder);
    } else {
      setError('서버 연결이 없습니다.');
    }
  };

  const handleCancelClick = () => {
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 10000
    }}>
      <div style={{
        backgroundColor: '#1D1D1D',
        padding: '30px',
        borderRadius: '10px',
        border: '2px solid #8B5CF6',
        maxWidth: '500px',
        width: '90%',
        maxHeight: '80vh',
        overflow: 'auto',
        color: '#E0E0E0'
      }}>
        <h3 style={{ 
          marginBottom: '20px', 
          color: '#8B5CF6',
          textAlign: 'center',
          fontSize: '20px'
        }}>
          📁 폴더 선택
        </h3>
        
        <p style={{ 
          marginBottom: '20px', 
          fontSize: '16px',
          textAlign: 'center',
          color: '#9CA3AF'
        }}>
          보고서를 생성할 폴더를 선택해주세요.
        </p>

        {isLoading && (
          <div style={{
            textAlign: 'center',
            marginBottom: '20px',
            color: '#8B5CF6'
          }}>
            <div style={{
              display: 'inline-block',
              width: '20px',
              height: '20px',
              border: '2px solid #8B5CF6',
              borderTop: '2px solid transparent',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              marginRight: '10px'
            }}></div>
            {folderList.length === 0 ? '폴더 목록을 불러오는 중...' : '보고서를 생성하는 중...'}
          </div>
        )}

        {error && (
          <div style={{
            backgroundColor: '#FEE2E2',
            color: '#DC2626',
            padding: '10px',
            borderRadius: '5px',
            marginBottom: '20px',
            textAlign: 'center'
          }}>
            {error}
          </div>
        )}

        {!isLoading && folderList.length > 0 && (
          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              marginBottom: '10px',
              fontSize: '16px',
              fontWeight: '600',
              color: '#E0E0E0'
            }}>
              사용 가능한 폴더:
            </label>
            <select
              value={selectedFolder}
              onChange={(e) => setSelectedFolder(e.target.value)}
              style={{
                width: '100%',
                padding: '10px',
                backgroundColor: '#374151',
                color: '#E0E0E0',
                border: '1px solid #6B7280',
                borderRadius: '5px',
                fontSize: '16px'
              }}
            >
              <option value="">폴더를 선택하세요</option>
              {folderList.map((folder, index) => (
                <option key={index} value={folder}>
                  {folder}
                </option>
              ))}
            </select>
          </div>
        )}

        {!isLoading && folderList.length === 0 && !error && (
          <div style={{
            textAlign: 'center',
            color: '#9CA3AF',
            marginBottom: '20px'
          }}>
            사용 가능한 폴더가 없습니다.
          </div>
        )}

        <div style={{ 
          display: 'flex', 
          gap: '15px', 
          justifyContent: 'center',
          marginTop: '20px'
        }}>
          <button
            onClick={handleOkClick}
            disabled={!selectedFolder || isLoading}
            style={{
              backgroundColor: selectedFolder && !isLoading ? '#8B5CF6' : '#6B7280',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '5px',
              cursor: selectedFolder && !isLoading ? 'pointer' : 'not-allowed',
              fontSize: '14px',
              fontWeight: 'bold',
              minWidth: '80px'
            }}
          >
            OK
          </button>
          <button
            onClick={handleCancelClick}
            disabled={isLoading}
            style={{
              backgroundColor: '#6B7280',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '5px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: 'bold',
              minWidth: '80px'
            }}
          >
            취소
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
