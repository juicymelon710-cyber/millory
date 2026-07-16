const { chromium } = require("playwright");

let passed = 0;
let failed = 0;

function check(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`  OK   ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${label}`);
  }
}

async function main() {
  const browser = await chromium.launch();

  // ===== API MODE =====
  console.log("=== MOD API (Turso real) ===");
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on("pageerror", (err) => errors.push(err.message));
    const apiCalls = [];
    page.on("response", (res) => {
      if (res.url().includes("/api/")) apiCalls.push({ url: res.url(), status: res.status() });
    });

    await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    check("no page errors on load", errors.length === 0);
    check("GET /api/products was called", apiCalls.some((c) => c.url.includes("/api/products?") && c.status === 200));

    const cardCount = await page.locator("#productGrid .product-card").count();
    check("catalog cards render (limited to 10 on homepage)", cardCount === 10);

    // switch to "all" via show more to check full 107 count is reachable
    const showMore = page.locator("#showMoreProducts");
    if (await showMore.count()) {
      await showMore.click();
      await page.waitForTimeout(300);
    }
    const allCount = await page.locator("#productGrid .product-card").count();
    check("all 107 products render after 'show more'", allCount === 107);

    console.log("--- filtre ---");
    await page.locator('.filter[data-filter="led"]').click();
    await page.waitForTimeout(300);
    const ledCards = await page.locator("#productGrid .product-card").count();
    const ledCategories = await page.locator("#productGrid .product-card").evaluateAll((cards) => cards.map((c) => c.dataset.category));
    check("category filter LED shows only led products", ledCards > 0 && ledCategories.every((c) => c === "led"));

    await page.locator('.filter[data-filter="all"]').click();
    await page.waitForTimeout(300);
    // Clicking the "all" category filter intentionally collapses back to the
    // homepage's limited view (matches real site behavior) - re-expand so the
    // rest of this test can find any of the 107 products by id.
    if (await showMore.count()) {
      await showMore.click();
      await page.waitForTimeout(300);
    }

    console.log("--- cautare (search prin filtrele existente pe pagina) ---");
    // The site doesn't have a dedicated search box; verify via API-backed data directly instead.
    const searchApi = await page.evaluate(async () => {
      const res = await fetch("/api/products?search=alexandra");
      return res.json();
    });
    check("API search finds Alexandra", searchApi.ok && searchApi.products.some((p) => p.id === "alexandra"));

    console.log("--- modale produs (minim 5) ---");
    const idsToOpen = ["alexandra", "leonardo-black", "davide", "selma", "simple-f1"];
    for (const id of idsToOpen) {
      const card = page.locator(`.product-card[data-product-id="${id}"]`);
      if (await card.count()) {
        await card.scrollIntoViewIfNeeded();
        await card.click();
      } else {
        await page.evaluate((productId) => {
          document.querySelectorAll(".product-card, .featured-card").forEach((el) => {
            if (el.dataset.productId === productId) el.click();
          });
        }, id);
      }
      await page.waitForTimeout(600);
      const isOpen = await page.locator("#productModal.open").count();
      const title = (await page.locator("#modalTitle").textContent().catch(() => "")) || "";
      const titleMatchesId = title.trim().toLowerCase().replace(/\s+/g, "-").includes(id.split("-")[0]);
      if (isOpen !== 1 || !titleMatchesId) console.log(`    DEBUG isOpen=${isOpen} titleMatchesId=${titleMatchesId} rawTitle=${JSON.stringify(title)}`);
      check(`modal opens for ${id} (title: "${title.trim()}")`, isOpen === 1 && titleMatchesId);
      await page.evaluate(() => document.querySelector("button.modal-close")?.click());
      await page.waitForTimeout(300);
      const closedOk = await page.evaluate(() => !document.body.classList.contains("product-modal-open"));
      check(`modal for ${id} closes cleanly`, closedOk);
    }

    console.log("--- leonardo-black date calculator ---");
    await page.evaluate(() => {
      document.querySelectorAll(".product-card").forEach((el) => {
        if (el.dataset.productId === "leonardo-black") el.click();
      });
    });
    await page.waitForTimeout(700);
    const optionGroupCount = await page.locator("#modalOptions .option-group").count();
    const totalText = await page.locator("#modalTotal").textContent();
    check("leonardo-black shows option groups from calculator API", optionGroupCount === 10);
    check("leonardo-black shows a real computed price (not 'pret la cerere')", !/pret la cerere/i.test(totalText || ""));
    await page.evaluate(() => document.querySelector("button.modal-close")?.click());
    await page.waitForTimeout(300);

    console.log("--- favorite si cos ---");
    await page.waitForTimeout(500); // let cart.js finish injecting buttons
    const favBtn = page.locator(".favorite-card-button").first();
    await favBtn.scrollIntoViewIfNeeded();
    await favBtn.click({ force: true });
    await page.waitForTimeout(300);
    const favActive = await favBtn.evaluate((el) => el.classList.contains("is-favorite"));
    check("favorite toggles on click", favActive === true);

    const cartBtn = page.locator(".cart-card-button").first();
    await cartBtn.scrollIntoViewIfNeeded();
    await cartBtn.click({ force: true });
    await page.waitForTimeout(300);
    const cartCount = await page.locator("[data-cart-count]").first().textContent();
    check("cart count increments after adding a product", Number(cartCount) >= 1);

    await page.close();
  }

  // ===== FALLBACK MODE (API blocked) =====
  console.log("\n=== MOD FALLBACK (API blocat) ===");
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.route("**/api/products**", (route) => route.abort("failed"));
    await page.route("**/api/calculator/products/**", (route) => route.abort("failed"));

    await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    check("no visible page errors when API is unreachable", errors.length === 0);

    const showMore = page.locator("#showMoreProducts");
    if (await showMore.count()) {
      await showMore.click();
      await page.waitForTimeout(300);
    }
    const fallbackCount = await page.locator("#productGrid .product-card").count();
    check("all 107 products still render from static fallback", fallbackCount === 107);

    await page.locator('.filter[data-filter="baie"]').click();
    await page.waitForTimeout(300);
    const baieCategories = await page.locator("#productGrid .product-card").evaluateAll((cards) => cards.map((c) => c.dataset.category));
    check("filters still work in fallback mode", baieCategories.length > 0 && baieCategories.every((c) => c === "baie"));

    await page.evaluate(() => {
      document.querySelectorAll(".product-card").forEach((el) => {
        if (el.dataset.productId === "leonardo-black") el.click();
      });
    });
    await page.waitForTimeout(600);
    const modalOpenFallback = await page.locator("#productModal.open").count();
    check("product modal still opens in fallback mode (using static data)", modalOpenFallback === 1);
    const noErrorTextShown = await page.locator("body").innerText();
    check("no raw error text (e.g. 'Failed to fetch') visible on page", !/failed to fetch|typeerror|networkerror/i.test(noErrorTextShown));

    await page.close();
  }

  await browser.close();

  console.log(`\n=== Rezultat: ${passed} OK, ${failed} FAIL ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("Testele au esuat:", error);
  process.exit(1);
});
