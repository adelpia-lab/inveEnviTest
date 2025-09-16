@echo off
echo Starting convEnviTest Application...
echo.

REM 현재 디렉토리를 프로젝트 루트로 설정
cd /d "%~dp0"

REM Next.js 개발 서버 시작 (백그라운드)
echo Starting Next.js development server...
start "Next.js Dev Server" cmd /k "cd nextjs && pnpm dev"

REM 잠시 대기 (Next.js 서버가 시작될 시간)
timeout /t 5 /nobreak > nul

REM Backend 서버 시작 (백그라운드)
echo Starting Backend server...
start "Backend Server" cmd /k "cd server && npm run dev"

REM 잠시 대기 (백엔드 서버가 시작될 시간)
timeout /t 3 /nobreak > nul

REM Chrome 브라우저로 localhost:3000 열기
echo Opening Chrome browser...
REM start chrome --kiosk --app="http://localhost:3000"
start chrome "http://localhost:3000"

echo.
echo Application started successfully!
echo - Next.js server: http://localhost:3000
echo - Backend server: Check the opened command windows
echo.
echo Press any key to close this window...
pause > nul
