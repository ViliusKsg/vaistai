# 🚀 PALEIDIMO INSTRUKCIJA — vaistai_info

## Greitas startas (1 komanda)

```powershell
Set-Location "C:\GitHub\CloudeCode\vaistai_info"; node server.js
```

Tada atidaryti: **http://localhost:3000**  
Admin panelis: **http://localhost:3000/admin?token=admin123**

---

## Pilna pradžia (pirmas kartas)

### 1. Patikrinti Node.js

```powershell
node --version   # turi būti v18+
```

Jei nėra — įdiegti: https://nodejs.org

### 2. Įdiegti priklausomybes

```powershell
Set-Location "C:\GitHub\CloudeCode\vaistai_info"
npm install
```

### 3. Įdiegti Playwright naršyklę

```powershell
npx playwright install chromium
```

### 4. Sukonfigūruoti API raktus

```powershell
Copy-Item ".env.example" ".env"
notepad .env
```

Užpildyti `.env`:
```
GROQ_API_KEY=     ← https://console.groq.com → API Keys
GEMINI_API_KEY=   ← https://aistudio.google.com → Get API Key
ADMIN_PASSWORD=   ← sugalvoti slaptažodį
```

### 5. Paleisti

```powershell
node server.js
```

---

## PowerShell skriptai

### start.ps1 — Paleisti serverį

```powershell
Set-Location "C:\GitHub\CloudeCode\vaistai_info"

if (-not (Test-Path ".env")) {
    Write-Host "❌ Nėra .env failo! Sukurk jį iš .env.example" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path "node_modules")) {
    Write-Host "📦 Diegiamos priklausomybės..." -ForegroundColor Yellow
    npm install
}

Write-Host "💊 Paleidžiamas serveris..." -ForegroundColor Green
Write-Host "   Puslapis:  http://localhost:3000" -ForegroundColor Cyan
Write-Host "   Admin:     http://localhost:3000/admin" -ForegroundColor Cyan
Write-Host "   Sustabdyti: Ctrl+C`n" -ForegroundColor Gray

node server.js
```

### test.ps1 — Patikrinti ar veikia

```powershell
Set-Location "C:\GitHub\CloudeCode\vaistai_info"

Write-Host "🔍 Tikrinamas serveris..." -ForegroundColor Yellow

# 1. Scraper testas
try {
    $scrape = Invoke-RestMethod "http://localhost:3000/api/scrape?q=ibuprofen" -TimeoutSec 10
    Write-Host "✅ Scraper veikia (šaltinis: $($scrape.source))" -ForegroundColor Green
} catch {
    Write-Host "❌ Scraper klaida: $_" -ForegroundColor Red
}

# 2. AI testas
try {
    $body = @{
        drugs        = @("ibuprofen")
        rawData      = @{}
        presets      = @("vartojimas", "salutiniai", "laikymas")
        extraQuestion = ""
    } | ConvertTo-Json -Depth 4

    $ai = Invoke-RestMethod "http://localhost:3000/api/ai" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 30
    $modelUsed = $ai._meta.modelUsed
    Write-Host "✅ AI veikia (modelis: $modelUsed)" -ForegroundColor Green
} catch {
    Write-Host "❌ AI klaida: $_" -ForegroundColor Red
}

# 3. Modelių statusas
try {
    $models = Invoke-RestMethod "http://localhost:3000/api/admin/models?token=admin123" -TimeoutSec 5
    Write-Host "`n📊 Modelių statusas:" -ForegroundColor Cyan
    foreach ($m in $models) {
        $avail = if ($m.available) { "✅" } else { "⏸" }
        Write-Host ("   {0} {1,-25} RPD: {2}/{3}" -f $avail, $m.label, $m.rpdUsed, $m.rpdLimit)
    }
} catch {
    Write-Host "❌ Admin klaida (ar serveris paleistas?): $_" -ForegroundColor Red
}
```

### clear-cache.ps1 — Išvalyti cache

```powershell
Set-Location "C:\GitHub\CloudeCode\vaistai_info"

$token = "admin123"  # pakeisti pagal .env ADMIN_PASSWORD

# AI cache
$r1 = Invoke-RestMethod "http://localhost:3000/api/admin/cache-clear" `
    -Method POST `
    -Headers @{ "x-admin-token" = $token } `
    -Body '{"type":"ai"}' `
    -ContentType "application/json"
Write-Host "🗑  AI cache išvalyta: $($r1.cleared) failų" -ForegroundColor Yellow

# Raw cache
$r2 = Invoke-RestMethod "http://localhost:3000/api/admin/cache-clear" `
    -Method POST `
    -Headers @{ "x-admin-token" = $token } `
    -Body '{"type":"raw"}' `
    -ContentType "application/json"
Write-Host "🗑  Raw cache išvalyta: $($r2.cleared) failų" -ForegroundColor Yellow
```

---

## Dažnos problemos

| Problema | Sprendimas |
|---|---|
| `Cannot find module` | `npm install` |
| `GROQ_API_KEY nenurodytas` | Patikrinti `.env` failą |
| Serveris neatsako | Patikrinti ar `node server.js` paleistas |
| vaistai.lt neveikia | `npx playwright install chromium` |
| 429 Too Many Requests | AI router automatiškai persijungs į kitą modelį |
| Admin rodo 401 | Patikrinti `ADMIN_PASSWORD` `.env` faile |

---

## Aplankų struktūra

```
vaistai_info/
├── index.html      ← UI (naršyklė)
├── style.css       ← Stiliai
├── app.js          ← Frontend logika
├── server.js       ← Express serveris
├── scraper.js      ← Playwright (vaistai.lt + OpenFDA)
├── ai-router.js    ← 4 modelių rotavimas + rate limit
├── analytics.js    ← Statistika
├── admin.html      ← Admin panelis
├── .env            ← API raktai (NEGIT'inti)
├── .env.example    ← Šablonas
├── cache/          ← Raw duomenų cache (7d)
│   └── ai/         ← AI atsakymų cache (24h)
├── package.json
├── RESUME.md       ← Sesijos tęsimo instrukcija
└── POST-MORTEM.md  ← Ciklo analizė
```
