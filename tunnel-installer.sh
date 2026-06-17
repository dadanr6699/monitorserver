#!/bin/bash
# Auto Installer Tunnel VPS (SSH, VMess, VLess, Trojan)
# Created for: dadanr6699

# Warna
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

clear
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}               AUTO INSTALLER TUNNEL VPS v1.0               ${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Check Root
if [ "${EUID}" -ne 0 ]; then
    echo -e "${RED}Error: Anda harus menjalankan script ini sebagai root!${NC}"
    exit 1
fi

# Input Domain
echo -e "${GREEN}[+] Persiapan Domain${NC}"
echo -e "Untuk menggunakan VMess/VLess/Trojan TLS, Anda membutuhkan domain."
echo -e "Pastikan domain Anda sudah diarahkan (pointing A Record) ke IP VPS ini."
read -p "Masukkan Domain Anda (contoh: tunnel.my.id): " domain

if [ -z "$domain" ]; then
    echo -e "${RED}Error: Domain tidak boleh kosong!${NC}"
    exit 1
fi

# 1. Update Sistem & Install Paket Pendukung
echo -e "\n${YELLOW}[1/5] Menginstall paket pendukung...${NC}"
apt-get update -y
apt-get install -y jq curl socat cron unzip zip ufw nginx dropbear fail2ban

# 2. Setup SSL (Let's Encrypt)
echo -e "\n${YELLOW}[2/5] Menyiapkan SSL Certificate...${NC}"
systemctl stop nginx
mkdir -p /etc/xray
curl https://get.acme.sh | sh
~/.acme.sh/acme.sh --register-account -m admin@$domain
~/.acme.sh/acme.sh --issue -d $domain --standalone --force
~/.acme.sh/acme.sh --install-cert -d $domain \
    --key-file /etc/xray/xray.key \
    --fullchain-file /etc/xray/xray.crt
chmod 644 /etc/xray/xray.key
chmod 644 /etc/xray/xray.crt

# 3. Install Xray-Core
echo -e "\n${YELLOW}[3/5] Menginstall Xray-Core...${NC}"
bash -c "$(curl -L https://github.com/XTLS/Xray-install/raw/main/install-release.sh)" @ install

# 4. Konfigurasi Xray-Core (/usr/local/etc/xray/config.json)
echo -e "\n${YELLOW}[4/5] Mengonfigurasi Xray...${NC}"
cat << EOF > /usr/local/etc/xray/config.json
{
  "log": {
    "access": "/var/log/xray/access.log",
    "error": "/var/log/xray/error.log",
    "loglevel": "info"
  },
  "inbounds": [
    {
      "port": 10000,
      "listen": "127.0.0.1",
      "protocol": "vmess",
      "settings": {
        "clients": []
      },
      "streamSettings": {
        "network": "ws",
        "wsSettings": {
          "path": "/vmess"
        }
      }
    },
    {
      "port": 10001,
      "listen": "127.0.0.1",
      "protocol": "vless",
      "settings": {
        "clients": [],
        "decryption": "none"
      },
      "streamSettings": {
        "network": "ws",
        "wsSettings": {
          "path": "/vless"
        }
      }
    },
    {
      "port": 10002,
      "listen": "127.0.0.1",
      "protocol": "trojan",
      "settings": {
        "clients": []
      },
      "streamSettings": {
        "network": "ws",
        "wsSettings": {
          "path": "/trojan"
        }
      }
    }
  ],
  "outbounds": [
    {
      "protocol": "freedom",
      "settings": {}
    }
  ]
}
EOF

# 5. Konfigurasi Nginx (Web Server + SSL Proxy Pass)
echo -e "\n${YELLOW}[5/5] Mengonfigurasi Nginx Reverse Proxy...${NC}"
cat << EOF > /etc/nginx/sites-available/default
server {
    listen 80;
    listen [::]:80;
    server_name $domain;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $domain;

    ssl_certificate /etc/xray/xray.crt;
    ssl_certificate_key /etc/xray/xray.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    location / {
        root /var/www/html;
        index index.html;
    }

    # VMess WS Proxy
    location /vmess {
        proxy_redirect off;
        proxy_pass http://127.0.0.1:10000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }

    # VLess WS Proxy
    location /vless {
        proxy_redirect off;
        proxy_pass http://127.0.0.1:10001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }

    # Trojan WS Proxy
    location /trojan {
        proxy_redirect off;
        proxy_pass http://127.0.0.1:10002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
}
EOF

# Restart Services
systemctl restart xray
systemctl enable xray
systemctl restart nginx
systemctl enable nginx

# Simpan Info Domain
echo "$domain" > /etc/xray/domain.txt

echo -e "\n${GREEN}====================================================${NC}"
echo -e "🎉 INSTALASI ENGINE TUNNEL SELESAI!"
echo -e "Domain Anda : $domain"
echo -e "SSL Key     : /etc/xray/xray.key"
echo -e "SSL Cert    : /etc/xray/xray.crt"
echo -e "Perintah Menu: ketik 'menu' untuk mengelola akun."
echo -e "${GREEN}====================================================${NC}"
