'use strict';

require('dotenv').config();

const express    = require('express');
const path       = require('path');
const fs         = require('fs');
const crypto     = require('crypto');
const { scrapeDrug, closeBrowser } = require('./scraper');
const { logRequest, getStats }     = require('./analytics');
const { callAI, getModelsStatus }  = require('./ai-router');

const app  = express();
const PORT = parseInt(process.env.PORT) || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const AI_CACHE_TTL_MS  = (parseInt(process.env.AI_CACHE_TTL_HOURS) || 24) * 3600 * 1000;

app.use(express.json({ limit: '2mb' }));

// ===== SECURITY HEADERS =====
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

// ===== STATIC =====
app.use(express.static(path.join(__dirname)));

// ===== AI RESULT CACHE (file-based) =====
const AI_CACHE_DIR = path.join(__dirname, 'cache', 'ai');
if (!fs.existsSync(AI_CACHE_DIR)) fs.mkdirSync(AI_CACHE_DIR, { recursive: true });

function aiCacheKey(drugs, presets, extraQuestion) {
  const str = JSON.stringify({ d: [...drugs].sort(), p: [...presets].sort(), q: extraQuestion || '' });
  return crypto.createHash('md5').update(str).digest('hex');
}
function readAiCache(key) {
  const f = path.join(AI_CACHE_DIR, key + '.json');
  if (!fs.existsSync(f)) return null;
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (Date.now() - d.ts > AI_CACHE_TTL_MS) return null;
  return d.result;
}
function writeAiCache(key, result) {
  fs.writeFileSync(path.join(AI_CACHE_DIR, key + '.json'), JSON.stringify({ ts: Date.now(), result }), 'utf8');
}

// ===== IN-FLIGHT DEDUPLICATION =====
const _inFlight = new Map();
async function deduplicatedAI(key, executor) {
  if (_inFlight.has(key)) return _inFlight.get(key);
  const promise = executor().finally(() => _inFlight.delete(key));
  _inFlight.set(key, promise);
  return promise;
}

// ===== /api/scrape =====
app.get('/api/scrape', async (req, res) => {
  const q = (req.query.q || '').trim().slice(0, 100);
  if (!q) return res.status(400).json({ error: 'Trūksta parametro q' });

  const t0 = Date.now();
  try {
    const result = await scrapeDrug(q);
    logRequest({ ip: req.ip, drugs: [q], responseMs: Date.now() - t0, source: result.source, cacheHit: result.fromCache || false });
    res.json(result);
  } catch (err) {
    logRequest({ ip: req.ip, drugs: [q], responseMs: Date.now() - t0, error: err.message });
    res.status(500).json({ error: 'Scraping klaida', details: err.message });
  }
});

// ===== /api/ai =====
app.post('/api/ai', async (req, res) => {
  const { drugs, rawData, presets, extraQuestion } = req.body;
  if (!drugs?.length) return res.status(400).json({ error: 'Trūksta drugs' });

  const t0  = Date.now();
  const key = aiCacheKey(drugs, presets || [], extraQuestion);

  const cached = readAiCache(key);
  if (cached) {
    logRequest({ ip: req.ip, drugs, presets, responseMs: Date.now() - t0, source: 'ai-cache', aiCacheHit: true });
    return res.json({ ...cached, _meta: { cache: true } });
  }

  try {
    const result = await deduplicatedAI(key, async () => {
      const prompt = buildPrompt(drugs, rawData, presets, extraQuestion);
      const { text, modelUsed, modelId } = await callAI(prompt);
      const parsed = JSON.parse(text);
      parsed._meta = { modelUsed, modelId, cache: false };
      writeAiCache(key, parsed);
      return parsed;
    });

    const firstDrug = Object.values(result.drugs || {})[0];
    logRequest({ ip: req.ip, drugs, presets, responseMs: Date.now() - t0, source: result._meta?.modelId || firstDrug?.source || 'ai', aiCacheHit: false });
    res.json(result);

  } catch (err) {
    logRequest({ ip: req.ip, drugs, presets, responseMs: Date.now() - t0, error: err.message });
    res.status(502).json({ error: err.message });
  }
});

