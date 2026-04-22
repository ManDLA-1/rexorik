// Получение обновлений от MAX API (long polling)
const axios  = require("axios");
const { TOKEN, BASE_URL } = require("../config");

const HEADERS = {
  Authorization: TOKEN,
  "Content-Type": "application/json",
};

let currentInterval = 200;   // ms
const MIN_INTERVAL  = 200;
const MAX_INTERVAL  = 10000;

let _offline_since = null;

async function getUpdates(marker = null) {
  const params = { timeout: 30 };
  if (marker) params.marker = marker;

  try {
    const r = await axios.get(`${BASE_URL}/updates`, {
      headers: HEADERS,
      params,
      timeout: 35000,
      httpsAgent: require("../server/sv_main").tlsAgent,
    });

    if (r.status === 429) {
      currentInterval = Math.min(currentInterval * 2, MAX_INTERVAL);
      console.warn(`⚠️ Rate limit, жду ${currentInterval}ms`);
      return {};
    }
    if (r.status !== 200) {
      console.error(`❌ ${r.status}:`, r.data);
      return {};
    }

    if (_offline_since) {
      const { log } = require("./sv_main");
      log(`🟢 Соединение восстановлено. Было офлайн с ${_offline_since}`, true);
      _offline_since = null;
    }
    currentInterval = Math.max(currentInterval * 0.9, MIN_INTERVAL);
    return r.data;

  } catch (err) {
    if (!_offline_since) {
      _offline_since = new Date().toLocaleString("ru-RU");
      console.error(`[OFFLINE] с ${_offline_since}:`, err.message);
    }
    currentInterval = Math.min(currentInterval * 2, MAX_INTERVAL);
    return {};
  }
}

function getInterval() { return currentInterval; }

module.exports = { getUpdates, getInterval };