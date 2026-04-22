// Отправка сообщений в MAX API
const axios = require("axios");
const { TOKEN, BASE_URL } = require("../config");

const HEADERS = {
  Authorization: TOKEN,
  "Content-Type": "application/json",
};

function getTlsAgent() {
  return require("../server/sv_main").tlsAgent;
}

async function sendMessage(chat_id, text, keyboard = null, reply_to = null) {
  const data = { text, format: "markdown" };
  if (keyboard)  data.attachments = [keyboard];
  if (reply_to)  data.link = { type: "reply", mid: reply_to };
  try {
    const r = await axios.post(`${BASE_URL}/messages`, data, {
      headers: HEADERS,
      params: { chat_id },
      httpsAgent: getTlsAgent(),
    });
    if (r.status === 200) {
      const msg = r.data?.message || {};
      return msg?.body?.mid || msg?.id || null;
    }
    console.warn(`⚠️ send→${chat_id} | ${r.status} | ${JSON.stringify(r.data).slice(0,100)}`);
  } catch (e) {
    console.error("send error:", e.message);
  }
  return null;
}

async function editMessage(message_id, chat_id, text, keyboard = null) {
  const data = { text, format: "markdown" };
  if (keyboard === null)     { /* не трогаем attachments */ }
  else if (Array.isArray(keyboard) && keyboard.length === 0) data.attachments = [];
  else                        data.attachments = [keyboard];
  try {
    const r = await axios.put(`${BASE_URL}/messages`, data, {
      headers: HEADERS,
      params: { message_id },
      httpsAgent: getTlsAgent(),
    });
    return r.status === 200;
  } catch { return false; }
}

async function deleteMessage(message_id) {
  if (!message_id) return false;
  try {
    const r = await axios.delete(`${BASE_URL}/messages`, {
      headers: HEADERS,
      params: { message_id },
      httpsAgent: getTlsAgent(),
    });
    return r.status === 200;
  } catch { return false; }
}

const replyTo = (chat_id, reply_mid, text, keyboard = null) =>
  sendMessage(chat_id, text, keyboard, reply_mid);

module.exports = { sendMessage, editMessage, deleteMessage, replyTo };