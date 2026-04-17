#!/bin/bash
# =============================================================
# Nginx + SSL setup vaistai.iddqd.eu
# Paleidimas: bash nginx-setup.sh
# PRIEŠ paleidžiant: DNS A record turi rodyti į šį serverio IP!
# =============================================================

set -e

DOMAIN="vaistai.iddqd.eu"
EMAIL="vilius@ksg.lt"
APP_DIR="/home/ubuntu/vaistai"

echo ""
echo "====================================================="
echo "  Nginx + SSL Setup — $DOMAIN"
echo "====================================================="
echo ""

# -------------------------------------------------------------
# 1. Nginx instaliavimas
# -------------------------------------------------------------
echo "[1/4] Instaliuojamas Nginx..."
sudo apt-get update -qq
sudo apt-get install -y nginx

# -------------------------------------------------------------
# 2. Certbot instaliavimas
# -------------------------------------------------------------
echo "[2/4] Instaliuojamas Certbot..."
sudo apt-get install -y certbot python3-certbot-nginx

# -------------------------------------------------------------
# 3. Nginx konfigūracija
# -------------------------------------------------------------
echo "[3/4] Konfigūruojamas Nginx..."

# Sukurti certbot webroot direktoriją
sudo mkdir -p /var/www/certbot

# Nukopijuoti nginx config
sudo cp "$APP_DIR/nginx.conf" /etc/nginx/sites-available/vaistai
sudo ln -sf /etc/nginx/sites-available/vaistai /etc/nginx/sites-enabled/vaistai

# Pašalinti default config
sudo rm -f /etc/nginx/sites-enabled/default

# Patikrinti konfigūraciją
sudo nginx -t

# Perkrauti Nginx
sudo systemctl reload nginx

# Atidaryti portus firewall'e
sudo ufw allow 'Nginx Full'
sudo ufw allow OpenSSH
sudo ufw --force enable

# -------------------------------------------------------------
# 4. SSL sertifikato gavimas
# -------------------------------------------------------------
echo "[4/4] Gaunamas SSL sertifikatas..."
echo ""
echo "DNS A record tikrinimas: $DOMAIN -> $(curl -s ifconfig.me)"
echo "Jei IP nesutampa — pirma nustatyk DNS ir paleisk skriptą iš naujo."
echo ""

sudo certbot --nginx \
    -d "$DOMAIN" \
    --non-interactive \
    --agree-tos \
    --email "$EMAIL" \
    --redirect

# Certbot auto-renewal
echo "Konfigūruojamas automatinis SSL atnaujinimas..."
(crontab -l 2>/dev/null; echo "0 12 * * * /usr/bin/certbot renew --quiet") | crontab -

echo ""
echo "====================================================="
echo "  ✅ Nginx + SSL sukonfigūruotas!"
echo "====================================================="
echo ""
echo "  Aplikacija pasiekiama: https://$DOMAIN"
echo ""
echo "  Naudingos komandos:"
echo "    sudo nginx -t              — patikrinti konfigūraciją"
echo "    sudo systemctl reload nginx — perkrauti nginx"
echo "    sudo certbot renew         — atnaujinti SSL rankiniu būdu"
echo ""
