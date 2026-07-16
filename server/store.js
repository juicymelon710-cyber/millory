const { spawnSync } = require("child_process");
const path = require("path");
const { normalizeConfig } = require("./calculator");

const dbPath = path.join(__dirname, "..", "data", "millory.sqlite");
const helperPath = path.join(__dirname, "..", "scripts", "sqlite-store.py");

function runStore(action, payload) {
  const result = spawnSync("python", [helperPath, dbPath, action], {
    input: payload ? JSON.stringify(payload) : "",
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "Eroare SQLite.").trim());
  }
  return result.stdout ? JSON.parse(result.stdout) : null;
}

function hasConfig() {
  return Boolean(runStore("has")?.exists);
}

function getConfig() {
  const row = runStore("get");
  if (!row?.data) {
    const error = new Error("Calculatorul nu este initializat. Ruleaza npm run init-db.");
    error.status = 400;
    throw error;
  }
  return normalizeConfig(row.data);
}

function saveConfig(config) {
  const normalized = normalizeConfig(config);
  runStore("save", normalized);
  return normalized;
}

module.exports = {
  hasConfig,
  getConfig,
  saveConfig
};
