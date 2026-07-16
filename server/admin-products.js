const { getDb } = require("./db");

const ALLOWED_FIELDS = new Set([
  "id", "title", "description", "category", "shape", "priceMdl", "inStock", "active",
  "image", "tags", "filters",
  "defaultSize", "smallestSize", "biggestSize", "recommendedSizes",
  "smallCoefficient", "mediumCoefficient", "bigCoefficient", "mediumSize", "bigSize",
  "materials", "optionGroups"
]);

const MAX_PRICE = 100_000_000;
const MAX_TEXT = 2000;
const MAX_SHORT_TEXT = 200;

// Unified error type carrying the HTTP status it should map to. server.js
// reads `.status` off any thrown error (duck typing) - errors without a
// `.status` are treated as unexpected and sanitized before reaching the client.
class ApiError extends Error {
  constructor(status, errors) {
    const list = Array.isArray(errors) ? errors : [errors];
    super(list.join(" "));
    this.name = "ApiError";
    this.status = status;
    this.errors = list;
  }
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toIntOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : null;
}

function validateSize(size, label, errors) {
  if (size === undefined || size === null) return { width: null, height: null };
  if (!isPlainObject(size)) {
    errors.push(`${label} trebuie sa fie un obiect {width, height}.`);
    return { width: null, height: null };
  }
  const width = toIntOrNull(size.width);
  const height = toIntOrNull(size.height);
  if (size.width !== undefined && width === null) errors.push(`${label}.width trebuie sa fie numeric.`);
  if (size.height !== undefined && height === null) errors.push(`${label}.height trebuie sa fie numeric.`);
  return { width, height };
}

