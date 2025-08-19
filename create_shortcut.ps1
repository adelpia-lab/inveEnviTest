# 바탕화면 경로 가져오기
$DesktopPath = [Environment]::GetFolderPath("Desktop")

# 현재 스크립트가 있는 디렉토리 경로
$ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path

# 배치파일 경로
$BatchFilePath = Join-Path $ScriptPath "start_convEnviTest.bat"

# 바로가기 파일 경로
$ShortcutPath = Join-Path $DesktopPath "convEnviTest.lnk"

# WScript.Shell 객체 생성
$WScriptShell = New-Object -ComObject WScript.Shell

# 바로가기 생성
$Shortcut = $WScriptShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $BatchFilePath
$Shortcut.WorkingDirectory = $ScriptPath
$Shortcut.Description = "Start convEnviTest Application"
$Shortcut.IconLocation = "C:\Windows\System32\cmd.exe,0"
$Shortcut.Save()

Write-Host "바로가기가 바탕화면에 생성되었습니다: $ShortcutPath" -ForegroundColor Green
Write-Host "배치파일 경로: $BatchFilePath" -ForegroundColor Yellow
Write-Host "바로가기 경로: $ShortcutPath" -ForegroundColor Yellow

# COM 객체 해제
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($WScriptShell) | Out-Null
[System.GC]::Collect()
[System.GC]::WaitForPendingFinalizers()
