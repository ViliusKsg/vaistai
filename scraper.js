'use strict';

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CACHE_DIR = path.join(__dirname, 'cache');
const CACHE_TTL_MS = (parseInt(process.env.CACHE_TTL_HOURS) || 168) * 60 * 60 * 1000;

// ===== CACHE =====
function cacheKey(drugName) {
  return crypto.createHash('md5').update(drugName.toLowerCase().trim()).digest('hex');
}

function readCache(drugName) {
  const file = path.join(CACHE_DIR, cacheKey(drugName) + '.json');
  if (!fs.existsSync(file)) return null;
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (Date.now() - data.ts > CACHE_TTL_MS) return null;
  return data.result;
}

function writeCache(drugName, result) {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, cacheKey(drugName) + '.json');
  fs.writeFileSync(file, JSON.stringify({ ts: Date.now(), result }), 'utf8');
}

// ===== BROWSER (singleton) =====
let _browser = null;
let _initPromise = null;

async function getBrowser() {
  if (_browser && _browser.isConnected()) return _browser;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    // Playwright-extra + stealth jei įdiegtas, kitaip standartinis playwright
    let launchFn;
    try {
      const { chromium: chromiumExtra } = require('playwright-extra');
      const StealthPlugin = require('puppeteer-extra-plugin-stealth');
      chromiumExtra.use(StealthPlugin());
      launchFn = chromiumExtra;
    } catch {
      launchFn = chromium;
    }

    _browser = await launchFn.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
      ],
    });
    _initPromise = null;
    return _browser;
  })();

  return _initPromise;
}

// ===== PAGRINDINIS SCRAPER =====
async function scrapeDrug(drugName) {
  // Cache patikrinimas
  const cached = readCache(drugName);
  if (cached) {
    console.log(`[cache hit] ${drugName}`);
    return { ...cached, fromCache: true };
  }

  console.log(`[scraping] ${drugName}`);

  // 1. Bandyti OpenFDA (greitas, be naršyklės — populiariems vaistams)
  const fdaResult = await tryOpenFDA(drugName);
  if (fdaResult) {
    writeCache(drugName, fdaResult);
    return fdaResult;
  }

  // 2. Playwright → vaistai.lt
  const vaistaiResult = await scrapeVaistaiLt(drugName);
  if (vaistaiResult) {
    writeCache(drugName, vaistaiResult);
    return vaistaiResult;
  }

  // 3. Playwright → vapris.vvkt.lt fallback
  const vaprisResult = await scrapeVapris(drugName);
  if (vaprisResult) {
    writeCache(drugName, vaprisResult);
    return vaprisResult;
  }

  // Visiškai nepavyko — grąžiname tuščią (AI naudos tik savo žinias)
  const empty = { source: 'none', raw: '', drugName };
  writeCache(drugName, empty);
  return empty;
}

