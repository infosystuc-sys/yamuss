@echo off
echo ===================================================
echo Iniciando Gestión de Pagos - MODO PRUEBA
echo ===================================================
echo.
echo Asegurate de que el archivo .env tenga configurado:
echo DB_DATABASE=PRUEBA
echo TEST_EMAIL_RECIPIENT=rivadeneirag@hotmail.com
echo.
echo Iniciando servidor Backend...
start "Gestión de Pagos - Backend" cmd /k "npm run server"

echo Iniciando servidor Frontend...
start "Gestión de Pagos - Frontend" cmd /k "npm run dev"

echo.
echo ===================================================
echo Servicios iniciados en ventanas separadas.
echo El navegador deberia abrirse en la direccion local.
echo ===================================================
pause
