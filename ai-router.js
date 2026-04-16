'use strict';

// ============================================================
//  AI ROUTER — Rotavimas + Eilė + Exponential Backoff + Stats
// ============================================================

const GROQ_API_KEY   = process.env.GROQ_API_KEY  || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

const MODELS = [
  { id: 'groq/llama-3.3-70b', provider: 'groq',   model: 'llama-3.3-70b-versatile',                    limits: { rpm: 28, rpd: 950  }, label: 'Groq llama-3.3-70b'   },
  { id: 'groq/llama-4-scout',  provider: 'groq',   model: 'meta-llama/llama-4-scout-17b-16e-instruct',  limits: { rpm: 28, rpd: 950  }, label: 'Groq llama-4-scout'    },
  { id: 'gemini/flash-lite',   provider: 'gemini', model: 'gemini-2.0-flash-lite',                      limits: { rpm: 28, rpd: 1400 }, label: 'Gemini Flash Lite'     },
  { id: 'groq/llama-3.1-8b',  provider: 'groq',   model: 'llama-3.1-8b-instant',                       limits: { rpm: 28, rpd: 13800}, label: 'Groq llama-3.1-8b'    },
];

// ===== RATE LIMIT STATE =====
const _state = {};

function getState(id) {
  if (!_state[id]) _state[id] = { rpmWindow: [], rpdCount: 0, rpdDate: todayUtc(), blockedUntil: 0, errors429: 0, totalCalls: 0 };
  const s = _state[id];
  if (s.rpdDate !== todayUtc()) { s.rpdCount = 0; s.rpdDate = todayUtc(); s.errors429 = 0; }
  return s;
}

function todayUtc() { return new Date().toISOString().slice(0, 10); }

function hasKey(m) {
  if (m.provider === 'groq')   return !!GROQ_API_KEY   && !GROQ_API_KEY.includes('įrašykite');
  if (m.provider === 'gemini') return !!GEMINI_API_KEY && !GEMINI_API_KEY.includes('įrašykite');
  return false;
}

function isAvailable(m) {
  if (!hasKey(m)) return false;
  const s = getState(m.id);
  const now = Date.now();
  if (s.blockedUntil > now) return false;
  if (s.rpdCount >= m.limits.rpd) return false;
  s.rpmWindow = s.rpmWindow.filter(t => now - t < 60000);
  if (s.rpmWindow.length >= m.limits.rpm) return false;
  return true;
}

function recordUsage(id) {
  const s = getState(id);
  s.rpmWindow.push(Date.now());
  s.rpdCount++;
  s.totalCalls++;
}

function recordRateError(id, retryAfterSec) {
  const s = getState(id);
  s.errors429++;
  s.blockedUntil = Date.now() + (retryAfterSec || 60) * 1000;
  console.warn(`[ai-router] ⏸ ${id} blokuotas ${retryAfterSec || 60}s (429 #${s.errors429})`);
}

function pickModel() {
  for (const m of MODELS) { if (isAvailable(m)) return m; }
  return null;
}

// ===== EILĖ (Queue) =====
// Apribojame max lygiagrečių AI užklausų skaičių — vengiame burst'o
const MAX_CONCURRENT = 3;
let _active = 0;
const _queue = [];

function enqueue(fn) {
  return new Promise((resolve, reject) => {
    _queue.push({ fn, resolve, reject });
    drainQueue();
  });
}

function drainQueue() {
  while (_queue.length > 0 && _active < MAX_CONCURRENT) {
    const { fn, resolve, reject } = _queue.shift();
    _active++;
    fn()
      .then(resolve)
      .catch(reject)
      .finally(() => { _active--; drainQueue(); });
  }
}

