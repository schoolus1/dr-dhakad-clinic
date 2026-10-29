@echo off
title Deploy Clinic Software to Hostinger VPS
echo ================================================
echo    Deploy Dr. Dhakad Clinic to Hostinger VPS
echo    Server: 72.60.223.224
echo ================================================
echo.
echo [1/2] VPS se connect kiya ja raha hai...
echo [INFO] Apna VPS password type karein aur Enter dabayein.
echo.
ssh -o StrictHostKeyChecking=no root@72.60.223.224 "curl -sSL https://raw.githubusercontent.com/schoolus1/dr-dhakad-clinic/main/deploy_vps.sh | bash"
echo.
echo ================================================
echo Setup process pura hua.
echo ================================================
pause
