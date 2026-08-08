#!/bin/bash
set -e

# ⛩️ VITAL VPS MONITOR BOT - Installer
# Flow: input BOT_TOKEN & ADMIN_ID, sisanya otomatis.

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info() { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1" >&2; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

[ "$(id -u)" -eq 0 ] || SUDO="sudo"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   🛰️  VITAL VPS MONITOR - INSTALLER"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. Dependensi sistem
if ! command -v node >/dev/null 2>&1; then
    warn "NodeJS belum ada, menginstall NodeJS 20.x..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO -E bash -
    $SUDO apt-get install -y nodejs
fi
info "NodeJS $(node -v)"

for pkg in sshpass zip unzip bc; do
    command -v "$pkg" >/dev/null 2>&1 || MISSING="$MISSING $pkg"
done
if [ -n "$MISSING" ]; then
    warn "Menginstall paket:$MISSING"
    $SUDO apt-get update -qq
    $SUDO apt-get install -y $MISSING
fi
info "Dependensi sistem siap"

command -v pm2 >/dev/null 2>&1 || { warn "Menginstall PM2..."; $SUDO npm install -g pm2; }
info "PM2 siap"

# 2. Input konfigurasi (trust boundary: validasi format)
echo ""
read -rp "🔑 Masukkan BOT_TOKEN (dari @BotFather): " BOT_TOKEN
read -rp "👤 Masukkan ADMIN_ID (dari @userinfobot): " ADMIN_ID

if ! [[ "$BOT_TOKEN" =~ ^[0-9]+:[A-Za-z0-9_-]+$ ]]; then
    err "Format BOT_TOKEN tidak valid (contoh: 123456789:AAF...)."
    exit 1
fi
if ! [[ "$ADMIN_ID" =~ ^[0-9]+$ ]]; then
    err "ADMIN_ID harus berupa angka."
    exit 1
fi

# 3. Tulis .env
cat > "$SCRIPT_DIR/.env" <<EOF
BOT_TOKEN=$BOT_TOKEN
ADMIN_ID=$ADMIN_ID
EOF
chmod 600 "$SCRIPT_DIR/.env"
info ".env dibuat"

# 4. Dependensi bot
info "Menginstall dependensi bot..."
npm install --no-audit --no-fund

# 5. Jalankan via PM2
pm2 delete vital-monitor >/dev/null 2>&1 || true
pm2 start bot.js --name vital-monitor
pm2 save
$SUDO env PATH=$PATH pm2 startup systemd -u "$(whoami)" --hp "$HOME" >/dev/null 2>&1 || \
    warn "Lewati pm2 startup (jalankan manual jika perlu auto-start saat boot)."

echo ""
info "Instalasi selesai. Bot berjalan sebagai 'vital-monitor'."
echo "   Cek status : pm2 status"
echo "   Lihat log  : pm2 logs vital-monitor"
echo "   Buka bot Telegram Anda, kirim /start"