function validatePayload(payload, { isCreate }) {
  const errors = [];

  if (!isPlainObject(payload)) {
    throw new ApiError(400, ["Corpul cererii trebuie sa fie un obiect JSON."]);
  }

  const unexpected = Object.keys(payload).filter((key) => !ALLOWED_FIELDS.has(key));
  if (unexpected.length) {
    throw new ApiError(400, [`Campuri necunoscute sau nepermise: ${unexpected.join(", ")}.`]);
  }

  const title = String(payload.title || "").trim();
  if (!title) errors.push("Titlul este obligatoriu.");
  if (title.length > MAX_SHORT_TEXT) errors.push(`Titlul nu poate depasi ${MAX_SHORT_TEXT} caractere.`);

  const category = String(payload.category || "").trim();
  if (!category) errors.push("Categoria este obligatorie.");
  if (category && !/^[a-z0-9-]+$/i.test(category)) errors.push("Categoria poate contine doar litere, cifre si cratime.");

  let id = String(payload.id || "").trim();
  if (isCreate) {
    if (!id) id = slugify(title);
    if (!id) errors.push("Nu s-a putut genera un ID valid din titlu; specifica un id manual.");
    if (id && !/^[a-z0-9-]+$/i.test(id)) errors.push("ID-ul poate contine doar litere, cifre si cratime.");
    if (id.length > 100) errors.push("ID-ul este prea lung.");
  }

  const description = payload.description !== undefined ? String(payload.description) : "";
  if (description.length > MAX_TEXT) errors.push(`Descrierea nu poate depasi ${MAX_TEXT} caractere.`);

  const shape = payload.shape !== undefined ? String(payload.shape).trim() : null;

  const priceMdl = payload.priceMdl !== undefined ? Number(payload.priceMdl) : 0;
  if (!Number.isFinite(priceMdl) || priceMdl < 0 || priceMdl > MAX_PRICE) errors.push("Pretul trebuie sa fie un numar pozitiv valid.");

  const inStock = payload.inStock !== undefined ? Boolean(payload.inStock) : true;
  const active = payload.active !== undefined ? Boolean(payload.active) : true;

  const image = payload.image !== undefined ? String(payload.image).trim() : "";
  if (image.length > MAX_TEXT) errors.push("URL-ul imaginii este prea lung.");

  const tags = Array.isArray(payload.tags) ? payload.tags : [];
  if (payload.tags !== undefined && !Array.isArray(payload.tags)) errors.push("tags trebuie sa fie un array.");
  const cleanTags = tags.map((tag, index) => {
    if (typeof tag !== "string" || !tag.trim()) {
      errors.push(`tags[${index}] trebuie sa fie un text nevid.`);
      return null;
    }
    return tag.trim().slice(0, 60);
  }).filter(Boolean);

  const filters = Array.isArray(payload.filters) ? payload.filters : [];
  if (payload.filters !== undefined && !Array.isArray(payload.filters)) errors.push("filters trebuie sa fie un array.");
  const cleanFilters = filters.map((item, index) => {
    if (!isPlainObject(item) || !String(item.name || "").trim() || !String(item.value || "").trim()) {
      errors.push(`filters[${index}] trebuie sa aiba name si value nevide.`);
      return null;
    }
    return { name: String(item.name).trim().slice(0, 80), value: String(item.value).trim().slice(0, 80) };
  }).filter(Boolean);

  const defaultSize = validateSize(payload.defaultSize, "defaultSize", errors);
  const smallestSize = validateSize(payload.smallestSize, "smallestSize", errors);
  const biggestSize = validateSize(payload.biggestSize, "biggestSize", errors);

  const recommendedSizes = Array.isArray(payload.recommendedSizes) ? payload.recommendedSizes : [];
  if (payload.recommendedSizes !== undefined && !Array.isArray(payload.recommendedSizes)) errors.push("recommendedSizes trebuie sa fie un array.");
  const cleanSizes = recommendedSizes.map((size, index) => {
    if (!isPlainObject(size)) {
      errors.push(`recommendedSizes[${index}] trebuie sa fie un obiect.`);
      return null;
    }
    const width = toIntOrNull(size.width);
    const height = toIntOrNull(size.height);
    if (width === null || height === null) {
      errors.push(`recommendedSizes[${index}] trebuie sa aiba width si height numerice.`);
      return null;
    }
    return {
      name: String(size.name || `${width}x${height}`).trim().slice(0, 60),
      width,
      height,
      priceMdl: size.priceMdl !== undefined ? toIntOrNull(size.priceMdl) : null
    };
  }).filter(Boolean);

  for (const [key, label] of [["smallCoefficient", "smallCoefficient"], ["mediumCoefficient", "mediumCoefficient"], ["bigCoefficient", "bigCoefficient"]]) {
    if (payload[key] !== undefined && (!isFiniteNumber(Number(payload[key])) || Number(payload[key]) < 0)) {
      errors.push(`${label} trebuie sa fie un numar pozitiv.`);
    }
  }
  const smallCoefficient = Number(payload.smallCoefficient || 0);
  const mediumCoefficient = Number(payload.mediumCoefficient || 0);
  const bigCoefficient = Number(payload.bigCoefficient || 0);
  const mediumSize = payload.mediumSize !== undefined ? toIntOrNull(payload.mediumSize) : null;
  const bigSize = payload.bigSize !== undefined ? toIntOrNull(payload.bigSize) : null;

  const materials = Array.isArray(payload.materials) ? payload.materials : [];
  if (payload.materials !== undefined && !Array.isArray(payload.materials)) errors.push("materials trebuie sa fie un array.");
  const cleanMaterials = materials.map((material, index) => {
    if (!isPlainObject(material) || !String(material.name || "").trim()) {
      errors.push(`materials[${index}] trebuie sa aiba un nume.`);
      return null;
    }
    const price = Number(material.priceMdl || 0);
    if (!Number.isFinite(price) || price < 0) {
      errors.push(`materials[${index}].priceMdl trebuie sa fie un numar pozitiv.`);
      return null;
    }
    return {
      name: String(material.name).trim().slice(0, 120),
      priceMdl: price,
      unit: ["m2", "ml", "mm", "buc"].includes(material.unit) ? material.unit : "buc",
      available: material.available !== false
    };
  }).filter(Boolean);

  const optionGroups = Array.isArray(payload.optionGroups) ? payload.optionGroups : [];
  if (payload.optionGroups !== undefined && !Array.isArray(payload.optionGroups)) errors.push("optionGroups trebuie sa fie un array.");
  const cleanGroups = optionGroups.map((group, groupIndex) => {
    if (!isPlainObject(group) || !String(group.name || "").trim()) {
      errors.push(`optionGroups[${groupIndex}] trebuie sa aiba un nume.`);
      return null;
    }
    const items = Array.isArray(group.items) ? group.items : [];
    if (group.items !== undefined && !Array.isArray(group.items)) {
      errors.push(`optionGroups[${groupIndex}].items trebuie sa fie un array.`);
    }
    const cleanItems = items.map((item, itemIndex) => {
      if (!isPlainObject(item) || !String(item.name || "").trim()) {
        errors.push(`optionGroups[${groupIndex}].items[${itemIndex}] trebuie sa aiba un nume.`);
        return null;
      }
      const price = Number(item.priceMdl || 0);
      if (!Number.isFinite(price) || price < 0) {
        errors.push(`optionGroups[${groupIndex}].items[${itemIndex}].priceMdl trebuie sa fie un numar pozitiv.`);
        return null;
      }
      return {
        name: String(item.name).trim().slice(0, 120),
        priceMdl: price,
        unit: ["m2", "ml", "mm", "buc"].includes(item.unit) ? item.unit : "buc",
        description: item.description !== undefined ? String(item.description).slice(0, MAX_TEXT) : "",
        available: item.available !== false
      };
    }).filter(Boolean);
    return {
      name: String(group.name).trim().slice(0, 100),
      selection: group.selection === "multiple" ? "multiple" : "single",
      available: group.available !== false,
      items: cleanItems
    };
  }).filter(Boolean);

  if (errors.length) throw new ApiError(422, errors);

  return {
    id, title, description, category, shape, priceMdl, inStock, active, image,
    tags: cleanTags, filters: cleanFilters,
    defaultSize, smallestSize, biggestSize, recommendedSizes: cleanSizes,
    smallCoefficient, mediumCoefficient, bigCoefficient, mediumSize, bigSize,
    materials: cleanMaterials, optionGroups: cleanGroups
  };
}

