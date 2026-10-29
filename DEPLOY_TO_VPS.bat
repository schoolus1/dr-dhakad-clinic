@echo off
title Deploy Clinic Software to Hostinger VPS
echo ================================================
echo    Deploy Dr. Dhakad Clinic to Hostinger VPS
echo    Server: 72.60.223.224 (Port: 22)
echo ================================================
echo.
echo [1/2] VPS se connect kiya ja raha hai...
echo [INFO] Jab password maange, apna VPS root password type karein aur Enter dabayein.
echo.
ssh -p 22 root@72.60.223.224 "bash -s" < deploy_vps.sh
echo.
echo ================================================
pause
