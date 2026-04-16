/* ===== KINTAMIEJI ===== */
'use strict';

// ===== TEMA =====
const themeToggle = document.getElementById('themeToggle');
const savedTheme = localStorage.getItem('theme') || 'light';
document.documentElement.setAttribute('data-theme', savedTheme);
themeToggle.textContent = savedTheme === 'dark' ? '☀️' : '🌙';

themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  themeToggle.textContent = next === 'dark' ? '☀️' : '🌙';
});

// ===== PRESET TOGGLE =====
const presetToggles = document.querySelectorAll('.preset-toggle');
presetToggles.forEach(label => {
  const cb = label.querySelector('input[type=checkbox]');
  cb.addEventListener('change', () => {
    label.classList.toggle('active', cb.checked);
  });
});

document.getElementById('selectAll').addEventListener('click', () => {
  presetToggles.forEach(l => { l.querySelector('input').checked = true; l.classList.add('active'); });
});
document.getElementById('selectNone').addEventListener('click', () => {
  presetToggles.forEach(l => { l.querySelector('input').checked = false; l.classList.remove('active'); });
});

// ===== CLEAR =====
document.getElementById('clearBtn').addEventListener('click', () => {
  ['drug1','drug2','drug3','extraQuestion'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('results').classList.add('hidden');
  document.getElementById('drugCards').innerHTML = '';
  document.getElementById('compatibilityCard').classList.add('hidden');
});

// ===== PAGRINDINIS PAIEŠKOS LOGIKA =====
document.getElementById('searchBtn').addEventListener('click', runSearch);
['drug1','drug2','drug3'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', e => { if (e.key === 'Enter') runSearch(); });
});

async function runSearch() {
  const drugs = [
    document.getElementById('drug1').value.trim(),
    document.getElementById('drug2').value.trim(),
    document.getElementById('drug3').value.trim(),
  ].filter(Boolean);

  if (drugs.length === 0) {
    showError('Įveskite bent vieno vaisto pavadinimą.');
    return;
  }

  const presets = Array.from(document.querySelectorAll('input[name=preset]:checked')).map(c => c.value);
  const extraQuestion = document.getElementById('extraQuestion').value.trim();

  const resultsEl = document.getElementById('results');
  const loadingEl = document.getElementById('loadingState');
  const errorEl = document.getElementById('errorState');
  const cardsEl = document.getElementById('drugCards');
  const compatCard = document.getElementById('compatibilityCard');

  resultsEl.classList.remove('hidden');
  loadingEl.classList.remove('hidden');
  errorEl.classList.add('hidden');
  cardsEl.innerHTML = '';
  compatCard.classList.add('hidden');
  document.getElementById('searchBtn').disabled = true;

  try {
    // 1. Gauti žalius duomenis scraper
    updateLoading('Ieškoma vaistų duomenų...');
    const rawData = await fetchDrugsData(drugs);

    // 2. AI apdorojimas
    updateLoading('AI analizuoja informaciją...');
    const aiResult = await fetchAiSummary(drugs, rawData, presets, extraQuestion);

    loadingEl.classList.add('hidden');
    renderResults(aiResult, drugs);

  } catch (err) {
    loadingEl.classList.add('hidden');
    showError(err.message || 'Nepavyko gauti informacijos. Bandykite dar kartą.');
  } finally {
    document.getElementById('searchBtn').disabled = false;
  }
}

function updateLoading(text) {
  document.getElementById('loadingText').textContent = text;
}

function showError(msg) {
  const resultsEl = document.getElementById('results');
  const errorEl = document.getElementById('errorState');
  resultsEl.classList.remove('hidden');
  errorEl.classList.remove('hidden');
  document.getElementById('errorText').textContent = msg;
}

