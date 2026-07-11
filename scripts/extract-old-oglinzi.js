const fs = require("fs");
const path = require("path");

const BASE_URL = "https://mirrors-md-website-or4fi4bst-alegzandru.vercel.app";
const LIST_URL = `${BASE_URL}/oglinzi`;
const RON_RATE = 4;

const root = path.join(__dirname, "..");
const dataDir = path.join(root, "data");
const assetsDir = path.join(root, "assets", "products");
const listPagePath = path.join(dataDir, "old-oglinzi-page.html");
const listJsonPath = path.join(dataDir, "old-oglinzi-list.json");
const detailsJsonPath = path.join(dataDir, "old-oglinzi-details.json");
const productsPath = path.join(dataDir, "products.js");

const aliasByOldSlug = new Map([
    ["elizabeth", "elizabeth-27"],
    ["nadinne", "nadine"],
    ["scarlett", "scarlet"],
    ["sophie", "sophy"],
    ["hollywood", "hollywood-pro"],
    ["fp-1", "fp"],
    ["earl", "earl-23"],
    ["aris", "ares"],
]);

function stripDiacritics(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function slugify(value) {
    return stripDiacritics(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function compactKey(value) {
    return stripDiacritics(value)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}

function cleanText(value) {
    return String(value || "")
        .split("{{{")[0]
        .replace(/\s+/g, " ")
        .trim();
}

function toRon(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number / RON_RATE) : null;
}

function imageUrl(raw) {
    const image = raw.image && raw.image[0];
    if (!image) return "";
    if (image.formats && image.formats.large && image.formats.large.url) return image.formats.large.url;
    if (image.formats && image.formats.medium && image.formats.medium.url) return image.formats.medium.url;
    return image.url || "";
}

function extensionFromUrl(url) {
    const clean = String(url || "").split("?")[0].toLowerCase();
    if (clean.endsWith(".png")) return ".png";
    if (clean.endsWith(".webp")) return ".webp";
    return ".jpg";
}

function shapeFromFilters(filters) {
    const joined = (filters || []).map((item) => `${item.name} ${item.value}`).join(" ").toLowerCase();
    if (joined.includes("rotund")) return "round";
    if (joined.includes("oval")) return "round";
    if (joined.includes("arc")) return "arch";
    return "rect";
}

function categoryFromFilters(raw) {
    const joined = (raw.filters || []).map((item) => `${item.name} ${item.value}`).join(" ").toLowerCase();
    if (joined.includes("led") || raw.seria) return "led";
    if (joined.includes("baie")) return "baie";
    return "decor";
}

function sizePrice(raw, size) {
    if (!size) return null;
    if (raw.defaultsize && size.name === raw.defaultsize.name) return raw.price ?? null;
    if (!raw.m2price) return null;

    const area = (Number(size.width || 0) * Number(size.height || 0)) / 1000000;
    if (!area) return null;

    let coefficient = raw.smallcoeficient_ro || raw.smallcoeficient || 1;
    const longestSide = Math.max(Number(size.width || 0), Number(size.height || 0));

    if (longestSide >= (raw.big_size || 1600)) {
        coefficient = raw.bigcoeficient_ro || raw.bigcoeficient || coefficient;
    } else if (longestSide >= (raw.medium_size || 1300)) {
        coefficient = raw.mediumcoeficient_ro || raw.mediumcoeficient || coefficient;
    }

    return Math.round(area * Number(raw.m2price || 0) * coefficient);
}

function addonLabel(addon) {
    return [addon.typename || addon.name].filter(Boolean).join(" ").trim();
}

function optionGroups(raw) {
    const groupNames = Array.from(new Set((raw.add_ons || []).map((addon) => addon.group).filter(Boolean)));

    return groupNames
        .map((groupName) => {
            const items = (raw.add_ons || [])
                .filter((addon) => addon.group === groupName)
                .map((addon) => ({
                    id: addon.id,
                    name: addonLabel(addon),
                    fullName: [addon.group, addon.typename || addon.name].filter(Boolean).join(" ").trim(),
                    priceMdl: addon.price ?? null,
                    priceRon: toRon(addon.price),
                    type: addon.type || "",
                    description: cleanText(addon.popup || addon.description),
                }));

            return items.length ? { name: groupName, items } : null;
        })
        .filter(Boolean);
}

function normalizeProduct(raw, existing) {
    const sourceImage = imageUrl(raw);
    const fallbackId = slugify(raw.slug || raw.name);
    const id = existing ? existing.id : fallbackId;
    const localImage = existing && existing.image ? existing.image : `assets/products/${id}${extensionFromUrl(sourceImage)}`;

    const recommendedSizes = (raw.linkedsizes || []).map((size) => {
        const priceMdl = sizePrice(raw, size);
        return {
            id: size.id,
            name: size.name,
            width: size.width,
            height: size.height,
            priceMdl,
            priceRon: toRon(priceMdl),
        };
    });

    return {
        ...(existing || {}),
        id,
        legacyId: raw.id,
        title: raw.name,
        category: categoryFromFilters(raw),
        shape: shapeFromFilters(raw.filters || []),
        description: cleanText(raw.description) || (existing && existing.description) || "Oglinda realizata la comanda, cu dimensiuni flexibile si optiuni suplimentare pentru confort, iluminare si montaj.",
        tags: [
            raw.seria,
            raw.category && raw.category.name,
            raw.filters && raw.filters[0] && raw.filters[0].value,
            raw.finished_product ? "In stoc" : "La comanda",
        ].filter(Boolean),
        image: localImage,
        sourceImage,
        priceMdl: raw.price ?? null,
        priceRon: toRon(raw.price),
        m2PriceMdl: raw.m2price ?? null,
        defaultSize: raw.defaultsize || (recommendedSizes[0] || null),
        smallestSize: raw.smallestsize || (recommendedSizes[0] || null),
        biggestSize: raw.biggestsize || (recommendedSizes[recommendedSizes.length - 1] || null),
        recommendedSizes,
        filters: (raw.filters || []).map((filter) => ({
            name: filter.name,
            value: filter.value,
        })),
        materials: (raw.materials || []).map((material) => ({
            id: material.id,
            name: String(material.name || "").trim(),
            priceMdl: material.price ?? null,
            priceRon: toRon(material.price),
            type: material.type || "",
        })),
        optionGroups: optionGroups(raw),
        inStock: Boolean(raw.inStock || raw.finished_product),
        sourceUrl: `${BASE_URL}/produse/comanda/${raw.slug}`,
    };
}

function readCurrentProducts() {
    const source = fs.readFileSync(productsPath, "utf8").replace(/^\uFEFF/, "");
    const match = source.match(/window\.MILLORY_PRODUCTS\s*=\s*([\s\S]*?);\s*$/);
    if (!match) throw new Error("Could not parse data/products.js.");
    return JSON.parse(match[1]);
}

function extractPayload(html) {
    const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!match) throw new Error("Could not find __NEXT_DATA__ in /oglinzi page.");
    return JSON.parse(match[1]);
}

async function ensureListPage() {
    let html = "";
    if (fs.existsSync(listPagePath)) {
        html = fs.readFileSync(listPagePath, "utf8").replace(/^\uFEFF/, "");
    }

    if (!html.includes("__NEXT_DATA__")) {
        const response = await fetch(LIST_URL);
        if (!response.ok) throw new Error(`Could not fetch ${LIST_URL}: ${response.status}`);
        html = await response.text();
        fs.writeFileSync(listPagePath, html, "utf8");
    }

    return html;
}

async function downloadImage(product) {
    if (!product.sourceImage || !product.image) return false;
    const target = path.join(root, product.image);
    if (fs.existsSync(target)) return false;

    fs.mkdirSync(path.dirname(target), { recursive: true });
    const response = await fetch(product.sourceImage);
    if (!response.ok) throw new Error(`Could not download image for ${product.id}: ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(target, buffer);
    return true;
}

async function main() {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.mkdirSync(assetsDir, { recursive: true });

    const html = await ensureListPage();
    const payload = extractPayload(html);
    const rawProducts = payload.props.pageProps.products || [];
    if (!rawProducts.length) throw new Error("No products found in old /oglinzi payload.");

    const currentProducts = readCurrentProducts();
    const byId = new Map(currentProducts.map((product) => [product.id, product]));
    const byCompactId = new Map(currentProducts.map((product) => [compactKey(product.id), product]));
    const byCompactTitle = new Map(currentProducts.map((product) => [compactKey(product.title), product]));

    const usedIds = new Set();
    const normalizedById = new Map();
    const added = [];
    const updated = [];
    const imagesDownloaded = [];

    for (const raw of rawProducts) {
        const alias = aliasByOldSlug.get(raw.slug);
        const existing = (alias && byId.get(alias))
            || byCompactId.get(compactKey(raw.slug))
            || byCompactTitle.get(compactKey(raw.name));
        const normalized = normalizeProduct(raw, existing);
        normalizedById.set(normalized.id, normalized);
        usedIds.add(normalized.id);
        if (existing) updated.push(normalized.id);
        else added.push(normalized.id);

        if (await downloadImage(normalized)) imagesDownloaded.push(normalized.image);
    }

    const merged = currentProducts.map((product) => normalizedById.get(product.id) || product);
    for (const product of normalizedById.values()) {
        if (!currentProducts.some((item) => item.id === product.id)) merged.push(product);
    }

    fs.writeFileSync(productsPath, `window.MILLORY_PRODUCTS = ${JSON.stringify(merged, null, 4)};\n`, "utf8");
    fs.writeFileSync(listJsonPath, JSON.stringify(rawProducts, null, 4), "utf8");
    fs.writeFileSync(detailsJsonPath, JSON.stringify(Array.from(normalizedById.values()), null, 4), "utf8");

    console.log(`Old products parsed: ${rawProducts.length}`);
    console.log(`Updated existing products: ${updated.length}`);
    console.log(`Added missing old products: ${added.length}${added.length ? ` (${added.join(", ")})` : ""}`);
    console.log(`Total local products: ${merged.length}`);
    console.log(`Images downloaded: ${imagesDownloaded.length}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
