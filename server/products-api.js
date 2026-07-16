const { getDb } = require("./db");

const CACHE_TTL_MS = 60_000;
const cache = new Map();

function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function cacheSet(key, value) {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

function invalidateProductCache(id) {
  for (const key of cache.keys()) {
    if (key.startsWith("products:") || key === "categories") {
      cache.delete(key);
      continue;
    }
    if (id && (key === `product:${id}` || key === `calculator-product:${id}`)) {
      cache.delete(key);
    }
  }
}

function rowsFor(result) {
  return result.rows;
}

function toBool(value) {
  return Number(value) === 1;
}

function mapProductSummary(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category_id,
    categoryName: row.category_name,
    shape: row.shape,
    priceMdl: row.price_mdl,
    inStock: toBool(row.in_stock),
    image: row.image || null,
    tags: row.tags ? row.tags.split("\x01") : []
  };
}

function mapMaterial(row) {
  return { name: row.name, priceMdl: row.price_mdl, unit: row.unit, type: row.unit };
}

function mapSize(row) {
  return { id: row.id, name: row.name, width: row.width, height: row.height, priceMdl: row.price_mdl };
}

async function loadSupplementsByGroup(db, groupIds) {
  const supplementsByGroup = new Map();
  if (!groupIds.length) return supplementsByGroup;

  const placeholders = groupIds.map(() => "?").join(",");
  const supplementsResult = await db.execute({
    sql: `SELECT id, group_id, name, price_mdl, unit, description FROM supplements WHERE group_id IN (${placeholders}) AND available = 1 ORDER BY sort_order`,
    args: groupIds
  });
  rowsFor(supplementsResult).forEach((row) => {
    if (!supplementsByGroup.has(row.group_id)) supplementsByGroup.set(row.group_id, []);
    supplementsByGroup.get(row.group_id).push({
      id: row.id,
      name: row.name,
      priceMdl: row.price_mdl,
      unit: row.unit,
      type: row.unit,
      description: row.description
    });
  });
  return supplementsByGroup;
}

async function listProducts(filters) {
  const db = getDb();
  const where = ["p.available = 1", "p.deleted_at IS NULL"];
  const args = [];

  if (filters.category) {
    where.push("p.category_id = ?");
    args.push(filters.category);
  }
  if (filters.inStock !== undefined) {
    where.push("p.in_stock = ?");
    args.push(filters.inStock ? 1 : 0);
  }
  if (filters.search) {
    where.push("(p.title LIKE ? OR p.description LIKE ?)");
    const term = `%${filters.search}%`;
    args.push(term, term);
  }

  const countResult = await db.execute({
    sql: `SELECT COUNT(*) as total FROM products p WHERE ${where.join(" AND ")}`,
    args
  });
  const total = Number(countResult.rows[0].total);

  const listArgs = [...args, filters.limit, filters.offset];
  const productsResult = await db.execute({
    sql: `
      SELECT
        p.id, p.title, p.description, p.category_id, p.shape, p.price_mdl, p.in_stock,
        c.name as category_name,
        (SELECT url FROM product_images WHERE product_id = p.id AND is_primary = 1 LIMIT 1) as image,
        (SELECT group_concat(tag, char(1)) FROM product_tags WHERE product_id = p.id) as tags
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE ${where.join(" AND ")}
      ORDER BY p.sort_order ASC, p.title ASC
      LIMIT ? OFFSET ?
    `,
    args: listArgs
  });

  return {
    total,
    limit: filters.limit,
    offset: filters.offset,
    products: rowsFor(productsResult).map(mapProductSummary)
  };
}

