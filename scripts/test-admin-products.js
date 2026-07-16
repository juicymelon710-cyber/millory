require("dotenv").config();

const BASE = "http://localhost:3000";
const TEST_ID = `test-admin-crud-temp-${Date.now()}`;

let passed = 0;
let failed = 0;
const failures = [];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function check(label, cond, extra) {
  if (cond) {
    passed++;
    console.log("  OK   " + label);
  } else {
    failed++;
    failures.push(label + (extra ? ` (${extra})` : ""));
    console.log("  FAIL " + label + (extra ? ` -> ${extra}` : ""));
  }
}

let sessionCookie = "";

async function request(method, path, { body, auth = true, useCookie = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (useCookie && sessionCookie) headers.Cookie = sessionCookie;
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) sessionCookie = setCookie.split(";")[0];
  const json = await response.json().catch(() => ({}));
  return { status: response.status, json };
}

async function main() {
  console.log(`=== Test Admin Products CRUD (temp id: ${TEST_ID}) ===\n`);

  // ---- 1. Unauthenticated requests rejected ----
  console.log("-- Unauthenticated access --");
  sessionCookie = "";
  {
    const r = await request("GET", "/api/admin/products");
    check("GET /api/admin/products without session -> 401", r.status === 401);
  }
  {
    const r = await request("GET", `/api/admin/products/${TEST_ID}`);
    check("GET /api/admin/products/:id without session -> 401", r.status === 401);
  }
  {
    const r = await request("POST", "/api/admin/products", { body: { title: "x" } });
    check("POST /api/admin/products without session -> 401", r.status === 401);
  }
  {
    const r = await request("PUT", `/api/admin/products/${TEST_ID}`, { body: { title: "x" } });
    check("PUT /api/admin/products/:id without session -> 401", r.status === 401);
  }
  {
    const r = await request("DELETE", `/api/admin/products/${TEST_ID}`, { body: { confirm: true } });
    check("DELETE /api/admin/products/:id without session -> 401", r.status === 401);
  }

  // ---- 2. Login ----
  console.log("\n-- Login --");
  const loginResult = await request("POST", "/api/admin/login", {
    body: { username: process.env.ADMIN_USER, password: process.env.ADMIN_PASSWORD },
    useCookie: false
  });
  check("Login with valid credentials succeeds", loginResult.status === 200 && Boolean(sessionCookie));

  // ---- Baseline snapshot of a real product (must remain untouched) ----
  console.log("\n-- Baseline snapshot of a real product --");
  const baselineList = await request("GET", "/api/admin/products?limit=1&offset=0");
  const baselineProduct = baselineList.json.products && baselineList.json.products[0];
  check("Baseline product fetched for non-interference check", Boolean(baselineProduct));
  let baselineDetail = null;
  if (baselineProduct) {
    const detailResult = await request("GET", `/api/admin/products/${encodeURIComponent(baselineProduct.id)}`);
    baselineDetail = detailResult.json.product;
  }

  // ---- 3. List / search / filter ----
  console.log("\n-- List / search / filter --");
  {
    const r = await request("GET", "/api/admin/products?limit=10");
    check("List products returns ok + array", r.status === 200 && Array.isArray(r.json.products));
    check("List products respects limit", r.json.products.length <= 10);
  }
  {
    const categoriesResult = await request("GET", "/api/categories", { useCookie: false });
    const category = categoriesResult.json.categories[0];
    const r = await request("GET", `/api/admin/products?category=${encodeURIComponent(category.id)}&limit=50`);
    const allMatch = r.json.products.every((p) => p.category === category.id);
    check(`Category filter (${category.id}) returns only matching products`, r.status === 200 && allMatch);
  }
  {
    const r = await request("GET", "/api/admin/products?inStock=false&limit=50");
    const allMatch = r.json.products.every((p) => p.inStock === false);
    check("inStock=false filter returns only out-of-stock products", r.status === 200 && allMatch);
  }
  {
    const r = await request("GET", "/api/admin/products?active=true&limit=50");
    const allMatch = r.json.products.every((p) => p.active === true);
    check("active=true filter returns only active products", r.status === 200 && allMatch);
  }
  if (baselineProduct) {
    const term = baselineProduct.title.slice(0, 4);
    const r = await request("GET", `/api/admin/products?search=${encodeURIComponent(term)}&limit=50`);
    const found = r.json.products.some((p) => p.id === baselineProduct.id);
    check(`Search filter finds known product by partial title "${term}"`, r.status === 200 && found);
  }

  // ---- 4. Create product ----
  console.log("\n-- Create product --");
  const createPayload = {
    id: TEST_ID,
    title: "Produs Test Automat CRUD",
    description: "Produs temporar creat de suita automata de teste. Nu este un produs real.",
    category: "test-category-crud",
    shape: "rotund",
    priceMdl: 1234,
    inStock: true,
    active: true,
    image: "/assets/products/test-placeholder.jpg",
    tags: ["test", "automat"],
    filters: [{ name: "culoare", value: "auriu" }],
    defaultSize: { width: 60, height: 60 },
    smallestSize: { width: 40, height: 40 },
    biggestSize: { width: 100, height: 100 },
    recommendedSizes: [{ name: "Standard", width: 60, height: 60, priceMdl: 1234 }],
    smallCoefficient: 0.8,
    mediumCoefficient: 1,
    bigCoefficient: 1.4,
    mediumSize: 70,
    bigSize: 90,
    materials: [{ name: "Sticla test", priceMdl: 100, unit: "m2", available: true }],
    optionGroups: [{
      name: "Iluminare",
      selection: "single",
      available: true,
      items: [{ name: "LED alb", priceMdl: 200, unit: "buc", description: "Iluminare LED", available: true }]
    }]
  };
  const createResult = await request("POST", "/api/admin/products", { body: createPayload });
  check("Create product returns 201", createResult.status === 201, JSON.stringify(createResult.json));
  check("Created product has correct id", createResult.json.product && createResult.json.product.id === TEST_ID);
  check("Created product has nested tags", createResult.json.product?.tags?.length === 2);
  check("Created product has nested materials", createResult.json.product?.materials?.length === 1);
  check("Created product has nested option groups + supplements", createResult.json.product?.optionGroups?.[0]?.items?.length === 1);

  const getCreated = await request("GET", `/api/admin/products/${TEST_ID}`);
  check("GET admin product by id after create matches title", getCreated.json.product?.title === createPayload.title);
  check("updated_at is auto-populated on create", Boolean(createResult.json.product?.updatedAt));
  const updatedAtAfterCreate = createResult.json.product?.updatedAt;

  // ---- 5. Duplicate id rejected ----
  console.log("\n-- Duplicate id rejected --");
  const dupResult = await request("POST", "/api/admin/products", { body: createPayload });
  check("Creating duplicate id returns 409 Conflict", dupResult.status === 409, JSON.stringify(dupResult.json));
  check("409 response body does not leak internals", !/SQLITE|SQL_INPUT|stack|node_modules/i.test(dupResult.json.message || ""));
  const afterDup = await request("GET", `/api/admin/products/${TEST_ID}`);
  check("Original product untouched after duplicate-id rejection", afterDup.json.product?.title === createPayload.title);

  // ---- Public API reflects create immediately (cache invalidation) ----
  console.log("\n-- Public API cache invalidation (create) --");
  {
    const r = await request("GET", `/api/products/${TEST_ID}`, { useCookie: false });
    check("Public API returns newly created active product immediately", r.status === 200 && r.json.product?.title === createPayload.title);
  }

  // ---- 6. Update product + related records ----
  console.log("\n-- Update product --");
  const updatePayload = {
    ...createPayload,
    title: "Produs Test Automat CRUD (Actualizat)",
    priceMdl: 4321,
    tags: ["test", "actualizat"],
    materials: [
      { name: "Sticla test", priceMdl: 100, unit: "m2", available: true },
      { name: "Rama aurie", priceMdl: 300, unit: "ml", available: true }
    ]
  };
  delete updatePayload.id;
  // Cross a full second so updated_at (second-resolution) is guaranteed to differ from create's.
  await sleep(1100);
  const updateResult = await request("PUT", `/api/admin/products/${TEST_ID}`, { body: updatePayload });
  check("Update product returns 200", updateResult.status === 200, JSON.stringify(updateResult.json));
  check("Updated product title reflects change", updateResult.json.product?.title === updatePayload.title);
  check("Updated product has replaced tags (old tag removed)", JSON.stringify(updateResult.json.product?.tags?.sort()) === JSON.stringify(["actualizat", "test"]));
  check("Updated product has 2 materials now", updateResult.json.product?.materials?.length === 2);
  check("updated_at changes automatically on update", updateResult.json.product?.updatedAt > updatedAtAfterCreate);

  // ---- 7. Rollback / atomicity + status code semantics ----
  console.log("\n-- Rollback / atomicity, 400 vs 422 --");
  {
    // Unexpected/unknown field is a structural (protocol) violation -> 400.
    const r = await request("PUT", `/api/admin/products/${TEST_ID}`, { body: { ...updatePayload, hackerField: true } });
    check("Update with unexpected field rejected (400, structural)", r.status === 400);
    const after = await request("GET", `/api/admin/products/${TEST_ID}`);
    check("Product unchanged after rejected update (no partial write)", after.json.product?.title === updatePayload.title);
  }
  {
    // Well-formed request, but a nested object fails business validation -> 422.
    const badMaterials = { ...updatePayload, materials: [{ priceMdl: 50 }] };
    const r = await request("PUT", `/api/admin/products/${TEST_ID}`, { body: badMaterials });
    check("Update with invalid material (missing name) rejected (422, business rule)", r.status === 422);
    const after = await request("GET", `/api/admin/products/${TEST_ID}`);
    check("Product materials unchanged after rejected update", after.json.product?.materials?.length === 2);
  }
  {
    const r = await request("PUT", `/api/admin/products/${TEST_ID}`, { body: "not-an-object-payload" });
    check("Update with non-object body rejected (400, structural)", r.status === 400);
  }
  {
    const r = await request("POST", "/api/admin/products", { body: { title: "Fara categorie" } });
    check("Create without category rejected (422, business rule)", r.status === 422);
  }
  {
    const r = await request("POST", "/api/admin/products", { body: { title: "", category: "test" } });
    check("Create without title rejected (422, business rule)", r.status === 422);
  }

  // ---- Public API reflects update immediately ----
  console.log("\n-- Public API cache invalidation (update) --");
  {
    const r = await request("GET", `/api/products/${TEST_ID}`, { useCookie: false });
    check("Public API reflects updated title immediately", r.status === 200 && r.json.product?.title === updatePayload.title);
    check("Public API reflects updated price immediately", r.json.product?.priceMdl === updatePayload.priceMdl);
  }
  {
    const r = await request("GET", `/api/products?search=${encodeURIComponent("Actualizat")}`, { useCookie: false });
    const found = r.json.products.some((p) => p.id === TEST_ID);
    check("Public product search finds updated product", found);
  }

  // ---- 8. Soft delete (dedicated deleted_at field, distinct from `active`) ----
  console.log("\n-- Soft delete --");
  {
    const r = await request("DELETE", `/api/admin/products/${TEST_ID}`, { body: {} });
    check("Delete without confirm:true rejected (400)", r.status === 400);
  }
  {
    const r = await request("DELETE", `/api/admin/products/${TEST_ID}`, { body: { confirm: true, hard: true } });
    check("Delete with hard:true rejected (403, permanent deletion not permitted)", r.status === 403);
  }
  let beforeDelete;
  {
    beforeDelete = await request("GET", `/api/admin/products/${TEST_ID}`);
    check("Product not deleted yet", beforeDelete.json.product?.deleted === false);
  }
  await sleep(1100);
  {
    const r = await request("DELETE", `/api/admin/products/${TEST_ID}`, { body: { confirm: true } });
    check("Delete with confirm:true succeeds (204 No Content)", r.status === 204);
    check("204 response body is empty", Object.keys(r.json).length === 0);
  }
  {
    const r = await request("GET", `/api/admin/products/${TEST_ID}`);
    check("Admin API still returns soft-deleted product (not hard-deleted)", r.status === 200 && r.json.product?.deleted === true);
    check("`active` flag is untouched by delete (stays a separate concept)", r.json.product?.active === beforeDelete.json.product?.active);
    check("updated_at changes automatically on delete", r.json.product?.updatedAt > beforeDelete.json.product?.updatedAt);
  }
  {
    const r = await request("GET", `/api/products/${TEST_ID}`, { useCookie: false });
    check("Public API no longer returns deleted product (404)", r.status === 404);
  }
  {
    const first = await request("GET", `/api/admin/products/${TEST_ID}`);
    const r = await request("DELETE", `/api/admin/products/${TEST_ID}`, { body: { confirm: true } });
    check("Deleting an already-deleted product is idempotent (204 again, not an error)", r.status === 204);
    const second = await request("GET", `/api/admin/products/${TEST_ID}`);
    check("Repeated delete does not change the original deletedAt timestamp", first.json.product?.deletedAt === second.json.product?.deletedAt);
  }
  {
    const r = await request("PUT", `/api/admin/products/${TEST_ID}`, { body: updatePayload });
    check("Editing a deleted product is rejected (409 Conflict)", r.status === 409);
  }
  {
    const r = await request("GET", "/api/admin/products?limit=50");
    const found = r.json.products.some((p) => p.id === TEST_ID);
    check("Default admin product list excludes deleted products", !found);
  }
  {
    const r = await request("GET", "/api/admin/products?deleted=true&limit=50");
    const found = r.json.products.some((p) => p.id === TEST_ID);
    check("deleted=true (trash view) lists the deleted test product", found);
  }

  // ---- 9. Restore ----
  console.log("\n-- Restore --");
  const beforeRestore = await request("GET", `/api/admin/products/${TEST_ID}`);
  await sleep(1100);
  {
    const r = await request("POST", `/api/admin/products/${TEST_ID}/restore`, {});
    check("Restore succeeds (200)", r.status === 200);
    check("Restored product is no longer marked deleted", r.json.product?.deleted === false);
    check("updated_at changes automatically on restore", r.json.product?.updatedAt > beforeRestore.json.product?.updatedAt);
  }
  {
    const r = await request("GET", `/api/products/${TEST_ID}`, { useCookie: false });
    check("Public API returns the restored product again immediately", r.status === 200);
  }
  {
    const r = await request("POST", `/api/admin/products/${TEST_ID}/restore`, {});
    check("Restoring an already-active product is idempotent (200, no error)", r.status === 200 && r.json.product?.deleted === false);
  }
  {
    const r = await request("POST", `/api/admin/products/does-not-exist-${Date.now()}/restore`, {});
    check("Restoring an unknown id returns 404", r.status === 404);
  }
  {
    // Now that it is restored, editing should work normally again.
    const r = await request("PUT", `/api/admin/products/${TEST_ID}`, { body: updatePayload });
    check("Editing a restored product succeeds again (200)", r.status === 200);
  }

  // ---- Session persistence ----
  console.log("\n-- Session persistence --");
  {
    const r = await request("GET", "/api/admin/session");
    check("Session still authenticated after full test sequence", r.json.authenticated === true);
  }

  // ---- Non-interference with real products ----
  console.log("\n-- Non-interference with real products --");
  if (baselineDetail) {
    const after = await request("GET", `/api/admin/products/${encodeURIComponent(baselineDetail.id)}`);
    check("Baseline real product title unchanged", after.json.product?.title === baselineDetail.title);
    check("Baseline real product price unchanged", after.json.product?.priceMdl === baselineDetail.priceMdl);
    check("Baseline real product active flag unchanged", after.json.product?.active === baselineDetail.active);
  }

  // ---- Unexpected errors are sanitized before reaching the client ----
  // Calls route() directly (in-process, not via HTTP) with a monkey-patched
  // productsApi.listProducts that throws a raw error containing internal
  // details (SQL text, file path) - the kind of thing a real DB failure
  // could surface. Confirms it is logged server-side but never leaked.
  console.log("\n-- Error sanitization (500s never leak internals) --");
  try {
    const route = require("../server.js");
    const productsApi = require("../server/products-api");
    const originalListProducts = productsApi.listProducts;
    const originalConsoleError = console.error;

    const secretDetail = "SQLITE_ERROR: no such table: secret_internal_table at /Users/laura/Desktop/Millory/server/products-api.js:123:45";
    productsApi.listProducts = async () => { throw new Error(secretDetail); };
    let loggedServerSide = false;
    console.error = (...args) => { loggedServerSide = String(args.join(" ")).includes("secret_internal_table"); };

    const { EventEmitter } = require("events");
    const mockReq = new EventEmitter();
    mockReq.method = "GET";
    mockReq.url = "/api/products";
    mockReq.headers = { host: "localhost:3000" };
    mockReq.socket = {};
    let statusCode = null;
    const bodyChunks = [];
    const mockRes = {
      writeHead(status) { statusCode = status; },
      setHeader() {},
      end(chunk) { if (chunk) bodyChunks.push(chunk); }
    };

    await route(mockReq, mockRes);
    const body = bodyChunks.join("");

    productsApi.listProducts = originalListProducts;
    console.error = originalConsoleError;

    check("Unexpected error maps to 500", statusCode === 500);
    check("Client response does not contain the raw error text", !body.includes(secretDetail) && !body.includes("secret_internal_table"));
    check("Client response has a generic, safe message", body.includes("eroare interna"));
    check("Unexpected error was still logged server-side (console.error)", loggedServerSide);
  } catch (error) {
    check("Error sanitization test ran without crashing", false, error.message);
  }

  // ---- Cleanup: fully remove the temp test product from the database ----
  console.log("\n-- Cleanup --");
  try {
    const { getDb } = require("../server/db");
    const db = getDb();
    await db.execute({ sql: "DELETE FROM products WHERE id = ?", args: [TEST_ID] });
    await db.execute({ sql: "DELETE FROM categories WHERE id = ?", args: ["test-category-crud"] });
    const verify = await db.execute({ sql: "SELECT 1 FROM products WHERE id = ?", args: [TEST_ID] });
    check("Temp test product fully removed from database", verify.rows.length === 0);
  } catch (error) {
    check("Cleanup completed without error", false, error.message);
  }

  console.log(`\n=== Rezultat: ${passed} OK, ${failed} FAIL ===`);
  if (failed > 0) {
    console.log("\nFailed checks:");
    failures.forEach((f) => console.log("  - " + f));
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("Test suite crashed:", error);
  process.exit(1);
});
