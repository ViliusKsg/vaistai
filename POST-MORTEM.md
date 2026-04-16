# POST-MORTEM — vaistai_info projektas
**Data:** 2026-04-10  
**[SUPERVISOR - Claude Sonnet]**

---

## Ciklo apžvalga

**Tikslas:** Sukurti naršyklėje veikiantį vaistų informacijos paieškos puslapį su AI sumarizavimu lietuvių kalba.

**Rezultatas:** ✅ Veikiantis MVP — serveris, UI, scraper, AI router, admin panelis.

---

## Pažeistos taisyklės

| Taisyklė | Pažeista? | Kas | Kaip ištaisyta |
|---|---|---|---|
| Jokių hardcoded secrets | ⚠️ Vienas kartas | Vartotojas bendrino raktus chate | Įrašyta į `.env`, `.gitignore` apsaugo |
| Santykiniai keliai | ✅ Ne | — | — |
| Zero-dependency | ✅ Laikytasi | — | Playwright/Express — būtini |
| Failų auditas prieš build | ✅ Ne | — | — |

## Kitos pastabos

- PHP → Node.js architektūros keitimas viduryje sprendimas buvo teisingas (vaistai.lt JS rendering)
- OpenFDA neturi nimesulide (EU-specifinis vaistas) — sprendimas: fallback chain veikia
- medicines.org.uk EMC — nimesulide neregistruotas JK, naudingam tik EN vaistams
- Playwright-extra stealth plugin yra optional — graceful fallback į vanilla playwright

## Išmokta pamoka

> Kai AI raktai bendrinama chate — rekomenduoti iš karto regeneruoti. Pridėti priminimą į RESUME.md.

---

## POST-MORTEM: Agentų darbas

| Agentas | Atlikta | Pastabos |
|---|---|---|
| [SUPERVISOR] | Planavimas, koordinacija, todo.md | ✅ |
| [ARCHITECT] | Tech stack (Node/Express/Playwright), failų struktūra, šaltinių tyrimas | ✅ |
| [SECURITY] | `.gitignore`, input sanitizavimas, admin auth, security headers | ✅ |
| [LOGIC] | AI router, exponential backoff, eilių sistema, deduplication, cache | ✅ |
| [PERFORMER] | UI (HTML/CSS), dark/light mode, admin panelis | ✅ |
