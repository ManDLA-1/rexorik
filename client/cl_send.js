// Формирование клавиатур и текстов
const { ROLES } = require("../config");
const {
  nowStr, isBotActive, isLogging, isSilentMode,
  getWlUser, getWlUsers, getSites, getSite,
  getMyTickets, getOpenTicketsAll, getArchiveTickets,
  getTicketsForReport, countOpenTickets,
  getWlPanel, saveWlPanel,
} = require("../db/db");
const { sendMessage, editMessage } = require("../server/sv_send");
const { makeLink, roleFlags } = require("./cl_get");

// ══════════════════════════════════════════
//  КЛАВИАТУРЫ
// ══════════════════════════════════════════

function kbMain(user_id) {
  const u     = getWlUser(user_id);
  const role  = u?.role || "SPEC";
  const flags = roleFlags(role);
  const buttons = [];

  if (flags.is_admin) {
    buttons.push([{ type:"callback", text: isBotActive() ? "🟢 БОТ ВКЛ" : "🔴 БОТ ВЫКЛ", payload:"toggle_bot" }]);
    buttons.push([
      { type:"callback", text: isLogging()    ? "📋 Логи: ВКЛ"   : "📋 Логи: ВЫКЛ",   payload:"toggle_logging" },
      { type:"callback", text: isSilentMode() ? "🔕 Тихий: ВКЛ"  : "🔔 Тихий: ВЫКЛ",  payload:"toggle_silent"  },
    ]);
    buttons.push([{ type:"callback", text:"⚙️ Управление системой", payload:"admin_panel" }]);
  }

  if (flags.incog) {
    buttons.push([{
      type:"callback",
      text: u?.incog_on ? "🎭 Инкогнито: ВКЛ" : "🎭 Инкогнито: ВЫКЛ",
      payload:"toggle_incog"
    }]);
  }

  buttons.push([
    { type:"callback", text:"📋 Мои заявки", payload:"my_tickets" },
    { type:"callback", text:"📦 Мой архив",  payload:"my_archive" },
  ]);
  buttons.push([{ type:"callback", text:"📊 Моя статистика", payload:"my_report" }]);

  if (role === "ROOT" || role === "SW") {
    buttons.push([
      { type:"callback", text:"📋 Все заявки", payload:"all_tickets" },
      { type:"callback", text:"📊 KPI",        payload:"kpi_menu" },
    ]);
    buttons.push([
      { type:"callback", text:"📢 → Техникам",  payload:"announce_techs" },
      { type:"callback", text:"📢 → Площадке",  payload:"announce_site_choose" },
    ]);
  } else if (role === "TECH") {
    buttons.push([{ type:"callback", text:"📢 → Площадке", payload:"announce_site_choose" }]);
  }

  return { type:"inline_keyboard", payload:{ buttons } };
}

function kbApproveTicket(ticket_id) {
  return { type:"inline_keyboard", payload:{ buttons:[[
    { type:"callback", text:"✅ Принять",   payload:`apr_accept_${ticket_id}` },
    { type:"callback", text:"❌ Отклонить", payload:`apr_reject_${ticket_id}` },
  ]]}};
}

function kbAssignTech(ticket_id) {
  const users = getWlUsers().filter(u => u.role !== "SPEC");
  const rows  = users.map(u => [{
    type:"callback",
    text:`${u.display_name} [${ROLES[u.role]?.label || ""}]`,
    payload:`assign_to_${u.user_id}_${ticket_id}`
  }]);
  rows.push([{ type:"callback", text:"❌ Отмена", payload:"back_main" }]);
  return { type:"inline_keyboard", payload:{ buttons: rows } };
}

function kbTechTicket(ticket_id) {
  return { type:"inline_keyboard", payload:{ buttons:[[
    { type:"callback", text:"⏳ В очередь",   payload:`tk_wait_${ticket_id}` },
    { type:"callback", text:"⚙️ В работу",    payload:`tk_work_${ticket_id}` },
    { type:"callback", text:"💬 Комментарий", payload:`tk_comment_${ticket_id}` },
  ]]}};
}

