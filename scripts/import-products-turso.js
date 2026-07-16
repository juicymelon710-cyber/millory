require("dotenv").config();

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { getDb } = require("../server/db");

const root = path.join(__dirname, "..");
const productsPath = path.join(root, "data", "products.js");
const calculatorPath = path.join(root, "data", "calculator-products.js");

const CATEGORY_NAMES = {
  led: "LED",
  baie: "Baie",
  decor: "Decor"
};

// Manually verified overrides for products.js <-> calculator-products.js entries that
// don't match automatically by id/slug/name. Each entry documents why it was confirmed.
// - leonardo-black / leonardoblak: name differs by one letter ("Blak" is a scrape typo
//   for "Black"), no other product has "Leonardo" in its title, and the product photo
//   (assets/products/leonardo-black.jpg) is a mirrored cabinet, matching the calculator
//   entry's legacy category "dulapuri" (cabinets). Confirmed 2026-07-15.
const MANUAL_CALCULATOR_MATCHES = {
  "leonardo-black": "leonardoblak"
};

function loadGlobal(filePath) {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(filePath, "utf8"), sandbox, { filename: filePath });
  return sandbox.window;
}

function cleanDescription(value) {
  return String(value || "")
    .replace(/\s*\{\{\{https?:\/\/\S+?}}}/gi, "")
    .replace(/\s*\{\{\{https?:\/\/\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function calculatorProductFor(product, calcProducts) {
  const overrideId = MANUAL_CALCULATOR_MATCHES[product.id];
  if (overrideId) {
    const override = calcProducts.find((item) => item.id === overrideId);
    if (override) return override;
  }
  return calcProducts.find((item) => (
    item.id === product.id || item.slug === product.id || item.name === product.title
  ));
}

function toInt(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : fallback;
}

function backupSource(products, calcProducts) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join(root, "data", "backups", stamp);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(productsPath, path.join(dir, "products.js"));
  fs.copyFileSync(calculatorPath, path.join(dir, "calculator-products.js"));
  fs.writeFileSync(path.join(dir, "products.snapshot.json"), JSON.stringify(products, null, 2));
  fs.writeFileSync(path.join(dir, "calculator-products.snapshot.json"), JSON.stringify(calcProducts, null, 2));
  return dir;
}

function validate(products, calcProducts) {
  const report = {
    duplicateIds: [],
    missingFields: [],
    unmatchedProducts: [],
    unmatchedCalcEntries: []
  };

  const seen = new Map();
  products.forEach((product) => {
    seen.set(product.id, (seen.get(product.id) || 0) + 1);
    const missing = ["id", "title", "category", "image"].filter((key) => !product[key]);
    if (missing.length) report.missingFields.push({ id: product.id || "(fara id)", missing });
  });
  report.duplicateIds = [...seen.entries()].filter(([, count]) => count > 1).map(([id]) => id);

  const usedCalc = new Set();
  products.forEach((product) => {
    const match = calculatorProductFor(product, calcProducts);
    if (match) usedCalc.add(match);
    else report.unmatchedProducts.push(product.id);
  });
  report.unmatchedCalcEntries = calcProducts.filter((entry) => !usedCalc.has(entry)).map((entry) => entry.id);

  return report;
}

async function importProduct(db, product, calcProducts, stats, errors) {
  const calc = calculatorProductFor(product, calcProducts);
  const materialsSource = calc?.materials?.length ? calc.materials : (product.materials || []);
  const optionGroupsSource = calc?.optionGroups?.length ? calc.optionGroups : (product.optionGroups || []);

  try {
    await db.execute({
      sql: `INSERT INTO categories (id, name, sort_order) VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET name = excluded.name`,
      args: [product.category, CATEGORY_NAMES[product.category] || product.category, 0]
    });

    await db.execute({
      sql: `INSERT INTO products (
              id, title, description, category_id, shape, price_mdl,
              default_width, default_height, smallest_width, smallest_height,
              biggest_width, biggest_height, small_coefficient, medium_coefficient,
              big_coefficient, medium_size, big_size, in_stock, available, sort_order, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(id) DO UPDATE SET
              title = excluded.title,
              description = excluded.description,
              category_id = excluded.category_id,
              shape = excluded.shape,
              price_mdl = excluded.price_mdl,
              default_width = excluded.default_width,
              default_height = excluded.default_height,
              smallest_width = excluded.smallest_width,
              smallest_height = excluded.smallest_height,
              biggest_width = excluded.biggest_width,
              biggest_height = excluded.biggest_height,
              small_coefficient = excluded.small_coefficient,
              medium_coefficient = excluded.medium_coefficient,
              big_coefficient = excluded.big_coefficient,
              medium_size = excluded.medium_size,
              big_size = excluded.big_size,
              in_stock = excluded.in_stock,
              available = excluded.available,
              updated_at = datetime('now')`,
      args: [
        product.id,
        product.title,
        cleanDescription(product.description),
        product.category,
        product.shape || null,
        toInt(product.priceMdl, 0),
        toInt(product.defaultSize?.width),
        toInt(product.defaultSize?.height),
        toInt(product.smallestSize?.width),
        toInt(product.smallestSize?.height),
        toInt(product.biggestSize?.width),
        toInt(product.biggestSize?.height),
        Number(calc?.smallCoefficient || 0),
        Number(calc?.mediumCoefficient || 0),
        Number(calc?.bigCoefficient || 0),
        toInt(calc?.mediumSize, null),
        toInt(calc?.bigSize, null),
        product.inStock !== false ? 1 : 0,
        1,
        stats.productIndex
      ]
    });
    stats.products += 1;

    await db.execute({ sql: "DELETE FROM product_images WHERE product_id = ?", args: [product.id] });
    if (product.image) {
      await db.execute({
        sql: "INSERT INTO product_images (product_id, url, is_primary, sort_order) VALUES (?, ?, 1, 0)",
        args: [product.id, product.image]
      });
      stats.images += 1;
    }

    await db.execute({ sql: "DELETE FROM product_tags WHERE product_id = ?", args: [product.id] });
    const uniqueTags = [...new Set(product.tags || [])];
    for (let i = 0; i < uniqueTags.length; i += 1) {
      await db.execute({
        sql: "INSERT INTO product_tags (product_id, tag, sort_order) VALUES (?, ?, ?)",
        args: [product.id, uniqueTags[i], i]
      });
      stats.tags += 1;
    }

    await db.execute({ sql: "DELETE FROM product_filters WHERE product_id = ?", args: [product.id] });
    const filters = product.filters || [];
    for (let i = 0; i < filters.length; i += 1) {
      await db.execute({
        sql: "INSERT INTO product_filters (product_id, name, value, sort_order) VALUES (?, ?, ?, ?)",
        args: [product.id, String(filters[i].name || ""), String(filters[i].value || ""), i]
      });
      stats.filters += 1;
    }

    await db.execute({ sql: "DELETE FROM product_sizes WHERE product_id = ?", args: [product.id] });
    const sizes = product.recommendedSizes || [];
    for (let i = 0; i < sizes.length; i += 1) {
      const size = sizes[i];
      await db.execute({
        sql: `INSERT INTO product_sizes (product_id, name, width, height, price_mdl, sort_order)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [product.id, String(size.name || `${size.width}x${size.height}`), toInt(size.width, 0), toInt(size.height, 0), toInt(size.priceMdl, null), i]
      });
      stats.sizes += 1;
    }

    await db.execute({ sql: "DELETE FROM product_materials WHERE product_id = ?", args: [product.id] });
    for (let i = 0; i < materialsSource.length; i += 1) {
      const material = materialsSource[i];
      await db.execute({
        sql: `INSERT INTO product_materials (product_id, name, price_mdl, unit, available, sort_order)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [product.id, String(material.name || "Material"), toInt(material.priceMdl, 0), String(material.type || material.unit || "buc"), material.available !== false ? 1 : 0, i]
      });
      stats.materials += 1;
    }

    const existingGroups = await db.execute({ sql: "SELECT id FROM option_groups WHERE product_id = ?", args: [product.id] });
    for (const row of existingGroups.rows) {
      await db.execute({ sql: "DELETE FROM supplements WHERE group_id = ?", args: [row.id] });
    }
    await db.execute({ sql: "DELETE FROM option_groups WHERE product_id = ?", args: [product.id] });

    for (let g = 0; g < optionGroupsSource.length; g += 1) {
      const group = optionGroupsSource[g];
      const groupResult = await db.execute({
        sql: `INSERT INTO option_groups (product_id, name, selection, available, sort_order)
              VALUES (?, ?, ?, ?, ?)`,
        args: [product.id, String(group.name || "Categorie"), group.selection === "multiple" ? "multiple" : "single", group.available !== false ? 1 : 0, g]
      });
      stats.optionGroups += 1;
      const groupId = Number(groupResult.lastInsertRowid);

      const items = group.items || [];
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        await db.execute({
          sql: `INSERT INTO supplements (group_id, name, price_mdl, unit, available, description, sort_order)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [groupId, String(item.name || item.fullName || "Supliment"), toInt(item.priceMdl, 0), String(item.type || item.unit || "buc"), item.available !== false ? 1 : 0, cleanDescription(item.description), i]
        });
        stats.supplements += 1;
      }
    }
  } catch (error) {
    errors.push({ productId: product.id, message: error.message });
  }
}

async function main() {
  console.log("Se citesc fisierele sursa...");
  const productsGlobal = loadGlobal(productsPath);
  const calcGlobal = loadGlobal(calculatorPath);
  const products = productsGlobal.MILLORY_PRODUCTS || [];
  const calcProducts = calcGlobal.MILLORY_CALCULATOR_PRODUCTS || [];

  console.log(`Produse gasite in data/products.js: ${products.length}`);
  console.log(`Intrari gasite in data/calculator-products.js: ${calcProducts.length}`);

  const report = validate(products, calcProducts);
  console.log("\n--- Raport validare ---");
  console.log(`ID-uri duplicate: ${report.duplicateIds.length}`);
  if (report.duplicateIds.length) console.log("  ", report.duplicateIds.join(", "));
  console.log(`Produse cu campuri obligatorii lipsa (id/title/category/image): ${report.missingFields.length}`);
  report.missingFields.forEach((entry) => console.log(`   ${entry.id}: lipseste ${entry.missing.join(", ")}`));
  console.log(`Produse fara corespondent in calculator-products.js (vor folosi materialele/optiunile proprii, daca exista): ${report.unmatchedProducts.length}`);
  console.log(`   ${report.unmatchedProducts.join(", ")}`);
  console.log(`Intrari in calculator-products.js fara produs corespunzator (ignorate la import): ${report.unmatchedCalcEntries.length}`);
  console.log(`   ${report.unmatchedCalcEntries.join(", ")}`);

  if (report.duplicateIds.length || report.missingFields.length) {
    console.error("\nValidarea a esuat: exista ID-uri duplicate sau campuri obligatorii lipsa. Importul NU a pornit.");
    process.exit(1);
  }
  console.log("\nValidare OK - se continua cu importul.");

  const backupDir = backupSource(products, calcProducts);
  console.log(`\nBackup salvat in: ${path.relative(root, backupDir)}`);

  const db = getDb();
  const stats = {
    productIndex: 0,
    products: 0,
    images: 0,
    tags: 0,
    filters: 0,
    sizes: 0,
    materials: 0,
    optionGroups: 0,
    supplements: 0
  };
  const errors = [];

  console.log("\nSe importa produsele in Turso...");
  for (const product of products) {
    await importProduct(db, product, calcProducts, stats, errors);
    stats.productIndex += 1;
  }

  const categoryCount = await db.execute("SELECT COUNT(*) as c FROM categories");

  console.log("\n--- Rezultat import ---");
  console.log(`Produse inserate/actualizate: ${stats.products} / ${products.length}`);
  console.log(`Categorii in baza de date: ${Number(categoryCount.rows[0].c)}`);
  console.log(`Imagini inserate: ${stats.images}`);
  console.log(`Tag-uri inserate: ${stats.tags}`);
  console.log(`Filtre inserate: ${stats.filters}`);
  console.log(`Dimensiuni inserate: ${stats.sizes}`);
  console.log(`Materiale inserate: ${stats.materials}`);
  console.log(`Grupuri de optiuni inserate: ${stats.optionGroups}`);
  console.log(`Suplimente inserate: ${stats.supplements}`);
  console.log(`Produse omise/nepotrivite (raportate mai sus, nu blocheaza importul): ${report.unmatchedProducts.length} fara pret calculator, ${report.unmatchedCalcEntries.length} intrari calculator neutilizate`);
  console.log(`Erori: ${errors.length}`);
  errors.forEach((entry) => console.log(`   ${entry.productId}: ${entry.message}`));
}

main().catch((error) => {
  console.error("Importul a esuat:", error);
  process.exit(1);
});
