const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { saveConfig, hasConfig } = require("../server/store");

const sourcePath = path.join(__dirname, "..", "server", "seeds", "calculator-products.js");
const source = fs.readFileSync(sourcePath, "utf8");
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: sourcePath });

const products = sandbox.window.MILLORY_CALCULATOR_PRODUCTS || [];
const config = {
  settings: {
    markupPercent: 40,
    minHeight: 400,
    minWidth: 400,
    maxHeight: 3000,
    maxWidth: 3000
  },
  products: products.map((product) => ({
    ...product,
    available: product.available !== false,
    materials: (product.materials || []).map((material) => ({
      ...material,
      unit: material.type || material.unit || "buc",
      available: material.available !== false
    })),
    optionGroups: (product.optionGroups || []).map((group) => ({
      ...group,
      selection: group.selection || inferSelection(group.name),
      available: group.available !== false,
      items: (group.items || []).map((item) => ({
        ...item,
        unit: item.type || item.unit || "buc",
        available: item.available !== false
      }))
    }))
  }))
};

function inferSelection(name) {
  const value = String(name || "").toLowerCase();
  if (value.includes("buton")) return "single";
  if (value.includes("dezabur")) return "single";
  if (value.includes("ram")) return "single";
  if (value.includes("foaie")) return "single";
  if (value.includes("lentil")) return "single";
  return "multiple";
}

saveConfig(config);

console.log(hasConfig() ? "Baza de date a fost initializata." : "Baza de date nu a fost initializata.");
console.log(`Produse importate: ${products.length}`);
console.log(`Parola admin implicita pentru dev este ADMIN_PASSWORD sau "admin123".`);
