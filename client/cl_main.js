// Главный обработчик событий (сообщения + кнопки)
const {
  nowStr, isWlUser, getWlUser, getWlChat, addWlUser, removeWlUser,
  setWlRole, setDisplayName, toggleIncog, getUsersByFlag,
  isBotActive, toggleBot, isLogging, toggleLogging, isSilentMode, toggleSilent,
  getSite, getSites, addSite, removeSite, updateSiteChat, getAllowedChats, findRule,
  createTicket, getTicket, updateTicket, countOpenTickets,
  getLastUserMessages, clearUserMessages, saveUserMessage,
  addJoinRequest, getJoinRequest, updateJoinRequest,
} = require("../db/db");

const { sendMessage, editMessage, deleteMessage, replyTo } = require("../server/sv_send");
const { log } = require("../server/sv_main");
const { ROLES, ADMIN_USER_ID } = require("../config");

const {
  kbApproveTicket, kbAssignTech, kbTechTicket, kbTicketDetail,
  kbRating, kbJoinRequest, kbSiteChooseForAnnounce,
  showMainPanel, showMyTickets, showAllTickets, showMyArchive,
  showTicketDetailPanel, showArchiveTicket, showReportMenuPanel,
  showMyReport, showKpiReport, showAdminPanel, showAdminUsers,
  showAdminSites, showManageUser, showSiteMgr, sendOrUpdatePanel,
  sendAnnouncementToTechs, sendAnnouncementToSite,
} = require("./cl_send");

// ── Состояния ввода ──
const announceWaiting     = new Map();
const commentWaiting      = new Map();
const rejectWaiting       = new Map();
const addSiteWaiting      = new Map();
const addUserWaiting      = new Map();
const renameUserWaiting   = new Map();
const changeChatIdWaiting = new Map();

// ════════════════════════════════════════
//  УВЕДОМЛЕНИЯ
// ════════════════════════════════════════

function notifySsee(text) {
  for (const u of getUsersByFlag("ssee")) {
    if (u.chat_id) sendMessage(u.chat_id, text);
  }
}

async function notifyApproveUsers(ticket_id, user_name, user_id, text, chat_id, message_id, rule) {
  const { makeLink } = require("./cl_get");
  const t    = getTicket(ticket_id);
  const code = t?.ticket_code || `#${ticket_id}`;
  const link = makeLink(chat_id, message_id);

  const notify_text = (
    `🆕 *Новая заявка ${code}*\n━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🏫 Площадка: *${rule.site_name}*\n` +
    `👤 От: *${user_name}* — ID: \`${user_id}\`\n` +
    `💭 [Сообщение](${link})\n\n` +
    `_${text.slice(0,300)}${text.length>300?"...":""}_\n━━━━━━━━━━━━━━━━━━━━━━`
  );
  const keyboard = kbApproveTicket(ticket_id);
  let lastMid    = null;

  for (const u of require("../db/db").getWlUsers()) {
    if (!["ROOT","SW"].includes(u.role) || !u.chat_id) continue;
    const mid = await sendMessage(u.chat_id, notify_text, keyboard);
    if (mid) lastMid = mid;
  }
  if (lastMid && t) updateTicket(ticket_id, { approve_mid: lastMid });
  log(`🆕 Создана заявка ${code} от ${user_name} площадка ${rule.site_name}`);
}

async function deleteUserIncoming(user_id, incoming_mid) {
  await deleteMessage(incoming_mid);
  for (const mid of getLastUserMessages(user_id)) await deleteMessage(mid);
  clearUserMessages(user_id);
}

// ════════════════════════════════════════
//  ОБРАБОТКА СООБЩЕНИЙ
// ════════════════════════════════════════

