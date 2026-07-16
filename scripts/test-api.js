require("dotenv").config();

const http = require("http");
const route = require("../server.js");

const FORBIDDEN_KEYS = ["sort_order", "created_at", "updated_at", "available", "category_id", "price_mdl", "in_stock", "is_primary", "group_id"];

let passed = 0;
let failed = 0;
const timings = [];

function check(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`  OK   ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${label}`);
  }
}

async function timedFetch(url) {
  const start = Date.now();
  const response = await fetch(url);
  const ms = Date.now() - start;
  timings.push({ url, ms, status: response.status });
  const body = await response.json().catch(() => null);
  return { response, body, ms };
}

function hasNoForbiddenKeys(value) {
  const json = JSON.stringify(value);
  return FORBIDDEN_KEYS.every((key) => !json.includes(`"${key}"`));
}

async function main() {
  const server = http.createServer(route);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  console.log("=== GET /api/products ===");
  {
    const { response, body, ms } = await timedFetch(`${base}/api/products`);
    check("status 200", response.status === 200);
    check("ok true", body?.ok === true);
    check("total is 107", body?.total === 107);
    check("returns default limit of 20 products", body?.products?.length === 20);
    check("no internal db fields leaked", hasNoForbiddenKeys(body));
    console.log(`  (${ms}ms)`);
  }

  console.log("=== GET /api/products?category=led ===");
  {
    const { response, body } = await timedFetch(`${base}/api/products?category=led&limit=100`);
    check("status 200", response.status === 200);
    check("all products have category led", body?.products?.every((p) => p.category === "led"));
  }

  console.log("=== GET /api/products?inStock=true ===");
  {
    const { response, body } = await timedFetch(`${base}/api/products?inStock=true&limit=100`);
    check("status 200", response.status === 200);
    check("all products in stock", body?.products?.every((p) => p.inStock === true));
  }

  console.log("=== GET /api/products?search=alexandra ===");
  {
    const { response, body } = await timedFetch(`${base}/api/products?search=alexandra`);
    check("status 200", response.status === 200);
    check("finds Alexandra", body?.products?.some((p) => p.id === "alexandra"));
  }

  console.log("=== GET /api/products invalid params ===");
  {
    const r1 = await timedFetch(`${base}/api/products?limit=0`);
    check("limit=0 -> 400", r1.response.status === 400);
    const r2 = await timedFetch(`${base}/api/products?limit=abc`);
    check("limit=abc -> 400", r2.response.status === 400);
    const r3 = await timedFetch(`${base}/api/products?inStock=maybe`);
    check("inStock=maybe -> 400", r3.response.status === 400);
    const r4 = await timedFetch(`${base}/api/products?offset=-1`);
    check("offset=-1 -> 400", r4.response.status === 400);
  }

  console.log("=== GET /api/products/alexandra ===");
  {
    const { response, body, ms } = await timedFetch(`${base}/api/products/alexandra`);
    check("status 200", response.status === 200);
    check("has images", body?.product?.images?.length > 0);
    check("has tags", body?.product?.tags?.length > 0);
    check("has filters", body?.product?.filters?.length > 0);
    check("has sizes", body?.product?.sizes?.length > 0);
    check("has materials", body?.product?.materials?.length > 0);
    check("has optionGroups", body?.product?.optionGroups?.length > 0);
    check("no internal db fields leaked", hasNoForbiddenKeys(body));
    console.log(`  (${ms}ms)`);
  }

  console.log("=== GET /api/products/leonardo-black (manual match verification) ===");
  {
    const { response, body } = await timedFetch(`${base}/api/products/leonardo-black`);
    check("status 200", response.status === 200);
    check("materials count is 29", body?.product?.materials?.length === 29);
    check("optionGroups count is 10", body?.product?.optionGroups?.length === 10);
  }

  console.log("=== GET /api/products/does-not-exist ===");
  {
    const { response } = await timedFetch(`${base}/api/products/does-not-exist`);
    check("status 404", response.status === 404);
  }

  console.log("=== GET /api/products/<invalid-id> ===");
  {
    const { response } = await timedFetch(`${base}/api/products/${encodeURIComponent("bad id;drop table")}`);
    check("status 400", response.status === 400);
  }

  console.log("=== GET /api/categories ===");
  {
    const { response, body, ms } = await timedFetch(`${base}/api/categories`);
    check("status 200", response.status === 200);
    check("has 3 categories", body?.categories?.length === 3);
    const total = (body?.categories || []).reduce((sum, c) => sum + c.productCount, 0);
    check("category product counts sum to 107", total === 107);
    console.log(`  (${ms}ms)`);
  }

  console.log("=== GET /api/calculator/products/alexandra ===");
  {
    const { response, body, ms } = await timedFetch(`${base}/api/calculator/products/alexandra`);
    check("status 200", response.status === 200);
    check("has materials", body?.product?.materials?.length > 0);
    check("has optionGroups", body?.product?.optionGroups?.length > 0);
    console.log(`  (${ms}ms)`);
  }

  console.log("=== GET /api/calculator/products/leonardo-black (manual match verification) ===");
  {
    const { response, body } = await timedFetch(`${base}/api/calculator/products/leonardo-black`);
    check("status 200", response.status === 200);
    check("materials count is 29", body?.product?.materials?.length === 29);
    check("optionGroups count is 10", body?.product?.optionGroups?.length === 10);
  }

  console.log("=== GET /api/calculator/products/silvia (should not exist as a product) ===");
  {
    const { response } = await timedFetch(`${base}/api/calculator/products/silvia`);
    check("status 404 (silvia was never matched to a product)", response.status === 404);
  }

  server.close();

  console.log("\n=== Timp de raspuns ===");
  timings.forEach((t) => console.log(`  ${t.status}  ${t.ms}ms  ${t.url}`));
  const avg = timings.reduce((sum, t) => sum + t.ms, 0) / timings.length;
  console.log(`  medie: ${avg.toFixed(1)}ms`);

  console.log(`\n=== Rezultat: ${passed} OK, ${failed} FAIL ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("Testele au esuat:", error);
  process.exit(1);
});
