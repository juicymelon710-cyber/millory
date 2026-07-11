const fs = require("fs");
const path = require("path");

const sourcePath = path.join(__dirname, "..", "old-alexandra-page.html");
const html = fs.readFileSync(sourcePath, "utf8").replace(/^\uFEFF/, "");
const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);

if (!match) {
    throw new Error("Could not find __NEXT_DATA__ payload.");
}

const payload = JSON.parse(match[1]);
let raw = payload.props.pageProps.productData;

if (raw && raw["0"]) {
    raw = raw["0"];
} else {
    raw = Object.values(raw || {}).find((value) => value && value.name);
}

if (!raw || !raw.name) {
    throw new Error("Could not locate the product object in __NEXT_DATA__.");
}
const ronRate = 4;

function cleanText(value) {
    return fixText(value)
        .split("{{{")[0]
        .replace(/\s+/g, " ")
        .trim();
}

function fixText(value) {
    return String(value || "")
        .replace(/Дѓ/g, "ă")
        .replace(/Д‚/g, "â")
        .replace(/Гў/g, "â")
        .replace(/Г®/g, "î")
        .replace(/И›/g, "ț")
        .replace(/И™/g, "ș")
        .replace(/ЕЈ/g, "ț")
        .replace(/Еџ/g, "ș")
        .replace(/Дў/g, "Ă")
        .replace(/ГЋ/g, "Î")
        .replace(/Иљ/g, "Ș")
        .replace(/Иў/g, "Ț");
}

function toRon(value) {
    return Math.round(Number(value || 0) / ronRate);
}

function shapeFromFilters(filters) {
    const shape = filters.find((item) => item.name === "Forma oglinzii");
    if (!shape) return "rect";
    return shape.value.toLowerCase().includes("rotund") ? "round" : "rect";
}

function categoryFromFilters(filters) {
    const lighting = filters.find((item) => item.name === "Tip de Iluminare");
    return lighting && lighting.value.toLowerCase().includes("led") ? "led" : "decor";
}

function sizePrice(size) {
    if (size.name === raw.defaultsize.name) return raw.price;

    const area = (size.width * size.height) / 1000000;
    let coefficient = raw.smallcoeficient_ro || 1;

    if (Math.max(size.width, size.height) >= (raw.big_size || 1600)) {
        coefficient = raw.bigcoeficient_ro || raw.bigcoeficient || 1;
    } else if (Math.max(size.width, size.height) >= (raw.medium_size || 1300)) {
        coefficient = raw.mediumcoeficient_ro || raw.mediumcoeficient || 1;
    }

    return Math.round(area * raw.m2price * coefficient);
}

function addonLabel(addon) {
    const type = addon.typename ? ` ${fixText(addon.typename)}` : "";
    return `${fixText(addon.group)}${type}`.trim();
}

const optionNames = (raw.optionNames || Array.from(new Set((raw.add_ons || []).map((addon) => addon.group))))
    .filter(Boolean);

const optionGroups = optionNames
    .map((groupName) => {
        const items = raw.add_ons
            .filter((addon) => addon.group === groupName)
            .map((addon) => ({
                id: addon.id,
                name: fixText(addon.typename || addon.name),
                fullName: addonLabel(addon),
                priceMdl: addon.price,
                priceRon: toRon(addon.price),
                type: addon.type,
                description: cleanText(addon.popup || addon.description)
            }));

        return items.length ? { name: fixText(groupName).trim(), items } : null;
    })
    .filter(Boolean);

const image = raw.image && raw.image[0];
const largeImage = image && image.formats && image.formats.large
    ? image.formats.large.url
    : image && image.url;

const product = {
    id: raw.slug,
    legacyId: raw.id,
    title: raw.name,
    category: categoryFromFilters(raw.filters || []),
    shape: shapeFromFilters(raw.filters || []),
    description: raw.description || "Oglinda LED realizata la comanda, cu dimensiuni flexibile si optiuni suplimentare pentru confort, iluminare si montaj.",
    tags: [
        raw.seria,
        raw.category && raw.category.name,
        raw.filters && raw.filters[0] && fixText(raw.filters[0].value),
        raw.finished_product ? "La comanda" : "In stoc"
    ].filter(Boolean),
    image: "assets/products/alexandra.png",
    sourceImage: largeImage,
    priceMdl: raw.price,
    priceRon: toRon(raw.price),
    m2PriceMdl: raw.m2price,
    defaultSize: raw.defaultsize,
    smallestSize: raw.smallestsize,
    biggestSize: raw.biggestsize,
    recommendedSizes: (raw.linkedsizes || []).map((size) => {
        const priceMdl = sizePrice(size);
        return {
            id: size.id,
            name: size.name,
            width: size.width,
            height: size.height,
            priceMdl,
            priceRon: toRon(priceMdl)
        };
    }),
    filters: (raw.filters || []).map((filter) => ({
        name: fixText(filter.name),
        value: fixText(filter.value)
    })),
    materials: (raw.materials || []).map((material) => ({
        id: material.id,
        name: fixText(material.name).trim(),
        priceMdl: material.price,
        priceRon: toRon(material.price),
        type: material.type
    })),
    optionGroups,
    inStock: raw.inStock,
    sourceUrl: "https://mirrors-md-website-or4fi4bst-alegzandru.vercel.app/produse/comanda/alexandra"
};

const js = `window.MILLORY_PRODUCTS = ${JSON.stringify([product], null, 4)};\n`;
fs.writeFileSync(path.join(__dirname, "..", "data", "products.js"), js, "utf8");
fs.writeFileSync(path.join(__dirname, "..", "data", "alexandra-old-source.json"), JSON.stringify(raw, null, 4), "utf8");
fs.writeFileSync(path.join(__dirname, "..", "data", "alexandra-normalized.json"), JSON.stringify(product, null, 4), "utf8");

console.log(`Extracted ${product.title}: ${product.recommendedSizes.length} sizes, ${product.optionGroups.length} option groups, ${product.materials.length} materials.`);
console.log(product.sourceImage);
