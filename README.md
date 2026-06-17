# ⛩️ VITAL VPS MONITOR BOT

Bot Telegram untuk memantau performa VPS (CPU, RAM, DISK) secara **Real-time** (update setiap 2 detik) dengan desain dashboard yang elegan. Bot ini mendukung akses Admin (untuk menambah/menghapus server) dan akses Publik (untuk memantau saja).

## 🚀 Fitur Utama
- **Real-Time Monitoring**: Data statistik server diperbarui secara otomatis setiap 2 detik.
- **Multi-Server**: Pantau banyak VPS sekaligus dari satu bot.
- **Admin Control**: Hanya pemilik bot (Admin) yang bisa mengelola daftar server.
- **Public Access**: Orang lain dapat melihat daftar server publik tanpa akses manajemen.
- **Secure**: Input data sensitif (SSH Password) otomatis dihapus dari chat segera setelah diterima.

## 🛠️ Persyaratan
- VPS dengan sistem operasi Ubuntu/Debian.
- NodeJS (Versi 14 ke atas).
- PM2 (Untuk menjalankan bot di background).
- `sshpass` (Untuk koneksi remote otomatis).

## 📥 Cara Penginstalan

### 1. Update & Install Dependensi Sistem
```bash
sudo apt-get update && sudo apt-get install -y sshpass zip unzip
```

### 2. Install NodeJS & PM2 (Jika belum ada)
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pm2
```

### 3. Clone Repository
```bash
git clone https://github.com/dadanr6699/vital69.git
cd vital69
```

### 4. Install Dependensi Bot
```bash
npm install
```

### 5. Konfigurasi Bot
Buka file `bot.js`, lalu cari baris berikut dan sesuaikan:
- `token`: Ganti dengan Token Bot Telegram Anda (dari @BotFather).
- `ADMIN_ID`: Ganti dengan Chat ID Telegram Anda (dari @userinfobot).

### 6. Jalankan Bot
```bash
pm2 start bot.js --name "vital-monitor"
pm2 save
pm2 startup
```

## 🎮 Cara Penggunaan
1. Buka bot Anda di Telegram.
2. Ketik `/start` atau `/vital`.
3. Klik **Tambah VPS Baru** (Khusus Admin) untuk mendaftarkan server.
4. Klik pada nama server untuk mulai memantau secara real-time.

## 📁 Struktur Folder
- `bot.js`: Logika utama bot Telegram.
- `monitor.sh`: Script shell yang dijalankan di VPS target untuk mengambil data resource.
- `global_servers.json`: Database server publik yang Anda daftarkan.

## 🛡️ Lisensi
Dilisensikan di bawah [MIT License](LICENSE).
