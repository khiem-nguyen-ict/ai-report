@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul

REM Get today's date (format: YYYY-MM-DD)
for /f "tokens=*" %%I in ('powershell -NoProfile -Command "Get-Date -Format 'yyyy-MM-dd'"') do set "TODAY=%%I"

REM Get the directory where this script is located
set "SCRIPT_DIR=%~dp0"
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

REM Load environment variables from .env file safely
set "ENV_FILE=%SCRIPT_DIR%\..\..\.env"
if exist "%ENV_FILE%" (
    for /f "usebackq tokens=1,* delims== eol=#" %%a in ("%ENV_FILE%") do (
        set "key=%%a"
        set "value=%%b"
        REM Trim whitespace from key
        for /f "tokens=*" %%k in ("!key!") do set "key=%%k"
        REM Trim whitespace from value
        for /f "tokens=*" %%v in ("!value!") do set "value=%%v"
        REM Strip surrounding quotes
        if "!value:~0,1!"=="\"" if "!value:~-1!"=="\"" set "value=!value:~1,-1!"
        if "!value:~0,1!"=="'" if "!value:~-1!"=="'" set "value=!value:~1,-1!"
        set "!key!=!value!"
    )
)

REM Define the report directory (relative to script location)
set "REPORT_DIR=%SCRIPT_DIR%\..\..\app-data"

REM Find the latest HTML report file (order by date DESC in filename)
set "LATEST_REPORT="
for /f "delims=" %%f in ('dir /b /o-d "%REPORT_DIR%\report_*.html" 2^>nul') do (
    if "!LATEST_REPORT!"=="" set "LATEST_REPORT=%%f"
)

if "!LATEST_REPORT!"=="" (
    echo Error: no report found
    exit /b 1
)

echo Found latest report: !LATEST_REPORT!

REM Call PowerShell script to extract content
set "PS_SCRIPT=%SCRIPT_DIR%\extract_report.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%" -ReportPath "%REPORT_DIR%\!LATEST_REPORT!" -OutputPath "%TEMP%\kakao_content.txt" <nul

if not exist "%TEMP%\kakao_content.txt" (
    echo Error: failed to extract content from report
    exit /b 1
)

set "FINAL_CONTENT="
for /f "usebackq delims=" %%A in ("%TEMP%\kakao_content.txt") do set "FINAL_CONTENT=%%A"

REM Build the MESSAGE with the extracted content
set "MESSAGE=Daily Report - %TODAY%:"
set "MESSAGE=%MESSAGE%%NEWLINE%%NEWLINE%%FINAL_CONTENT%"

REM Log the MESSAGE content for debugging
echo ===== MESSAGE CONTENT =====
echo %MESSAGE%
echo ===== END MESSAGE =====

REM Clear the file first to ensure no previous data remains
type nul > "%SCRIPT_DIR%\..\..\app-data\kakao-talk.txt"

REM Save the MESSAGE to file (UTF-8)
powershell -NoProfile -Command "Set-Content -Path '%SCRIPT_DIR%\..\..\app-data\kakao-talk.txt' -Value \"%MESSAGE%\" -Encoding UTF8" <nul

REM Verify the new data was written correctly
timeout /t 1 /nobreak >nul
set "WRITTEN_CONTENT="
for /f "usebackq delims=" %%A in ("%SCRIPT_DIR%\..\..\app-data\kakao-talk.txt") do set "WRITTEN_CONTENT=%%A"
if "!WRITTEN_CONTENT!"=="" (
    echo Error: failed to write message to kakao-talk.txt
    exit /b 1
)

REM Check if the file contains today's date (verify it's new data)
echo !WRITTEN_CONTENT! | findstr /c:"%TODAY%" >nul 2>nul
if errorlevel 1 (
    echo Error: written content does not contain today's date. Previous data may still be present.
    exit /b 1
)
echo Successfully wrote new data to kakao-talk.txt

REM Copy message to clipboard
powershell -NoProfile -Command "Set-Clipboard -Value \"%MESSAGE%\"" <nul

REM Open KakaoTalk
start "" "kakao://"

REM Wait for KakaoTalk to open
timeout /t 3 /nobreak >nul

echo.
echo ============================================================
echo Message has been copied to clipboard!
echo.
echo MANUAL STEPS REQUIRED (Windows KakaoTalk automation differs from macOS):
echo 1. KakaoTalk should now be open
echo 2. Press Ctrl+F to open search
echo 3. Press Ctrl+A to select all in search
echo 4. Type your group name: %KAKAO_TALK_GROUP_NAME%
echo 5. Click on the group chat to open it
echo 6. Press Ctrl+A to select all in chat input
echo 7. Press Ctrl+V to paste the message
echo 8. Press Enter to send (or review first)
echo ============================================================
echo.
echo The message is also saved to: %SCRIPT_DIR%\..\..\app-data\kakao-talk.txt
echo You can copy from there if clipboard fails.

pause