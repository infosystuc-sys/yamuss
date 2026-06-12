@echo off
echo ===================================================
echo Generador de Ejecutable - Gestión de Pagos
echo ===================================================
echo Este script compilara todo el proyecto (Frontend + Backend)
echo y generara un unico archivo ejecutable en la carpeta "build".
echo.
echo Iniciando limpieza...
if exist build rmdir /s /q build
mkdir build

echo Iniciando proceso de compilacion...

call npm run build:exe

echo Copiando archivos estaticos del Frontend (dist)...
xcopy /E /I /Y dist build\dist

echo Copiando .env de produccion (asegurate de configurarlo)...
copy .env build\.env

echo ===================================================
echo ¡COMPILACION FINALIZADA!
echo Todo lo necesario para el cliente esta en la carpeta "build".
echo Solo necesitas entregar esa carpeta completa.
echo El cliente debe hacer doble clic en "server.exe".
echo ===================================================
pause
