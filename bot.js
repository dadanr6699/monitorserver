require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const token = process.env.BOT_TOKEN;
const ADMIN_ID = parseInt(process.env.ADMIN_ID);

if (!token || !ADMIN_ID) {
    console.error('❌ BOT_TOKEN dan ADMIN_ID wajib diisi di file .env');
    process.exit(1);
}

const botOptions = { polling: true };
if (process.env.BOT_API_URL) botOptions.baseApiUrl = process.env.BOT_API_URL;
const bot = new TelegramBot(token, botOptions);

const GLOBAL_SERVERS_FILE = path.join(__dirname, 'global_servers.json');
const MONITOR_SCRIPT = path.join(__dirname, 'monitor.sh');
if (!fs.existsSync(GLOBAL_SERVERS_FILE)) fs.writeFileSync(GLOBAL_SERVERS_FILE, '[]');

let userState = {};
let liveSessions = {};

function getGlobalServers() {
    try { return JSON.parse(fs.readFileSync(GLOBAL_SERVERS_FILE)); } catch (e) { return []; }
}

function saveGlobalServers(servers) {
    fs.writeFileSync(GLOBAL_SERVERS_FILE, JSON.stringify(servers, null, 2));
}

function getMainMenu(chatId) {
    const servers = getGlobalServers();
    const keyboard = [];

    if (servers.length === 0) {
        keyboard.push([{ text: '📭 Belum ada server terdaftar', callback_data: 'none' }]);
    } else {
        for (let i = 0; i < servers.length; i += 2) {
            const row = [
                { text: `🖥️ ${servers[i].name.toUpperCase()}`, callback_data: `start_live:${servers[i].name}` }
            ];
            if (i + 1 < servers.length) {
                row.push({ text: `🖥️ ${servers[i + 1].name.toUpperCase()}`, callback_data: `start_live:${servers[i + 1].name}` });
            }
            keyboard.push(row);
        }
    }

    if (chatId === ADMIN_ID) {
        const adminRow = [{ text: '➕ Tambah VPS', callback_data: 'start_add_flow' }];
        if (servers.length > 0) {
            adminRow.push({ text: '🗑️ Hapus VPS', callback_data: 'menu_del' });
        }
        keyboard.push(adminRow);
    }
    return { inline_keyboard: keyboard };
}

function getHeaderText(chatId) {
    const servers = getGlobalServers();
    const isAdmin = chatId === ADMIN_ID;
    const badge = isAdmin ? 'Admin Panel' : 'Public Access';
    const serverCount = servers.length;

    return [
        '🛰️ <b>VITAL VPS MONITOR</b>',
        '<blockquote>🌐 <b>System Overview</b>',
        `• 👤 <b>Role Access</b> : <code>${badge}</code>`,
        `• 📊 <b>Registered VPS</b> : <code>${serverCount} Server${serverCount !== 1 ? 's' : ''}</code>`,
        `• 🟢 <b>System Status</b> : <code>Online</code></blockquote>`,
        '',
        serverCount === 0
            ? '⚠️ <i>Belum ada server terdaftar. Silakan tambahkan VPS baru.</i>'
            : '👇 <i>Pilih server di bawah untuk mulai memantau:</i>'
    ].join('\n');
}

