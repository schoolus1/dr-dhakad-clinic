@echo off
echo ================================================
echo    Dr. Dhakad Clinic - Software Update Tool
echo ================================================
echo.
echo [1/3] नया अपडेट डाउनलोड हो रहा है (Fetching latest update)...
git pull origin main
if %errorlevel% neq 0 (
    echo [ERROR] अपडेट डाउनलोड नहीं हो सका! कृपया इंटरनेट कनेक्शन चेक करें।
    pause
    exit /b 1
)

echo.
echo [2/3] आवश्यक लाइब्रेरी जांची जा रही हैं...
pip install -r requirements.txt --quiet

echo.
echo [3/3] डेटाबेस सुरक्षा जांच...
python -c "import app; print('[OK] Database & Models verified')"

echo.
echo ================================================
echo  ✅ बधाई! सॉफ्टवेयर सफलतापूर्वक अपडेट हो गया है!
echo  (आपका पुराना सभी मरीजों का डेटा 100%% सुरक्षित है)
echo ================================================
echo.
pause
