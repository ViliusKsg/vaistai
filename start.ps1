Set-Location "C:\GitHub\CloudeCode\vaistai_info"

if (-not (Test-Path ".env")) {
    Write-Host "❌ Nėra .env failo! Sukurk jį iš .env.example" -ForegroundColor Red
    Write-Host "   Copy-Item '.env.example' '.env'; notepad .env" -ForegroundColor Yellow
    exit 1
}

if (-not (Test-Path "node_modules")) {
    Write-Host "📦 Diegiamos priklausomybės..." -ForegroundColor Yellow
    npm install
}

Write-Host ""
Write-Host "💊 Paleidžiamas serveris..." -ForegroundColor Green
Write-Host "   Puslapis:  http://localhost:3000" -ForegroundColor Cyan
Write-Host "   Admin:     http://localhost:3000/admin" -ForegroundColor Cyan
Write-Host "   Sustabdyti: Ctrl+C" -ForegroundColor Gray
Write-Host ""

node server.js
