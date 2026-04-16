Set-Location "C:\GitHub\CloudeCode\vaistai_info"

$token = (Get-Content ".env" -ErrorAction SilentlyContinue | Where-Object { $_ -match "^ADMIN_PASSWORD=" }) -replace "^ADMIN_PASSWORD=", ""
if (-not $token) { $token = "admin123" }

$headers = @{ "x-admin-token" = $token; "Content-Type" = "application/json" }

Write-Host "`n🗑  Valomas cache..." -ForegroundColor Yellow

try {
    $r1 = Invoke-RestMethod "http://localhost:3000/api/admin/cache-clear" -Method POST -Headers $headers -Body '{"type":"ai"}'
    Write-Host "   AI cache:  $($r1.cleared) failų išvalyta" -ForegroundColor Green
} catch {
    Write-Host "   AI cache klaida: $_" -ForegroundColor Red
}

try {
    $r2 = Invoke-RestMethod "http://localhost:3000/api/admin/cache-clear" -Method POST -Headers $headers -Body '{"type":"raw"}'
    Write-Host "   Raw cache: $($r2.cleared) failų išvalyta" -ForegroundColor Green
} catch {
    Write-Host "   Raw cache klaida: $_" -ForegroundColor Red
}

Write-Host ""