// ===== OPENFDA (be naršyklės) =====
async function tryOpenFDA(drugName) {
  try {
    const query = encodeURIComponent(`openfda.generic_name:"${drugName}" OR openfda.brand_name:"${drugName}"`);
    const url = `https://api.fda.gov/drug/label.json?search=${query}&limit=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.results?.length) return null;
    const r = json.results[0];
    return {
      source: 'openfda',
      drugName,
      raw: extractFdaFields(r),
    };
  } catch {
    return null;
  }
}

function extractFdaFields(r) {
  const pick = (arr) => arr?.[0] ?? '';
  return {
    indications:         pick(r.indications_and_usage),
    dosage:              pick(r.dosage_and_administration),
    warnings:            pick(r.warnings) || pick(r.warnings_and_cautions),
    contraindications:   pick(r.contraindications),
    adverseReactions:    pick(r.adverse_reactions),
    storage:             pick(r.storage_and_handling),
    pediatricUse:        pick(r.pediatric_use),
    pregnancyUse:        pick(r.pregnancy),
    description:         pick(r.description),
  };
}

// ===== VAISTAI.LT PLAYWRIGHT =====
async function scrapeVaistaiLt(drugName) {
  let page;
  try {
    const browser = await getBrowser();
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      locale: 'lt-LT',
      extraHTTPHeaders: { 'Accept-Language': 'lt-LT,lt;q=0.9' },
    });
    page = await context.newPage();

    // Paieška
    const searchUrl = `https://vaistai.lt/search.html?q=${encodeURIComponent(drugName)}`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });

    // Pirmasis rezultatas
    const firstLink = await page.$('a.product-title, .search-result a[href*=".html"], .product-list a');
    if (!firstLink) return null;
    await firstLink.click();
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });

    // Klikti "Informacinis lapelis" tab
    const tabClicked = await page.evaluate(() => {
      const tabs = [...document.querySelectorAll('a, button, .tab, [role=tab]')];
      const tab = tabs.find(el => el.textContent.trim().toLowerCase().includes('informacinis lapelis'));
      if (tab) { tab.click(); return true; }
      return false;
    });

    if (tabClicked) {
      await page.waitForTimeout(1500);
    }

    // Gauti meta informaciją iš produkto puslapio
    const meta = await page.evaluate(() => {
      const getText = (sel) => document.querySelector(sel)?.textContent?.trim() ?? '';
      return {
        title:      getText('h1'),
        form:       getText('.product-info .form, [data-label="Forma"]'),
        strength:   getText('[data-label="Stiprumas"], .strength'),
        atcCode:    getText('[data-label="ATC kodas"], .atc'),
        substance:  getText('[data-label="Veiklioji medžiaga"], .substance'),
        usage:      getText('.vartojimas, .usage-info, .product-usage'),
        description: getText('.product-description, .description-text'),
      };
    });

    // Informacinio lapelio tekstas
    const leafletText = await page.evaluate(() => {
      const container = document.querySelector(
        '#informacinis-lapelis, .product-leaflet, [id*="lapelis"], .tab-content.active, .leaflet-content'
      );
      return container ? container.innerText.trim() : '';
    });

    await context.close();

    if (!meta.title && !leafletText) return null;

    return {
      source: 'vaistai.lt',
      drugName,
      raw: {
        title:      meta.title || drugName,
        form:       meta.form,
        strength:   meta.strength,
        atcCode:    meta.atcCode,
        substance:  meta.substance,
        usage:      meta.usage,
        description: meta.description,
        leaflet: leafletText.slice(0, 8000), // Max 8k chars AI kontekstui
      },
    };
  } catch (err) {
    console.error(`[vaistai.lt error] ${drugName}:`, err.message);
    if (page) await page.context().close().catch(() => {});
    return null;
  }
}

// ===== VAPRIS FALLBACK =====
async function scrapeVapris(drugName) {
  let page;
  try {
    const browser = await getBrowser();
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    });
    page = await context.newPage();

    const url = `https://vapris.vvkt.lt/vvkt-web/public/medicinalProduct/viewList?searchPhrase=${encodeURIComponent(drugName)}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

    // Pirmasis rezultatas
    const firstRow = await page.$('table tbody tr:first-child a, .result-list a:first-child');
    if (!firstRow) { await context.close(); return null; }

    await firstRow.click();
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });

    const raw = await page.evaluate(() => {
      return document.body.innerText.slice(0, 6000);
    });

    await context.close();
    if (!raw) return null;

    return { source: 'vapris', drugName, raw };
  } catch (err) {
    console.error(`[vapris error] ${drugName}:`, err.message);
    if (page) await page.context().close().catch(() => {});
    return null;
  }
}

// ===== SHUTDOWN =====
async function closeBrowser() {
  if (_browser) {
    await _browser.close().catch(() => {});
    _browser = null;
  }
}

module.exports = { scrapeDrug, closeBrowser };
