@echo off
setlocal
cd /d "%~dp0"
echo ============================================
echo SBP ACCOUNTING - BUILD PUBLISH OFFLINE
 echo ============================================
where dotnet >nul 2>nul
if errorlevel 1 (
  echo .NET SDK tidak ditemukan. Buka Visual Studio 2026 dengan workload .NET Desktop Development.
  pause
  exit /b 1
)
echo.
echo Restore paket NuGet...
dotnet restore SBPAccounting.sln
if errorlevel 1 goto :fail
echo.
echo Publish Windows x64 self-contained single-file...
dotnet publish SBPAccounting.csproj -c Release -r win-x64 --self-contained true /p:PublishSingleFile=true /p:IncludeNativeLibrariesForSelfExtract=true -o publish
if errorlevel 1 goto :fail
echo.
echo BERHASIL. Folder hasil: %cd%\publish
pause
exit /b 0
:fail
echo.
echo BUILD GAGAL. Periksa pesan di atas.
pause
exit /b 1
