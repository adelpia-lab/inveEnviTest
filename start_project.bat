@echo off
chcp 65001 >nul
echo ========================================
echo    Adel Environment Test Project
echo ========================================
echo.
echo 서버와 프론트엔드를 시작합니다...
echo.

REM 현재 디렉토리를 프로젝트 루트로 설정
cd /d "%~dp0"

REM 서버 디렉토리에서 npm run dev 실행 (백그라운드)
echo [1/3] 서버를 시작합니다...
start "Adel Server" cmd /k "cd server && npm run dev"

REM 잠시 대기
timeout /t 3 /nobreak >nul

REM NextJS 디렉토리에서 pnpm dev 실행 (백그라운드)
echo [2/3] 프론트엔드를 시작합니다...
start "Adel Frontend" cmd /k "cd nextjs && pnpm dev"

REM 잠시 대기
timeout /t 5 /nobreak >nul

REM 크롬에서 localhost:3000 열기
echo [3/3] 브라우저에서 애플리케이션을 엽니다...
start chrome "http://localhost:3000"

echo.
echo ========================================
echo 모든 서비스가 시작되었습니다!
echo.
echo - 서버: http://localhost:3001 (예상)
echo - 프론트엔드: http://localhost:3000
echo - 브라우저가 자동으로 열립니다
echo ========================================
echo.
echo 서비스를 중지하려면 각 터미널 창을 닫으세요.
pause
