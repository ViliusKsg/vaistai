# TODO — vaistai_info

- [x] ETAPAS: Projekto struktūra, katalogai | [ARCHITECT] | DONE
- [x] ETAPAS: index.html UI | [PERFORMER] | DONE
- [x] ETAPAS: style.css dark/light | [PERFORMER] | DONE
- [x] ETAPAS: app.js fetch logika | [LOGIC] | DONE
- [x] ETAPAS: proxy.php scraper su cache | [SECURITY] | DONE
- [x] ETAPAS: ai.php Groq API | [LOGIC] | DONE
- [ ] ETAPAS: Testavimas su realiais vaistais | [SUPERVISOR] | PENDING
- [ ] ETAPAS: GROQ_API_KEY konfigūracija | [VARTOTOJAS] | PENDING
- [ ] ETAPAS: Papildomi AI modeliai (OpenRouter/Gemini) | [ARCHITECT] | PENDING

## Oracle Free Tier — instancijos gavimas

- [ ] OCI CLI įdiegimas (WSL arba Linux): `bash -c "$(curl -fsSL https://raw.githubusercontent.com/oracle/oci-cli/master/scripts/install/install.sh)"` | [VARTOTOJAS] | PENDING
- [ ] OCI CLI konfigūracija: `oci setup config` (reikia User OCID, Tenancy OCID) | [VARTOTOJAS] | PENDING
- [ ] Užpildyti COMPARTMENT_ID, SUBNET_ID, IMAGE_ID `oracle-tier/oci-create-instance.sh` | [VARTOTOJAS] | PENDING
- [ ] Paleisti retry skriptą: `bash oracle-tier/oci-create-instance.sh` | [VARTOTOJAS] | PENDING
- [ ] Patikrinti `instance-result.json` — nukopijuoti viešą IP | [VARTOTOJAS] | PENDING
- [ ] Prisijungti per SSH: `ssh ubuntu@<IP>` | [VARTOTOJAS] | PENDING
- [ ] Paleisti setup.sh serveryje | [SUPERVISOR] | PENDING
- [ ] Sukonfigūruoti .env serveryje (GROQ_API_KEY, GEMINI_API_KEY) | [VARTOTOJAS] | PENDING
- [ ] Ištestuoti http://<IP>:3000 — paieška su realiais vaistais | [SUPERVISOR] | PENDING
- [ ] DNS: vaistai.info → serverio IP (A record) | [VARTOTOJAS] | PENDING
- [ ] Nginx + SSL (Let's Encrypt) konfigūracija | [ARCHITECT] | PENDING