async function handleMessage(message) {
  const chat_id    = parseInt(message?.recipient?.chat_id);
  if (!chat_id) return;
  const body       = message?.body || {};
  const text       = (body.text || "").trim();
  const message_id = body.mid || message.id || "";
  const sender     = message?.sender || {};
  const user_id    = sender.user_id;
  const user_name  = sender.name || "Неизвестно";

  const allowed = getAllowedChats();
  const u       = isWlUser(user_id) ? getWlUser(user_id) : null;
  const role    = u?.role || null;
  const flags   = role ? ROLES[role] : {};

  // SPEC — игнорируем
  if (u && role === "SPEC") { await deleteMessage(message_id); return; }

  // WL в своей личке
  if (u && chat_id === getWlChat(user_id)) {
    await deleteUserIncoming(user_id, message_id);

    if (rejectWaiting.has(user_id)) {
      const ticket_id = rejectWaiting.get(user_id); rejectWaiting.delete(user_id);
      const t = getTicket(ticket_id);
      if (t) {
        updateTicket(ticket_id, { status:"rejected", rejected_at: nowStr(), reject_reason: text });
        if (t.approve_mid) await deleteMessage(t.approve_mid);
        await replyTo(t.chat_id, t.message_id,
          `❌ *Заявка ${t.ticket_code} отклонена.*\nПричина: ${text}\n━━━━━━━━━━━━━━━━━━━━━━\n🦊 REXORIK`
        );
        log(`❌ Заявка ${t.ticket_code} отклонена. Причина: ${text}`);
        notifySsee(`❌ Заявка ${t.ticket_code} отклонена. Причина: ${text}`);
      }
      await showMainPanel(user_id); return;
    }

    if (commentWaiting.has(user_id)) {
      const ticket_id = commentWaiting.get(user_id); commentWaiting.delete(user_id);
      updateTicket(ticket_id, { comment: text });
      await showTicketDetailPanel(user_id, ticket_id); return;
    }

    if (announceWaiting.has(user_id)) {
      const state = announceWaiting.get(user_id); announceWaiting.delete(user_id);
      if (state.type === "techs") {
        sendAnnouncementToTechs(text, role);
        await sendOrUpdatePanel(user_id, "✅ *Объявление отправлено техникам.*",
          { type:"inline_keyboard", payload:{ buttons:[[{ type:"callback", text:"🔙 В меню", payload:"back_main" }]] }}
        );
      } else if (state.type === "site") {
        sendAnnouncementToSite(text, state.site_id, role);
        const s = getSite(state.site_id);
        await sendOrUpdatePanel(user_id, `✅ *Объявление отправлено на площадку ${s?.site_name || ""}.*`,
          { type:"inline_keyboard", payload:{ buttons:[[{ type:"callback", text:"🔙 В меню", payload:"back_main" }]] }}
        );
      }
      return;
    }

    if (renameUserWaiting.has(user_id)) {
      const target_id = renameUserWaiting.get(user_id); renameUserWaiting.delete(user_id);
      setDisplayName(target_id, text);
      const tu = getWlUser(target_id);
      if (tu) await sendMessage(tu.chat_id, `✏️ *Ваше имя в системе изменено на:* ${text}\n🦊 REXORIK`);
      await showManageUser(user_id, target_id); return;
    }

    if (changeChatIdWaiting.has(user_id)) {
      const site_id = changeChatIdWaiting.get(user_id);
      const n = parseInt(text);
      if (isNaN(n)) {
        await sendOrUpdatePanel(user_id, "❌ Введите число:",
          { type:"inline_keyboard", payload:{ buttons:[[{ type:"callback", text:"❌ Отмена", payload:`site_mgr_${site_id}` }]] }}
        );
      } else {
        changeChatIdWaiting.delete(user_id);
        updateSiteChat(site_id, n);
        await sendOrUpdatePanel(user_id, `✅ chat\\_id обновлён: \`${n}\``,
          { type:"inline_keyboard", payload:{ buttons:[[{ type:"callback", text:"🔙 К площадке", payload:`site_mgr_${site_id}` }]] }}
        );
      }
      return;
    }

    if (addSiteWaiting.has(user_id)) {
      const state = addSiteWaiting.get(user_id);
      const step  = state.step;
      if (step === "name") {
        addSiteWaiting.set(user_id, { step:"prefix", name: text });
        await sendOrUpdatePanel(user_id, `🏫 *${text}*\n\nВведите префикс (1-2 буквы):`,
          { type:"inline_keyboard", payload:{ buttons:[[{ type:"callback", text:"❌ Отмена", payload:"admin_sites" }]] }}
        );
      } else if (step === "prefix") {
        addSiteWaiting.set(user_id, { ...state, step:"keyword", prefix: text.slice(0,2).toUpperCase() });
        await sendOrUpdatePanel(user_id, `Префикс: *${text.slice(0,2).toUpperCase()}*\n\nВведите ключевое слово:`,
          { type:"inline_keyboard", payload:{ buttons:[[{ type:"callback", text:"❌ Отмена", payload:"admin_sites" }]] }}
        );
      } else if (step === "keyword") {
        addSiteWaiting.set(user_id, { ...state, step:"chat", keyword: text });
        await sendOrUpdatePanel(user_id, `Ключевое слово: *${text}*\n\nВведите chat\\_id:`,
          { type:"inline_keyboard", payload:{ buttons:[[{ type:"callback", text:"❌ Отмена", payload:"admin_sites" }]] }}
        );
      } else if (step === "chat") {
        const cid = parseInt(text);
        if (isNaN(cid)) {
          await sendOrUpdatePanel(user_id, "❌ Введите число:",
            { type:"inline_keyboard", payload:{ buttons:[[{ type:"callback", text:"❌ Отмена", payload:"admin_sites" }]] }}
          );
        } else {
          const sid = state.keyword.toLowerCase().replace(/\s+/g, "_");
          addSite(sid, state.name, state.keyword, state.prefix, cid);
          addSiteWaiting.delete(user_id);
          await sendOrUpdatePanel(user_id, `✅ Площадка *${state.name}* добавлена!`,
            { type:"inline_keyboard", payload:{ buttons:[[{ type:"callback", text:"🔙 К площадкам", payload:"admin_sites" }]] }}
          );
          log(`🏫 Добавлена площадка ${state.name} [${state.keyword}]`);
        }
      }
      return;
    }

    if (addUserWaiting.has(user_id)) {
      const state = addUserWaiting.get(user_id);
      if (state.step === "uid") {
        const n = parseInt(text);
        if (isNaN(n)) {
          await sendOrUpdatePanel(user_id, "❌ Введите число:",
            { type:"inline_keyboard", payload:{ buttons:[[{ type:"callback", text:"❌ Отмена", payload:"admin_panel" }]] }}
          );
        } else {
          addUserWaiting.set(user_id, { step:"chatid", uid: n });
          await sendOrUpdatePanel(user_id, `ID: \`${n}\`\n\nВведите chat\\_id:`,
            { type:"inline_keyboard", payload:{ buttons:[[{ type:"callback", text:"❌ Отмена", payload:"admin_panel" }]] }}
          );
        }
      } else if (state.step === "chatid") {
        const n = parseInt(text);
        if (isNaN(n)) {
          await sendOrUpdatePanel(user_id, "❌ Введите число:",
            { type:"inline_keyboard", payload:{ buttons:[[{ type:"callback", text:"❌ Отмена", payload:"admin_panel" }]] }}
          );
        } else {
          addUserWaiting.set(user_id, { ...state, step:"name", chatid: n });
          await sendOrUpdatePanel(user_id, `chat\\_id: \`${n}\`\n\nВведите имя:`,
            { type:"inline_keyboard", payload:{ buttons:[[{ type:"callback", text:"❌ Отмена", payload:"admin_panel" }]] }}
          );
        }
      } else if (state.step === "name") {
        addWlUser(state.uid, state.chatid, text, "SPEC");
        addUserWaiting.delete(user_id);
        await sendMessage(state.chatid,
          `✅ *Доступ предоставлен!*\nВы добавлены в систему. Вам назначена роль Следящего. Ожидайте назначения.\n━━━━━━━━━━━━━━━━━━━━━━\n🦊 REXORIK`
        );
        log(`👤 Добавлен ${text} (ID:${state.uid}) роль SPEC`);
        await sendOrUpdatePanel(user_id, `✅ *${text}* добавлен как Следящий!`,
          { type:"inline_keyboard", payload:{ buttons:[[{ type:"callback", text:"👥 К пользователям", payload:"admin_users" }]] }}
        );
      }
      return;
    }

    if (text.toLowerCase() === "/menu") { await showMainPanel(user_id); return; }
    await showMainPanel(user_id);
    return;
  }

  // /menu в публичном чате
  if (u && text.toLowerCase() === "/menu") {
    await deleteMessage(message_id);
    await showMainPanel(user_id);
    return;
  }

  // Incognito в публичном чате
  if (u && allowed.includes(chat_id) && flags?.incog && u.incog_on && !text.toLowerCase().startsWith("/")) {
    await deleteMessage(message_id);
    const from = role === "ROOT" ? "Разработчика REXORIK" : "Руководителя IT-отдела";
    await sendMessage(chat_id,
      `📣 *Сообщение от ${from}:*\n━━━━━━━━━━━━━━━━━━━━━━\n\n${text}\n\n━━━━━━━━━━━━━━━━━━━━━━\n🕐 ${nowStr()} | 🦊 REXORIK`
    );
    return;
  }

  // Тихий режим
  if (isSilentMode() && allowed.includes(chat_id) && !u) {
    await deleteMessage(message_id);
    log(`🔕 Удалено сообщение от ${user_name} (ID:${user_id})`);
    return;
  }

  // Незнакомец в личке
  if (!allowed.includes(chat_id) && !u) {
    if (text.toLowerCase().includes("fox0fores")) {
      const req_id    = addJoinRequest(user_id, chat_id, user_name);
      const adminChat = getWlChat(ADMIN_USER_ID);
      if (adminChat) {
        await sendMessage(adminChat,
          `🔔 *Запрос на подключение*\n━━━━━━━━━━━━━━━━━━━━━━\n👤 *${user_name}*\n🆔 user\\_id: \`${user_id}\`\n💬 chat\\_id: \`${chat_id}\`\n━━━━━━━━━━━━━━━━━━━━━━\n🕐 ${nowStr()} | 🦊 REXORIK`,
          kbJoinRequest(req_id)
        );
      }
      await sendMessage(chat_id, `📨 *Запрос отправлен администратору.*\nОжидайте подтверждения.\n━━━━━━━━━━━━━━━━━━━━━━\n🦊 REXORIK`);
    } else {
      await sendMessage(chat_id, `🚫 *Доступ ограничен.*\nЕсли вы специалист — обратитесь: https://t.me/fox0fores\n━━━━━━━━━━━━━━━━━━━━━━\n🦊 REXORIK`);
    }
    return;
  }

  // Публичный чат → заявка
  if (!allowed.includes(chat_id)) return;
  if (!isBotActive()) return;
  const rule = findRule(chat_id, text);
  if (!rule) return;

  const { id: ticket_id, code } = createTicket({ chat_id, message_id, user_id, user_name, text, ...rule });
  await replyTo(chat_id, message_id,
    `✅ Заявка получена. 🦊 Ожидайте ответа технического специалиста.\n_(Номер заявки: ${code})_\n━━━━━━━━━━━━━━━━━━━━━━\n🕐 ${nowStr()} | 🦊 REXORIK`
  );
  await notifyApproveUsers(ticket_id, user_name, user_id, text, chat_id, message_id, rule);
}