async function listAdminProducts(filters) {
  const db = getDb();
  // Deleted products are excluded from the normal list by default. Passing
  // deleted:true switches to the trash view (only deleted products) instead
  // of mixing the two - the two states are meant to be viewed separately.
  const where = [filters.deleted ? "p.deleted_at IS NOT NULL" : "p.deleted_at IS NULL"];
  const args = [];

  if (filters.category) {
    where.push("p.category_id = ?");
    args.push(filters.category);
  }
  if (filters.inStock !== undefined) {
    where.push("p.in_stock = ?");
    args.push(filters.inStock ? 1 : 0);
  }
  if (filters.active !== undefined) {
    where.push("p.available = ?");
    args.push(filters.active ? 1 : 0);
  }
  if (filters.search) {
    where.push("(p.title LIKE ? OR p.id LIKE ?)");
    const term = `%${filters.search}%`;
    args.push(term, term);
  }
  const whereSql = `WHERE ${where.join(" AND ")}`;

  const countResult = await db.execute({ sql: `SELECT COUNT(*) as total FROM products p ${whereSql}`, args });
  const total = Number(countResult.rows[0].total);

  const listResult = await db.execute({
    sql: `
      SELECT p.id, p.title, p.category_id, c.name as category_name, p.price_mdl, p.in_stock, p.available, p.deleted_at, p.updated_at,
        (SELECT url FROM product_images WHERE product_id = p.id AND is_primary = 1 LIMIT 1) as image
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      ${whereSql}
      ORDER BY p.updated_at DESC
      LIMIT ? OFFSET ?
    `,
    args: [...args, filters.limit, filters.offset]
  });

  return {
    total,
    limit: filters.limit,
    offset: filters.offset,
    products: listResult.rows.map((row) => ({
      id: row.id,
      title: row.title,
      category: row.category_id,
      categoryName: row.category_name,
      priceMdl: row.price_mdl,
      inStock: Boolean(row.in_stock),
      active: Boolean(row.available),
      deleted: Boolean(row.deleted_at),
      deletedAt: row.deleted_at,
      image: row.image || null,
      updatedAt: row.updated_at
    }))
  };
}