// ===== FETCH: SCRAPER =====
async function fetchDrugsData(drugs) {
  const results = {};
  for (const drug of drugs) {
    try {
      const res = await fetch(`/api/scrape?q=${encodeURIComponent(drug)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      results[drug] = data;
    } catch (e) {
      results[drug] = { error: e.message, raw: '' };
    }
  }
  return results;
}

// ===== FETCH: AI =====
async function fetchAiSummary(drugs, rawData, presets, extraQuestion) {
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ drugs, rawData, presets, extraQuestion }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `AI klaida: HTTP ${res.status}`);
  }
  return res.json();
}

// ===== RENDER REZULTATAI =====
function renderResults(aiResult, drugs) {
  const cardsEl = document.getElementById('drugCards');
  const compatCard = document.getElementById('compatibilityCard');

  // Atskiros vaistų kortelės
  if (aiResult.drugs) {
    for (const [drugName, info] of Object.entries(aiResult.drugs)) {
      const card = buildDrugCard(drugName, info);
      cardsEl.appendChild(card);
    }
  }

  // Suderinamumas (tik jei >1 vaistas ir yra duomenų)
  if (drugs.length > 1 && aiResult.compatibility) {
    document.getElementById('compatibilityContent').innerHTML = formatCompatibility(aiResult.compatibility);
    compatCard.classList.remove('hidden');
  }
}

function buildDrugCard(name, info) {
  const card = document.createElement('div');
  card.className = 'drug-card';

  const sourceLabel = info.source === 'vaistai.lt' ? 'vaistai.lt' : info.source === 'openfda' ? 'OpenFDA' : 'AI žinios';

  card.innerHTML = `
    <div class="drug-card-header">
      <h2>💊 ${escHtml(name)}</h2>
      <span class="source-badge">${escHtml(sourceLabel)}</span>
    </div>
    <div class="drug-card-body">
      ${renderSections(info.sections || {})}
      ${info.extra ? `<div class="info-section"><h3>❓ Papildoma informacija</h3><p>${escHtml(info.extra)}</p></div>` : ''}
    </div>
  `;
  return card;
}

const SECTION_META = {
  vartojimas:      { icon: '💊', label: 'Vartojimas ir dozės' },
  salutiniai:      { icon: '⚠️', label: 'Svarbiausi šalutiniai poveikiai' },
  kontraindikacijos:{ icon: '🚫', label: 'Kontraindikacijos' },
  vaikai:          { icon: '👶', label: 'Dozės vaikams' },
  laikymas:        { icon: '🌡️', label: 'Laikymo sąlygos' },
  terminas:        { icon: '📅', label: 'Tinkamumo terminas' },
  suderinamas:     { icon: '🔗', label: 'Suderinamumas su vaistais' },
  nescumas:        { icon: '🤰', label: 'Nėštumas ir maitinimas krūtimi' },
  alkoholis:       { icon: '🍷', label: 'Alkoholis' },
  vairavimas:      { icon: '🚗', label: 'Vairavimas' },
};

function renderSections(sections) {
  let html = '';
  for (const [key, value] of Object.entries(sections)) {
    if (!value) continue;
    const meta = SECTION_META[key] || { icon: 'ℹ️', label: key };
    html += `<div class="info-section">
      <h3>${meta.icon} ${meta.label}</h3>
      <p>${formatValue(value)}</p>
    </div>`;
  }
  return html || '<p style="color:var(--text-muted);font-size:0.9rem;">Informacija nerasta.</p>';
}

function formatCompatibility(data) {
  if (!data) return '<p>Informacija nerasta.</p>';
  if (typeof data === 'string') return `<p>${escHtml(data)}</p>`;

  let html = '';
  if (data.status) {
    const cls = data.status === 'ok' ? 'ok' : data.status === 'danger' ? 'danger' : 'warn';
    const icon = cls === 'ok' ? '✅' : cls === 'danger' ? '🚨' : '⚠️';
    html += `<div class="alert-box ${cls}">${icon} ${escHtml(data.verdict || '')}</div>`;
  }
  if (data.details) html += `<p style="margin-top:12px;font-size:0.9rem;line-height:1.7">${escHtml(data.details)}</p>`;
  if (data.recommendation) html += `<p style="margin-top:10px;font-weight:600;font-size:0.9rem">💡 ${escHtml(data.recommendation)}</p>`;
  return html || `<p>${escHtml(String(data))}</p>`;
}

function formatValue(val) {
  if (!val) return '';
  if (typeof val === 'string') return escHtml(val).replace(/\n/g, '<br>');
  if (Array.isArray(val)) return '<ul>' + val.map(v => `<li>${escHtml(String(v))}</li>`).join('') + '</ul>';
  return escHtml(String(val));
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
