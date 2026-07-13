const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { getConfig, saveConfig } = require("./server/store");
const { publicConfig, calculateQuote } = require("./server/calculator");

const root = __dirname;
const port = Number(process.env.PORT || 3000);
const adminUser = process.env.ADMIN_USER || "admin";
const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
const sessionSecret = process.env.SESSION_SECRET || "millory-change-this-secret";
const sessions = new Map();
const publicRoot = path.join(root, "public");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4"
};

function send(res, status, payload, headers = {}) {
  const body = typeof payload === "string" || Buffer.isBuffer(payload)
    ? payload
    : JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": typeof payload === "object" && !Buffer.isBuffer(payload) ? "application/json; charset=utf-8" : "text/plain; charset=utf-8",
    ...headers
  });
  res.end(body);
}

function sendJson(res, status, payload) {
  send(res, status, payload, { "Content-Type": "application/json; charset=utf-8" });
}

function parseCookies(req) {
  return Object.fromEntries(String(req.headers.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const index = part.indexOf("=");
      return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
    }));
}

function sign(value) {
  return crypto.createHmac("sha256", sessionSecret).update(value).digest("hex");
}

function createSession(res) {
  const id = crypto.randomBytes(32).toString("hex");
  const token = `${id}.${sign(id)}`;
  sessions.set(id, { createdAt: Date.now() });
  res.setHeader("Set-Cookie", `millory_admin=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`);
}

function getSession(req) {
  const token = parseCookies(req).millory_admin || "";
  const [id, signature] = token.split(".");
  if (!id || !signature || sign(id) !== signature || !sessions.has(id)) return null;
  return { id };
}

function clearSession(req, res) {
  const session = getSession(req);
  if (session) sessions.delete(session.id);
  res.setHeader("Set-Cookie", "millory_admin=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) {
        reject(new Error("Payload prea mare."));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("JSON invalid."));
      }
    });
  });
}

function requireAdmin(req, res) {
  if (getSession(req)) return true;
  sendJson(res, 401, { ok: false, message: "Autentificare necesara." });
  return false;
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);
  if (req.method !== "GET" && req.method !== "HEAD") {
    send(res, 405, "Metoda nu este permisa.");
    return;
  }
  if (pathname.includes("/server/") || pathname.endsWith(".sqlite") || pathname.endsWith(".db")) {
    send(res, 404, "Pagina nu a fost gasita.");
    return;
  }

  let filePath = path.normalize(path.join(publicRoot, pathname === "/" ? "index.html" : pathname));
  if (!filePath.startsWith(publicRoot)) {
    send(res, 403, "Acces refuzat.");
    return;
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }
  fs.readFile(filePath, (error, content) => {
    if (error) {
      const isPageRequest = req.method === "GET"
        && !path.extname(pathname)
        && String(req.headers.accept || "").includes("text/html");
      if (isPageRequest) {
        fs.readFile(path.join(publicRoot, "index.html"), (indexError, indexContent) => {
          if (indexError) {
            send(res, 404, "Pagina nu a fost gasita.");
            return;
          }
          res.writeHead(200, { "Content-Type": mimeTypes[".html"] });
          res.end(indexContent);
        });
        return;
      }
      send(res, 404, "Pagina nu a fost gasita.");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
    res.end(content);
  });
}

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (req.method === "GET" && url.pathname === "/api/calculator/config") {
      sendJson(res, 200, { ok: true, config: publicConfig(getConfig()) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/calculator/quote") {
      sendJson(res, 200, { ok: true, quote: calculateQuote(getConfig(), await readBody(req)) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/session") {
      sendJson(res, 200, { ok: true, authenticated: Boolean(getSession(req)) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/admin/login") {
      const body = await readBody(req);
      if (!safeEqual(body.username || "", adminUser) || !safeEqual(body.password || "", adminPassword)) {
        sendJson(res, 401, { ok: false, message: "Utilizator sau parola incorecta." });
        return;
      }
      createSession(res);
      sendJson(res, 200, { ok: true, message: "Autentificat cu succes." });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/admin/logout") {
      if (!requireAdmin(req, res)) return;
      clearSession(req, res);
      sendJson(res, 200, { ok: true, message: "Ai iesit din admin." });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/config") {
      if (!requireAdmin(req, res)) return;
      sendJson(res, 200, { ok: true, config: getConfig() });
      return;
    }

    if (req.method === "PUT" && url.pathname === "/api/admin/config") {
      if (!requireAdmin(req, res)) return;
      const config = saveConfig((await readBody(req)).config);
      sendJson(res, 200, { ok: true, message: "Modificarile au fost salvate.", config });
      return;
    }

    serveStatic(req, res);
  } catch (error) {
    sendJson(res, 400, { ok: false, message: error.message });
  }
}

if (require.main === module || process.env.VERCEL) {
  http.createServer(route).listen(port, () => {
    console.log(`Millory server running on port ${port}`);
  });
}

module.exports = route;
