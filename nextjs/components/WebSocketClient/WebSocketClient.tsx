// components/WebSocketClient.jsx
import React, { useState, useEffect, useRef } from 'react';

// 연결할 WebSocket 서버의 주소
// 이 주소는 Next.js 앱이 실행되는 브라우저에서 직접 접근 가능해야 합니다.
const WEBSOCKET_SERVER_URL = 'ws://192.168.1.82:8080';

export default function WebSocketClient() {
  const [isConnected, setIsConnected] = useState(false);
  const [messageInput, setMessageInput] = useState('');
  const [receivedMessages, setReceivedMessages] = useState([]);
  const [status, setStatus] = useState('연결 대기 중...');

  // useRef를 사용하여 WebSocket 객체를 저장합니다.
  // 이 방법은 컴포넌트 리렌더링 시에도 WebSocket 인스턴스가 유지되도록 합니다.
  const ws = useRef(null);

  useEffect(() => {
    // 컴포넌트 마운트 시 WebSocket 연결 시도
    console.log('WebSocket 연결 시도 중...');
    ws.current = new WebSocket(WEBSOCKET_SERVER_URL);

    // 연결 성공 시
    ws.current.onopen = () => {
      console.log('WebSocket 서버에 연결되었습니다.');
      setIsConnected(true);
      setStatus('연결됨');
      setReceivedMessages(prev => [...prev, '--- 서버에 연결되었습니다! ---']);
    };

    // 메시지 수신 시
    ws.current.onmessage = (event) => {
      console.log('메시지 수신:', event.data);
      setReceivedMessages(prev => [...prev, event.data]);
    };

    // 에러 발생 시
    ws.current.onerror = (error) => {
      console.error('WebSocket 에러 발생:', error);
      setStatus(`에러: ${error.message || '알 수 없는 오류'}`);
      setIsConnected(false);
    };

    // 연결 종료 시
    ws.current.onclose = () => {
      console.log('WebSocket 연결이 종료되었습니다.');
      setIsConnected(false);
      setStatus('연결 종료됨. 서버를 확인하거나 페이지를 새로고침하세요.');
    };

    // 컴포넌트 언마운트 시 WebSocket 연결 정리
    return () => {
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        console.log('컴포넌트 언마운트로 인해 WebSocket 연결 닫기.');
        ws.current.close();
      }
    };
  }, []); // 빈 배열은 컴포넌트 마운트 시 한 번만 실행되도록 합니다.

  // 메시지 전송 핸들러
  const sendMessage = () => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN && messageInput.trim() !== '') {
      console.log('메시지 전송:', messageInput);
      ws.current.send(messageInput);
      setMessageInput(''); // 입력 필드 초기화
    } else {
      setStatus('메시지를 보낼 수 없습니다. 연결 상태를 확인하세요.');
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif', maxWidth: '600px', margin: 'auto' }}>
      <h1>Next.js WebSocket 클라이언트</h1>
      <p>상태: <strong style={{ color: isConnected ? 'green' : 'red' }}>{status}</strong></p>

      <div style={{ marginBottom: '20px' }}>
        <input
          type="text"
          value={messageInput}
          onChange={(e) => setMessageInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="여기에 메시지를 입력하세요..."
          disabled={!isConnected}
          style={{ width: 'calc(100% - 80px)', padding: '10px', fontSize: '16px', border: '1px solid #ddd' }}
        />
        <button
          onClick={sendMessage}
          disabled={!isConnected || messageInput.trim() === ''}
          style={{ width: '70px', padding: '10px', fontSize: '16px', marginLeft: '10px', cursor: 'pointer' }}
        >
          전송
        </button>
      </div>

      <div style={{ border: '1px solid #eee', padding: '15px', minHeight: '200px', maxHeight: '400px', overflowY: 'auto', backgroundColor: '#fcfcfc' }}>
        <h3>수신된 메시지:</h3>
        {receivedMessages.length === 0 ? (
          <p style={{ color: '#888' }}>아직 메시지가 없습니다.</p>
        ) : (
          <ul style={{ listStyleType: 'none', padding: 0 }}>
            {receivedMessages.map((msg, index) => (
              <li key={index} style={{ padding: '5px 0', borderBottom: '1px dotted #eee', wordBreak: 'break-all' }}>
                {msg}
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        onClick={() => setReceivedMessages([])}
        style={{ marginTop: '15px', padding: '8px 15px', cursor: 'pointer' }}
      >
        수신 메시지 지우기
      </button>
    </div>
  );
}