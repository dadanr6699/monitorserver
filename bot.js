require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

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
        servers.forEach(s => {
            keyboard.push([{ text: `🖥️  ${s.name.toUpperCase()}`, callback_data: `start_live:${s.name}` }]);
        });
    }

    if (chatId === ADMIN_ID) {
        keyboard.push([{ text: '➕ Tambah VPS', callback_data: 'start_add_flow' }]);
        if (servers.length > 0) {
            keyboard.push([{ text: '🗑️ Hapus VPS', callback_data: 'menu_del' }]);
        }
    }
    return { inline_keyboard: keyboard };
}

function getHeaderText(chatId) {
    const servers = getGlobalServers();
    const isAdmin = chatId === ADMIN_ID;
    const badge = isAdmin ? '👨‍💻 *ADMIN PANEL*' : '🌐 *PUBLIC DASHBOARD*';
    return [
        '╭───────────────────╮',
        '   🛰️  *VITAL VPS MONITOR*',
        '╰───────────────────╯',
        '',
        badge,
        `📊 Total Server : *${servers.length}*`,
        `🟢 Status       : *Online*`,
        '',
        servers.length === 0
            ? '_Belum ada server. Tambahkan VPS baru._'
            : '_Pilih server untuk mulai memantau:_'
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
            ? '```\n' + stats + `\n🕐 Update : ${now} (auto 3s)\n────────────────────────────` + '```'
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
        parse_mode: 'Markdown',
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
        bot.editMessageText('⏹️ *Monitoring dihentikan.*\n\nKlik server lagi untuk memulai ulang.', {
            chat_id: chatId,
            message_id: msgId,
            parse_mode: 'Markdown',
            reply_markup: getMainMenu(chatId)
        });
    }

    if (data === 'back_to_menu') {
        stopLive(chatId);
        bot.answerCallbackQuery(query.id);
        bot.editMessageText(getHeaderText(chatId), {
            chat_id: chatId,
            message_id: msgId,
            parse_mode: 'Markdown',
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
        const delKeyboard = gServers.map(s => ([{ text: `❌ ${s.name}`, callback_data: `confirm_del:${s.name}` }]));
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
        bot.editMessageText(`✅ VPS *${name}* berhasil dihapus.\n📊 Sisa server: *${servers.length}*`, {
            chat_id: chatId,
            message_id: msgId,
            parse_mode: 'Markdown',
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
            `✅ *VPS Berhasil Ditambahkan!*\n\n🖥 Nama : *${state.data.name}*\n🌐 IP   : ${state.data.ip}\n🔌 Port : ${state.data.port}\n👤 User : ${state.data.user}`,
            { parse_mode: 'Markdown', reply_markup: getMainMenu(chatId) }
        );
    }
});

process.on('uncaughtException', err => console.error('Uncaught:', err));
process.on('unhandledRejection', err => console.error('Unhandled:', err));

console.log('✅ VPS Vital Monitor Bot running...');