async function fetchStats(vps) {
    return new Promise((resolve) => {
        // Gunakan port SSH yang disimpan, default ke 22 jika tidak diset
        const port = vps.port || '22';
        const args = [
            '-e', 'ssh',
            '-p', port,
            '-o', 'StrictHostKeyChecking=no',
            '-o', 'ConnectTimeout=8',
            `${vps.user}@${vps.ip}`,
            'bash -s'
        ];
        const child = spawn('sshpass', args, {
            env: { ...process.env, SSHPASS: vps.pass },
            timeout: 15000
        });

        let stdout = '';
        let done = false;
        const finish = (val) => { if (!done) { done = true; resolve(val); } };

        child.stdout.on('data', (d) => { stdout += d.toString(); });
        child.on('error', () => finish(null));
        child.on('close', (code) => {
            if (code !== 0) return finish(null);
            finish(stdout.replace(/\x1b\[[0-9;]*m/g, ''));
        });

        // Kirim isi script monitor.sh via stdin
        try {
            fs.createReadStream(MONITOR_SCRIPT).pipe(child.stdin);
        } catch (e) {
            finish(null);
        }
    });
}

function stopLive(chatId) {
    if (liveSessions[chatId]) {
        clearInterval(liveSessions[chatId].interval);
        delete liveSessions[chatId];
    }
}

async function startLive(chatId, msgId, name) {
    stopLive(chatId);
    const vps = getGlobalServers().find(s => s.name === name);
    if (!vps) return;

    const liveKeyboard = {
        inline_keyboard: [
            [{ text: '⏹️ Stop Monitor', callback_data: 'stop_live' }],
            [{ text: '🔙 Kembali ke Menu', callback_data: 'back_to_menu' }]
        ]
    };

    const update = async () => {
        const stats = await fetchStats(vps);
        const now = new Date().toLocaleTimeString('id-ID', { hour12: false });
        const text = stats
            ? '```\n' + stats + `\n🕐 Update : ${now}\n────────────────────────────` + '```'
            : `⚠️ *SERVER OFFLINE*\n\n🖥 Server : *${name.toUpperCase()}*\n🌐 IP     : ${vps.ip}\n⏰ Cek    : ${now}\n\n_Tidak dapat terhubung. Pastikan VPS aktif._`;

        bot.editMessageText(text, {
            chat_id: chatId,
            message_id: msgId,
            parse_mode: 'Markdown',
            reply_markup: liveKeyboard
        }).catch(() => {});
    };

    update();
    liveSessions[chatId] = { interval: setInterval(update, 3000) };
}

bot.onText(/\/(start|vital|monitor|menu)/, async (msg) => {
    stopLive(msg.chat.id);
    bot.sendMessage(msg.chat.id, getHeaderText(msg.chat.id), {
        parse_mode: 'HTML',
        reply_markup: getMainMenu(msg.chat.id)
    });
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const msgId = query.message.message_id;
    const data = query.data;

    if (data === 'none') {
        return bot.answerCallbackQuery(query.id);
    }

    if (data.startsWith('start_live:')) {
        const name = data.split(':')[1];
        const vps = getGlobalServers().find(s => s.name === name);
        if (!vps) return bot.answerCallbackQuery(query.id, { text: 'VPS tidak ditemukan' });
        bot.answerCallbackQuery(query.id, { text: `📡 Menghubungkan ke ${name}...` });
        bot.editMessageText(`⏳ *Menghubungkan ke ${name.toUpperCase()}...*\nMohon tunggu sebentar.`, {
            chat_id: chatId,
            message_id: msgId,
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: '🔙 Batal', callback_data: 'back_to_menu' }]] }
        }).then(() => startLive(chatId, msgId, name)).catch(() => {});
    }

    if (data === 'stop_live') {
        stopLive(chatId);
        bot.answerCallbackQuery(query.id, { text: '⏹️ Monitoring dihentikan' });
        bot.editMessageText('⏹️ <b>Monitoring dihentikan.</b>\n\nKlik server lagi untuk memulai ulang.', {
            chat_id: chatId,
            message_id: msgId,
            parse_mode: 'HTML',
            reply_markup: getMainMenu(chatId)
        });
    }

    if (data === 'back_to_menu') {
        stopLive(chatId);
        bot.answerCallbackQuery(query.id);
        bot.editMessageText(getHeaderText(chatId), {
            chat_id: chatId,
            message_id: msgId,
            parse_mode: 'HTML',
            reply_markup: getMainMenu(chatId)
        });
    }

    if (data === 'start_add_flow') {
        if (chatId !== ADMIN_ID) return bot.answerCallbackQuery(query.id, { text: '🚫 Akses Ditolak' });
        bot.answerCallbackQuery(query.id);
        userState[chatId] = { step: 'NAME', data: {} };
        const sent = await bot.sendMessage(chatId, '🆕 *TAMBAH VPS BARU*\n\n📋 Masukkan *Nama VPS*:', { parse_mode: 'Markdown' });
        userState[chatId].lastBotMsgId = sent.message_id;
    }

    if (data === 'menu_del') {
        if (chatId !== ADMIN_ID) return;
        const gServers = getGlobalServers();
        const delKeyboard = [];
        for (let i = 0; i < gServers.length; i += 2) {
            const row = [{ text: `❌ ${gServers[i].name}`, callback_data: `confirm_del:${gServers[i].name}` }];
            if (i + 1 < gServers.length) {
                row.push({ text: `❌ ${gServers[i + 1].name}`, callback_data: `confirm_del:${gServers[i + 1].name}` });
            }
            delKeyboard.push(row);
        }
        delKeyboard.push([{ text: '🔙 Batal', callback_data: 'back_to_menu' }]);
        bot.editMessageText('🗑 *HAPUS VPS*\n\nPilih VPS yang ingin dihapus:', {
            chat_id: chatId,
            message_id: msgId,
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: delKeyboard }
        });
    }

    if (data.startsWith('confirm_del:')) {
        if (chatId !== ADMIN_ID) return;
        const name = data.split(':')[1];
        saveGlobalServers(getGlobalServers().filter(s => s.name !== name));
        bot.answerCallbackQuery(query.id, { text: `✅ VPS ${name} dihapus` });
        const servers = getGlobalServers();
        bot.editMessageText(`✅ VPS <b>${name}</b> berhasil dihapus.\n📊 Sisa server: <b>${servers.length}</b>`, {
            chat_id: chatId,
            message_id: msgId,
            parse_mode: 'HTML',
            reply_markup: getMainMenu(chatId)
        });
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (chatId !== ADMIN_ID || !msg.text || msg.text.startsWith('/')) return;
    const state = userState[chatId];
    if (!state) return;

    try { bot.deleteMessage(chatId, msg.message_id); } catch (e) {}
    if (state.lastBotMsgId) { try { bot.deleteMessage(chatId, state.lastBotMsgId); } catch (e) {} }

    if (state.step === 'NAME') {
        state.data.name = msg.text;
        state.step = 'IP';
        const sent = await bot.sendMessage(chatId, '🌐 Masukkan *IP Address* VPS:', { parse_mode: 'Markdown' });
        state.lastBotMsgId = sent.message_id;
    } else if (state.step === 'IP') {
        state.data.ip = msg.text;
        state.step = 'PORT';
        const sent = await bot.sendMessage(chatId, '🔌 Masukkan *Port SSH* VPS:\n_(Ketik angka port, atau ketik 22 untuk default)_', { parse_mode: 'Markdown' });
        state.lastBotMsgId = sent.message_id;
    } else if (state.step === 'PORT') {
        const portInput = msg.text.trim();
        state.data.port = /^[0-9]+$/.test(portInput) ? portInput : '22';
        state.step = 'USER';
        const sent = await bot.sendMessage(chatId, '👤 Masukkan *Username SSH*:', { parse_mode: 'Markdown' });
        state.lastBotMsgId = sent.message_id;
    } else if (state.step === 'USER') {
        state.data.user = msg.text;
        state.step = 'PASS';
        const sent = await bot.sendMessage(chatId, '🔑 Masukkan *Password SSH*:', { parse_mode: 'Markdown' });
        state.lastBotMsgId = sent.message_id;
    } else if (state.step === 'PASS') {
        state.data.pass = msg.text;
        const srvs = getGlobalServers();
        srvs.push(state.data);
        saveGlobalServers(srvs);
        userState[chatId] = null;
        bot.sendMessage(chatId,
            `✅ <b>VPS Berhasil Ditambahkan!</b>\n\n🖥 Nama : <b>${state.data.name}</b>\n🌐 IP   : ${state.data.ip}\n🔌 Port : ${state.data.port}\n👤 User : ${state.data.user}`,
            { parse_mode: 'HTML', reply_markup: getMainMenu(chatId) }
        );
    }
});

