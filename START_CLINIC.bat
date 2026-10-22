@echo off
echo ================================================
echo    Dr. Dhakad Clinic Management Software
echo ================================================
echo.

REM Check Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python नहीं मिला! python.org से डाउनलोड करें।
    pause
    exit /b 1
)

REM Install dependencies if needed
if not exist ".deps_installed" (
    echo [INFO] पहली बार चला रहे हैं - डिपेंडेंसी इंस्टॉल हो रही हैं...
    pip install -r requirements.txt
    echo. > .deps_installed
)

echo [INFO] सॉफ्टवेयर शुरू हो रहा है...
echo [INFO] ब्राउज़र में खोलें: http://localhost:5000
echo.
echo Default Login:
echo   Doctor   : username=doctor   , password=doctor123
echo   Reception: username=reception, password=reception123
echo.
echo दूसरे कंप्यूटर से खोलें: http://[इस PC का IP]:5000
echo (IP जानने के लिए: ipconfig कमांड चलाएं)
echo.
echo बंद करने के लिए Ctrl+C दबाएं
echo ================================================
echo.

python app.py
pause
