/**
 * Oracle Cloud VM Auto-Create skriptas
 * 
 * Naudojimas:
 * 1. Atidaryk: https://cloud.oracle.com/compute/instances/create?region=eu-amsterdam-1
 * 2. Sukonfigūruok instanciją (VM.Standard.A1.Flex, 4 OCPU, 24GB RAM, etc.)
 * 3. Paspausk F12 → Console
 * 4. Įkopijuok visą šį kodą ir paspausk Enter
 * 5. Norėdamas sustabdyti, surink: stopAutoCreate()
 */
(function () {
  'use strict';

  const RETRY_INTERVAL_MS = 5 * 60 * 1000; // 5 minutės tarp bandymų
  const RESPONSE_WAIT_MS  = 45 * 1000;      // 45 sek laukiama atsakymo

  let attempts = 0;
  let intervalId = null;

  function log(msg) {
    console.log(`%c[OracleBot ${new Date().toLocaleTimeString()}] ${msg}`,
      'color: #00aaff; font-weight: bold');
  }

  function findCreateButton() {
    for (const btn of document.querySelectorAll('button')) {
      const text = btn.textContent.trim();
      if ((text === 'Create' || text === 'Sukurti') && !btn.disabled) {
        return btn;
      }
    }
    return null;
  }

  function hasCapacityError() {
    const body = document.body.innerText || '';
    return body.includes('Out of capacity') || body.includes('API Error');
  }

  function dismissError() {
    // Bandome uždaryti klaidos pranešimą (× mygtukas)
    for (const btn of document.querySelectorAll('button')) {
      const label = (btn.getAttribute('aria-label') || '').toLowerCase();
      const text  = btn.textContent.trim();
      const inError = btn.closest(
        '[class*="message"], [class*="error"], [class*="notification"], [class*="alert"]'
      );
      if (inError && (text === '×' || text === '✕' || label.includes('close') || label.includes('dismiss'))) {
        btn.click();
        log('Klaidos pranešimas uždarytas.');
        return;
      }
    }
    log('Klaidos mygtuko nerasta – tęsiame.');
  }

  async function attempt() {
    attempts++;
    const btn = findCreateButton();

    if (!btn) {
      log(`#${attempts} – "Create" mygtukas nerastas. Ar tikrai puslapio apačioje matomas mygtukas?`);
      return;
    }

    log(`#${attempts} – Spaudžiamas "Create"...`);
    btn.click();

    // Laukiame atsakymo
    await new Promise(r => setTimeout(r, RESPONSE_WAIT_MS));

    if (hasCapacityError()) {
      log(`#${attempts} – Out of capacity. Kitas bandymas po ${RETRY_INTERVAL_MS / 60000} min.`);
      dismissError();
    } else {
      log(`#${attempts} – Klaidos nerasta! Instancija gali būti kuriama – patikrink puslapį!`);
      // Nesustabdome – gali būti, kad klaida dar neatsirado
    }
  }

  // Pirmasis bandymas iš karto
  attempt();

  // Kartojame kas RETRY_INTERVAL_MS
  intervalId = setInterval(attempt, RETRY_INTERVAL_MS);

  // Eksportuojame sustabdymo funkciją
  window.stopAutoCreate = function () {
    clearInterval(intervalId);
    log('Skriptas sustabdytas.');
  };

  log(`Skriptas paleistas. Bandys kas ${RETRY_INTERVAL_MS / 60000} min. Sustabdymui: stopAutoCreate()`);
})();