// ===== EXPONENTIAL BACKOFF =====
async function withBackoff(fn, maxAttempts = 4) {
  let delay = 1000; // 1s → 2s → 4s → 8s
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isLast = attempt === maxAttempts;
      const isRetryable = err?.isRateLimit || err?.isTransient;

      if (!isRetryable || isLast) throw err;

      // Jei serveris pasakė retry-after — naudojame tą
      const waitMs = err.retryAfterMs || delay;
      console.warn(`[backoff] Bandymas ${attempt}/${maxAttempts} nepavyko. Laukiame ${waitMs}ms...`);
      await sleep(waitMs);
      delay = Math.min(delay * 2, 30000); // max 30s
    }
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ===== GROQ UŽKLAUSA =====
async function callGroq(model, prompt) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 3000,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(45000),
  });

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('retry-after') || '60');
    recordRateError(model.id, retryAfter);
    throw { isRateLimit: true, retryAfterMs: retryAfter * 1000 };
  }
  if (res.status >= 500) throw { isTransient: true, message: `Groq HTTP ${res.status}` };
  if (!res.ok) throw new Error(`Groq HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const json    = await res.json();
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error('Groq tuščias atsakymas');
  return { text: content, modelUsed: model.label, modelId: model.id };
}

// ===== GEMINI UŽKLAUSA =====
async function callGemini(model, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model.model}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-goog-api-key': GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 3000 },
    }),
    signal: AbortSignal.timeout(45000),
  });

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('retry-after') || '60');
    recordRateError(model.id, retryAfter);
    throw { isRateLimit: true, retryAfterMs: retryAfter * 1000 };
  }
  if (res.status >= 500) throw { isTransient: true, message: `Gemini HTTP ${res.status}` };
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const json = await res.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini tuščias atsakymas');

  // Pašaliname markdown fences jei yra
  const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
  return { text: cleaned, modelUsed: model.label, modelId: model.id };
}

// ===== PAGRINDINĖ FUNKCIJA =====
async function callAI(prompt) {
  return enqueue(() => _callAIInternal(prompt));
}

async function _callAIInternal(prompt) {
  for (let attempt = 0; attempt < MODELS.length * 2; attempt++) {
    const model = pickModel();
    if (!model) {
      const nextAvailable = getNextAvailableTime();
      throw new Error(`Visi AI modeliai išnaudojo limitus. Bandykite po: ${nextAvailable}`);
    }

    recordUsage(model.id);
    console.log(`[ai-router] → ${model.label} | RPM ${getState(model.id).rpmWindow.filter(t => Date.now()-t<60000).length}/${model.limits.rpm} | RPD ${getState(model.id).rpdCount}/${model.limits.rpd}`);

    try {
      const callFn = model.provider === 'groq' ? callGroq : callGemini;
      // Exponential backoff tik transient klaidoms (5xx)
      return await withBackoff(() => callFn(model, prompt), 3);

    } catch (err) {
      if (err?.isRateLimit) {
        console.warn(`[ai-router] Rate limit → rotavimas į kitą modelį`);
        continue;
      }
      throw err;
    }
  }

  throw new Error('AI užklausa nepavyko po visų bandymų');
}

function getNextAvailableTime() {
  const times = MODELS
    .filter(m => hasKey(m))
    .map(m => getState(m.id).blockedUntil)
    .filter(t => t > Date.now());
  if (!times.length) return 'dabar (RPD limitas)';
  const soonest = Math.min(...times);
  return new Date(soonest).toLocaleTimeString('lt-LT');
}

// ===== STATUSO API =====
function getModelsStatus() {
  const now = Date.now();
  return MODELS.map(m => {
    const s = getState(m.id);
    const rpm = s.rpmWindow.filter(t => now - t < 60000).length;
    return {
      id:           m.id,
      label:        m.label,
      provider:     m.provider,
      hasKey:       hasKey(m),
      available:    isAvailable(m),
      rpmUsed:      rpm,
      rpmLimit:     m.limits.rpm,
      rpmPct:       Math.round(rpm / m.limits.rpm * 100),
      rpdUsed:      s.rpdCount,
      rpdLimit:     m.limits.rpd,
      rpdPct:       Math.round(s.rpdCount / m.limits.rpd * 100),
      totalCalls:   s.totalCalls,
      errors429:    s.errors429,
      blockedUntil: s.blockedUntil > now ? new Date(s.blockedUntil).toISOString() : null,
      queueLength:  _queue.length,
      activeCalls:  _active,
    };
  });
}

module.exports = { callAI, getModelsStatus };
