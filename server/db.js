const { createClient } = require("@libsql/client");

let client = null;
let rawClient = null;

// The underlying @libsql/hrana-client HTTP transport makes its own internal
// fetch() to the real Turso host on every fresh client construction (a
// protocol-version probe, before any query runs) - not a self-fetch or
// localhost call, just an extra network round-trip that's fragile on a
// serverless cold start. Node surfaces any failure of it (DNS, TLS, reset,
// timeout) as the same generic `TypeError: fetch failed`. Retrying a small,
// bounded number of times absorbs that transient class of failure without
// masking real errors (non-network errors, e.g. SQL/auth errors, are
// rethrown immediately on first failure).
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 150;

function isTransientFetchError(error) {
  return error instanceof TypeError && /fetch failed/i.test(error.message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(fn) {
  let lastError;
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isTransientFetchError(error) || attempt === RETRY_ATTEMPTS) throw error;
      await sleep(RETRY_DELAY_MS * attempt);
    }
  }
  throw lastError;
}

function getDb() {
  if (client) return client;

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) {
    throw new Error("TURSO_DATABASE_URL nu este setat. Verifica fisierul .env sau variabilele de mediu din Vercel.");
  }

  rawClient = createClient({ url, authToken });
  // Transactions are stateful multi-step sequences (execute/commit/rollback)
  // that cannot be safely re-run from the top on a mid-sequence failure, so
  // transaction() is passed through directly rather than retried here.
  client = {
    execute: (...args) => withRetry(() => rawClient.execute(...args)),
    executeMultiple: (...args) => withRetry(() => rawClient.executeMultiple(...args)),
    batch: (...args) => withRetry(() => rawClient.batch(...args)),
    transaction: (...args) => rawClient.transaction(...args),
    close: () => rawClient.close(),
    get closed() {
      return rawClient.closed;
    }
  };
  return client;
}

module.exports = { getDb };
