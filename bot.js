require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const token = process.env.BOT_TOKEN;
const ADMIN_ID = parseInt(process.env.ADMIN_ID); 

// Mengarahkan ke Telegram Bot API Lokal di Docker
const bot = new TelegramBot(token, { 
    polling: true,
    baseApiUrl: 'http://127.0.0.1:8081' // Port container docker Anda
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
    const globalSrv = getGlobalServers();
    const keyboard = [];

    globalSrv.forEach(s => {
        keyboard.push([{ text: `🌍 VPS: ${s.name.toUpperCase()}`, callback_data: `start_live:${s.name}` }]);
    });

    if (chatId === ADMIN_ID) {
        keyboard.push([{ text: "Tambah VPS Baru", callback_data: "start_add_flow" }]);
        if (globalSrv.length > 0) {
            keyboard.push([{ text: "🗑️ Hapus VPS", callback_data: "menu_del" }]);
        }
    }
    
    return { inline_keyboard: keyboard };
}

async function fetchStats(vps) {
    return new Promise((resolve) => {
        const cmd = `sshpass -p '${vps.pass}' ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 ${vps.user}@${vps.ip} "bash -s" < /root/vital/monitor.sh`;
        exec(cmd, (error, stdout) => {
            if (error) resolve("❌ SERVER OFFLINE / SSH ERROR");
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

bot.onText(/\/(start|vital|monitor)/, (msg) => {
    stopLive(msg.chat.id);
    const welcomeMsg = (msg.chat.id === ADMIN_ID) 
        ? "👨‍💻 **ADMIN DASHBOARD**\nKelola dan pantau seluruh server:" 
        : "🛰️ **PUBLIC MONITORING**\nSilakan pilih server untuk memantau status:";
    
    bot.sendMessage(msg.chat.id, welcomeMsg, {
        parse_mode: 'Markdown',
        reply_markup: getMainMenu(msg.chat.id)
    });
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const msgId = query.message.message_id;
    const data = query.data;

    if (data.startsWith("start_live:")) {
        stopLive(chatId);
        const name = data.split(":")[1];
        const vps = getGlobalServers().find(s => s.name === name);

        if (!vps) return bot.answerCallbackQuery(query.id, { text: "VPS tidak ditemukan" });

        bot.answerCallbackQuery(query.id, { text: `Monitoring ${name}...` });
        
        const update = async () => {
            const stats = await fetchStats(vps);
            const now = new Date().toLocaleTimeString();
            const text = "```\n🔴 REAL-TIME MONITORING: " + name.toUpperCase() + "\nUpdate: " + now + "\n" + stats + "```";
            
            bot.editMessageText(text, {
                chat_id: chatId,
                message_id: msgId,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: "🔙 Kembali ke Menu", callback_data: "back_to_menu" }]]
                }
            }).catch(() => {});
        };

        update();
        liveSessions[chatId] = { interval: setInterval(update, 2000) };
    }

    if (data === "back_to_menu") {
        stopLive(chatId);
        bot.editMessageText("🖥 **VPS MONITORING DASHBOARD**", {
            chat_id: chatId,
            message_id: msgId,
            parse_mode: 'Markdown',
            reply_markup: getMainMenu(chatId)
        });
    }

    if (data === "start_add_flow") {
        if (chatId !== ADMIN_ID) return bot.answerCallbackQuery(query.id, { text: "Akses Ditolak" });
        bot.answerCallbackQuery(query.id);
        userState[chatId] = { step: 'NAME', data: {} };
        const sent = await bot.sendMessage(chatId, "🆕 **TAMBAH VPS PUBLIK**\nMasukkan Nama VPS:");
        userState[chatId].lastBotMsgId = sent.message_id;
    }

    if (data === "menu_del") {
        if (chatId !== ADMIN_ID) return;
        const gServers = getGlobalServers();
        const delKeyboard = gServers.map(s => ([{ text: `❌ Hapus: ${s.name}`, callback_data: `confirm_del:${s.name}` }]));
        delKeyboard.push([{ text: "🔙 Batal", callback_data: "back_to_menu" }]);
        bot.editMessageText("🗑 Pilih yang ingin dihapus:", { chat_id: chatId, message_id: msgId, reply_markup: { inline_keyboard: delKeyboard } });
    }

    if (data.startsWith("confirm_del:")) {
        if (chatId !== ADMIN_ID) return;
        const name = data.split(":")[1];
        saveGlobalServers(getGlobalServers().filter(s => s.name !== name));
        bot.sendMessage(chatId, `🗑 VPS ${name} dihapus.`, { reply_markup: getMainMenu(chatId) });
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
        const sent = await bot.sendMessage(chatId, "🌐 Masukkan IP Address:");
        state.lastBotMsgId = sent.message_id;
    } else if (state.step === 'IP') {
        state.data.ip = msg.text;
        state.step = 'USER';
        const sent = await bot.sendMessage(chatId, "👤 Masukkan Username SSH:");
        state.lastBotMsgId = sent.message_id;
    } else if (state.step === 'USER') {
        state.data.user = msg.text;
        state.step = 'PASS';
        const sent = await bot.sendMessage(chatId, "🔑 Masukkan Password SSH:");
        state.lastBotMsgId = sent.message_id;
    } else if (state.step === 'PASS') {
        state.data.pass = msg.text;
        const srvs = getGlobalServers();
        srvs.push(state.data);
        saveGlobalServers(srvs);
        bot.sendMessage(chatId, `✅ Berhasil disimpan sebagai VPS PUBLIK!`, { reply_markup: getMainMenu(chatId) });
        userState[chatId] = null;
    }
});
