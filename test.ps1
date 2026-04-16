Set-Location "C:\GitHub\CloudeCode\vaistai_info"

Write-Host "`n🔍 Tikrinamas serveris (http://localhost:3000)...`n" -ForegroundColor Yellow

# 1. Scraper testas
try {
    $scrape = Invoke-RestMethod "http://localhost:3000/api/scrape?q=ibuprofen" -TimeoutSec 10
    Write-Host "✅ Scraper veikia   (šaltinis: $($scrape.source), vaistas: $($scrape.drugName))" -ForegroundColor Green
} catch {
    Write-Host "❌ Scraper klaida:  $_" -ForegroundColor Red
}

# 2. AI testas
try {
    $body = @{
        drugs         = @("ibuprofen")
        rawData       = @{}
        presets       = @("vartojimas", "salutiniai", "laikymas")
        extraQuestion = ""
    } | ConvertTo-Json -Depth 4

    $ai = Invoke-RestMethod "http://localhost:3000/api/ai" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 30
    $model = $ai._meta.modelUsed
    $cache = if ($ai._meta.cache) { " [iš cache]" } else { "" }
    Write-Host "✅ AI veikia        (modelis: $model$cache)" -ForegroundColor Green
} catch {
    Write-Host "❌ AI klaida:       $_" -ForegroundColor Red
}

# 3. Admin ir modelių statusas
try {
    $token = (Get-Content ".env" | Where-Object { $_ -match "^ADMIN_PASSWORD=" }) -replace "^ADMIN_PASSWORD=", ""
    if (-not $token) { $token = "admin123" }

    $models = Invoke-RestMethod "http://localhost:3000/api/admin/models?token=$token" -TimeoutSec 5

    Write-Host "`n📊 Modelių statusas:" -ForegroundColor Cyan
    foreach ($m in $models) {
        $avail  = if ($m.available) { "✅" } elseif (-not $m.hasKey) { "🔑" } else { "⏸" }
        $rpdPct = "$($m.rpdUsed)/$($m.rpdLimit)"
        $rpmPct = "$($m.rpmUsed)/$($m.rpmLimit) rpm"
        $blocked = if ($m.blockedUntil) { " [blok. iki $($m.blockedUntil)]" } else { "" }
        Write-Host ("   {0} {1,-28} RPD: {2,-10} {3}{4}" -f $avail, $m.label, $rpdPct, $rpmPct, $blocked)
    }
} catch {
    Write-Host "❌ Admin nepasiekiamas: $_" -ForegroundColor Red
}

Write-Host ""