function kbTicketDetail(ticket, user_id = null) {
  const buttons = [];
  const s   = ticket.status;
  const tid = ticket.id;
  const u   = user_id ? getWlUser(user_id) : null;

  if (s === "assigned") {
    buttons.push({ type:"callback", text:"⏳ В очередь", payload:`tk_wait_${tid}` });
    buttons.push({ type:"callback", text:"⚙️ В работу",  payload:`tk_work_${tid}` });
  } else if (s === "waiting") {
    buttons.push({ type:"callback", text:"⚙️ В работу",  payload:`tk_work_${tid}` });
  } else if (s === "in_work") {
    buttons.push({ type:"callback", text:"✅ Выполнено", payload:`tk_done_${tid}` });
  }

  if (["assigned","waiting","in_work"].includes(s)) {
    buttons.push({ type:"callback", text:"💬 Комментарий", payload:`tk_comment_${tid}` });
    if (u?.role === "ROOT" || u?.role === "SW") {
      buttons.push({ type:"callback", text:"❌ Отклонить", payload:`trej_${tid}` });
    }
  }
  buttons.push({ type:"callback", text:"🔙 Назад", payload:"my_tickets" });
  return { type:"inline_keyboard", payload:{ buttons: [buttons] } };
}

const kbArchiveDetail = () => ({ type:"inline_keyboard", payload:{ buttons:[[
  { type:"callback", text:"🔙 Назад к архиву", payload:"my_archive" }
]]}});

function kbRating(ticket_id) {
  return { type:"inline_keyboard", payload:{ buttons:[[
    { type:"callback", text:"⭐1", payload:`rate_1_${ticket_id}` },
    { type:"callback", text:"⭐2", payload:`rate_2_${ticket_id}` },
    { type:"callback", text:"⭐3", payload:`rate_3_${ticket_id}` },
    { type:"callback", text:"⭐4", payload:`rate_4_${ticket_id}` },
    { type:"callback", text:"⭐5", payload:`rate_5_${ticket_id}` },
  ]]}};
}

const kbReportMenu = (prefix = "my_report_") => ({ type:"inline_keyboard", payload:{ buttons:[
  [
    { type:"callback", text:"📅 День",   payload:`${prefix}1`  },
    { type:"callback", text:"📆 Неделя", payload:`${prefix}7`  },
    { type:"callback", text:"🗓 Месяц",  payload:`${prefix}30` },
  ],
  [{ type:"callback", text:"🔙 Назад", payload:"back_main" }],
]}});

const kbAdminPanel = () => ({ type:"inline_keyboard", payload:{ buttons:[
  [{ type:"callback", text:"👥 Пользователи", payload:"admin_users" }],
  [{ type:"callback", text:"🏫 Площадки",     payload:"admin_sites" }],
  [{ type:"callback", text:"🔙 Назад",         payload:"back_main"   }],
]}});

function kbAdminUsers() {
  const rows = getWlUsers().map(u => [{
    type:"callback",
    text:`👤 ${u.display_name} [${ROLES[u.role]?.label || "?"}]`,
    payload:`manage_user_${u.user_id}`
  }]);
  rows.push([{ type:"callback", text:"➕ Добавить вручную", payload:"add_user_manual" }]);
  rows.push([{ type:"callback", text:"🔙 Назад",            payload:"admin_panel"     }]);
  return { type:"inline_keyboard", payload:{ buttons: rows } };
}

function kbManageUser(target_id) {
  const rows = Object.entries(ROLES).map(([rid, rd]) => [{
    type:"callback", text:`Роль → ${rd.label}`, payload:`set_role_${target_id}_${rid}`
  }]);
  rows.push([{ type:"callback", text:"✏️ Изменить имя", payload:`rename_user_${target_id}` }]);
  rows.push([{ type:"callback", text:"❌ Удалить",       payload:`del_user_${target_id}`    }]);
  rows.push([{ type:"callback", text:"🔙 Назад",         payload:"admin_users"              }]);
  return { type:"inline_keyboard", payload:{ buttons: rows } };
}

