require("dotenv").config();

const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { getConfig, saveConfig } = require("./server/store");
const { publicConfig, calculateQuote } = require("./server/calculator");
const telegram = require("./server/telegram");
const productsApi = require("./server/products-api");
const adminProducts = require("./server/admin-products");
const adminAuth = require("./server/admin-auth");

const root = __dirname;
const port = Number(process.env.PORT || 3000);
const adminUser = process.env.ADMIN_USER || "";
const adminPassword = process.env.ADMIN_PASSWORD || "";
const sessionSecret = process.env.SESSION_SECRET || "";
const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN || "";
const telegramChatId = process.env.TELEGRAM_CHAT_ID || "";
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
  // no-store: without this, browsers may serve a stale cached copy of a GET
  // JSON response after a mutation, even though the server-side cache was
  // correctly invalidated - the data must always come from the network.
  send(res, status, payload, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
}

function sendNoContent(res) {
  res.writeHead(204, { "Cache-Control": "no-store" });
  res.end();
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

function isHttpsRequest(req) {
  return req.headers["x-forwarded-proto"] === "https" || Boolean(req.socket.encrypted);
}

function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "unknown";
}

function setSessionCookie(req, res, token) {
  const secure = isHttpsRequest(req) ? "; Secure" : "";
  res.setHeader("Set-Cookie", `millory_admin=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${secure}`);
}

function clearSessionCookie(req, res) {
  const secure = isHttpsRequest(req) ? "; Secure" : "";
  res.setHeader("Set-Cookie", `millory_admin=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`);
}

function clientError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) {
        reject(clientError(400, "Payload prea mare."));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(clientError(400, "JSON invalid."));
      }
    });
  });
}

