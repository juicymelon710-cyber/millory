const crypto = require("crypto");
const { getDb } = require("./db");

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 5;
const loginAttempts = new Map();

function sign(secret, value) {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

// Best-effort brute-force protection. On serverless the in-memory Map resets
// on cold start, so this is a first layer, not a hard guarantee - acceptable
// for a single-admin panel, but worth revisiting if this becomes multi-user.
function isRateLimited(ip) {
  const now = Date.now();
  const attempts = (loginAttempts.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  loginAttempts.set(ip, attempts);
  return attempts.length >= RATE_LIMIT_MAX_ATTEMPTS;
}

function recordFailedAttempt(ip) {
  const attempts = loginAttempts.get(ip) || [];
  attempts.push(Date.now());
  loginAttempts.set(ip, attempts);
}

function clearAttempts(ip) {
  loginAttempts.delete(ip);
}

async function createSession(secret) {
  const db = getDb();
  const id = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await db.execute({
    sql: "INSERT INTO admin_sessions (id, expires_at) VALUES (?, ?)",
    args: [id, expiresAt]
  });
  return `${id}.${sign(secret, id)}`;
}

async function verifySession(secret, token) {
  if (!token) return false;
  const [id, signature] = String(token).split(".");
  if (!id || !signature || sign(secret, id) !== signature) return false;

  const db = getDb();
  const result = await db.execute({ sql: "SELECT expires_at FROM admin_sessions WHERE id = ?", args: [id] });
  const row = result.rows[0];
  if (!row) return false;

  if (new Date(row.expires_at).getTime() < Date.now()) {
    await db.execute({ sql: "DELETE FROM admin_sessions WHERE id = ?", args: [id] });
    return false;
  }
  return true;
}

async function destroySession(token) {
  if (!token) return;
  const [id] = String(token).split(".");
  if (!id) return;
  const db = getDb();
  await db.execute({ sql: "DELETE FROM admin_sessions WHERE id = ?", args: [id] });
}

module.exports = {
  safeEqual,
  isRateLimited,
  recordFailedAttempt,
  clearAttempts,
  createSession,
  verifySession,
  destroySession
};
