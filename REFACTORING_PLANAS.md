# vaistai_info — Refactoring planas
**Data:** 2026-04-30
**Statusas:** Planavimo fazė

---

## Etapas 1: Struktūros pertvarkymas (nauji aplankai)

```
vaistai_info/
├── src/
│   ├── server.js          ← dabartinis server.js
│   ├── routes/
│   │   ├── api.js         ← /api/scrape, /api/ai
│   │   └── admin.js       ← /admin, /api/admin/*
│   ├── services/
│   │   ├── scraper.js     ← dabartinis scraper.js
│   │   ├── ai-router.js   ← dabartinis ai-router.js
│   │   ├── cache.js       ← iškeltas bendras cache modulis
│   │   └── analytics.js   ← dabartinis analytics.js
│   └── utils/
│       ├── prompt-builder.js  ← buildPrompt iš server.js
│       └── validators.js      ← input sanitizavimas
├── public/
│   ├── index.html
│   ├── admin.html
│   ├── app.js
│   └── style.css
├── config/
│   └── config.js          ← visos konstantos vienoje vietoje
├── tests/
│   ├── scraper.test.js
│   ├── ai-router.test.js
│   └── api.test.js
├── cache/                 ← lieka kaip yra
├── package.json
├── .env
└── README.md
```

---

## Etapas 2: Bendras cache modulis (`src/services/cache.js`)

**Problema:** Dabar cache logika dubliuojasi `server.js` (AI cache) ir `scraper.js` (raw cache).

**Sprendimas:** Vienas `Cache` klasė su:
- `get(key, ttl)`
- `set(key, value)`
- `clear()`
- `getDir()` pagal tipą

---

## Etapas 3: Input validation (`src/utils/validators.js`)

```javascript
function validateDrugName(name) {
  if (!name || typeof name !== 'string') return null;
  const cleaned = name.trim().slice(0, 100);
  // Leidžiami tik raidės, skaičiai, tarpai, brūkšneliai
  if (!/^[\p{L}\p{N}\s\-]+$/u.test(cleaned)) return null;
  return cleaned;
}
```

---

## Etapas 4: Konfigūracijos centralizavimas (`config/config.js`)

```javascript
module.exports = {
  port: process.env.PORT || 3000,
  adminPassword: process.env.ADMIN_PASSWORD,
  cache: {
    rawTtlHours: parseInt(process.env.CACHE_TTL_HOURS) || 168,
    aiTtlHours: parseInt(process.env.AI_CACHE_TTL_HOURS) || 24,
  },
  ai: {
    maxConcurrent: 3,
    maxRetries: 4,
    timeoutMs: 45000,
  },
  analytics: {
    maxRecent: 500,
    saveDebounceMs: 5000,
  },
  security: {
    jsonLimit: '2mb',
  }
};
```

---

## Etapas 5: Admin slaptažodžio validacija

**Problema:** Default `admin123` jei nėra `.env`.

**Sprendimas:**
```javascript
if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 8) {
  console.error('❌ ADMIN_PASSWORD per trumpas arba nenustatytas!');
  process.exit(1);
}
```

---

## Etapas 6: GDPR-safe analytics

**Problema:** IP adresai saugomi be anonimizavimo.

**Sprendimas:**
```javascript
function anonymizeIp(ip) {
  // Pvz.: 192.168.1.123 → 192.168.1.xxx
  return ip.replace(/\.\d+$/, '.xxx');
}
```

---

## Etapas 7: Health check endpoint

```javascript
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    version: require('../package.json').version,
  });
});
```

---

## Etapas 8: Testų pridėjimas

**Prioritetai:**
1. `scraper.test.js` — mockinti Playwright, testuoti fallback chain
2. `ai-router.test.js` — mockinti fetch, testuoti rate limiting
3. `api.test.js` — supertest, testuoti endpoint'us

**Framework:** `jest` + `supertest`

---

## Etapas 9: Error handling pagerinimas

**Dabar:** Daug `try/catch` su bendromis žinutėmis.

**Reikia:**
- Custom error klasės (`ScraperError`, `AIRouterError`, `ValidationError`)
- Centralizuotas error handler middleware
- Struktūrizuoti error response'ai

---

## Etapas 10: Logging pagerinimas

**Dabar:** `console.log`/`console.warn` visur.

**Reikia:**
- `winston` arba `pino` logger
- Log levels (debug, info, warn, error)
- Request ID per užklausą (correlation ID)
- Rotuojami log failai

---

## Prioritetų eilė

| Prioritetas | Etapas | Trukmė (est.) |
|-------------|--------|---------------|
| 🔴 **Kritinis** | 5. Admin slaptažodžio validacija | 10 min |
| 🔴 **Kritinis** | 3. Input validation | 20 min |
| 🟡 **Aukštas** | 2. Bendras cache modulis | 30 min |
| 🟡 **Aukštas** | 4. Konfigūracijos centralizavimas | 20 min |
| 🟢 **Vidutinis** | 1. Struktūros pertvarkymas | 1 val |
| 🟢 **Vidutinis** | 6. GDPR-safe analytics | 15 min |
| 🟢 **Vidutinis** | 7. Health check | 10 min |
| 🔵 **Žemas** | 8. Testai | 2 val |
| 🔵 **Žemas** | 9. Error handling | 1 val |
| 🔵 **Žemas** | 10. Logging | 1 val |

---

## Greitas startas (kai tęsim)

```bash
cd c:\GitHub\CloudeCode\vaistai_info
# 1. Pradėti nuo kritinių: etapai 3 + 5
# 2. Tada struktūra: etapas 1 + 2 + 4
# 3. Tada viskas kitas
```