async function getAdminProductById(id) {
  const db = getDb();
  const productResult = await db.execute({
    sql: `SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = ?`,
    args: [id]
  });
  const product = productResult.rows[0];
  if (!product) return null;

  const [images, tags, filtersResult, sizes, materials, groups] = await Promise.all([
    db.execute({ sql: "SELECT url, is_primary FROM product_images WHERE product_id = ? ORDER BY sort_order", args: [id] }),
    db.execute({ sql: "SELECT tag FROM product_tags WHERE product_id = ? ORDER BY sort_order", args: [id] }),
    db.execute({ sql: "SELECT name, value FROM product_filters WHERE product_id = ? ORDER BY sort_order", args: [id] }),
    db.execute({ sql: "SELECT id, name, width, height, price_mdl FROM product_sizes WHERE product_id = ? ORDER BY sort_order", args: [id] }),
    db.execute({ sql: "SELECT name, price_mdl, unit, available FROM product_materials WHERE product_id = ? ORDER BY sort_order", args: [id] }),
    db.execute({ sql: "SELECT id, name, selection, available FROM option_groups WHERE product_id = ? ORDER BY sort_order", args: [id] })
  ]);

  const groupRows = groups.rows;
  const supplementsByGroup = new Map();
  if (groupRows.length) {
    const groupIds = groupRows.map((g) => g.id);
    const placeholders = groupIds.map(() => "?").join(",");
    const supplementsResult = await db.execute({
      sql: `SELECT id, group_id, name, price_mdl, unit, description, available FROM supplements WHERE group_id IN (${placeholders}) ORDER BY sort_order`,
      args: groupIds
    });
    supplementsResult.rows.forEach((row) => {
      if (!supplementsByGroup.has(row.group_id)) supplementsByGroup.set(row.group_id, []);
      supplementsByGroup.get(row.group_id).push({
        id: row.id,
        name: row.name,
        priceMdl: row.price_mdl,
        unit: row.unit,
        description: row.description,
        available: Boolean(row.available)
      });
    });
  }

  return {
    id: product.id,
    title: product.title,
    description: product.description,
    category: product.category_id,
    categoryName: product.category_name,
    shape: product.shape,
    priceMdl: product.price_mdl,
    inStock: Boolean(product.in_stock),
    active: Boolean(product.available),
    deleted: Boolean(product.deleted_at),
    deletedAt: product.deleted_at,
    image: images.rows.find((row) => row.is_primary)?.url || images.rows[0]?.url || "",
    defaultSize: { width: product.default_width, height: product.default_height },
    smallestSize: { width: product.smallest_width, height: product.smallest_height },
    biggestSize: { width: product.biggest_width, height: product.biggest_height },
    smallCoefficient: product.small_coefficient,
    mediumCoefficient: product.medium_coefficient,
    bigCoefficient: product.big_coefficient,
    mediumSize: product.medium_size,
    bigSize: product.big_size,
    tags: tags.rows.map((row) => row.tag),
    filters: filtersResult.rows.map((row) => ({ name: row.name, value: row.value })),
    recommendedSizes: sizes.rows.map((row) => ({ id: row.id, name: row.name, width: row.width, height: row.height, priceMdl: row.price_mdl })),
    materials: materials.rows.map((row) => ({ name: row.name, priceMdl: row.price_mdl, unit: row.unit, available: Boolean(row.available) })),
    optionGroups: groupRows.map((group) => ({
      id: group.id,
      name: group.name,
      selection: group.selection,
      available: Boolean(group.available),
      items: supplementsByGroup.get(group.id) || []
    })),
    updatedAt: product.updated_at,
    createdAt: product.created_at
  };
}

async function productExists(id) {
  const db = getDb();
  const result = await db.execute({ sql: "SELECT 1 FROM products WHERE id = ?", args: [id] });
  return result.rows.length > 0;
}

async function getProductState(id) {
  const db = getDb();
  const result = await db.execute({ sql: "SELECT deleted_at FROM products WHERE id = ?", args: [id] });
  if (!result.rows.length) return { exists: false, deleted: false };
  return { exists: true, deleted: Boolean(result.rows[0].deleted_at) };
}

async function ensureCategory(tx, category) {
  await tx.execute({
    sql: `INSERT INTO categories (id, name, sort_order) VALUES (?, ?, 0) ON CONFLICT(id) DO NOTHING`,
    args: [category, category]
  });
}