function kbAdminSites() {
  const rows = getSites().map(s => [{
    type:"callback",
    text:`🏫 ${s.site_name} [${s.prefix}] кл: ${s.keyword}`,
    payload:`site_mgr_${s.site_id}`
  }]);
  rows.push([{ type:"callback", text:"➕ Добавить площадку", payload:"add_site"     }]);
  rows.push([{ type:"callback", text:"🔙 Назад",              payload:"admin_panel"  }]);
  return { type:"inline_keyboard", payload:{ buttons: rows } };
}

function kbSiteMgr(site_id) {
  const s = getSite(site_id);
  return { type:"inline_keyboard", payload:{ buttons:[
    [{ type:"callback", text:`💬 chat_id: ${s?.chat_id || "—"} (изменить)`, payload:`change_chatid_${site_id}` }],
    [{ type:"callback", text:"🗑 Удалить площадку", payload:`del_site_${site_id}` }],
    [{ type:"callback", text:"🔙 Назад",             payload:"admin_sites"         }],
  ]}};
}

const kbJoinRequest = (req_id) => ({ type:"inline_keyboard", payload:{ buttons:[
  [
    { type:"callback", text:"✅ Подключить", payload:`req_accept_${req_id}` },
    { type:"callback", text:"❌ Отказать",   payload:`req_deny_${req_id}`   },
  ],
  [{ type:"callback", text:"📝 Подробнее", payload:`req_detail_${req_id}` }],
]}});

function kbSiteChooseForAnnounce() {
  const buttons = getSites().map(s => [{
    type:"callback", text:`🏫 ${s.site_name}`, payload:`announce_site_${s.site_id}`
  }]);
  buttons.push([{ type:"callback", text:"❌ Отмена", payload:"back_main" }]);
  return { type:"inline_keyboard", payload:{ buttons } };
}

// ══════════════════════════════════════════
//  ТЕКСТЫ
// ══════════════════════════════════════════

function textMainPanel(user_id) {
  const u     = getWlUser(user_id);
  const role  = u?.role || "SPEC";
  const flags = roleFlags(role);
  const rl    = ROLES[role]?.label || "";
  const dname = u?.display_name || "—";
  let text    = `🖥️ *Панель REXORIK*\n━━━━━━━━━━━━━━━━━━━━━━\n👤 ${dname} | 🎖 ${rl}\n`;
  if (flags.is_admin) {
    const a = isBotActive()  ? "🟢" : "🔴";
    const l = isLogging()    ? "✅" : "❌";
    const s = isSilentMode() ? "🔕" : "🔔";
    text += `Бот: ${a} | Логи: ${l} | Тихий: ${s}\n`;
  }
  text += `📋 Открытых заявок: *${countOpenTickets()}*\n━━━━━━━━━━━━━━━━━━━━━━\nВыберите действие:`;
  return text;
}

