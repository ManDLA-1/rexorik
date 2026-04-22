// REST API для веб-панели
const { checkUpdate } = require("../updater/updater");
const { WEB_SECRET }  = require("../config");
const db = require("../db/db");

module.exports = function(app) {
  // Простая авторизация через заголовок
  function auth(req, res, next) {
    if (req.headers["x-secret"] !== WEB_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    next();
  }

  app.get("/api/status",     auth, (req, res) => res.json({
    bot_active:  db.isBotActive(),
    logging:     db.isLogging(),
    silent_mode: db.isSilentMode(),
    open_tickets: db.countOpenTickets(),
  }));

  app.get("/api/tickets",    auth, (req, res) => res.json(db.getOpenTicketsAll()));
  app.get("/api/users",      auth, (req, res) => res.json(db.getWlUsers()));
  app.get("/api/sites",      auth, (req, res) => res.json(db.getSites()));
  app.get("/api/archive",    auth, (req, res) => res.json(db.getArchiveTickets()));

  app.post("/api/toggle_bot",     auth, (req, res) => res.json({ active: db.toggleBot() }));
  app.post("/api/toggle_logging", auth, (req, res) => res.json({ logging: db.toggleLogging() }));
  app.post("/api/toggle_silent",  auth, (req, res) => res.json({ silent: db.toggleSilent() }));

  app.post("/api/update_check", auth, async (req, res) => {
    res.json({ ok: true });
    await checkUpdate(true);
  });

  app.get("/api/version", auth, async (req, res) => {
    const { getLocalSha, getRemoteSha } = require("../updater/updater");
    const local  = getLocalSha();
    const remote = await getRemoteSha();
    res.json({ local: local?.slice(0,7), remote: remote?.slice(0,7), upToDate: local === remote });
  });
};