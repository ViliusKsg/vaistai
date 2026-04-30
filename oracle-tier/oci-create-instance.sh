#!/bin/bash
# =============================================================
# Oracle Cloud — automatinis instancijos kūrimas su OCI CLI
# Kartoja kas 5 min kol instancija sukurta arba sustabdyta
#
# Prieš naudojimą:
#   1. Įdiek OCI CLI:  bash -c "$(curl -fsSL https://raw.githubusercontent.com/oracle/oci-cli/master/scripts/install/install.sh)"
#   2. Sukonfigūruok:  oci setup config
#   3. Užpildyk kintamuosius žemiau
#   4. Paleisk:        bash oci-create-instance.sh
# =============================================================

# ─────────────────────────────────────────────
# KONFIGŪRACIJA — užpildyk prieš paleidžiant
# ─────────────────────────────────────────────
COMPARTMENT_ID="ocid1.tenancy.oc1..PAKEISK_MANE"   # Tenancy / compartment OCID
SUBNET_ID="ocid1.subnet.oc1.eu-amsterdam-1..PAKEISK_MANE"
IMAGE_ID="ocid1.image.oc1.eu-amsterdam-1..PAKEISK_MANE"  # Ubuntu 22.04 ARM
AVAILABILITY_DOMAIN="lVCZ:EU-AMSTERDAM-1-AD-1"            # arba AD-2, AD-3
SHAPE="VM.Standard.A1.Flex"
OCPUS=4
MEMORY_GB=24
SSH_PUBLIC_KEY_FILE="$HOME/.ssh/id_rsa.pub"   # kelias iki tavo SSH viešo rakto
INSTANCE_NAME="vaistai-arm-$(date +%Y%m%d-%H%M)"

RETRY_INTERVAL=300   # sekundės tarp bandymų (300 = 5 min)
# ─────────────────────────────────────────────

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

check_deps() {
  if ! command -v oci &>/dev/null; then
    echo "KLAIDA: OCI CLI nerastas."
    echo "Įdiek: bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/oracle/oci-cli/master/scripts/install/install.sh)\""
    exit 1
  fi
  if [ ! -f "$SSH_PUBLIC_KEY_FILE" ]; then
    echo "KLAIDA: SSH raktas nerastas: $SSH_PUBLIC_KEY_FILE"
    echo "Sukurk: ssh-keygen -t rsa -b 4096"
    exit 1
  fi
  if [[ "$COMPARTMENT_ID" == *"PAKEISK_MANE"* ]]; then
    echo "KLAIDA: Užpildyk COMPARTMENT_ID, SUBNET_ID, IMAGE_ID kintamuosius šiame skripte."
    exit 1
  fi
}

try_create() {
  local attempt=$1
  log "Bandymas #${attempt} — kuriama instancija '${INSTANCE_NAME}'..."

  RESULT=$(oci compute instance launch \
    --compartment-id        "$COMPARTMENT_ID" \
    --availability-domain   "$AVAILABILITY_DOMAIN" \
    --subnet-id             "$SUBNET_ID" \
    --image-id              "$IMAGE_ID" \
    --shape                 "$SHAPE" \
    --shape-config          "{\"ocpus\": ${OCPUS}, \"memoryInGBs\": ${MEMORY_GB}}" \
    --display-name          "$INSTANCE_NAME" \
    --ssh-authorized-keys-file "$SSH_PUBLIC_KEY_FILE" \
    --assign-public-ip      true \
    --wait-for-state        RUNNING \
    --max-wait-seconds      120 \
    2>&1)

  if echo "$RESULT" | grep -q '"lifecycle-state": "RUNNING"\|"lifecycleState": "RUNNING"'; then
    log "SĖKMĖ! Instancija sukurta ir veikia."
    INSTANCE_IP=$(echo "$RESULT" | grep -oP '"publicIp":\s*"\K[^"]+' | head -1)
    [ -n "$INSTANCE_IP" ] && log "Viešas IP: $INSTANCE_IP"
    echo "$RESULT" > instance-result.json
    log "Pilnas atsakymas išsaugotas: instance-result.json"
    exit 0
  elif echo "$RESULT" | grep -qi "Out of host capacity\|InternalError\|out of capacity\|LimitExceeded"; then
    log "Nepakanka resursų arba limitas. Kitas bandymas po ${RETRY_INTERVAL}s..."
    return 1
  else
    log "Nežinoma klaida:"
    echo "$RESULT" | tail -20
    log "Kitas bandymas po ${RETRY_INTERVAL}s..."
    return 1
  fi
}

# ─────────────────────────────────────────────
# Pagalbinė komanda: gauk reikalingus OCID
# ─────────────────────────────────────────────
if [ "$1" = "--get-ids" ]; then
  echo "=== Availability Domains ==="
  oci iam availability-domain list --query 'data[*].name' --output table 2>/dev/null || \
    oci iam availability-domain list 2>&1 | grep '"name"'

  echo ""
  echo "=== Subnets (eu-amsterdam-1) ==="
  oci network subnet list --compartment-id "$(oci iam compartment list --query 'data[0].id' --raw-output 2>/dev/null)" \
    --query 'data[*].{id:id,name:"display-name",cidr:"cidr-block"}' --output table 2>/dev/null || \
    echo "Nurodyk COMPARTMENT_ID rankiniu būdu."

  echo ""
  echo "=== Ubuntu 22.04 ARM images ==="
  oci compute image list \
    --compartment-id "$COMPARTMENT_ID" \
    --operating-system "Canonical Ubuntu" \
    --operating-system-version "22.04" \
    --shape "$SHAPE" \
    --query 'data[*].{id:id,name:"display-name"}' \
    --output table 2>/dev/null || echo "Nurodyk COMPARTMENT_ID pirmiau."
  exit 0
fi

# ─────────────────────────────────────────────
# Pagrindinis ciklas
# ─────────────────────────────────────────────
check_deps

log "OCI CLI instancijos kūrimas pradėtas."
log "  Shape:  $SHAPE  (${OCPUS} OCPU / ${MEMORY_GB} GB)"
log "  AD:     $AVAILABILITY_DOMAIN"
log "  Retry:  kas ${RETRY_INTERVAL}s"
log "Stabdymui: Ctrl+C"
echo ""

ATTEMPT=0
while true; do
  ATTEMPT=$((ATTEMPT + 1))
  try_create "$ATTEMPT" && break
  log "Laukiama ${RETRY_INTERVAL}s..."
  sleep "$RETRY_INTERVAL"
done