function textTicketDetail(t) {
  const code        = t.ticket_code || `#${t.id}`;
  const created     = t.created_at  || "—";
  const assigned_at = t.assigned_at || "—";
  const in_work_at  = t.in_work_at  || "—";
  const rv          = parseInt(t.rating) || 0;
  const rating_s    = rv ? "⭐".repeat(rv) + ` (${rv}/5)` : "Не оценено";
  const site_name   = t.site_name   || "—";
  const assignee    = t.assignee_name || "—";
  const comment     = t.comment     || "—";
  const link        = makeLink(t.chat_id, t.message_id);
  const statusMap   = {
    new:"🆕 Новая", assigned:"📌 На рассмотрении", waiting:"⏳ В очереди",
    in_work:"⚙️ В работе", done:"✅ Выполнена", rejected:"❌ Отклонена",
  };
  let text = (
    `📃 *Заявка ${code}*\n` +
    `👤 От: *${t.user_name || "—"}* (ID: \`${t.user_id || "—"}\`)\n` +
    `📅 Получена: \`${created}\`\n` +
    `⭐ Оценка: ${rating_s}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🏫 Площадка: *${site_name}*\n` +
    `📌 Статус: *${statusMap[t.status] || t.status}*\n` +
    `Выдана технику: \`${assigned_at}\`\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `💭 *Текст заявки:*\n${t.text || "—"}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🔧 Исполнитель: ${assignee}\n` +
    `⚙️ В работе: \`${in_work_at}\`\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `💬 *Комментарий техника:*\n${comment}\n`
  );
  if (t.status === "rejected" && t.reject_reason) {
    text += `🚫 *Причина отклонения:* ${t.reject_reason}\n`;
  }
  text += `━━━━━━━━━━━━━━━━━━━━━━\n🔗 [Перейти к сообщению](${link})`;
  return text;
}

function textMyTickets(user_id) {
  const tickets = getMyTickets(user_id, ["assigned","waiting","in_work"]);
  if (!tickets.length) return "📋 *Мои открытые заявки*\n━━━━━━━━━━━━━━━━━━━━━━\n_нет открытых заявок_";
  const icons = { assigned:"📌", waiting:"⏳", in_work:"⚙️" };
  const lines = tickets.map(t => `  ${icons[t.status]||""} ${t.ticket_code||`#${t.id}`} — от ${t.created_at}`);
  return "📋 *Мои открытые заявки*\n━━━━━━━━━━━━━━━━━━━━━━\n" + lines.join("\n");
}

function kbMyTickets(user_id) {
  const tickets = getMyTickets(user_id, ["assigned","waiting","in_work"]);
  const icons   = { assigned:"📌", waiting:"⏳", in_work:"⚙️" };
  const rows    = tickets.map(t => [{
    type:"callback",
    text:`${icons[t.status]||""} ${t.ticket_code||`#${t.id}`}`,
    payload:`view_${t.id}`
  }]);
  rows.push([{ type:"callback", text:"🔙 Назад", payload:"back_main" }]);
  return { type:"inline_keyboard", payload:{ buttons: rows } };
}

function textAllTickets() {
  const tickets = getOpenTicketsAll();
  if (!tickets.length) return "📋 *Все открытые заявки*\n━━━━━━━━━━━━━━━━━━━━━━\n_нет заявок_";
  const icons = { new:"🆕", assigned:"📌", waiting:"⏳", in_work:"⚙️" };
  const lines = tickets.map(t =>
    `  ${icons[t.status]||""} ${t.ticket_code||`#${t.id}`} → ${t.assignee_name||"—"} | ${t.created_at}`
  );
  return "📋 *Все открытые заявки*\n━━━━━━━━━━━━━━━━━━━━━━\n" + lines.join("\n");
}

function kbAllTickets() {
  const tickets = getOpenTicketsAll();
  const icons   = { new:"🆕", assigned:"📌", waiting:"⏳", in_work:"⚙️" };
  const rows    = tickets.map(t => [{
    type:"callback",
    text:`${icons[t.status]||""} ${t.ticket_code||`#${t.id}`}`,
    payload:`view_${t.id}`
  }]);
  rows.push([{ type:"callback", text:"🔙 Назад", payload:"back_main" }]);
  return { type:"inline_keyboard", payload:{ buttons: rows } };
}

function textMyArchive(user_id) {
  const tickets = getArchiveTickets(user_id);
  if (!tickets.length) return "📦 *Мой архив*\n━━━━━━━━━━━━━━━━━━━━━━\n_пусто_";
  const lines = tickets.map(t => {
    const ic = t.status === "done" ? "✅" : "❌";
    return `  ${ic} ${t.ticket_code||`#${t.id}`} | ${t.done_at||t.rejected_at||"—"}`;
  });
  return "📦 *Мой архив*\n━━━━━━━━━━━━━━━━━━━━━━\n" + lines.join("\n");
}

function kbMyArchive(user_id) {
  const tickets = getArchiveTickets(user_id);
  const rows    = tickets.map(t => [{
    type:"callback",
    text:`${t.status==="done"?"✅":"❌"} ${t.ticket_code||`#${t.id}`}`,
    payload:`arch_view_${t.id}`
  }]);
  rows.push([{ type:"callback", text:"🔙 Назад", payload:"back_main" }]);
  return { type:"inline_keyboard", payload:{ buttons: rows } };
}

function textReport(days, user_id = null) {
  const tickets = getTicketsForReport(days, user_id);
  const label   = { 1:"день", 7:"неделю", 30:"месяц" }[days] || `${days} дней`;
  const total   = tickets.length;
  const done    = tickets.filter(t => t.status === "done").length;
  const rej     = tickets.filter(t => t.status === "rejected").length;
  const rated   = tickets.filter(t => t.rating);
  const avg     = rated.length ? (rated.reduce((s,t) => s + parseInt(t.rating), 0) / rated.length).toFixed(1) : "—";
  let text = `${user_id ? "📊 *Моя статистика*" : "📊 *KPI сводка*"} за ${label}\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `📋 Всего: *${total}*\n✅ Выполнено: *${done}*\n❌ Отклонено: *${rej}*\n🔄 Открытых: *${total-done-rej}*\n⭐ Средняя оценка: *${avg}*\n`;
  if (!user_id) {
    text += "━━━━━━━━━━━━━━━━━━━━━━\n👷 *По техникам:*\n";
    const counts = {};
    for (const t of tickets) {
      if (t.assignee_name) {
        if (!counts[t.assignee_name]) counts[t.assignee_name] = { total:0, done:0 };
        counts[t.assignee_name].total++;
        if (t.status === "done") counts[t.assignee_name].done++;
      }
    }
    for (const [name, c] of Object.entries(counts)) {
      text += `  • ${name}: ${c.total} заявок, ${c.done} выполнено\n`;
    }
  }
  return text;
}

function textAdminUsers() {
  const users = getWlUsers();
  const lines = users.map(u => {
    const rl = ROLES[u.role]?.label || "?";
    return `• *${u.display_name}* [${rl}] (ID:\`${u.user_id}\`)\n  chat\\_id: \`${u.chat_id}\``;
  });
  return "👥 *Пользователи системы*\n━━━━━━━━━━━━━━━━━━━━━━\n" + lines.join("\n\n");
}

// ══════════════════════════════════════════
//  ПАНЕЛЬ (одно сообщение на пользователя)
// ══════════════════════════════════════════

async function sendOrUpdatePanel(user_id, text, keyboard) {
  const chat_id   = getWlChat(user_id);
  if (!chat_id) return;
  const panel_mid = getWlPanel(user_id, chat_id);
  if (panel_mid) {
    const ok = await editMessage(panel_mid, chat_id, text, keyboard);
    if (ok) return;
  }
  const new_mid = await sendMessage(chat_id, text, keyboard);
  if (new_mid) saveWlPanel(user_id, chat_id, new_mid);
}

const showMainPanel       = (uid)           => sendOrUpdatePanel(uid, textMainPanel(uid), kbMain(uid));
const showMyTickets       = (uid)           => sendOrUpdatePanel(uid, textMyTickets(uid), kbMyTickets(uid));
const showAllTickets      = (uid)           => sendOrUpdatePanel(uid, textAllTickets(), kbAllTickets());
const showMyArchive       = (uid)           => sendOrUpdatePanel(uid, textMyArchive(uid), kbMyArchive(uid));
const showReportMenuPanel = (uid, prefix)   => sendOrUpdatePanel(uid, "📊 *Выберите период:*", kbReportMenu(prefix));
const showMyReport        = (uid, days)     => sendOrUpdatePanel(uid, textReport(days, uid), kbReportMenu("my_report_"));
const showKpiReport       = (uid, days)     => sendOrUpdatePanel(uid, textReport(days), kbReportMenu("kpi_report_"));
const showAdminPanel      = (uid)           => sendOrUpdatePanel(uid, "⚙️ *Управление системой*\n━━━━━━━━━━━━━━━━━━━━━━", kbAdminPanel());
const showAdminUsers      = (uid)           => sendOrUpdatePanel(uid, textAdminUsers(), kbAdminUsers());
const showAdminSites      = (uid)           => sendOrUpdatePanel(uid, "🏫 *Управление площадками*\n━━━━━━━━━━━━━━━━━━━━━━", kbAdminSites());

async function showTicketDetailPanel(uid, ticket_id) {
  const t = require("../db/db").getTicket(ticket_id);
  if (!t) { showMainPanel(uid); return; }
  await sendOrUpdatePanel(uid, textTicketDetail(t), kbTicketDetail(t, uid));
}

async function showArchiveTicket(uid, ticket_id) {
  const t = require("../db/db").getTicket(ticket_id);
  if (!t) { showMyArchive(uid); return; }
  await sendOrUpdatePanel(uid, textTicketDetail(t), kbArchiveDetail());
}

async function showManageUser(admin_id, target_id) {
  const u  = getWlUser(target_id);
  if (!u) { showAdminUsers(admin_id); return; }
  const rl = ROLES[u.role]?.label || "?";
  await sendOrUpdatePanel(admin_id,
    `👤 *${u.display_name}*\nРоль: *${rl}*\nID: \`${u.user_id}\`\nchat\\_id: \`${u.chat_id}\`\n━━━━━━━━━━━━━━━━━━━━━━`,
    kbManageUser(target_id)
  );
}

async function showSiteMgr(uid, site_id) {
  const s = getSite(site_id);
  if (!s) { showAdminSites(uid); return; }
  await sendOrUpdatePanel(uid,
    `🏫 *${s.site_name}*\nКлючевое слово: \`${s.keyword}\`\nПрефикс: \`${s.prefix}\`\nchat\\_id: \`${s.chat_id}\`\n━━━━━━━━━━━━━━━━━━━━━━`,
    kbSiteMgr(site_id)
  );
}

// Объявления
function sendAnnouncementToTechs(text, sender_role) {
  const from = sender_role === "ROOT" ? "Разработчика REXORIK" : "Руководителя IT-отдела";
  const msg  = `📢 *СООБЩЕНИЕ ОТ ${from.toUpperCase()}* 📢\n━━━━━━━━━━━━━━━━━━━━━━\n\n*${text}*\n\n━━━━━━━━━━━━━━━━━━━━━━\n🕐 ${nowStr()} | 🦊 REXORIK`;
  const db   = require("../db/db");
  for (const u of db.getWlUsers()) {
    if (u.role === "TECH" && u.chat_id) sendMessage(u.chat_id, msg);
  }
}

function sendAnnouncementToSite(text, site_id, sender_role) {
  const s = getSite(site_id);
  if (!s) return;
  const from = sender_role === "ROOT" ? "Разработчика REXORIK"
             : sender_role === "SW"   ? "Руководителя IT-отдела"
             :                          "Технического специалиста";
  const msg = `📢 *ОБЪЯВЛЕНИЕ ДЛЯ ПЛОЩАДКИ: ${s.site_name}* 📢\n━━━━━━━━━━━━━━━━━━━━━━\n\n*${text}*\n\n━━━━━━━━━━━━━━━━━━━━━━\n🕐 ${nowStr()} | 🦊 REXORIK`;
  sendMessage(s.chat_id, msg);
}

module.exports = {
  // keyboards
  kbMain, kbApproveTicket, kbAssignTech, kbTechTicket, kbTicketDetail,
  kbArchiveDetail, kbRating, kbReportMenu, kbAdminPanel, kbAdminUsers,
  kbManageUser, kbAdminSites, kbSiteMgr, kbJoinRequest, kbSiteChooseForAnnounce,
  kbMyTickets, kbAllTickets, kbMyArchive,
  // texts
  textMainPanel, textTicketDetail, textMyTickets, textAllTickets,
  textMyArchive, textReport, textAdminUsers,
  // panels
  sendOrUpdatePanel,
  showMainPanel, showMyTickets, showAllTickets, showMyArchive,
  showTicketDetailPanel, showArchiveTicket, showReportMenuPanel,
  showMyReport, showKpiReport, showAdminPanel, showAdminUsers,
  showAdminSites, showManageUser, showSiteMgr,
  // announcements
  sendAnnouncementToTechs, sendAnnouncementToSite,
};