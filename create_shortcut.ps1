# Adel Environment Test Project 바로가기 생성 스크립트
# PowerShell 스크립트

# 현재 스크립트의 디렉토리를 가져오기
$ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = $ScriptPath

# 배치 파일 경로
$BatchFilePath = Join-Path $ProjectRoot "start_project.bat"

# 아이콘 파일 경로 (adelLogo.png)
$IconPath = Join-Path $ProjectRoot "nextjs\public\img\adelLogo.png"

# 바로가기 파일 경로 (바탕화면에 생성)
$DesktopPath = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $DesktopPath "Adel Environment Test.lnk"

# WScript.Shell 객체 생성
$WScriptShell = New-Object -ComObject WScript.Shell

# 바로가기 객체 생성
$Shortcut = $WScriptShell.CreateShortcut($ShortcutPath)

# 바로가기 속성 설정
$Shortcut.TargetPath = $BatchFilePath
$Shortcut.WorkingDirectory = $ProjectRoot
$Shortcut.Description = "Adel Environment Test Project - 서버와 프론트엔드 시작"
$Shortcut.IconLocation = $IconPath

# 바로가기 저장
$Shortcut.Save()

Write-Host "========================================" -ForegroundColor Green
Write-Host "   Adel Environment Test Project" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "바로가기가 성공적으로 생성되었습니다!" -ForegroundColor Yellow
Write-Host ""
Write-Host "위치: $ShortcutPath" -ForegroundColor Cyan
Write-Host "아이콘: $IconPath" -ForegroundColor Cyan
Write-Host ""
Write-Host "바로가기를 더블클릭하여 프로젝트를 시작하세요!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

# WScript.Shell 객체 해제
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($WScriptShell) | Out-Null