async function requireAdmin(req, res) {
  const token = parseCookies(req).millory_admin;
  if (await adminAuth.verifySession(sessionSecret, token)) return true;
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
    if (req.method === "GET" && url.pathname === "/api/products") {
      const params = url.searchParams;
      const filters = {};

      if (params.has("category")) {
        const category = params.get("category").trim();
        if (!category || category.length > 50) {
          sendJson(res, 400, { ok: false, message: "Parametrul category este invalid." });
          return;
        }
        filters.category = category;
      }

      if (params.has("inStock")) {
        const raw = params.get("inStock");
        if (raw !== "true" && raw !== "false") {
          sendJson(res, 400, { ok: false, message: "Parametrul inStock trebuie sa fie true sau false." });
          return;
        }
        filters.inStock = raw === "true";
      }

      if (params.has("search")) {
        const search = params.get("search").trim();
        if (search.length > 100) {
          sendJson(res, 400, { ok: false, message: "Parametrul search este prea lung." });
          return;
        }
        if (search) filters.search = search;
      }

      let limit = 20;
      if (params.has("limit")) {
        limit = Number(params.get("limit"));
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
          sendJson(res, 400, { ok: false, message: "Parametrul limit trebuie sa fie un numar intreg intre 1 si 100." });
          return;
        }
      }
      filters.limit = limit;

      let offset = 0;
      if (params.has("offset")) {
        offset = Number(params.get("offset"));
        if (!Number.isInteger(offset) || offset < 0) {
          sendJson(res, 400, { ok: false, message: "Parametrul offset trebuie sa fie un numar intreg pozitiv." });
          return;
        }
      }
      filters.offset = offset;

      const cacheKey = `products:${JSON.stringify(filters)}`;
      let data = productsApi.cacheGet(cacheKey);
      if (!data) {
        data = await productsApi.listProducts(filters);
        productsApi.cacheSet(cacheKey, data);
      }
      sendJson(res, 200, { ok: true, ...data });
      return;
    }

    const productIdMatch = url.pathname.match(/^\/api\/products\/([^/]+)$/);
    if (req.method === "GET" && productIdMatch) {
      const id = decodeURIComponent(productIdMatch[1]);
      if (!/^[a-z0-9-]+$/i.test(id) || id.length > 100) {
        sendJson(res, 400, { ok: false, message: "ID de produs invalid." });
        return;
      }
      const cacheKey = `product:${id}`;
      let product = productsApi.cacheGet(cacheKey);
      if (!product) {
        product = await productsApi.getProductById(id);
        if (product) productsApi.cacheSet(cacheKey, product);
      }
      if (!product) {
        sendJson(res, 404, { ok: false, message: "Produsul nu a fost gasit." });
        return;
      }
      sendJson(res, 200, { ok: true, product });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/categories") {
      const cacheKey = "categories";
      let categories = productsApi.cacheGet(cacheKey);
      if (!categories) {
        categories = await productsApi.listCategories();
        productsApi.cacheSet(cacheKey, categories);
      }
      sendJson(res, 200, { ok: true, categories });
      return;
    }

    const calculatorProductMatch = url.pathname.match(/^\/api\/calculator\/products\/([^/]+)$/);
    if (req.method === "GET" && calculatorProductMatch) {
      const id = decodeURIComponent(calculatorProductMatch[1]);
      if (!/^[a-z0-9-]+$/i.test(id) || id.length > 100) {
        sendJson(res, 400, { ok: false, message: "ID de produs invalid." });
        return;
      }
      const cacheKey = `calculator-product:${id}`;
      let product = productsApi.cacheGet(cacheKey);
      if (!product) {
        product = await productsApi.getCalculatorProduct(id);
        if (product) productsApi.cacheSet(cacheKey, product);
      }
      if (!product) {
        sendJson(res, 404, { ok: false, message: "Produsul nu a fost gasit." });
        return;
      }
      sendJson(res, 200, { ok: true, product });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/calculator/config") {
      sendJson(res, 200, { ok: true, config: publicConfig(getConfig()) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/calculator/quote") {
      sendJson(res, 200, { ok: true, quote: calculateQuote(getConfig(), await readBody(req)) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/checkout/telegram") {
      if (!telegramBotToken || !telegramChatId) {
        sendJson(res, 503, { ok: false, message: "Trimiterea directa prin Telegram nu este configurata." });
        return;
      }
      const body = await readBody(req);
      const message = String(body.message || "").trim();
      if (!message) {
        sendJson(res, 400, { ok: false, message: "Mesaj gol." });
        return;
      }
      try {
        await telegram.sendMessage(telegramBotToken, telegramChatId, message);
      } catch (error) {
        error.status = 400;
        throw error;
      }
      sendJson(res, 200, { ok: true, message: "Comanda a fost trimisa prin Telegram." });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/session") {
      const token = parseCookies(req).millory_admin;
      sendJson(res, 200, { ok: true, authenticated: await adminAuth.verifySession(sessionSecret, token) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/admin/login") {
      if (!adminUser || !adminPassword || !sessionSecret) {
        sendJson(res, 503, { ok: false, message: "Admin-ul nu este configurat. Seteaza ADMIN_USER, ADMIN_PASSWORD si SESSION_SECRET." });
        return;
      }
      const ip = clientIp(req);
      if (adminAuth.isRateLimited(ip)) {
        sendJson(res, 429, { ok: false, message: "Prea multe incercari. Reincearca peste cateva minute." });
        return;
      }
      const body = await readBody(req);
      if (!adminAuth.safeEqual(body.username || "", adminUser) || !adminAuth.safeEqual(body.password || "", adminPassword)) {
        adminAuth.recordFailedAttempt(ip);
        sendJson(res, 401, { ok: false, message: "Utilizator sau parola incorecta." });
        return;
      }
      adminAuth.clearAttempts(ip);
      const token = await adminAuth.createSession(sessionSecret);
      setSessionCookie(req, res, token);
      sendJson(res, 200, { ok: true, message: "Autentificat cu succes." });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/admin/logout") {
      if (!(await requireAdmin(req, res))) return;
      await adminAuth.destroySession(parseCookies(req).millory_admin);
      clearSessionCookie(req, res);
      sendJson(res, 200, { ok: true, message: "Ai iesit din admin." });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/config") {
      if (!(await requireAdmin(req, res))) return;
      sendJson(res, 200, { ok: true, config: getConfig() });
      return;
    }

    if (req.method === "PUT" && url.pathname === "/api/admin/config") {
      if (!(await requireAdmin(req, res))) return;
      const config = saveConfig((await readBody(req)).config);
      sendJson(res, 200, { ok: true, message: "Modificarile au fost salvate.", config });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/products") {
      if (!(await requireAdmin(req, res))) return;
      const params = url.searchParams;
      const filters = {};

      if (params.has("category")) filters.category = params.get("category").trim().slice(0, 50);
      if (params.has("inStock")) {
        const raw = params.get("inStock");
        if (raw === "true" || raw === "false") filters.inStock = raw === "true";
      }
      if (params.has("active")) {
        const raw = params.get("active");
        if (raw === "true" || raw === "false") filters.active = raw === "true";
      }
      if (params.has("deleted")) {
        filters.deleted = params.get("deleted") === "true";
      }
      if (params.has("search")) filters.search = params.get("search").trim().slice(0, 100);

      let limit = 20;
      if (params.has("limit")) {
        limit = Number(params.get("limit"));
        if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
          sendJson(res, 400, { ok: false, message: "Parametrul limit trebuie sa fie un numar intreg intre 1 si 200." });
          return;
        }
      }
      filters.limit = limit;

      let offset = 0;
      if (params.has("offset")) {
        offset = Number(params.get("offset"));
        if (!Number.isInteger(offset) || offset < 0) {
          sendJson(res, 400, { ok: false, message: "Parametrul offset trebuie sa fie un numar intreg pozitiv." });
          return;
        }
      }
      filters.offset = offset;

      const data = await adminProducts.listAdminProducts(filters);
      sendJson(res, 200, { ok: true, ...data });
      return;
    }

    const adminProductIdMatch = url.pathname.match(/^\/api\/admin\/products\/([^/]+)$/);

    if (req.method === "GET" && adminProductIdMatch) {
      if (!(await requireAdmin(req, res))) return;
      const product = await adminProducts.getAdminProductById(decodeURIComponent(adminProductIdMatch[1]));
      if (!product) {
        sendJson(res, 404, { ok: false, message: "Produsul nu a fost gasit." });
        return;
      }
      sendJson(res, 200, { ok: true, product });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/admin/products") {
      if (!(await requireAdmin(req, res))) return;
      const product = await adminProducts.createProduct(await readBody(req));
      productsApi.invalidateProductCache(product.id);
      sendJson(res, 201, { ok: true, message: "Produsul a fost creat.", product });
      return;
    }

    if (req.method === "PUT" && adminProductIdMatch) {
      if (!(await requireAdmin(req, res))) return;
      const id = decodeURIComponent(adminProductIdMatch[1]);
      const product = await adminProducts.updateProduct(id, await readBody(req));
      if (!product) {
        sendJson(res, 404, { ok: false, message: "Produsul nu a fost gasit." });
        return;
      }
      productsApi.invalidateProductCache(id);
      sendJson(res, 200, { ok: true, message: "Produsul a fost actualizat.", product });
      return;
    }

    // Soft delete is idempotent: calling it again on an already-deleted
    // product succeeds with 204 rather than erroring. `hard: true` requests
    // permanent deletion, which is intentionally unsupported -> 403.
    if (req.method === "DELETE" && adminProductIdMatch) {
      if (!(await requireAdmin(req, res))) return;
      const id = decodeURIComponent(adminProductIdMatch[1]);
      const body = await readBody(req).catch(() => ({}));
      if (body.confirm !== true) {
        sendJson(res, 400, { ok: false, message: "Confirmarea este obligatorie pentru stergerea produsului (trimite confirm: true)." });
        return;
      }
      const product = await adminProducts.softDeleteProduct(id, { hard: body.hard === true });
      if (!product) {
        sendJson(res, 404, { ok: false, message: "Produsul nu a fost gasit." });
        return;
      }
      productsApi.invalidateProductCache(id);
      sendNoContent(res);
      return;
    }

    const restoreMatch = url.pathname.match(/^\/api\/admin\/products\/([^/]+)\/restore$/);
    // Idempotent: restoring a product that isn't deleted succeeds and
    // returns its current state unchanged rather than erroring.
    if (req.method === "POST" && restoreMatch) {
      if (!(await requireAdmin(req, res))) return;
      const id = decodeURIComponent(restoreMatch[1]);
      const product = await adminProducts.restoreProduct(id);
      if (!product) {
        sendJson(res, 404, { ok: false, message: "Produsul nu a fost gasit." });
        return;
      }
      productsApi.invalidateProductCache(id);
      sendJson(res, 200, { ok: true, message: "Produsul a fost restaurat.", product });
      return;
    }

    serveStatic(req, res);
  } catch (error) {
    // Errors that were deliberately thrown with a `.status` carry a curated,
    // client-safe message (validation text, "not found", etc.) - pass those
    // through as-is. Anything else is unexpected (DB failures, subprocess
    // errors, bugs) and may contain internals (SQL text, file paths, stack
    // traces) that must never reach the client - log it server-side only and
    // return a generic message.
    if (typeof error.status === "number") {
      sendJson(res, error.status, {
        ok: false,
        message: error.message,
        ...(Array.isArray(error.errors) ? { errors: error.errors } : {})
      });
      return;
    }
    console.error("Unhandled server error:", error);
    sendJson(res, 500, { ok: false, message: "A aparut o eroare interna. Incearca din nou mai tarziu." });
  }
}

if (require.main === module || process.env.VERCEL) {
  http.createServer(route).listen(port, () => {
    console.log(`Millory server running on port ${port}`);
  });
}

module.exports = route;
