const Database = require("better-sqlite3");
const path     = require("path");
const { ROLES, INITIAL_DATA } = require("../config");

const DB_PATH = path.join(__dirname, "../data/tickets.db");
let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
  }
  return db;
}

function initDb() {
  const d = getDb();

  d.exec(`
    CREATE TABLE IF NOT EXISTS tickets (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_code     TEXT,
      chat_id         INTEGER NOT NULL,
      message_id      TEXT,
      user_id         INTEGER,
      user_name       TEXT,
      text            TEXT,
      status          TEXT DEFAULT 'new',
      site_id         TEXT,
      site_name       TEXT,
      site_prefix     TEXT,
      site_counter    INTEGER,
      approve_mid     TEXT,
      assign_mid      TEXT,
      assignee_id     INTEGER,
      assignee_name   TEXT,
      created_at      TEXT,
      approved_at     TEXT,
      assigned_at     TEXT,
      in_work_at      TEXT,
      done_at         TEXT,
      rejected_at     TEXT,
      reject_reason   TEXT,
      comment         TEXT,
      rating          INTEGER,
      notify_mid      TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS wl_users (
      user_id       INTEGER PRIMARY KEY,
      chat_id       INTEGER,
      name          TEXT,
      display_name  TEXT,
      role          TEXT DEFAULT 'SPEC',
      incog_on      INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sites (
      site_id   TEXT PRIMARY KEY,
      site_name TEXT,
      keyword   TEXT,
      prefix    TEXT,
      chat_id   INTEGER,
      counter   INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS wl_panels (
      user_id    INTEGER,
      chat_id    INTEGER,
      message_id TEXT,
      PRIMARY KEY (user_id, chat_id)
    );

    CREATE TABLE IF NOT EXISTS user_messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER,
      message_id TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS join_requests (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER,
      chat_id    INTEGER,
      user_name  TEXT,
      created_at TEXT,
      status     TEXT DEFAULT 'pending'
    );
  `);

  // Добавляем недостающие колонки (миграция)
  const migrations = [
    ["tickets", "ticket_code",   "TEXT"],
    ["tickets", "site_prefix",   "TEXT"],
    ["tickets", "site_counter",  "INTEGER"],
    ["tickets", "approve_mid",   "TEXT"],
    ["tickets", "assign_mid",    "TEXT"],
    ["tickets", "approved_at",   "TEXT"],
    ["tickets", "assigned_at",   "TEXT"],
    ["tickets", "rejected_at",   "TEXT"],
    ["tickets", "reject_reason", "TEXT"],
    ["tickets", "comment",       "TEXT"],
    ["tickets", "rating",        "INTEGER"],
    ["wl_users","display_name",  "TEXT"],
    ["wl_users","role",          "TEXT DEFAULT 'SPEC'"],
    ["wl_users","incog_on",      "INTEGER DEFAULT 0"],
    ["sites",   "prefix",        "TEXT"],
    ["sites",   "counter",       "INTEGER DEFAULT 0"],
  ];
  for (const [table, col, type] of migrations) {
    try { d.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`); } catch {}
  }

  // Настройки по умолчанию
  d.prepare("INSERT OR IGNORE INTO settings VALUES ('bot_active','1')").run();
  d.prepare("INSERT OR IGNORE INTO settings VALUES ('logging_enabled','1')").run();
  d.prepare("INSERT OR IGNORE INTO settings VALUES ('silent_mode','0')").run();

  // Начальные данные
  const userCount = d.prepare("SELECT COUNT(*) as c FROM wl_users").get().c;
  if (userCount === 0) {
    const insUser = d.prepare(
      "INSERT OR IGNORE INTO wl_users (user_id,chat_id,name,display_name,role) VALUES (?,?,?,?,?)"
    );
    for (const u of INITIAL_DATA.wl_users) {
      insUser.run(u.user_id, u.chat_id, u.name, u.display_name || u.name, u.role || "ROOT");
    }
    const insSite = d.prepare(
      "INSERT OR IGNORE INTO sites (site_id,site_name,keyword,prefix,chat_id,counter) VALUES (?,?,?,?,?,0)"
    );
    for (const s of INITIAL_DATA.sites) {
      insSite.run(s.site_id, s.site_name, s.keyword, s.prefix || s.site_id[0].toUpperCase(), s.chat_id);
    }
  }

  console.log("✅ БД инициализирована");
}

// ── Настройки ──
const getSetting  = (key, def = "0") => d().prepare("SELECT value FROM settings WHERE key=?").get(key)?.value ?? def;
const setSetting  = (key, val)       => d().prepare("INSERT OR REPLACE INTO settings VALUES (?,?)").run(key, val);
const d           = getDb;

const isBotActive    = ()  => getSetting("bot_active", "1") === "1";
const toggleBot      = ()  => { const n = isBotActive() ? "0" : "1"; setSetting("bot_active", n); return n === "1"; };
const isLogging      = ()  => getSetting("logging_enabled", "1") === "1";
const toggleLogging  = ()  => { const n = isLogging() ? "0" : "1"; setSetting("logging_enabled", n); return n === "1"; };
const isSilentMode   = ()  => getSetting("silent_mode", "0") === "1";
const toggleSilent   = ()  => { const n = isSilentMode() ? "0" : "1"; setSetting("silent_mode", n); return n === "1"; };

// ── WL Пользователи ──
const getWlUsers  = ()         => d().prepare("SELECT * FROM wl_users").all();
const getWlUser   = (uid)      => d().prepare("SELECT * FROM wl_users WHERE user_id=?").get(uid) || null;
const isWlUser    = (uid)      => !!d().prepare("SELECT 1 FROM wl_users WHERE user_id=?").get(uid);
const getWlChat   = (uid)      => getWlUser(uid)?.chat_id || null;
const getWlUserIds = ()        => d().prepare("SELECT user_id FROM wl_users").all().map(r => r.user_id);

function addWlUser(user_id, chat_id, name, role = "SPEC") {
  d().prepare(
    "INSERT OR REPLACE INTO wl_users (user_id,chat_id,name,display_name,role,incog_on) VALUES (?,?,?,?,?,0)"
  ).run(user_id, chat_id, name, name, role);
}

const removeWlUser    = (uid)       => d().prepare("DELETE FROM wl_users WHERE user_id=?").run(uid);
const setWlRole       = (uid, role) => d().prepare("UPDATE wl_users SET role=? WHERE user_id=?").run(role, uid);
const setDisplayName  = (uid, name) => d().prepare("UPDATE wl_users SET display_name=? WHERE user_id=?").run(name, uid);

function toggleIncog(uid) {
  const u = getWlUser(uid);
  const newVal = u?.incog_on ? 0 : 1;
  d().prepare("UPDATE wl_users SET incog_on=? WHERE user_id=?").run(newVal, uid);
  return newVal === 1;
}

function getUsersByFlag(flag) {
  const { ROLES } = require("../config");
  return getWlUsers().filter(u => ROLES[u.role]?.[flag]);
}

function hasFlag(uid, flag) {
  const { ROLES } = require("../config");
  const u = getWlUser(uid);
  return u ? !!ROLES[u.role]?.[flag] : false;
}

// ── Площадки ──
const getSites       = ()        => d().prepare("SELECT * FROM sites").all();
const getSite        = (sid)     => d().prepare("SELECT * FROM sites WHERE site_id=?").get(sid) || null;
const getAllowedChats = ()        => [...new Set(d().prepare("SELECT chat_id FROM sites").all().map(r => r.chat_id))];
const removeSite     = (sid)     => d().prepare("DELETE FROM sites WHERE site_id=?").run(sid);
const updateSiteChat = (sid, cid)=> d().prepare("UPDATE sites SET chat_id=? WHERE site_id=?").run(cid, sid);

function addSite(site_id, site_name, keyword, prefix, chat_id) {
  d().prepare(
    "INSERT OR REPLACE INTO sites (site_id,site_name,keyword,prefix,chat_id,counter) VALUES (?,?,?,?,?,0)"
  ).run(site_id, site_name, keyword, prefix, chat_id);
}

function nextSiteCounter(site_id) {
  d().prepare("UPDATE sites SET counter=counter+1 WHERE site_id=?").run(site_id);
  return d().prepare("SELECT counter FROM sites WHERE site_id=?").get(site_id).counter;
}

function findRule(chat_id, text) {
  const rows = d().prepare("SELECT * FROM sites WHERE chat_id=?").all(chat_id);
  const lower = text.toLowerCase();
  for (const s of rows) {
    if (lower.includes(s.keyword.toLowerCase())) {
      return { site_id: s.site_id, site_name: s.site_name, keyword: s.keyword,
               prefix: s.prefix || s.site_id[0].toUpperCase() };
    }
  }
  return null;
}

// ── Заявки ──
function createTicket({ chat_id, message_id, user_id, user_name, text, site_id, site_name, prefix }) {
  const counter = nextSiteCounter(site_id);
  const code    = `${prefix}-#${counter}`;
  const now     = nowStr();
  const info = d().prepare(`
    INSERT INTO tickets (ticket_code,chat_id,message_id,user_id,user_name,text,
      status,site_id,site_name,site_prefix,site_counter,created_at)
    VALUES (?,?,?,?,?,?,'new',?,?,?,?,?)
  `).run(code, chat_id, message_id, user_id, user_name, text,
         site_id, site_name, prefix, counter, now);
  return { id: info.lastInsertRowid, code };
}

const getTicket  = (id) => d().prepare("SELECT * FROM tickets WHERE id=?").get(id) || null;

function updateTicket(id, fields) {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const sets = keys.map(k => `${k}=?`).join(", ");
  d().prepare(`UPDATE tickets SET ${sets} WHERE id=?`).run(...Object.values(fields), id);
}

function getMyTickets(user_id, statuses = null) {
  if (statuses) {
    const ph = statuses.map(() => "?").join(",");
    return d().prepare(
      `SELECT * FROM tickets WHERE assignee_id=? AND status IN (${ph}) ORDER BY id DESC`
    ).all(user_id, ...statuses);
  }
  return d().prepare("SELECT * FROM tickets WHERE assignee_id=? ORDER BY id DESC LIMIT 50").all(user_id);
}

const getOpenTicketsAll = () =>
  d().prepare("SELECT * FROM tickets WHERE status IN ('new','assigned','waiting','in_work') ORDER BY id").all();

function getArchiveTickets(user_id = null) {
  if (user_id) {
    return d().prepare(
      "SELECT * FROM tickets WHERE assignee_id=? AND status IN ('done','rejected') ORDER BY id DESC LIMIT 50"
    ).all(user_id);
  }
  return d().prepare(
    "SELECT * FROM tickets WHERE status IN ('done','rejected') ORDER BY id DESC LIMIT 50"
  ).all();
}

function getTicketsForReport(days, user_id = null) {
  const since = new Date(Date.now() - days * 86400000)
    .toLocaleString("ru-RU", { hour12: false })
    .replace(",", "");
  if (user_id) {
    return d().prepare(
      "SELECT * FROM tickets WHERE assignee_id=? AND created_at>=? ORDER BY id"
    ).all(user_id, since);
  }
  return d().prepare("SELECT * FROM tickets WHERE created_at>=? ORDER BY id").all(since);
}

const countOpenTickets = () =>
  d().prepare("SELECT COUNT(*) as c FROM tickets WHERE status IN ('new','assigned','waiting','in_work')").get().c;

// ── Панели ──
function saveWlPanel(user_id, chat_id, message_id) {
  d().prepare(`
    INSERT INTO wl_panels (user_id,chat_id,message_id) VALUES (?,?,?)
    ON CONFLICT(user_id,chat_id) DO UPDATE SET message_id=excluded.message_id
  `).run(user_id, chat_id, message_id);
}

const getWlPanel = (uid, cid) =>
  d().prepare("SELECT message_id FROM wl_panels WHERE user_id=? AND chat_id=?").get(uid, cid)?.message_id || null;

// ── Сообщения для удаления ──
const saveUserMessage    = (uid, mid)  => d().prepare("INSERT INTO user_messages (user_id,message_id,created_at) VALUES (?,?,?)").run(uid, mid, nowStr());
const getLastUserMessages = (uid, n=20) => d().prepare("SELECT message_id FROM user_messages WHERE user_id=? ORDER BY id DESC LIMIT ?").all(uid, n).map(r => r.message_id);
const clearUserMessages   = (uid)      => d().prepare("DELETE FROM user_messages WHERE user_id=?").run(uid);

// ── Запросы на подключение ──
function addJoinRequest(user_id, chat_id, user_name) {
  d().prepare("DELETE FROM join_requests WHERE user_id=?").run(user_id);
  const info = d().prepare(
    "INSERT INTO join_requests (user_id,chat_id,user_name,created_at,status) VALUES (?,?,?,?,'pending')"
  ).run(user_id, chat_id, user_name, nowStr());
  return info.lastInsertRowid;
}

const getJoinRequest    = (id)          => d().prepare("SELECT * FROM join_requests WHERE id=?").get(id) || null;
const updateJoinRequest = (id, status)  => d().prepare("UPDATE join_requests SET status=? WHERE id=?").run(status, id);

// ── Утилиты ──
function nowStr() {
  return new Date().toLocaleString("ru-RU", {
    day:"2-digit", month:"2-digit", year:"numeric",
    hour:"2-digit", minute:"2-digit", second:"2-digit", hour12: false
  }).replace(",","");
}

module.exports = {
  initDb, nowStr,
  // settings
  getSetting, setSetting, isBotActive, toggleBot, isLogging, toggleLogging, isSilentMode, toggleSilent,
  // users
  getWlUsers, getWlUser, isWlUser, getWlChat, getWlUserIds, addWlUser, removeWlUser,
  setWlRole, setDisplayName, toggleIncog, getUsersByFlag, hasFlag,
  // sites
  getSites, getSite, addSite, removeSite, updateSiteChat, getAllowedChats, findRule,
  // tickets
  createTicket, getTicket, updateTicket, getMyTickets, getOpenTicketsAll,
  getArchiveTickets, getTicketsForReport, countOpenTickets,
  // panels
  saveWlPanel, getWlPanel,
  // messages
  saveUserMessage, getLastUserMessages, clearUserMessages,
  // requests
  addJoinRequest, getJoinRequest, updateJoinRequest,
};