// -------------------------------------------------------------
// WEB DASHBOARD SERVER (Zero-dependency HTTP Server)
// -------------------------------------------------------------
const WEB_PORT = parseInt(process.env.WEB_PORT || '3000');

function getWebDashboardHTML() {
    return `<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Vital VPS Monitor Dashboard</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            background-color: #0d1117; color: #c9d1d9;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
            padding: 20px; display: flex; flex-direction: column; align-items: center; min-height: 100vh;
        }
        .container { width: 100%; max-width: 650px; }
        header { text-align: center; margin-bottom: 20px; padding: 15px; background: #161b22; border: 1px solid #30363d; border-radius: 8px; }
        h1 { font-size: 1.4rem; color: #58a6ff; margin-bottom: 5px; }
        p.subtitle { font-size: 0.85rem; color: #8b949e; }
        .controls { display: flex; gap: 10px; margin-bottom: 15px; }
        select { flex: 1; padding: 10px; background: #161b22; color: #58a6ff; border: 1px solid #30363d; border-radius: 6px; font-size: 0.95rem; font-weight: bold; outline: none; cursor: pointer; }
        select:focus { border-color: #58a6ff; }
        .terminal { background: #010409; border: 1px solid #30363d; border-radius: 8px; padding: 15px; font-family: "Courier New", Courier, monospace; white-space: pre-wrap; font-size: 0.88rem; line-height: 1.4; color: #7ee787; min-height: 380px; box-shadow: 0 4px 12px rgba(0,0,0,0.5); overflow-x: auto; }
        .footer { margin-top: 15px; text-align: center; font-size: 0.8rem; color: #8b949e; }
        .footer a { color: #58a6ff; text-decoration: none; }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>🛰️ VITAL VPS MONITOR</h1>
            <p class="subtitle">Real-Time VPS Performance Dashboard</p>
        </header>

        <div class="controls">
            <select id="serverSelect" onchange="onServerChange()">
                <option value="">⏳ Memuat daftar server...</option>
            </select>
        </div>

        <div class="terminal" id="output">Silakan pilih server untuk memantau...</div>

        <div class="footer">
            Real-Time Monitor | Auto Refresh: 3s
        </div>
    </div>

    <script>
        let timer = null;
        async function loadServers() {
            try {
                const res = await fetch('/api/servers');
                const servers = await res.json();
                const select = document.getElementById('serverSelect');
                if (servers.length === 0) {
                    select.innerHTML = '<option value="">📭 Belum ada server terdaftar</option>';
                    document.getElementById('output').textContent = 'Belum ada server yang terdaftar.';
                    return;
                }
                select.innerHTML = servers.map(s => \`<option value="\${s.name}">🖥️ \${s.name.toUpperCase()} (\${s.ip})</option>\`).join('');
                onServerChange();
            } catch (e) {
                document.getElementById('output').textContent = 'Error memuat daftar server.';
            }
        }

        async function updateStats() {
            const name = document.getElementById('serverSelect').value;
            if (!name) return;
            try {
                const res = await fetch('/api/stats?name=' + encodeURIComponent(name));
                const data = await res.json();
                const now = new Date().toLocaleTimeString('id-ID', { hour12: false });
                if (data.ok && data.stats) {
                    document.getElementById('output').textContent = data.stats + '\\n🕐 Update : ' + now + '\\n────────────────────────────';
                } else {
                    document.getElementById('output').textContent = '⚠️ SERVER OFFLINE\\n\\n🖥 Server : ' + name.toUpperCase() + '\\n⏰ Cek    : ' + now + '\\n\\nTidak dapat terhubung via SSH. Pastikan VPS aktif.';
                }
            } catch (e) {
                document.getElementById('output').textContent = 'Error koneksi ke Web API.';
            }
        }

        function onServerChange() {
            if (timer) clearInterval(timer);
            document.getElementById('output').textContent = '⏳ Menghubungkan ke server...';
            updateStats();
            timer = setInterval(updateStats, 3000);
        }
        loadServers();
    </script>
</body>
</html>`;
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    
    if (url.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(getWebDashboardHTML());
    }

    if (url.pathname === '/api/servers') {
        const servers = getGlobalServers().map(s => ({ name: s.name, ip: s.ip, port: s.port || '22' }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(servers));
    }

    if (url.pathname === '/api/stats') {
        const name = url.searchParams.get('name');
        const vps = getGlobalServers().find(s => s.name === name);
        if (!vps) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ ok: false, message: 'Server not found' }));
        }

        const stats = await fetchStats(vps);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: !!stats, stats }));
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
});

server.listen(WEB_PORT, () => {
    console.log(`🌐 Web Dashboard running on http://0.0.0.0:${WEB_PORT}`);
});

process.on('uncaughtException', err => console.error('Uncaught:', err));
process.on('unhandledRejection', err => console.error('Unhandled:', err));

console.log('✅ VPS Vital Monitor Bot running...');
