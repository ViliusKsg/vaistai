# vaistai_info — Projekto analizė
**Data:** 2026-04-30
**Apžvalgą atliko:** Kimi K2.6

---

## 1. Kas tai?

**Vaistų informacijos paieškos sistema su AI sumarizavimu lietuvių kalba.**

Vartotojas įveda 1–3 vaistų pavadinimus, pasirenka dominančias temas (vartojimas, šalutiniai poveikiai, kontraindikacijos ir kt.), sistema surenka duomenis iš šaltinių ir AI sugeneruoja struktūrizuotą atsakymą lietuvių kalba.

---

## 2. Architektūra

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  index.html │────→│  server.js   │────→│   scraper.js    │
│  (UI)       │     │  (Express)   │     │  (Playwright)   │
└─────────────┘     └──────────────┘     └─────────────────┘
                            │
                            ↓
                     ┌──────────────┐
                     │  ai-router.js│
                     │  (Groq/Gemini)│
                     └──────────────┘
                            │
                            ↓
                     ┌──────────────┐
                     │  analytics.js│
                     │  (stats)     │
                     └──────────────┘
```

### Backend (`server.js`)
- **Express.js** serveris, port 3000
- **Endpoint'ai:**
  - `GET /api/scrape?q=vaistas` — surenka vaisto duomenis
  - `POST /api/ai` — siunčia AI sumarizavimui
  - `GET /admin` + `/api/admin/*` — admin panelis su auth
- **Cache:** file-based (`cache/ai/` ir `cache/`)
- **Deduplication:** `_inFlight` Map — neleidžia dubliuoti AI užklausų

### Frontend (`index.html` + `app.js` + `style.css`)
- 3 vaistų įvesties laukai
- Preset checkbox'ai (10 temų)
- Papildomas klausimo laukas
- Dark/light mode per localStorage
- Rezultatai kortelėmis su sekcijomis

### Scraper (`scraper.js`)
**3 šaltinių fallback chain:**
1. **OpenFDA API** — greitas, be naršyklės, tik EN, populiariems vaistams
2. **vaistai.lt** — Playwright + stealth, LT kalba, informacinis lapelis
3. **vapris.vvkt.lt** — fallback, oficialus LT registras

**Browser singleton** — vienas Playwright instance visoms užklausoms.

### AI Router (`ai-router.js`)
- **4 modeliai:** Groq (llama-3.3-70b, llama-4-scout, llama-3.1-8b) + Gemini (flash-lite)
- **Rate limiting:** RPM/RPD tracking per modelį
- **Rotacija:** kai vienas pasiekia limitą → pereina prie kito
- **Queue:** max 3 lygiagrečios užklausos
- **Exponential backoff:** 1s → 2s → 4s → 8s retry

### Analytics (`analytics.js`)
- In-memory stats + `analytics.json` persistence
- Top vaistai, top IP, recent requests, cache hit rates
- Debounced save (5s)

---

## 3. Duomenų srautas

```
1. Vartotojas įveda vaistus → pasirenka presetus
2. Frontend kviečia /api/scrape kiekvienam vaistui (lygiagrečiai)
3. Scraper bando OpenFDA → vaistai.lt → vapris
4. Frontend kviečia /api/ai su surinktais raw duomenimis
5. Backend tikrina AI cache → jei miss, deduplicatedAI → callAI
6. AI router renka modelį → siunčia promptą → grąžina JSON
7. Backend cache'ina rezultatą → grąžina frontend
8. Frontend renderina korteles + suderinamumo sekciją
```

---

## 4. Prompt struktūra (`buildPrompt`)

AI gauna:
- Surinktus raw duomenis iš visų šaltinių (apkarpytus iki 3000 simb.)
- Pasirinktų presetų sąrašą
- Papildomą klausimą (jei yra)
- Instrukciją grąžinti JSON su `drugs` ir `compatibility`

**Temų presetai:** vartojimas, šalutiniai, kontraindikacijos, vaikai, laikymas, terminas, suderinamas, nėštumas, alkoholis, vairavimas.

---

## 5. Konfigūracija (`.env`)

```
GROQ_API_KEY=        ← https://console.groq.com
GEMINI_API_KEY=      ← https://aistudio.google.com
PORT=3000
CACHE_TTL_HOURS=168   (scraper cache)
AI_CACHE_TTL_HOURS=24 (AI cache)
ADMIN_PASSWORD=       (default: admin123)
```

---

## 6. Žinomi trūkumai / tech debt

| # | Problema | Vieta | Rimtumas |
|---|----------|-------|----------|
| 1 | **Visi failai root aplanke** — nėra `src/`, `routes/`, `services/` struktūros | visur | Vidutinis |
| 2 | **Cache logika dubliuojasi** — `scraper.js` ir `server.js` turi atskirą cache | 2 failai | Vidutinis |
| 3 | **Admin slaptažodis gali būti default** `admin123` | `server.js` | **Aukštas** |
| 4 | **Nėra input validation** — `drugName` tik `.slice(0,100)`, nėra sanitizavimo | `server.js` | Vidutinis |
| 5 | **Playwright context neuždaromas** `scrapeDrug` — tik `context.close()`, bet browser lieka | `scraper.js` | Žemas |
| 6 | **Nėra testų** — nei unit, nei integration | — | Vidutinis |
| 7 | **Analytics nėra GDPR-safe** — IP logginamas be anonimizavimo | `analytics.js` | Vidutinis |
| 8 | **Hardcoded konstantos** — `MAX_RECENT=500`, `MAX_CONCURRENT=3` | 2 failai | Žemas |
| 9 | **Nėra health check endpoint** — monitoringui | `server.js` | Žemas |
| 10 | **Oracle Cloud skriptai nebaigti** — `todo.md` rodo daug pending | `oracle-tier/` | Žemas |

---

## 7. Stipriosios pusės

- ✅ Geras AI router su fallback ir rate limiting
- ✅ Deduplication — neleidžia dubliuoti užklausų
- ✅ File-based cache — paprasta, veikia be DB
- ✅ Stealth Playwright — bando apeiti bot detection
- ✅ Admin panelis su basic auth
- ✅ Dark/light mode
- ✅ OpenFDA → vaistai.lt → vapris fallback chain

---

## 8. Priklausomybės

```json
{
  "express": "^4.18.3",
  "playwright": "^1.43.1",
  "playwright-extra": "^4.3.6",
  "puppeteer-extra-plugin-stealth": "^2.11.2",
  "dotenv": "^16.4.5"
}
```

---

## 9. Failų sąrašas

| Failas | Paskirtis | Eilučių (~) |
|--------|-----------|-------------|
| `server.js` | Express serveris, API endpoint'ai, cache | 200+ |
| `scraper.js` | Playwright scraper, 3 šaltiniai | 200+ |
| `ai-router.js` | AI modelių rotacija, rate limits, queue | 200+ |
| `app.js` | Frontend logika, fetch, render | 200+ |
| `analytics.js` | Statistika, logging | 100+ |
| `index.html` | UI struktūra | 100+ |
| `style.css` | Stiliai, dark/light mode | 200+ |
| `admin.html` | Admin panelis | ? |
| `package.json` | Priklausomybės | 20 |
| `.env.example` | Konfigūracijos šablonas | 6 |
| `START.md` | Paleidimo instrukcija | 50 |
| `POST-MORTEM.md` | Projekt retrospektyva | 40 |
| `todo.md` | Darbų sąrašas | 30 |
| `oracle-auto-create.js` | Oracle Cloud VM auto-create | 100+ |
| `oracle-tier/oci-create-instance.sh` | OCI CLI skriptas | ? |
| `nginx.conf` / `nginx-setup.sh` | Nginx konfigūracija | ? |
| `ecosystem.config.js` | PM2 konfigūracija | ? |
| `start.ps1` / `test.ps1` / `clear-cache.ps1` | PowerShell skriptai | 3×30 |

---

## 10. TODO būsena (iš `todo.md`)

**Done:**
- [x] Projekto struktūra
- [x] index.html UI
- [x] style.css dark/light
- [x] app.js fetch logika
- [x] proxy.php scraper su cache
- [x] ai.php Groq API

**Pending:**
- [ ] Testavimas su realiais vaistais
- [ ] GROQ_API_KEY konfigūracija
- [ ] Papildomi AI modeliai (OpenRouter/Gemini)
- [ ] Oracle Free Tier instancijos gavimas (daug žingsnių)
- [ ] DNS + Nginx + SSL