// ════════════════════════════════════════
//  ОБРАБОТКА КНОПОК
// ════════════════════════════════════════

async function handleCallback(update) {
  const cb      = update?.callback || {};
  const payload = cb.payload || "";
  const user_id = cb.user?.user_id;
  if (!user_id) return;

  const u     = getWlUser(user_id);
  const role  = u?.role || null;
  const flags = role ? ROLES[role] : {};

  // Оценка (любой автор)
  if (payload.startsWith("rate_")) {
    const [,r, tid] = payload.split("_");
    const rating = parseInt(r), ticket_id = parseInt(tid);
    const t = getTicket(ticket_id);
    if (!t || user_id !== t.user_id || t.rating) return;
    updateTicket(ticket_id, { rating });
    const msgObj  = update?.message || {};
    const msg_mid = msgObj?.body?.mid || msgObj?.id;
    const msgChat = msgObj?.recipient?.chat_id;
    if (msg_mid && msgChat) {
      await editMessage(msg_mid, msgChat,
        `✅ *Заявка ${t.ticket_code} выполнена.*\n\nОценка: ${"⭐".repeat(rating)} (${rating}/5)\nСпасибо!\n━━━━━━━━━━━━━━━━━━━━━━\n🦊 REXORIK`,
        []
      );
    }
    log(`⭐ Оценка ${rating}/5 для ${t.ticket_code}`);
    return;
  }

  if (!u || role === "SPEC") return;

  // ── Approve: принять ──
  if (payload.startsWith("apr_accept_")) {
    if (!["ROOT","SW"].includes(role)) return;
    const ticket_id = parseInt(payload.split("_")[2]);
    const t = getTicket(ticket_id); if (!t) return;
    await sendOrUpdatePanel(user_id, `✅ *Принятие заявки ${t.ticket_code}*\n\nВыберите исполнителя:`, kbAssignTech(ticket_id));
    return;
  }

  if (payload.startsWith("assign_to_")) {
    if (!["ROOT","SW"].includes(role)) return;
    const parts     = payload.split("_");
    const tech_id   = parseInt(parts[2]);
    const ticket_id = parseInt(parts[3]);
    const t  = getTicket(ticket_id);
    const tu = getWlUser(tech_id);
    if (!t || !tu) return;
    const now = nowStr();
    updateTicket(ticket_id, { status:"assigned", assignee_id: tech_id, assignee_name: tu.display_name, approved_at: now, assigned_at: now });
    if (t.approve_mid) await deleteMessage(t.approve_mid);
    if (tu.chat_id) {
      const mid = await sendMessage(tu.chat_id,
        `📌 *Назначена заявка ${t.ticket_code}*\n━━━━━━━━━━━━━━━━━━━━━━\n🏫 ${t.site_name||"—"}\n👤 От: ${t.user_name||"—"}\n💭 ${(t.text||"").slice(0,200)}\n━━━━━━━━━━━━━━━━━━━━━━\n🕐 ${nowStr()} | 🦊 REXORIK`,
        kbTechTicket(ticket_id)
      );
      if (mid) updateTicket(ticket_id, { assign_mid: mid });
    }
    notifySsee(`📌 Заявка ${t.ticket_code} назначена → *${tu.display_name}*\nПлощадка: ${t.site_name||"—"} | ${nowStr()}`);
    log(`📌 Заявка ${t.ticket_code} назначена → ${tu.display_name}`);
    await showMainPanel(user_id);
    return;
  }

  // ── Approve: отклонить ──
  if (payload.startsWith("apr_reject_no_")) {
    if (!["ROOT","SW"].includes(role)) return;
    const ticket_id = parseInt(payload.split("_")[3]);
    rejectWaiting.delete(user_id);
    const t = getTicket(ticket_id); if (!t) return;
    updateTicket(ticket_id, { status:"rejected", rejected_at: nowStr(), reject_reason: "" });
    if (t.approve_mid) await deleteMessage(t.approve_mid);
    await replyTo(t.chat_id, t.message_id, `❌ *Заявка ${t.ticket_code} отклонена.*\n━━━━━━━━━━━━━━━━━━━━━━\n🦊 REXORIK`);
    log(`❌ Заявка ${t.ticket_code} отклонена (без причины)`);
    notifySsee(`❌ Заявка ${t.ticket_code} отклонена без причины`);
    await showMainPanel(user_id);
    return;
  }

  if (payload.startsWith("apr_reject_")) {
    if (!["ROOT","SW"].includes(role)) return;
    const ticket_id = parseInt(payload.split("_")[2]);
    const t = getTicket(ticket_id); if (!t) return;
    rejectWaiting.set(user_id, ticket_id);
    await sendOrUpdatePanel(user_id,
      `❌ *Отклонение заявки ${t.ticket_code}*\n\nНапишите причину или нажмите «Без причины»:`,
      { type:"inline_keyboard", payload:{ buttons:[
        [{ type:"callback", text:"🚫 Без причины", payload:`apr_reject_no_${ticket_id}` }],
        [{ type:"callback", text:"❌ Отмена",       payload:"back_main" }],
      ]}}
    );
    return;
  }

  if (payload.startsWith("trej_")) {
    if (!["ROOT","SW"].includes(role)) return;
    const ticket_id = parseInt(payload.slice(5));
    const t = getTicket(ticket_id); if (!t) return;
    rejectWaiting.set(user_id, ticket_id);
    await sendOrUpdatePanel(user_id,
      `❌ *Отклонение заявки ${t.ticket_code}*\n\nНапишите причину или нажмите «Без причины»:`,
      { type:"inline_keyboard", payload:{ buttons:[
        [{ type:"callback", text:"🚫 Без причины", payload:`apr_reject_no_${ticket_id}` }],
        [{ type:"callback", text:"❌ Отмена",       payload:`view_${ticket_id}` }],
      ]}}
    );
    return;
  }

  // ── Техник: действия ──
  if (payload.startsWith("tk_wait_")) {
    const ticket_id = parseInt(payload.slice(8));
    const t = getTicket(ticket_id); if (!t) return;
    if (!["assigned","in_work"].includes(t.status)) return;
    updateTicket(ticket_id, { status:"waiting" });
    if (t.assign_mid) { await deleteMessage(t.assign_mid); updateTicket(ticket_id, { assign_mid: null }); }
    log(`⏳ ${t.ticket_code} → Ожидание`);
    await showTicketDetailPanel(user_id, ticket_id);

  } else if (payload.startsWith("tk_work_")) {
    const ticket_id = parseInt(payload.slice(8));
    const t = getTicket(ticket_id); if (!t) return;
    if (!["assigned","waiting"].includes(t.status)) return;
    updateTicket(ticket_id, { status:"in_work", in_work_at: nowStr() });
    if (t.assign_mid) { await deleteMessage(t.assign_mid); updateTicket(ticket_id, { assign_mid: null }); }
    await replyTo(t.chat_id, t.message_id,
      `⚙️ Заявка ${t.ticket_code} принята в работу. Ожидайте технического специалиста.\n━━━━━━━━━━━━━━━━━━━━━━\n🕐 ${nowStr()} | 🦊 REXORIK`
    );
    notifySsee(`⚙️ Заявка ${t.ticket_code} *в работе*\n👷 ${t.assignee_name||"—"} | ${nowStr()}`);
    log(`⚙️ ${t.ticket_code} → В работе → ${t.assignee_name||"—"}`);
    await showTicketDetailPanel(user_id, ticket_id);

  } else if (payload.startsWith("tk_done_")) {
    const ticket_id = parseInt(payload.slice(8));
    const t = getTicket(ticket_id); if (!t) return;
    if (t.status !== "in_work") return;
    updateTicket(ticket_id, { status:"done", done_at: nowStr() });
    if (t.assign_mid) { await deleteMessage(t.assign_mid); updateTicket(ticket_id, { assign_mid: null }); }
    await replyTo(t.chat_id, t.message_id,
      `✅ *Заявка ${t.ticket_code} выполнена*\n\nПожалуйста, оцените работу специалиста 👇\n━━━━━━━━━━━━━━━━━━━━━━\n🕐 ${nowStr()} | 🦊 REXORIK`,
      kbRating(ticket_id)
    );
    notifySsee(`✅ Заявка ${t.ticket_code} *выполнена*\n👷 ${t.assignee_name||"—"} | ${nowStr()}`);
    log(`✅ ${t.ticket_code} → Выполнена → ${t.assignee_name||"—"}`);
    await showMyTickets(user_id);

  } else if (payload.startsWith("tk_comment_")) {
    const ticket_id = parseInt(payload.slice(11));
    const t = getTicket(ticket_id); if (!t) return;
    commentWaiting.set(user_id, ticket_id);
    await sendOrUpdatePanel(user_id,
      `💬 *Комментарий к заявке ${t.ticket_code}*\n\nНапишите комментарий:`,
      { type:"inline_keyboard", payload:{ buttons:[[{ type:"callback", text:"❌ Отмена", payload:`view_${ticket_id}` }]] }}
    );

  // ── Переключатели ──
  } else if (payload === "toggle_bot") {
    if (!flags.is_admin) return;
    toggleBot();
    log(`🔧 Бот ${isBotActive()?"включён":"выключен"} — ${u.display_name}`);
    await showMainPanel(user_id);

  } else if (payload === "toggle_logging") {
    if (!flags.is_admin) return;
    toggleLogging(); await showMainPanel(user_id);

  } else if (payload === "toggle_silent") {
    if (!flags.is_admin) return;
    toggleSilent(); await showMainPanel(user_id);

  } else if (payload === "toggle_incog") {
    if (!flags.incog) return;
    toggleIncog(user_id); await showMainPanel(user_id);

  // ── Заявки ──
  } else if (payload === "my_tickets")   { await showMyTickets(user_id); }
  else if (payload === "all_tickets")    { if (!["ROOT","SW"].includes(role)) return; await showAllTickets(user_id); }
  else if (payload === "my_archive")     { await showMyArchive(user_id); }
  else if (payload === "my_report")      { await showReportMenuPanel(user_id, "my_report_"); }
  else if (payload.startsWith("my_report_"))  { await showMyReport(user_id, parseInt(payload.slice(10))); }
  else if (payload === "kpi_menu")       { if (!["ROOT","SW"].includes(role)) return; await showReportMenuPanel(user_id, "kpi_report_"); }
  else if (payload.startsWith("kpi_report_")) { if (!["ROOT","SW"].includes(role)) return; await showKpiReport(user_id, parseInt(payload.slice(11))); }
  else if (payload.startsWith("view_"))       { await showTicketDetailPanel(user_id, parseInt(payload.slice(5))); }
  else if (payload.startsWith("arch_view_"))  { await showArchiveTicket(user_id, parseInt(payload.slice(10))); }

  // ── Объявления ──
  else if (payload === "announce_techs") {
    if (!["ROOT","SW"].includes(role)) return;
    announceWaiting.set(user_id, { type:"techs" });
    await sendOrUpdatePanel(user_id, "📢 *Объявление для техников*\n\nНапишите текст:",
      { type:"inline_keyboard", payload:{ buttons:[[{ type:"callback", text:"❌ Отмена", payload:"back_main" }]] }}
    );
  } else if (payload === "announce_site_choose") {
    await sendOrUpdatePanel(user_id, "📢 *Выберите площадку для объявления:*", kbSiteChooseForAnnounce());
  } else if (payload.startsWith("announce_site_")) {
    const site_id = payload.slice(14);
    const s = getSite(site_id); if (!s) return;
    announceWaiting.set(user_id, { type:"site", site_id });
    await sendOrUpdatePanel(user_id, `📢 *Объявление для площадки ${s.site_name}*\n\nНапишите текст:`,
      { type:"inline_keyboard", payload:{ buttons:[[{ type:"callback", text:"❌ Отмена", payload:"back_main" }]] }}
    );

  // ── Назад ──
  } else if (payload === "back_main") {
    for (const m of [announceWaiting, commentWaiting, rejectWaiting, addSiteWaiting, addUserWaiting, renameUserWaiting, changeChatIdWaiting]) {
      m.delete(user_id);
    }
    await showMainPanel(user_id);

  // ── Админ ──
  } else if (payload === "admin_panel")  { if (!flags.is_admin) return; await showAdminPanel(user_id); }
  else if (payload === "admin_users")    { if (!flags.is_admin) return; await showAdminUsers(user_id); }
  else if (payload === "admin_sites")    { if (!flags.is_admin) return; await showAdminSites(user_id); }
  else if (payload === "add_site") {
    if (!flags.is_admin) return;
    addSiteWaiting.set(user_id, { step:"name" });
    await sendOrUpdatePanel(user_id, "🏫 *Добавление площадки*\n\nВведите название:",
      { type:"inline_keyboard", payload:{ buttons:[[{ type:"callback", text:"❌ Отмена", payload:"admin_sites" }]] }}
    );
  } else if (payload === "add_user_manual") {
    if (!flags.is_admin) return;
    addUserWaiting.set(user_id, { step:"uid" });
    await sendOrUpdatePanel(user_id, "👤 *Добавление пользователя*\n\nВведите user\\_id:",
      { type:"inline_keyboard", payload:{ buttons:[[{ type:"callback", text:"❌ Отмена", payload:"admin_panel" }]] }}
    );
  } else if (payload.startsWith("manage_user_")) {
    if (!flags.is_admin) return; await showManageUser(user_id, parseInt(payload.slice(12)));
  } else if (payload.startsWith("set_role_")) {
    if (!flags.is_admin) return;
    const parts     = payload.split("_");
    const target_id = parseInt(parts[2]);
    const new_role  = parts[3];
    if (!ROLES[new_role]) return;
    const old_u = getWlUser(target_id);
    setWlRole(target_id, new_role);
    const rl = ROLES[new_role].label;
    const tc = getWlChat(target_id);
    if (tc) await sendMessage(tc, `🎖 *Ваша роль изменена!*\n\nНовая роль: *${rl}*\n━━━━━━━━━━━━━━━━━━━━━━\n🦊 REXORIK`);
    log(`🎖 ${old_u?.display_name||target_id}: ${ROLES[old_u?.role]?.label||"?"} → ${rl}`);
    await showManageUser(user_id, target_id);
  } else if (payload.startsWith("rename_user_")) {
    if (!flags.is_admin) return;
    const target_id = parseInt(payload.slice(12));
    renameUserWaiting.set(user_id, target_id);
    await sendOrUpdatePanel(user_id, "✏️ *Изменение имени*\n\nВведите новое имя:",
      { type:"inline_keyboard", payload:{ buttons:[[{ type:"callback", text:"❌ Отмена", payload:`manage_user_${target_id}` }]] }}
    );
  } else if (payload.startsWith("del_user_")) {
    if (!flags.is_admin) return;
    const target_id = parseInt(payload.slice(9));
    const tu = getWlUser(target_id); removeWlUser(target_id);
    log(`🗑 Удалён ${tu?.display_name||target_id}`);
    await showAdminUsers(user_id);
  } else if (payload.startsWith("site_mgr_"))     { if (!flags.is_admin) return; await showSiteMgr(user_id, payload.slice(9)); }
  else if (payload.startsWith("change_chatid_"))   {
    if (!flags.is_admin) return;
    const site_id = payload.slice(14);
    changeChatIdWaiting.set(user_id, site_id);
    const s = getSite(site_id);
    await sendOrUpdatePanel(user_id, `💬 Текущий chat\\_id: \`${s?.chat_id||"—"}\`\n\nВведите новый:`,
      { type:"inline_keyboard", payload:{ buttons:[[{ type:"callback", text:"❌ Отмена", payload:`site_mgr_${site_id}` }]] }}
    );
  } else if (payload.startsWith("del_site_"))      { if (!flags.is_admin) return; removeSite(payload.slice(9)); await showAdminSites(user_id); }

  // ── Запросы на подключение ──
  else if (payload.startsWith("req_accept_")) {
    if (!flags.is_admin) return;
    const req = getJoinRequest(parseInt(payload.split("_")[2])); if (!req) return;
    addWlUser(req.user_id, req.chat_id, req.user_name, "SPEC");
    updateJoinRequest(req.id, "accepted");
    await sendMessage(req.chat_id, `✅ *Доступ предоставлен!*\nВы добавлены в систему. Вам назначена роль Следящего. Ожидайте назначения.\n━━━━━━━━━━━━━━━━━━━━━━\n🦊 REXORIK`);
    log(`👤 Подключён ${req.user_name} (ID:${req.user_id}) роль SPEC`);
    await showAdminPanel(user_id);
  } else if (payload.startsWith("req_deny_")) {
    if (!flags.is_admin) return;
    const req = getJoinRequest(parseInt(payload.split("_")[2])); if (!req) return;
    updateJoinRequest(req.id, "denied");
    await sendMessage(req.chat_id, `❌ *В доступе отказано.*\nОбратитесь к администратору: https://t.me/fox0fores\n━━━━━━━━━━━━━━━━━━━━━━\n🦊 REXORIK`);
    await showMainPanel(user_id);
  } else if (payload.startsWith("req_detail_")) {
    if (!flags.is_admin) return;
    const req = getJoinRequest(parseInt(payload.split("_")[2])); if (!req) return;
    await sendOrUpdatePanel(user_id,
      `📝 *Запрос на подключение*\n━━━━━━━━━━━━━━━━━━━━━━\n👤 *${req.user_name}*\n🆔 \`${req.user_id}\`\n💬 \`${req.chat_id}\`\n━━━━━━━━━━━━━━━━━━━━━━`,
      { type:"inline_keyboard", payload:{ buttons:[
        [{ type:"callback", text:"✅ Подключить", payload:`req_accept_${req.id}` }, { type:"callback", text:"❌ Отказать", payload:`req_deny_${req.id}` }],
        [{ type:"callback", text:"🔙 Назад", payload:"back_main" }],
      ]}}
    );
  }

  // ── Авто-обновление (ручная проверка) ──
  else if (payload === "check_update") {
    if (!flags.is_admin) return;
    await sendOrUpdatePanel(user_id, "🔄 Проверяю обновления...",
      { type:"inline_keyboard", payload:{ buttons:[[{ type:"callback", text:"🔙 Назад", payload:"back_main" }]] }}
    );
    const { checkUpdate } = require("../updater/updater");
    await checkUpdate(true);
  }
}

async function handleUpdate(update) {
  const t = update?.update_type;
  if (t === "message_created")  await handleMessage(update?.message || {});
  else if (t === "message_callback") await handleCallback(update);
}

module.exports = { handleUpdate };