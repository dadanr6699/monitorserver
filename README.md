# 🛰️ VITAL VPS MONITOR BOT

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/Node.js-v14%2B-blue.svg)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/Platform-Ubuntu%20%7C%20Debian-orange.svg)](#)

Bot Telegram untuk memantau performa VPS (CPU, RAM, DISK, Network) secara **Real-time** (update 3 detik) dengan desain dashboard minimalis & elegan.

---

### 📺 Preview Dashboard
```text
╔══════════════════════════╗
     🛰️  VPS VITAL MONITOR
╚══════════════════════════╝

📍 SYSTEM INFO
   OS      : Ubuntu 24.04.4 LTS
   IP      : 152.42.251.217
   Uptime  : 2 days, 29 minutes
   Load    : 0.80, 0.69, 0.61
   Proses  : 165 aktif
────────────────────────────
📊 RESOURCE USAGE
🟢 CPU   [■□□□□□□□□□] 4%
🟢 RAM   [■■■■■■□□□□] 64% (5098/7941 MB)
🟢 DISK  [■■■■□□□□□□] 44% (101G/232G)
────────────────────────────
📶 NETWORK (eth0)
   📥 Download  : 2.3 KB/s
   📤 Upload    : 1.9 KB/s
   📦 Total RX  : 373.84 GB
   📦 Total TX  : 70.05 GB
────────────────────────────
🔥 TOP PROCESS
 • agy           ➜  23.7%
 • python3       ➜   3.8%
 • systemd       ➜   1.2%
```

---

### 🚀 Fitur Utama
* **⚡ Real-Time Monitoring** — Data resource diperbarui otomatis setiap 3 detik.
* **🖥️ Multi-Server** — Pantau banyak VPS sekaligus dalam satu bot.
* **🛡️ Secure Connection** — Koneksi SSH menggunakan argumen aman (`sshpass -e`), aman dari kebocoran password di process list (`ps`).
* **🔑 Admin & Public Mode** — Menu manajemen (Tambah/Hapus) khusus Admin. Pengguna publik hanya dapat memantau.

---

### 🛠️ Persyaratan
* **VPS Target:** OS Ubuntu / Debian.
* **VPS Bot Host:** NodeJS (v14+), PM2, dan `sshpass`.

---

### 📥 Cara Instalasi

#### ⚡ Jalankan Installer Otomatis (Rekomendasi)
Cukup jalankan satu perintah ini di VPS Bot Host, ikuti instruksi input `BOT_TOKEN` dan `ADMIN_ID`:
```bash
git clone https://github.com/dadanr6699/monitorserver.git && cd monitorserver && bash install.sh
```

---

#### 🔧 Instalasi Manual

**1. Install Dependensi Sistem & PM2**
```bash
sudo apt-get update
sudo apt-get install -y sshpass zip unzip bc nodejs npm
sudo npm install -g pm2
```

**2. Setup Konfigurasi & Bot**
```bash
git clone https://github.com/dadanr6699/monitorserver.git && cd monitorserver
npm install
cp .env.example .env
nano .env # Isi BOT_TOKEN & ADMIN_ID
```

**3. Jalankan Bot**
```bash
pm2 start bot.js --name "vital-monitor"
pm2 save
pm2 startup
```

---

### 🎮 Cara Penggunaan
1. Buka bot di Telegram, kirim `/start`.
2. Klik **➕ Tambah VPS** (Khusus Admin) untuk mendaftarkan server baru.
3. Klik nama server pada daftar untuk mulai memantau live.
4. Klik **⏹️ Stop Monitor** atau **Back** untuk kembali ke menu utama.

---

### 📁 Struktur Folder
* `bot.js` — Logika utama bot Telegram (Node.js).
* `monitor.sh` — Script resource collector (dijalankan remote di target VPS).
* `install.sh` — Script instalasi otomatis.
* `global_servers.json` — Database local server terdaftar.

---

### 🛡️ Lisensi
Dilisensikan di bawah [MIT License](LICENSE).
