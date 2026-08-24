@echo off
rem 启动 dsh-literature-reader 全局热键脚本（AutoHotkey v2）
rem 要求：已安装 AutoHotkey v2；dsh web 在本机运行 (127.0.0.1:3080)
cd /d "%~dp0"
where AutoHotkey64.exe >nul 2>nul
if %errorlevel%==0 (
    start "" AutoHotkey64.exe "%~dp0lit-reader.ahk"
) else (
    where AutoHotkey.exe >nul 2>nul
    if %errorlevel%==0 (
        start "" AutoHotkey.exe "%~dp0lit-reader.ahk"
    ) else (
        echo [错误] 未找到 AutoHotkey。请先安装 AutoHotkey v2: https://www.autohotkey.com
        pause
    )
)