async function writeProductRelations(tx, id, data) {
  await tx.execute({ sql: "DELETE FROM product_images WHERE product_id = ?", args: [id] });
  if (data.image) {
    await tx.execute({
      sql: "INSERT INTO product_images (product_id, url, is_primary, sort_order) VALUES (?, ?, 1, 0)",
      args: [id, data.image]
    });
  }

  await tx.execute({ sql: "DELETE FROM product_tags WHERE product_id = ?", args: [id] });
  for (let i = 0; i < data.tags.length; i += 1) {
    await tx.execute({ sql: "INSERT INTO product_tags (product_id, tag, sort_order) VALUES (?, ?, ?)", args: [id, data.tags[i], i] });
  }

  await tx.execute({ sql: "DELETE FROM product_filters WHERE product_id = ?", args: [id] });
  for (let i = 0; i < data.filters.length; i += 1) {
    const f = data.filters[i];
    await tx.execute({ sql: "INSERT INTO product_filters (product_id, name, value, sort_order) VALUES (?, ?, ?, ?)", args: [id, f.name, f.value, i] });
  }

  await tx.execute({ sql: "DELETE FROM product_sizes WHERE product_id = ?", args: [id] });
  for (let i = 0; i < data.recommendedSizes.length; i += 1) {
    const s = data.recommendedSizes[i];
    await tx.execute({
      sql: "INSERT INTO product_sizes (product_id, name, width, height, price_mdl, sort_order) VALUES (?, ?, ?, ?, ?, ?)",
      args: [id, s.name, s.width, s.height, s.priceMdl, i]
    });
  }

  await tx.execute({ sql: "DELETE FROM product_materials WHERE product_id = ?", args: [id] });
  for (let i = 0; i < data.materials.length; i += 1) {
    const m = data.materials[i];
    await tx.execute({
      sql: "INSERT INTO product_materials (product_id, name, price_mdl, unit, available, sort_order) VALUES (?, ?, ?, ?, ?, ?)",
      args: [id, m.name, m.priceMdl, m.unit, m.available ? 1 : 0, i]
    });
  }

  const existingGroups = await tx.execute({ sql: "SELECT id FROM option_groups WHERE product_id = ?", args: [id] });
  for (const row of existingGroups.rows) {
    await tx.execute({ sql: "DELETE FROM supplements WHERE group_id = ?", args: [row.id] });
  }
  await tx.execute({ sql: "DELETE FROM option_groups WHERE product_id = ?", args: [id] });
  for (let g = 0; g < data.optionGroups.length; g += 1) {
    const group = data.optionGroups[g];
    const groupResult = await tx.execute({
      sql: "INSERT INTO option_groups (product_id, name, selection, available, sort_order) VALUES (?, ?, ?, ?, ?)",
      args: [id, group.name, group.selection, group.available ? 1 : 0, g]
    });
    const groupId = Number(groupResult.lastInsertRowid);
    for (let i = 0; i < group.items.length; i += 1) {
      const item = group.items[i];
      await tx.execute({
        sql: "INSERT INTO supplements (group_id, name, price_mdl, unit, available, description, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)",
        args: [groupId, item.name, item.priceMdl, item.unit, item.available ? 1 : 0, item.description, i]
      });
    }
  }
}

