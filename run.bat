@echo off
REM Exit on error
setlocal enabledelayedexpansion

REM Ensure consistent PATH
set PATH=C:\Windows\System32;C:\Windows;C:\Windows\System32\Wbem;C:\Windows\System32\WindowsPowerShell\v1.0\;%PATH%

REM Resolve script directory reliably
set "SCRIPT_DIR=%~dp0"
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

REM Optional debug log - clear at start
set "LOG_FILE=%TEMP%\automator-script.log"
type nul > "%LOG_FILE%"

REM Function to log to both console and file
call :LOG "=== Script started at %date% %time% ==="
call :LOG "Running as: %USERNAME%"
call :LOG "Working dir: %SCRIPT_DIR%"
call :LOG "PATH: %PATH%"

REM Move to script directory
cd /d "%SCRIPT_DIR%"

REM Load .env safely
set "ENV_FILE=%SCRIPT_DIR%\.env"
if exist "%ENV_FILE%" (
    call :LOG "Loading .env file..."
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
) else (
    call :LOG "<<< .env file not found at %ENV_FILE% >>>"
)

REM Determine notify-only flag
set "notify_only=false"
set "node_args="
for %%a in (%*) do (
    if "%%a"=="--notify" (
        set "notify_only=true"
    ) else (
        set "node_args=!node_args! %%a"
    )
)

if "!notify_only!"=="true" (
    set "node_args=!node_args! --notify"
)

REM Run Node script
call :LOG "Running Node script..."
node "%SCRIPT_DIR%\index.js" %node_args% >> "%LOG_FILE%" 2>&1
type "%LOG_FILE%"

if "!notify_only!"=="true" (
    call :LOG "Finished running Node script in notify-only mode."
    exit /b 0
)

REM Ensure kakao script exists
set "KAKAO_SCRIPT=%SCRIPT_DIR%\src\services\kakao-talk.bat"
if not exist "%KAKAO_SCRIPT%" (
    call :LOG "<<< kakao-talk.bat not found at %KAKAO_SCRIPT% >>>"
    exit /b 1
)

REM Run kakao script - output to separate log to avoid feedback loop
call :LOG "Running kakao-talk.bat..."
set "KAKAO_LOG=%TEMP%\kakao-script.log"
type nul > "%KAKAO_LOG%"
cmd /c "%KAKAO_SCRIPT%" >> "%KAKAO_LOG%" 2>&1
type "%KAKAO_LOG%"
type "%KAKAO_LOG%" >> "%LOG_FILE%"

call :LOG "=== Script finished at %date% %time% ==="
exit /b 0

:LOG
echo %~1
echo %~1 >> "%LOG_FILE%"
goto :eof