@echo off
cd /d "%~dp0packages\renderer"
node "%~dp0node_modules\vite\bin\vite.js" --host --strictPort
