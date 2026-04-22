// Чтение данных для клиентской логики
const db = require("../db/db");
const { ROLES } = require("../config");

function midToShort(mid) {
  try {
    const hex = mid.split(".").pop();
    return Buffer.from(hex, "hex").toString("base64url");
  } catch { return mid; }
}

const makeLink = (chat_id, message_id) =>
  `https://max.ru/c/${chat_id}/${midToShort(message_id)}`;

function roleFlags(role_id) {
  return ROLES[role_id] || ROLES.SPEC;
}

module.exports = { midToShort, makeLink, roleFlags, ...db };