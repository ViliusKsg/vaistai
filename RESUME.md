# RESUME — vaistai_info sesijos tęsimas
> Perskaityk šį failą kai pasakoma "atkuriam sesiją" arba po pertraukos.

---

## Projekto vieta

```
C:\GitHub\CloudeCode\vaistai_info\
```

## Kaip paleisti

```powershell
Set-Location "C:\GitHub\CloudeCode\vaistai_info"
node server.js
```

→ Puslapis: http://localhost:3000  
→ Admin: http://localhost:3000/admin?token=admin123

## Failų struktūra ir paskirtis

| Failas | Paskirtis |
|---|---|
| `index.html` | Pagrindinis UI — 3 vaistų laukai, presetų checkboxes |
| `style.css` | Stiliai — dark/light mode, native CSS |
| `app.js` | Frontend: fetch `/api/scrape` + `/api/ai`, DOM render |
| `server.js` | Express serveris — visi endpoint'ai, AI cache, dedup |
| `scraper.js` | Playwright scraper: OpenFDA → vaistai.lt → vapris |
| `ai-router.js` | 4 modelių rotavimas + RPM/RPD tracking + backoff + queue |
| `analytics.js` | Užklausų logging, statistika (IP, top vaistai, response time) |
| `admin.html` | Admin panelis — modelių limitai, statistika, cache valymas |
| `.env` | API raktai ir konfigūracija (git-ignored) |
| `cache/` | Raw scraper cache (7 dienų TTL) |
| `cache/ai/` | AI atsakymų cache (24h TTL) |
| `analytics.json` | Statistikos duomenys (auto-generuojamas) |
| `todo.md` | Užduočių sąrašas |

## AI Modeliai (rotavimo eilė)

1. **Groq llama-3.3-70b** — geriausios kokybės (RPD: 950/d)
2. **Groq llama-4-scout-17b** — rezervas (RPD: 950/d)
3. **Gemini 2.0 Flash Lite** — Google fallback (RPD: 1400/d)
4. **Groq llama-3.1-8b** — paskutinis fallback (RPD: 13800/d)

## Duomenų šaltiniai (scraper prioritetai)

1. **OpenFDA API** — nemokamas JSON, be naršyklės (EN, populiarūs vaistai)
2. **vaistai.lt** — Playwright, "Informacinis lapelis" tab (LT)
3. **vapris.vvkt.lt** — Playwright fallback, oficialus LT registras
4. AI naudoja savo žinias jei visi šaltiniai nepasiekiami

## .env konfigūracija

```env
GROQ_API_KEY=...         # console.groq.com
GEMINI_API_KEY=...       # aistudio.google.com
PORT=3000
CACHE_TTL_HOURS=168      # Raw cache (7 dienų)
AI_CACHE_TTL_HOURS=24    # AI atsakymų cache
ADMIN_PASSWORD=admin123  # Keisti prieš produkciją!
```

⚠️ **API raktai buvo bendrinami chate** — jei naudosi tuos pačius, pirmiausia regeneruok:
- Groq: https://console.groq.com → API Keys
- Gemini: https://aistudio.google.com → Get API Key

## Žinomi trūkumai / tolimesni darbai

- [ ] vaistai.lt "Informacinis lapelis" tab'o CSS selektor gali keistis — reikia patikrinti
- [ ] Rate limit state prarandamas serverio perkrovimo metu (in-memory) — jei reikia, perkelti į failą
- [ ] ADMIN_PASSWORD pakeisti į stipresnį prieš public deployment
- [ ] vapris.vvkt.lt scraper neišbandytas su realiais duomenimis
- [ ] Gemini grąžina plain text, ne JSON object — testuoti su realiu vaistu

## Testavimo komandos

```powershell
# Testuoti scraper
Invoke-RestMethod 'http://localhost:3000/api/scrape?q=ibuprofen'

# Testuoti AI
$b = @{ drugs=@('ibuprofen'); rawData=@{}; presets=@('vartojimas','salutiniai'); extraQuestion='' } | ConvertTo-Json -Depth 4
Invoke-RestMethod 'http://localhost:3000/api/ai' -Method POST -Body $b -ContentType 'application/json'

# Modelių statusas
Invoke-RestMethod 'http://localhost:3000/api/admin/models?token=admin123'
```
