// Проверка обновлений с GitHub и перезапуск
const { execSync, exec } = require("child_process");
const axios  = require("axios");
const { GITHUB_REPO, GITHUB_TOKEN, GITHUB_BRANCH } = require("../config");
const { log } = require("../server/sv_main");

let currentSha = null;

function getLocalSha() {
  try {
    return execSync("git rev-parse HEAD").toString().trim();
  } catch { return null; }
}

async function getRemoteSha() {
  try {
    const headers = GITHUB_TOKEN ? { Authorization: `token ${GITHUB_TOKEN}` } : {};
    const r = await axios.get(
      `https://api.github.com/repos/${GITHUB_REPO}/commits/${GITHUB_BRANCH}`,
      { headers }
    );
    return r.data.sha;
  } catch (e) {
    console.error("GitHub check error:", e.message);
    return null;
  }
}

async function checkUpdate(manual = false) {
  const local  = getLocalSha();
  const remote = await getRemoteSha();

  if (!remote) {
    if (manual) log("⚠️ Не удалось проверить обновления GitHub");
    return;
  }

  if (local === remote) {
    if (manual) log(`✅ Актуальная версия: \`${local?.slice(0,7)}\``);
    return;
  }

  log(`🔄 Доступно обновление!\nТекущий: \`${local?.slice(0,7)}\`\nНовый: \`${remote.slice(0,7)}\`\nОбновляюсь...`, true);

  try {
    execSync("git pull origin " + GITHUB_BRANCH, { stdio: "inherit" });
    execSync("npm install --production", { stdio: "inherit" });
    log("✅ Обновление установлено. Перезапуск...", true);

    // Перезапуск через 2 секунды
    setTimeout(() => {
      exec("npm start", (err) => { if (err) console.error(err); });
      process.exit(0);
    }, 2000);
  } catch (e) {
    log(`❌ Ошибка обновления: ${e.message}`, true);
  }
}

module.exports = { checkUpdate, getLocalSha, getRemoteSha };