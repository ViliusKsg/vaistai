'use strict';

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_FILE  = path.join(__dirname, 'analytics.json');
const MAX_RECENT = 500; // kiek naujausių įrašų saugoti

// ===== IN-MEMORY STRUKTŪROS =====
let _data = {
  requests:   [],   // paskutiniai MAX_RECENT įrašai
  drugs:      {},   // { 'ibuprofen': { count, lastSeen, sources: {openfda:N,...} } }
  ips:        {},   // { '127.0.0.1': { count, lastSeen } }
  errors:     0,
  cacheHits:  0,
  aiCacheHits:0,
  totalRequests: 0,
  startedAt: new Date().toISOString(),
};

// ===== ĮKĖLIMAS IŠ DISKO =====
if (fs.existsSync(DATA_FILE)) {
  try {
    const saved = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    _data = { ..._data, ...saved };
    // startedAt nekeisti — rodo kada serveris startuotas
    _data.startedAt = new Date().toISOString();
  } catch { /* pirmasis paleidimas */ }
}

// ===== IŠSAUGOJIMAS (debounced) =====
let _saveTimer = null;
function scheduleSave() {
  if (_saveTimer) return;
  _saveTimer = setTimeout(() => {
    fs.writeFileSync(DATA_FILE, JSON.stringify(_data, null, 2), 'utf8');
    _saveTimer = null;
  }, 5000);
}

// ===== LOG UŽKLAUSA =====
function logRequest({ ip, drugs, presets, responseMs, source, cacheHit, aiCacheHit, error }) {
  const now = new Date().toISOString();
  const drugList = Array.isArray(drugs) ? drugs : [drugs];

  _data.totalRequests++;
  if (cacheHit)   _data.cacheHits++;
  if (aiCacheHit) _data.aiCacheHits++;
  if (error)      _data.errors++;

  // IP statistika
  const cleanIp = sanitizeIp(ip);
  if (!_data.ips[cleanIp]) _data.ips[cleanIp] = { count: 0, lastSeen: now };
  _data.ips[cleanIp].count++;
  _data.ips[cleanIp].lastSeen = now;

  // Vaistų statistika
  for (const drug of drugList) {
    const key = drug.toLowerCase().trim();
    if (!_data.drugs[key]) _data.drugs[key] = { count: 0, lastSeen: now, sources: {} };
    _data.drugs[key].count++;
    _data.drugs[key].lastSeen = now;
    if (source) {
      _data.drugs[key].sources[source] = (_data.drugs[key].sources[source] || 0) + 1;
    }
  }

  // Recent requests (ring buffer)
  _data.requests.push({
    ts: now,
    ip: cleanIp,
    drugs: drugList,
    presets: presets || [],
    responseMs: responseMs || 0,
    source: source || 'unknown',
    cacheHit: !!cacheHit,
    aiCacheHit: !!aiCacheHit,
    error: error || null,
  });
  if (_data.requests.length > MAX_RECENT) {
    _data.requests = _data.requests.slice(-MAX_RECENT);
  }

  scheduleSave();
}

// ===== STATISTIKOS API =====
function getStats() {
  const topDrugs = Object.entries(_data.drugs)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 20)
    .map(([name, d]) => ({ name, count: d.count, lastSeen: d.lastSeen, sources: d.sources }));

  const topIps = Object.entries(_data.ips)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 20)
    .map(([ip, d]) => ({ ip, count: d.count, lastSeen: d.lastSeen }));

  const recent = [..._data.requests].reverse().slice(0, 100);

  // Vidutinis response time (paskutiniai 100)
  const rtSample = _data.requests.slice(-100).filter(r => r.responseMs > 0);
  const avgResponseMs = rtSample.length
    ? Math.round(rtSample.reduce((s, r) => s + r.responseMs, 0) / rtSample.length)
    : 0;

  // Kešo efektyvumas
  const cacheHitRate = _data.totalRequests > 0
    ? Math.round((_data.cacheHits / _data.totalRequests) * 100)
    : 0;
  const aiCacheHitRate = _data.totalRequests > 0
    ? Math.round((_data.aiCacheHits / _data.totalRequests) * 100)
    : 0;

  return {
    summary: {
      totalRequests: _data.totalRequests,
      errors: _data.errors,
      cacheHits: _data.cacheHits,
      aiCacheHits: _data.aiCacheHits,
      cacheHitRate,
      aiCacheHitRate,
      avgResponseMs,
      startedAt: _data.startedAt,
      uptimeMin: Math.round((Date.now() - new Date(_data.startedAt).getTime()) / 60000),
    },
    topDrugs,
    topIps,
    recent,
  };
}

function sanitizeIp(ip) {
  if (!ip) return 'unknown';
  // IPv6 loopback → readable
  if (ip === '::1' || ip === '::ffff:127.0.0.1') return '127.0.0.1';
  // Strip IPv6 prefix
  if (ip.startsWith('::ffff:')) return ip.slice(7);
  return ip.slice(0, 45); // max length sanitize
}

module.exports = { logRequest, getStats };
