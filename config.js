// ╔══════════════════════════════════════════╗
// ║      КОНФИГУРАЦИЯ БОТА  REXORIK         ║
// ╚══════════════════════════════════════════╝

module.exports = {
  TOKEN:        "f9LHodD0cOJ1Nhhqtqba84dYPrDidysmKjQ7oLQt2qTinJWt5ciBcLHTSr9Xcjm6KKp4f1fjOjBJI26vGz9y",
  BASE_URL:     "https://platform-api.max.ru",
  ADMIN_USER_ID: 218951195,
  LOG_CHAT_ID:  -73495647886619,   // null — отключить

  // GitHub авто-обновление
  GITHUB_REPO:  "ManDLA-1/rexorik",   // "owner/repo"
  GITHUB_TOKEN: "",                     // Personal Access Token (если приватный)
  GITHUB_BRANCH: "main",

  // Веб-панель
  WEB_PORT: 3000,
  WEB_SECRET: "rexorik_admin",          // пароль для входа в веб

  ROLES: {
    ROOT: { label: "Руководитель", is_admin: true,  approve: true,  ssee: true,  incog: true  },
    SW:   { label: "Супервайзер",  is_admin: false, approve: true,  ssee: true,  incog: true  },
    TECH: { label: "Техник",       is_admin: false, approve: true,  ssee: false, incog: false },
    SPEC: { label: "Следящий",     is_admin: false, approve: false, ssee: true,  incog: false },
  },

  INITIAL_DATA: {
    wl_users: [
      { user_id: 218951195, chat_id: 50447860, name: "Fox Fores", display_name: "Дмитрий", role: "ROOT" },
    ],
    sites: [
      { site_id: "ushinsky",     site_name: "УШИНСКОГО",      keyword: "Ушинского",   prefix: "У", chat_id: -72276298856686 },
      { site_id: "ushinskytest", site_name: "Тестировачная площадка", keyword: "Тестировачная",   prefix: "Т", chat_id: -73313426742555 },
    ],
  },
};