async function getProductById(id) {
  const db = getDb();
  const productResult = await db.execute({
    sql: `
      SELECT p.*, c.name as category_name
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.id = ? AND p.available = 1 AND p.deleted_at IS NULL
    `,
    args: [id]
  });
  const product = productResult.rows[0];
  if (!product) return null;

  const [images, tags, filtersResult, sizes, materials, groups] = await Promise.all([
    db.execute({ sql: "SELECT url, is_primary FROM product_images WHERE product_id = ? ORDER BY sort_order", args: [id] }),
    db.execute({ sql: "SELECT tag FROM product_tags WHERE product_id = ? ORDER BY sort_order", args: [id] }),
    db.execute({ sql: "SELECT name, value FROM product_filters WHERE product_id = ? ORDER BY sort_order", args: [id] }),
    db.execute({ sql: "SELECT id, name, width, height, price_mdl FROM product_sizes WHERE product_id = ? ORDER BY sort_order", args: [id] }),
    db.execute({ sql: "SELECT name, price_mdl, unit, available FROM product_materials WHERE product_id = ? AND available = 1 ORDER BY sort_order", args: [id] }),
    db.execute({ sql: "SELECT id, name, selection FROM option_groups WHERE product_id = ? AND available = 1 ORDER BY sort_order", args: [id] })
  ]);

  const groupRows = rowsFor(groups);
  const supplementsByGroup = await loadSupplementsByGroup(db, groupRows.map((g) => g.id));

  return {
    id: product.id,
    title: product.title,
    description: product.description,
    category: product.category_id,
    categoryName: product.category_name,
    shape: product.shape,
    priceMdl: product.price_mdl,
    inStock: toBool(product.in_stock),
    defaultSize: { width: product.default_width, height: product.default_height },
    smallestSize: { width: product.smallest_width, height: product.smallest_height },
    biggestSize: { width: product.biggest_width, height: product.biggest_height },
    smallCoefficient: product.small_coefficient,
    mediumCoefficient: product.medium_coefficient,
    bigCoefficient: product.big_coefficient,
    mediumSize: product.medium_size,
    bigSize: product.big_size,
    images: rowsFor(images).map((row) => ({ url: row.url, isPrimary: toBool(row.is_primary) })),
    tags: rowsFor(tags).map((row) => row.tag),
    filters: rowsFor(filtersResult).map((row) => ({ name: row.name, value: row.value })),
    sizes: rowsFor(sizes).map(mapSize),
    recommendedSizes: rowsFor(sizes).map(mapSize),
    materials: rowsFor(materials).map(mapMaterial),
    optionGroups: groupRows.map((group) => ({
      id: group.id,
      name: group.name,
      selection: group.selection,
      items: supplementsByGroup.get(group.id) || []
    }))
  };
}

async function listCategories() {
  const db = getDb();
  const result = await db.execute(`
    SELECT c.id, c.name, c.sort_order, COUNT(p.id) as product_count
    FROM categories c
    LEFT JOIN products p ON p.category_id = c.id AND p.available = 1 AND p.deleted_at IS NULL
    GROUP BY c.id, c.name, c.sort_order
    ORDER BY c.sort_order ASC, c.name ASC
  `);
  return rowsFor(result).map((row) => ({
    id: row.id,
    name: row.name,
    productCount: Number(row.product_count)
  }));
}

async function getCalculatorProduct(id) {
  const db = getDb();
  const productResult = await db.execute({
    sql: "SELECT * FROM products WHERE id = ? AND available = 1 AND deleted_at IS NULL",
    args: [id]
  });
  const product = productResult.rows[0];
  if (!product) return null;

  const [sizes, materials, groups] = await Promise.all([
    db.execute({ sql: "SELECT id, name, width, height, price_mdl FROM product_sizes WHERE product_id = ? ORDER BY sort_order", args: [id] }),
    db.execute({ sql: "SELECT name, price_mdl, unit FROM product_materials WHERE product_id = ? AND available = 1 ORDER BY sort_order", args: [id] }),
    db.execute({ sql: "SELECT id, name, selection FROM option_groups WHERE product_id = ? AND available = 1 ORDER BY sort_order", args: [id] })
  ]);

  const groupRows = rowsFor(groups);
  const supplementsByGroup = await loadSupplementsByGroup(db, groupRows.map((g) => g.id));

  return {
    id: product.id,
    title: product.title,
    priceMdl: product.price_mdl,
    defaultSize: { width: product.default_width, height: product.default_height },
    smallestSize: { width: product.smallest_width, height: product.smallest_height },
    biggestSize: { width: product.biggest_width, height: product.biggest_height },
    smallCoefficient: product.small_coefficient,
    mediumCoefficient: product.medium_coefficient,
    bigCoefficient: product.big_coefficient,
    mediumSize: product.medium_size,
    bigSize: product.big_size,
    recommendedSizes: rowsFor(sizes).map(mapSize),
    materials: rowsFor(materials).map(mapMaterial),
    optionGroups: groupRows.map((group) => ({
      id: group.id,
      name: group.name,
      selection: group.selection,
      items: supplementsByGroup.get(group.id) || []
    }))
  };
}

module.exports = {
  listProducts,
  getProductById,
  listCategories,
  getCalculatorProduct,
  cacheGet,
  cacheSet,
  invalidateProductCache
};
