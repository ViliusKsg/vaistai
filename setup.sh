#!/bin/bash
# =============================================================
# vaistai.info — Oracle Cloud Ubuntu 22.04 ARM setup skriptas
# Paleidimas: bash setup.sh
# =============================================================

set -e  # Sustabdyti jei bet kuri komanda nepavyksta

REPO_URL="https://github.com/ViliusKsg/vaistai.git"
APP_DIR="/home/ubuntu/vaistai"
NODE_VERSION="20"

echo ""
echo "====================================================="
echo "  vaistai.info — Oracle Cloud Setup"
echo "====================================================="
echo ""

# -------------------------------------------------------------
# 1. Sistemos atnaujinimas
# -------------------------------------------------------------
echo "[1/7] Atnaujinamas sistema..."
sudo apt-get update -qq
sudo apt-get upgrade -y -qq
sudo apt-get install -y -qq git curl wget unzip build-essential

# -------------------------------------------------------------
# 2. Node.js instaliavimas (per nvm)
# -------------------------------------------------------------
echo "[2/7] Instaliuojamas Node.js ${NODE_VERSION}..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi
echo "Node.js versija: $(node --version)"
echo "npm versija: $(npm --version)"

# -------------------------------------------------------------
# 3. PM2 instaliavimas (process manager)
# -------------------------------------------------------------
echo "[3/7] Instaliuojamas PM2..."
sudo npm install -g pm2 -q
pm2 --version

# -------------------------------------------------------------
# 4. Projekto klonvimas
# -------------------------------------------------------------
echo "[4/7] Klonuojamas projektas..."
if [ -d "$APP_DIR" ]; then
    echo "Projektas jau egzistuoja — atnaujinamas..."
    cd "$APP_DIR"
    git pull origin main
else
    git clone "$REPO_URL" "$APP_DIR"
    cd "$APP_DIR"
fi

# -------------------------------------------------------------
# 5. npm priklausomybių instaliavimas
# -------------------------------------------------------------
echo "[5/7] Instaliuojamos npm priklausomybės..."
cd "$APP_DIR"
npm install --omit=dev

# Playwright + Chromium (ARM64 palaikomas)
echo "Instaliuojamas Chromium (gali užtrukti ~2 min)..."
npx playwright install chromium
npx playwright install-deps chromium

# -------------------------------------------------------------
# 6. .env failo konfigūravimas
# -------------------------------------------------------------
echo "[6/7] Konfigūruojamas .env..."
if [ ! -f "$APP_DIR/.env" ]; then
    cp "$APP_DIR/.env.example" "$APP_DIR/.env"
    echo ""
    echo "⚠️  SVARBU: Redaguok .env failą ir įrašyk tikrus API raktus!"
    echo "   nano $APP_DIR/.env"
    echo ""
else
    echo ".env jau egzistuoja — neperrašomas."
fi

# -------------------------------------------------------------
# 7. Firewall konfigūravimas
# -------------------------------------------------------------
echo "[7/7] Konfigūruojamas firewall (ufw)..."
sudo ufw allow OpenSSH
sudo ufw allow 3000/tcp
sudo ufw --force enable
sudo ufw status

# -------------------------------------------------------------
# PM2 paleidimas
# -------------------------------------------------------------
echo ""
echo "====================================================="
echo "  Paleidžiama aplikacija su PM2..."
echo "====================================================="
cd "$APP_DIR"

# Sustabdyti jei jau veikia
pm2 stop vaistai 2>/dev/null || true
pm2 delete vaistai 2>/dev/null || true

# Paleisti
pm2 start ecosystem.config.js
pm2 save

# PM2 auto-start po rebooto
pm2 startup systemd -u ubuntu --hp /home/ubuntu | tail -1 | sudo bash || true

echo ""
echo "====================================================="
echo "  ✅ Setup baigtas!"
echo "====================================================="
echo ""
echo "  Aplikacija veikia ant: http://$(curl -s ifconfig.me):3000"
echo ""
echo "  Naudingos komandos:"
echo "    pm2 status          — proceso būsena"
echo "    pm2 logs vaistai    — logai real-time"
echo "    pm2 restart vaistai — perkrauti"
echo "    pm2 stop vaistai    — sustabdyti"
echo ""
echo "  Jei dar neredagavai .env:"
echo "    nano $APP_DIR/.env"
echo "    pm2 restart vaistai"
echo ""
