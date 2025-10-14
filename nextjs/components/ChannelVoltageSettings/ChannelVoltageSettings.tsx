import React, { useState, useEffect } from 'react';
import styles from './ChannelVoltageSettings.module.css';

interface ChannelVoltageSettingsProps {
  wsConnection: WebSocket | null;
  onClose?: () => void;
}

interface ChannelVoltages {
  channel1: number;
}

const ChannelVoltageSettings: React.FC<ChannelVoltageSettingsProps> = ({ wsConnection, onClose }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [voltages, setVoltages] = useState<ChannelVoltages>({ channel1: 220 });
  const [isLoading, setIsLoading] = useState(false);

  // WebSocket 메시지 수신 처리
  useEffect(() => {
    if (!wsConnection) return;

    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      
      // 초기 채널 전압 설정 수신
      if (typeof message === 'string' && message.startsWith('Initial channel voltages:')) {
        try {
          const match = message.match(/Initial channel voltages: (\[.*\])/);
          if (match && match[1]) {
            const voltageArray = JSON.parse(match[1]);
            if (Array.isArray(voltageArray) && voltageArray.length >= 1) {
              setVoltages({
                channel1: voltageArray[0] || 0
              });
            }
          }
        } catch (error) {
          console.error('Failed to parse initial channel voltages:', error);
        }
      }
      
      // 채널 전압 설정 저장 성공 메시지
      if (typeof message === 'string' && message.startsWith('[CHANNEL_VOLTAGES_SAVED]')) {
        setIsLoading(false);
        setIsOpen(false);
        if (onClose) onClose();
        
        // 저장된 채널 전압값을 부모 컴포넌트에 전달하여 파워 테이블 업데이트
        try {
          const match = message.match(/\[CHANNEL_VOLTAGES_SAVED\] (\[.*\])/);
          if (match && match[1]) {
            const savedVoltages = JSON.parse(match[1]);
            console.log('✅ ChannelVoltageSettings: 채널 전압 저장 완료, 파워 테이블 업데이트:', savedVoltages);
          }
        } catch (error) {
          console.error('ChannelVoltageSettings: 저장된 전압값 파싱 오류:', error);
        }
      }
    };

    wsConnection.addEventListener('message', handleMessage);
    return () => wsConnection.removeEventListener('message', handleMessage);
  }, [wsConnection, onClose]);

  const handleInputChange = (channel: keyof ChannelVoltages, value: string) => {
    const numValue = parseFloat(value) || 0;
    // 최소값 0, 최대값 500으로 제한
    const clampedValue = Math.max(0, Math.min(500, numValue));
    setVoltages(prev => ({
      ...prev,
      [channel]: clampedValue
    }));
  };

  const handleSave = () => {
    if (!wsConnection || wsConnection.readyState !== WebSocket.OPEN) {
      console.error('WebSocket이 연결되지 않았습니다.');
      return;
    }

    setIsLoading(true);
    
    // 전압 배열로 변환
    const voltageArray = [
      voltages.channel1
    ];

    // WebSocket을 통해 서버에 전송
    const message = `[CHANNEL_VOLTAGES] ${JSON.stringify(voltageArray)}`;
    wsConnection.send(message);
  };

  const handleCancel = () => {
    setIsOpen(false);
    if (onClose) onClose();
  };

  const openModal = () => {
    setIsOpen(true);
  };

  return (
    <div className={styles.container}>
      <button 
        className={styles.openButton}
        onClick={openModal}
        disabled={!wsConnection || wsConnection.readyState !== WebSocket.OPEN}
      >
        채널전압 설정
      </button>

      {isOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2>채널 전압 설정</h2>
              <button className={styles.closeButton} onClick={handleCancel}>
                ×
              </button>
            </div>
            
            <div className={styles.modalContent}>
              <div className={styles.inputGroup}>
                <label htmlFor="channel1">채널 1 전압 (V): <span className={styles.rangeInfo}>( 0.0 ~ 500.0)</span></label>
                <input
                  id="channel1"
                  type="number"
                  step="1"
                  min="0"
                  max="500"
                  value={voltages.channel1}
                  onChange={(e) => handleInputChange('channel1', e.target.value)}
                  placeholder="220.0"
                />
              </div>
              
            </div>
            
            <div className={styles.modalFooter}>
              <button 
                className={styles.saveButton}
                onClick={handleSave}
                disabled={isLoading}
              >
                {isLoading ? '저장 중...' : '저장'}
              </button>
              <button 
                className={styles.cancelButton}
                onClick={handleCancel}
                disabled={isLoading}
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChannelVoltageSettings; 