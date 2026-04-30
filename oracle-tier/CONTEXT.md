# ORACLE FREE TIER — Darbo ir derybų istorija
> Perskaityk šį failą norint tęsti darbą. Čia visa konteksto istorija.

---

## Tikslas

Gauti **Oracle Cloud Always Free** ARM instanciją:
- Shape: **VM.Standard.A1.Flex**
- Region: **eu-amsterdam-1** (Netherlands Northwest)
- Konfigūracija: **4 OCPU + 24 GB RAM** (maksimalus Free Tier limitas)
- OS: Ubuntu 22.04 ARM
- Paskirtis: paleisti vaistai.info Node.js aplikaciją

---

## Paskyros informacija

| Parametras | Reikšmė |
|---|---|
| Oracle Cloud paskyra | vilius76 (root) |
| Region | eu-amsterdam-1 (Netherlands Northwest) |
| Compartment | vilius76 (root) |
| Tenancy | reikia patikrinti OCI Console → Profile → Tenancy |
| Console URL | https://cloud.oracle.com/compute/instances/create?region=eu-amsterdam-1 |

---

## Bandymų istorija

### 2026-04-17 — Pirmasis bandymas (naršyklė)

**Klaida:**
```
API Error: Out of capacity for shape VM.Standard.A1.Flex in availability domain AD-1.
Create the instance in a different availability domain or try again later.
```

**Konfigūracija bandymo metu:**
- Instance name: `instance-20260417-2234`
- Availability domain: AD-1
- Capacity type: on-demand
- Fault domain: Let Oracle choose

**Rezultatas:** NEPAVYKO — AD-1 neturi laisvų ARM resursų.

---

## Žinomos problemos

1. **Out of capacity** — Oracle ARM instancijų resursai yra riboti ir dažnai išnaudoti.
   - AD-1 bandyta — nepavyko
   - Reikia bandyti: AD-1, AD-2, AD-3 rotacijoje
   - Sprendimas: automatinis retry skriptas (žr. `oci-create-instance.sh`)

2. **Free Tier riba** — VM.Standard.A1.Flex maksimumas yra 4 OCPU + 24 GB visoje paskyroje.

3. **On-demand vs Preemptible** — on-demand neveikia kai nėra talpos; preemptible gali padėti bet bus nutraukta.

---

## Strategija (eilės tvarka)

### 1 etapas — Greiti bandymai (DABAR)
- [ ] Bandyti AD-1, AD-2, AD-3 rankiniu būdu OCI Console
- [ ] Kiekvieną AD bandyti su ir be Fault Domain specifikacijos

### 2 etapas — Automatizuotas retry (jei 1 etapas nepavyko)
- [ ] Įdiegti OCI CLI (žr. žemiau)
- [ ] Sukonfigūruoti `oci setup config`
- [ ] Užpildyti OCID reikšmes `oci-create-instance.sh`
- [ ] Paleisti skriptą — jis bandys kas 5 min automatiškai

### 3 etapas — Alternatyvos (jei ilgai negauna)
- [ ] Pabandyti kitą regioną (Ashburn us-ashburn-1 — dažniausiai turi talpos)
- [ ] Pabandyti sukurti 1 OCPU + 6 GB instanciją (mažiau resursų = daugiau šansų)
- [ ] Laukti vakaro/nakties (resursai atlaisvėja ES darbo ne valandomis)

---

## OCI CLI diegimas ir konfigūracija

### Diegimas (Linux/macOS/WSL)
```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/oracle/oci-cli/master/scripts/install/install.sh)"
```

### Konfigūracija
```bash
oci setup config
```
Reikės:
- **User OCID** → OCI Console → Profile (viršuje dešinėje) → User settings → OCID
- **Tenancy OCID** → OCI Console → Profile → Tenancy → OCID
- **Region** → `eu-amsterdam-1`
- **RSA key** — skriptas generuos automatiškai arba nurodyti esamą

### Patikrinimas
```bash
oci iam region list --output table
```

---

## Reikalingi OCID (užpildyti kai turima)

```
COMPARTMENT_ID = ocid1.tenancy.oc1..???
                 (= Tenancy OCID, nes naudojam root compartment)

SUBNET_ID      = ocid1.subnet.oc1.eu-amsterdam-1..???
                 Kaip gauti:
                 OCI Console → Networking → Virtual Cloud Networks
                 → tavo VCN → Subnets → kopijuok OCID

IMAGE_ID       = ocid1.image.oc1.eu-amsterdam-1..???
                 Kaip gauti:
                 bash oci-create-instance.sh --get-ids
                 arba OCI Console → Compute → Images → Platform Images
                 → Ubuntu 22.04 (aarch64) → OCID

AVAILABILITY_DOMAIN = lVCZ:EU-AMSTERDAM-1-AD-1
                      (patikrink: oci iam availability-domain list)
```

---

## Kaip paleisti retry skriptą

```bash
# 1. Eik į oracle-tier aplanką
cd /path/to/vaistai_info/oracle-tier

# 2. Gauk reikalingus ID (po to, kai užpildei COMPARTMENT_ID skripte)
bash oci-create-instance.sh --get-ids

# 3. Užpildyk oci-create-instance.sh (COMPARTMENT_ID, SUBNET_ID, IMAGE_ID)
nano oci-create-instance.sh

# 4. Paleisk
bash oci-create-instance.sh
```

Skriptas bandys kas **5 min** ir sustabdys save kai instancija bus sukurta.  
Sustabdymui rankiniu būdu: `Ctrl+C`

---

## Kai instancija sukurta — kiti žingsniai

1. **Nukopijuok IP** iš `instance-result.json` arba OCI Console
2. **Prisijunk per SSH:**
   ```bash
   ssh ubuntu@<IP_ADRESAS>
   ```
3. **Paleisk setup skriptą:**
   ```bash
   curl -fsSL https://raw.githubusercontent.com/ViliusKsg/vaistai/main/setup.sh | bash
   ```
   arba nukopijuok `../setup.sh` į serverį ir paleisk.

4. **Sukonfigūruok `.env`** su API raktais (Groq, Gemini)

5. **Nustatyk domeną** vaistai.info → DNS A record → serverio IP

---

## Aplanko struktūra

```
oracle-tier/
  oci-create-instance.sh   ← pagrindinis retry skriptas
  CONTEXT.md               ← šis failas (istorija ir instrukcijos)
  instance-result.json     ← sukuriamas automatiškai kai instancija sukurta
```

---

## Susijęs projektas

- **vaistai.info** app kodas: `c:\GitHub\CloudeCode\vaistai_info\`
- **GitHub repo**: https://github.com/ViliusKsg/vaistai
- **Setup skriptas**: `../setup.sh` (Ubuntu 22.04 ARM konfigūracija)

---

*Paskutinis atnaujinimas: 2026-04-17*