async function createProduct(payload) {
  const data = validatePayload(payload, { isCreate: true });
  const existing = await getProductState(data.id);
  if (existing.exists) {
    const hint = existing.deleted ? " Produsul este sters - poate fi restaurat in loc de recreat." : "";
    throw new ApiError(409, [`Un produs cu id-ul "${data.id}" exista deja.${hint}`]);
  }

  const db = getDb();
  const tx = await db.transaction("write");
  try {
    await ensureCategory(tx, data.category);
    await tx.execute({
      sql: `INSERT INTO products (
              id, title, description, category_id, shape, price_mdl,
              default_width, default_height, smallest_width, smallest_height,
              biggest_width, biggest_height, small_coefficient, medium_coefficient,
              big_coefficient, medium_size, big_size, in_stock, available, sort_order
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      args: [
        data.id, data.title, data.description, data.category, data.shape, data.priceMdl,
        data.defaultSize.width, data.defaultSize.height, data.smallestSize.width, data.smallestSize.height,
        data.biggestSize.width, data.biggestSize.height, data.smallCoefficient, data.mediumCoefficient,
        data.bigCoefficient, data.mediumSize, data.bigSize, data.inStock ? 1 : 0, data.active ? 1 : 0
      ]
    });
    await writeProductRelations(tx, data.id, data);
    await tx.commit();
  } catch (error) {
    await tx.rollback().catch(() => {});
    throw error;
  }

  return getAdminProductById(data.id);
}

async function updateProduct(id, payload) {
  const state = await getProductState(id);
  if (!state.exists) return null;
  if (state.deleted) {
    throw new ApiError(409, ["Produsul este sters. Restaureaza-l inainte de a-l edita."]);
  }
  const data = validatePayload({ ...payload, id }, { isCreate: false });

  const db = getDb();
  const tx = await db.transaction("write");
  try {
    await ensureCategory(tx, data.category);
    await tx.execute({
      sql: `UPDATE products SET
              title = ?, description = ?, category_id = ?, shape = ?, price_mdl = ?,
              default_width = ?, default_height = ?, smallest_width = ?, smallest_height = ?,
              biggest_width = ?, biggest_height = ?, small_coefficient = ?, medium_coefficient = ?,
              big_coefficient = ?, medium_size = ?, big_size = ?, in_stock = ?, available = ?,
              updated_at = datetime('now')
            WHERE id = ?`,
      args: [
        data.title, data.description, data.category, data.shape, data.priceMdl,
        data.defaultSize.width, data.defaultSize.height, data.smallestSize.width, data.smallestSize.height,
        data.biggestSize.width, data.biggestSize.height, data.smallCoefficient, data.mediumCoefficient,
        data.bigCoefficient, data.mediumSize, data.bigSize, data.inStock ? 1 : 0, data.active ? 1 : 0,
        id
      ]
    });
    await writeProductRelations(tx, id, data);
    await tx.commit();
  } catch (error) {
    await tx.rollback().catch(() => {});
    throw error;
  }

  return getAdminProductById(id);
}

// Soft delete: stamps the dedicated `deleted_at` column rather than reusing
// `available` (which stays a pure publish/unpublish toggle an admin can flip
// independently of deletion). Chosen over hard deletion because
// order_items.product_id references products, and hard-deleting would either
// orphan historical order records or require cascading deletes that erase a
// customer's order history. deleted_at IS NULL is also required (alongside
// available = 1) by every public-facing query, so a deleted product
// disappears from the live site immediately - and it stays reversible via
// restoreProduct, independent of whatever the `active` flag was set to.
//
// Idempotent: calling this on an already-deleted product is a no-op that
// returns the existing state unchanged (same deleted_at timestamp preserved,
// no error) rather than re-stamping the deletion time on every retry.
async function softDeleteProduct(id, { hard = false } = {}) {
  if (hard) {
    // Permanent deletion is intentionally not supported - order history and
    // the delete/restore audit trail both depend on the row surviving.
    throw new ApiError(403, ["Stergerea permanenta nu este permisa. Foloseste doar stergerea reversibila (soft delete)."]);
  }
  const state = await getProductState(id);
  if (!state.exists) return null;
  if (!state.deleted) {
    const db = getDb();
    await db.execute({
      sql: "UPDATE products SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
      args: [id]
    });
  }
  return getAdminProductById(id);
}

// Idempotent: restoring a product that isn't deleted is a no-op that returns
// the current state unchanged rather than erroring.
async function restoreProduct(id) {
  const state = await getProductState(id);
  if (!state.exists) return null;
  if (state.deleted) {
    const db = getDb();
    await db.execute({
      sql: "UPDATE products SET deleted_at = NULL, updated_at = datetime('now') WHERE id = ?",
      args: [id]
    });
  }
  return getAdminProductById(id);
}

module.exports = {
  ApiError,
  listAdminProducts,
  getAdminProductById,
  createProduct,
  updateProduct,
  softDeleteProduct,
  restoreProduct
};
