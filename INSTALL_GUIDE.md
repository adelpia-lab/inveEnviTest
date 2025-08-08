# ConvEnviTest 설치 가이드

## 📋 개요

이 문서는 ConvEnviTest 환경 테스트 시스템의 설치 방법을 상세히 설명합니다.

## 🎯 설치 방법 선택

다음 중 하나의 방법을 선택하여 설치하세요:

1. **자동 설치 스크립트** (권장)
2. **수동 설치**
3. **Docker 설치**

---

## 🚀 방법 1: 자동 설치 스크립트 (권장)

### Windows 사용자

1. **설치 스크립트 실행**
   ```cmd
   install.bat
   ```

2. **실행 스크립트 사용**
   ```cmd
   # 전체 시스템 실행
   run_all.bat
   
   # 백엔드만 실행
   run_backend.bat
   
   # 프론트엔드만 실행
   run_frontend.bat
   ```

### Linux/Mac 사용자

1. **실행 권한 부여**
   ```bash
   chmod +x install.sh
   ```

2. **설치 스크립트 실행**
   ```bash
   ./install.sh
   ```

3. **실행 스크립트 사용**
   ```bash
   # 전체 시스템 실행
   ./run_all.sh
   
   # 백엔드만 실행
   ./run_backend.sh
   
   # 프론트엔드만 실행
   ./run_frontend.sh
   ```

---

## 🔧 방법 2: 수동 설치

### 사전 요구사항 확인

#### Node.js 설치
```bash
# Node.js 버전 확인
node --version

# npm 버전 확인
npm --version
```

**필요 버전**: Node.js 18.0.0 이상

### 1단계: 백엔드 서버 설치

```bash
# 서버 디렉토리로 이동
cd server

# 의존성 설치
npm install

# 개발 서버 실행
npm run dev
```

### 2단계: 프론트엔드 설치

새 터미널을 열고:

```bash
# 프로젝트 루트로 이동
cd nextjs

# 의존성 설치
npm install

# 개발 서버 실행
npm run dev
```

### 3단계: 브라우저 접속

웹 브라우저에서 `http://localhost:3000` 접속

---

## 🐳 방법 3: Docker 설치

### Docker 설치 확인

```bash
# Docker 버전 확인
docker --version

# Docker Compose 버전 확인
docker-compose --version
```

### Docker Compose로 실행

```bash
# 전체 시스템 실행
docker-compose up -d

# 로그 확인
docker-compose logs -f

# 서비스 중지
docker-compose down
```

### 개별 서비스 실행

```bash
# 백엔드만 실행
docker-compose up backend

# 프론트엔드만 실행
docker-compose up frontend
```

---

## 🔍 설치 확인

### 1. 백엔드 서버 확인

백엔드 서버가 정상적으로 실행되면:
- 포트 8080에서 WebSocket 서버 실행
- 콘솔에 "WebSocket server is running on port 8080" 메시지 표시

### 2. 프론트엔드 확인

프론트엔드가 정상적으로 실행되면:
- 포트 3000에서 Next.js 서버 실행
- 브라우저에서 `http://localhost:3000` 접속 가능

### 3. WebSocket 연결 확인

브라우저 개발자 도구 콘솔에서:
- "WebSocket connected" 메시지 확인
- 실시간 데이터 수신 확인

---

## ⚠️ 문제 해결

### 일반적인 문제들

#### 1. Node.js 버전 오류
```
문제: Node.js 버전이 너무 낮음
해결: Node.js 18.0.0 이상으로 업그레이드
```

#### 2. 포트 충돌
```
문제: 포트 3000 또는 8080이 이미 사용 중
해결: 
- 다른 프로세스 종료
- 또는 다른 포트 사용
```

#### 3. 권한 오류 (Linux/Mac)
```bash
# 시리얼 포트 권한 설정
sudo chmod 666 /dev/ttyUSB0
```

#### 4. Docker 권한 오류
```bash
# Docker 그룹에 사용자 추가
sudo usermod -aG docker $USER
```

#### 5. WebSocket 연결 실패
```
문제: 프론트엔드에서 백엔드 연결 실패
해결:
1. 백엔드 서버가 실행 중인지 확인
2. 방화벽 설정 확인
3. localhost:8080 접속 가능한지 확인
```

### 로그 확인 방법

#### 백엔드 로그
```bash
# 터미널에서 직접 확인
cd server
npm run dev

# 또는 Docker 사용 시
docker-compose logs backend
```

#### 프론트엔드 로그
```bash
# 터미널에서 직접 확인
cd nextjs
npm run dev

# 또는 Docker 사용 시
docker-compose logs frontend
```

---

## 📞 지원

문제가 발생하면 다음을 확인하세요:

1. **로그 확인**: 각 서비스의 콘솔 로그 확인
2. **버전 확인**: Node.js, npm, Docker 버전 확인
3. **포트 확인**: 3000, 8080 포트 사용 여부 확인
4. **권한 확인**: 파일 및 디렉토리 접근 권한 확인

---

## 🎉 설치 완료

설치가 완료되면:

1. **브라우저에서 접속**: `http://localhost:3000`
2. **시스템 설정**: USB 포트, 전압, 온도 설정
3. **테스트 실행**: Power Switch를 ON으로 설정하여 자동 테스트 실행

자세한 사용법은 `README.md` 파일을 참조하세요.
