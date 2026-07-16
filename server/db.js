const { createClient } = require("@libsql/client");

let client = null;

function getDb() {
  if (client) return client;

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) {
    throw new Error("TURSO_DATABASE_URL nu este setat. Verifica fisierul .env sau variabilele de mediu din Vercel.");
  }

  client = createClient({ url, authToken });
  return client;
}

module.exports = { getDb };
