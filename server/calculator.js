const VALID_UNITS = new Set(["m2", "ml", "mm", "buc"]);

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function formatId(value, fallback) {
  return String(value || fallback || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function quantityByUnit(unit, metrics) {
  if (unit === "m2") return metrics.area;
  if (unit === "ml") return metrics.perimeter;
  if (unit === "mm") return metrics.width / 1000;
  return 1;
}

function cleanDescription(value) {
  return String(value || "")
    .replace(/\s*\{\{\{https?:\/\/\S+?}}}/gi, "")
    .replace(/\s*\{\{\{https?:\/\/\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeItem(item, fallbackId) {
  const unit = VALID_UNITS.has(item.unit || item.type) ? item.unit || item.type : "buc";
  return {
    id: formatId(item.id, fallbackId),
    name: String(item.name || "Element").trim(),
    priceMdl: Math.max(0, toNumber(item.priceMdl)),
    unit,
    available: item.available !== false,
    description: cleanDescription(item.description)
  };
}

function normalizeConfig(input) {
  const source = input || {};
  const settings = source.settings || {};
  const normalized = {
    settings: {
      markupPercent: Math.max(0, Math.min(500, toNumber(settings.markupPercent, 40))),
      minHeight: Math.max(100, toNumber(settings.minHeight, 400)),
      minWidth: Math.max(100, toNumber(settings.minWidth, 400)),
      maxHeight: Math.max(100, toNumber(settings.maxHeight, 3000)),
      maxWidth: Math.max(100, toNumber(settings.maxWidth, 3000))
    },
    products: []
  };

  if (normalized.settings.minHeight > normalized.settings.maxHeight) {
    throw badRequest("Dimensiunea minima de inaltime nu poate fi mai mare decat maxima.");
  }
  if (normalized.settings.minWidth > normalized.settings.maxWidth) {
    throw badRequest("Dimensiunea minima de latime nu poate fi mai mare decat maxima.");
  }

  normalized.products = (source.products || []).map((product, productIndex) => {
    const id = formatId(product.id || product.slug, `produs-${productIndex + 1}`);
    const smallestSize = product.smallestSize || {};
    const biggestSize = product.biggestSize || {};
    const defaultSize = product.defaultSize || product.recommendedSizes?.[0] || smallestSize;
    const optionGroups = (product.optionGroups || []).map((group, groupIndex) => ({
      id: formatId(group.id, `categorie-${groupIndex + 1}`),
      name: String(group.name || "Categorie").trim(),
      selection: group.selection === "multiple" ? "multiple" : "single",
      available: group.available !== false,
      items: (group.items || []).map((item, itemIndex) => normalizeItem(item, `supliment-${itemIndex + 1}`))
    }));

    return {
      id,
      name: String(product.name || product.title || "Produs").trim(),
      slug: String(product.slug || id).trim(),
      category: String(product.category || "oglinzi").trim(),
      image: String(product.image || "").trim(),
      available: product.available !== false,
      defaultSize: {
        width: toNumber(defaultSize?.width, normalized.settings.minWidth),
        height: toNumber(defaultSize?.height, normalized.settings.minHeight)
      },
      smallestSize: {
        width: toNumber(smallestSize.width, normalized.settings.minWidth),
        height: toNumber(smallestSize.height, normalized.settings.minHeight)
      },
      biggestSize: {
        width: toNumber(biggestSize.width, normalized.settings.maxWidth),
        height: toNumber(biggestSize.height, normalized.settings.maxHeight)
      },
      recommendedSizes: (product.recommendedSizes || []).map((size, sizeIndex) => ({
        id: formatId(size.id, `dimensiune-${sizeIndex + 1}`),
        name: String(size.name || `${size.height}x${size.width}`).trim(),
        width: toNumber(size.width),
        height: toNumber(size.height)
      })),
      materials: (product.materials || []).map((item, itemIndex) => normalizeItem(item, `material-${itemIndex + 1}`)),
      optionGroups
    };
  });

  if (!normalized.products.length) {
    throw badRequest("Trebuie sa existe cel putin un produs in calculator.");
  }

  normalized.products.forEach((product) => {
    if (!product.materials.length) {
      throw badRequest(`Produsul ${product.name} trebuie sa aiba cel putin un material.`);
    }
  });

  return normalized;
}

function publicConfig(config) {
  return {
    settings: config.settings,
    products: config.products
      .filter((product) => product.available !== false)
      .map((product) => ({
        id: product.id,
        name: product.name,
        category: product.category,
        image: product.image,
        defaultSize: product.defaultSize,
        smallestSize: product.smallestSize,
        biggestSize: product.biggestSize,
        recommendedSizes: product.recommendedSizes,
        optionGroups: product.optionGroups
          .filter((group) => group.available !== false)
          .map((group) => ({
            id: group.id,
            name: group.name,
            selection: group.selection,
            items: group.items
              .filter((item) => item.available !== false)
              .map((item) => ({
                id: item.id,
                name: item.name,
                unit: item.unit,
                description: cleanDescription(item.description)
              }))
          }))
      }))
  };
}

function metricsFor(product, settings, widthInput, heightInput) {
  const minHeight = Math.max(settings.minHeight, toNumber(product.smallestSize.height, settings.minHeight));
  const minWidth = Math.max(settings.minWidth, toNumber(product.smallestSize.width, settings.minWidth));
  const maxHeight = Math.min(settings.maxHeight, toNumber(product.biggestSize.height, settings.maxHeight));
  const maxWidth = Math.min(settings.maxWidth, toNumber(product.biggestSize.width, settings.maxWidth));
  const rawHeight = toNumber(heightInput, product.defaultSize.height);
  const rawWidth = toNumber(widthInput, product.defaultSize.width);
  const height = Math.min(maxHeight, Math.max(minHeight, rawHeight));
  const width = Math.min(maxWidth, Math.max(minWidth, rawWidth));

  return {
    height,
    width,
    area: (height * width) / 1000000,
    perimeter: ((height + width) * 2) / 1000,
    limits: { minHeight, minWidth, maxHeight, maxWidth },
    adjusted: rawHeight !== height || rawWidth !== width
  };
}

function calculateQuote(config, payload) {
  const product = config.products.find((entry) => entry.id === payload.productId && entry.available !== false);
  if (!product) throw badRequest("Produsul selectat nu este disponibil.");

  const metrics = metricsFor(product, config.settings, payload.width, payload.height);
  const materialCost = product.materials.reduce((sum, material) => {
    return sum + material.priceMdl * quantityByUnit(material.unit, metrics);
  }, 0);
  const basePrice = Math.round(materialCost * (1 + config.settings.markupPercent / 100));
  const selectedIds = new Set(payload.optionIds || []);
  const optionGroups = product.optionGroups
    .filter((group) => group.available !== false)
    .map((group) => ({
      id: group.id,
      name: group.name,
      selection: group.selection,
      items: group.items
        .filter((item) => item.available !== false)
        .map((item) => ({
          id: item.id,
          name: item.name,
          unit: item.unit,
          priceMdl: Math.round(item.priceMdl * quantityByUnit(item.unit, metrics)),
          selected: selectedIds.has(item.id)
        }))
    }));
  const optionTotal = optionGroups.reduce((sum, group) => {
    return sum + group.items.reduce((groupSum, item) => groupSum + (item.selected ? item.priceMdl : 0), 0);
  }, 0);

  return {
    product: { id: product.id, name: product.name, image: product.image },
    metrics,
    basePriceMdl: basePrice,
    optionGroups,
    selectedOptions: optionGroups.flatMap((group) => (
      group.items.filter((item) => item.selected).map((item) => ({
        group: group.name,
        id: item.id,
        name: item.name,
        priceMdl: item.priceMdl
      }))
    )),
    totalMdl: basePrice + optionTotal
  };
}

module.exports = {
  normalizeConfig,
  publicConfig,
  calculateQuote,
  VALID_UNITS
};