// ===== ADMIN AUTH =====
function adminAuth(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (token === ADMIN_PASSWORD) return next();
  const auth = req.headers['authorization'];
  if (auth) {
    const b64 = auth.replace('Basic ', '');
    const [, pass] = Buffer.from(b64, 'base64').toString().split(':');
    if (pass === ADMIN_PASSWORD) return next();
  }
  res.setHeader('WWW-Authenticate', 'Basic realm="Admin"');
  res.status(401).send('Unauthorized');
}

app.get('/admin', adminAuth, (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/api/admin/stats', adminAuth, (req, res) => res.json(getStats()));
app.get('/api/admin/models', adminAuth, (req, res) => res.json(getModelsStatus()));
app.post('/api/admin/cache-clear', adminAuth, (req, res) => {
  const type = req.body?.type || 'ai';
  const dir  = type === 'raw' ? path.join(__dirname, 'cache') : AI_CACHE_DIR;
  let cleared = 0;
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.json') && !fs.statSync(path.join(dir,f)).isDirectory()) {
        fs.unlinkSync(path.join(dir, f));
        cleared++;
      }
    }
  }
  res.json({ ok: true, cleared, type });
});

// ===== PROMPT BUILDER =====
function buildPrompt(drugs, rawData, presets, extraQuestion) {
  const sections = {
    vartojimas:        'vartojimas ir dozės (kaip vartoti, kiek, kaip dažnai)',
    salutiniai:        'svarbiausi šalutiniai poveikiai (tik patys svarbiausi)',
    kontraindikacijos: 'kontraindikacijos (kam negalima vartoti)',
    vaikai:            'dozės vaikams (amžius, svoris, dozė)',
    laikymas:          'laikymo sąlygos (temperatūra, šviesa, drėgmė)',
    terminas:          'tinkamumo terminas (atidarius ir neatidarius)',
    suderinamas:       'sąveika su kitais vaistais',
    nescumas:          'vartojimas nėštumo ir žindymo metu',
    alkoholis:         'sąveika su alkoholiu',
    vairavimas:        'poveikis vairavimui',
  };

  const activeSections = (presets || []).filter(p => sections[p])
    .map(p => `- "${p}": ${sections[p]}`).join('\n');

  const rawSummary = drugs.map(d => {
    const r = rawData?.[d];
    if (!r || r.error) return `${d}: [duomenų nerasta, naudok savo žinias]`;
    if (r.source === 'openfda') return `${d} (OpenFDA, EN):\n${JSON.stringify(r.raw).slice(0, 3000)}`;
    if (r.raw?.leaflet)         return `${d} (vaistai.lt, LT):\n${r.raw.leaflet.slice(0, 3000)}`;
    return `${d}: ${JSON.stringify(r.raw).slice(0, 2000)}`;
  }).join('\n\n');

  const compatPart = drugs.length > 1
    ? `\nPateik "compatibility": { status:"ok|warn|danger", verdict:"1 sakinys LT", details:"2-4 sakiniai LT", recommendation:"1 sakinys LT" }.`
    : '';

  return `Tu esi farmacijos specialistas. TIKTAI lietuvių kalba. Nulinis vanduo — tik faktai.

Duomenys:
${rawSummary}

Prašomi skyriai:
${activeSections}
${extraQuestion ? `\nPapildomas klausimas: "${extraQuestion}" → kiekvienam vaistui kaip "extra" laukas.` : ''}
${compatPart}

Grąžink JSON:
{
  "drugs": {
    "<vaisto pavadinimas>": {
      "source": "<openfda|vaistai.lt|vapris|ai>",
      "sections": { <tik prašyti skyriai: "pavadinimas": "tekstas LT"> }${extraQuestion ? ',\n      "extra": "..."' : ''}
    }
  }${drugs.length > 1 ? ',\n  "compatibility": { "status":"...", "verdict":"...", "details":"...", "recommendation":"..." }' : ''}
}

Dozės tiksliais skaičiais (mg/ml). Nė viena sekcija be turinio.`;
}

// ===== START =====
const server = app.listen(PORT, () => {
  console.log(`\n💊 Vaistų info:  http://localhost:${PORT}`);
  console.log(`🔧 Admin panelis: http://localhost:${PORT}/admin`);
  console.log(`   Slaptažodis: ${ADMIN_PASSWORD}\n`);
});

process.on('SIGINT', async () => {
  console.log('\nStabdoma...');
  await closeBrowser();
  server.close(() => process.exit(0));
});
