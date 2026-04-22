// Точка входа: Express + polling loop + TLS + логи
require("fs").mkdirSync(require("path").join(__dirname, "../data"), { recursive: true });

const https    = require("https");
const express  = require("express");
const schedule = require("node-schedule");
const { initDb, isBotActive, isLogging, nowStr } = require("../db/db");
const { getUpdates, getInterval } = require("./sv_get");
const { sendMessage } = require("./sv_send");
const { handleUpdate } = require("../client/cl_main");
const { checkUpdate }  = require("../updater/updater");
const { LOG_CHAT_ID, WEB_PORT } = require("../config");

// ── TLS агент (обход SSL проблем MAX API) ──
const tlsAgent = new https.Agent({
  rejectUnauthorized: false,
  secureOptions: require("crypto").constants.SSL_OP_LEGACY_SERVER_CONNECT,
  ciphers: "DEFAULT@SECLEVEL=1",
});
module.exports.tlsAgent = tlsAgent;

// ── Логирование ──
function log(text, force = false) {
  console.log(`[LOG] ${nowStr()} ${text}`);
  if ((isLogging() || force) && LOG_CHAT_ID) {
    sendMessage(LOG_CHAT_ID, `📋 *Лог* | \`${nowStr()}\`\n${text}`).catch(() => {});
  }
}
module.exports.log = log;

// ── Express (веб-интерфейс) ──
const app = express();
app.use(express.json());
app.use(express.static(require("path").join(__dirname, "../web")));
require("../web/api")(app);   // маршруты веб-API

app.listen(WEB_PORT, () => console.log(`🌐 Веб-панель: http://localhost:${WEB_PORT}`));

// ── Polling loop ──
async function pollLoop() {
  let marker = null;
  while (true) {
    try {
      const data = await getUpdates(marker);
      for (const upd of data.updates || []) {
        await handleUpdate(upd).catch(e => console.error("handleUpdate error:", e));
      }
      if (data.marker) marker = data.marker;
    } catch (e) {
      console.error("pollLoop error:", e);
    }
    await sleep(getInterval());
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Авто-обновление каждый час ──
schedule.scheduleJob("0 * * * *", async () => {
  console.log("🔄 Проверка обновлений...");
  await checkUpdate(false);
});

// ── Запуск ──
initDb();
log("🚀 Бот REXORIK запущен", true);
pollLoop();