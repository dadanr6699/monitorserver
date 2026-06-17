require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { exec } = require('child_process');
const fs = require('fs');

const token = process.env.BOT_TOKEN;
const ADMIN_ID = parseInt(process.env.ADMIN_ID);

const bot = new TelegramBot(token, {
    polling: true,
    baseApiUrl: 'http://127.0.0.1:8081'
});

const GLOBAL_SERVERS_FILE = '/root/vital/global_servers.json';
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
            keyboard.push([{ text: `🖥️ ${s.name.toUpperCase()}`, callback_data: `start_live:${s.name}` }]);
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

async function fetchStats(vps) {
    return new Promise((resolve) => {
        const cmd = `sshpass -p '${vps.pass}' ssh -o StrictHostKeyChecking=no -o ConnectTimeout=8 ${vps.user}@${vps.ip} "bash -s" < /root/vital/monitor.sh`;
        exec(cmd, { timeout: 15000 }, (error, stdout) => {
            if (error) resolve(null);
            else resolve(stdout.replace(/\x1b\[[0-9;]*m/g, ''));
        });
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

        let text;
        if (!stats) {
            text = `\u26a0\ufe0f SERVER OFFLINE\n\n🖥 ${name.toUpperCase()}\n⏰ Cek terakhir: ${now}`;
        } else {
            text = '```\n' + stats + '```';
        }

        bot.editMessageText(text, {
            chat_id: chatId,
            message_id: msgId,
            parse_mode: 'Markdown',
            reply_markup: liveKeyboard
        }).catch(() => {});
    };

    update();
    liveSessions[chatId] = { interval: setInterval(update, 3000), name, msgId };
}

bot.onText(/\/(start|vital|monitor|menu)/, async (msg) => {
    stopLive(msg.chat.id);
    const chatId = msg.chat.id;
    const isAdmin = chatId === ADMIN_ID;
    const servers = getGlobalServers();

    const headerText = isAdmin
        ? `👨‍💻 *ADMIN PANEL — VPS VITAL MONITOR*
📊 Total Server: *${servers.length}*

_Pilih server untuk mulai monitoring real\-time:_`
        : `🛰️ *VPS VITAL MONITOR*
🌐 Public Monitoring Dashboard
📊 Total Server: *${servers.length}*

_Pilih server yang ingin dipantau:_`;

    bot.sendMessage(chatId, headerText, {
        parse_mode: 'MarkdownV2',
        reply_markup: getMainMenu(chatId)
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

        // Tampilkan pesan loading dulu
        bot.editMessageText(`⏳ *Menghubungkan ke server ${name.toUpperCase()}...*\n\nMohon tunggu sebentar.`, {
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
        const servers = getGlobalServers();
        const isAdmin = chatId === ADMIN_ID;
        const headerText = isAdmin
            ? `👨‍💻 *ADMIN PANEL — VPS VITAL MONITOR*\n📊 Total Server: *${servers.length}*`
            : `🛰️ *VPS VITAL MONITOR*\n📊 Total Server: *${servers.length}*`;
        bot.editMessageText(headerText, {
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
            `✅ *VPS Berhasil Ditambahkan!*\n\n🖥 Nama : *${state.data.name}*\n🌐 IP   : \`${state.data.ip}\`\n👤 User : \`${state.data.user}\``,
            { parse_mode: 'Markdown', reply_markup: getMainMenu(chatId) }
        );
    }
});

process.on('uncaughtException', err => console.error('Uncaught:', err));
process.on('unhandledRejection', err => console.error('Unhandled:', err));

console.log('\u2705 VPS Vital Monitor Bot running...');
