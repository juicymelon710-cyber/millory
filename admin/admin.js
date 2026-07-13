(function () {
  const loginPanel = document.querySelector("[data-login-panel]");
  const adminPanel = document.querySelector("[data-admin-panel]");
  const loginForm = document.querySelector("[data-login-form]");
  const loginMessage = document.querySelector("[data-login-message]");
  const adminMessage = document.querySelector("[data-admin-message]");
  const settingsTarget = document.querySelector("[data-settings]");
  const productsTarget = document.querySelector("[data-products]");
  const saveButton = document.querySelector("[data-save]");
  const logoutButton = document.querySelector("[data-logout]");
  const addProductButton = document.querySelector("[data-add-product]");

  const units = [
    ["m2", "m2"],
    ["ml", "ml"],
    ["buc", "bucata"],
    ["mm", "latime ml"]
  ];

  let config = null;

  function setMessage(target, text, type) {
    target.textContent = text || "";
    target.classList.toggle("ok", type === "ok");
    target.classList.toggle("error", type === "error");
  }

  async function request(url, options = {}) {
    const response = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      ...options
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      throw new Error(data.message || "A aparut o eroare.");
    }
    return data;
  }

  function field(label, value, attrs = "") {
    return `<label>${label}<input value="${escapeHtml(value ?? "")}" ${attrs}></label>`;
  }

  function numberField(label, value, attrs = "") {
    return `<label>${label}<input type="number" step="0.01" value="${Number(value || 0)}" ${attrs}></label>`;
  }

  function checkbox(label, checked, attrs = "") {
    return `<label>${label}<select ${attrs}><option value="true" ${checked ? "selected" : ""}>Disponibil</option><option value="false" ${!checked ? "selected" : ""}>Indisponibil</option></select></label>`;
  }

  function unitSelect(value, attrs = "") {
    return `<label>Unitate<select ${attrs}>${units.map(([id, name]) => `<option value="${id}" ${id === value ? "selected" : ""}>${name}</option>`).join("")}</select></label>`;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderSettings() {
    settingsTarget.innerHTML = `
      ${numberField("Adaos %", config.settings.markupPercent, 'data-setting="markupPercent" min="0" max="500"')}
      ${numberField("Inaltime minima", config.settings.minHeight, 'data-setting="minHeight" min="100"')}
      ${numberField("Latime minima", config.settings.minWidth, 'data-setting="minWidth" min="100"')}
      ${numberField("Inaltime maxima", config.settings.maxHeight, 'data-setting="maxHeight" min="100"')}
      ${numberField("Latime maxima", config.settings.maxWidth, 'data-setting="maxWidth" min="100"')}
    `;
  }

  function renderProducts() {
    productsTarget.innerHTML = config.products.map((product, productIndex) => `
      <article class="product-editor" data-product-index="${productIndex}">
        <div class="product-top">
          <div>
            <p class="eyebrow">${escapeHtml(product.category)}</p>
            <h2>${escapeHtml(product.name)}</h2>
          </div>
          <div class="row-actions">
            <button type="button" class="secondary" data-add-material="${productIndex}">Material</button>
            <button type="button" class="secondary" data-add-group="${productIndex}">Categorie suplimente</button>
            <button type="button" class="danger" data-delete-product="${productIndex}">Sterge produs</button>
          </div>
        </div>
        <div class="product-body">
          <div class="editor-grid">
            ${field("Nume produs", product.name, `data-product-field="name"`)}
            ${field("Categorie", product.category, `data-product-field="category"`)}
            ${checkbox("Status produs", product.available !== false, `data-product-field="available"`)}
            ${field("Imagine", product.image, `data-product-field="image"`)}
            ${numberField("Default inaltime", product.defaultSize.height, `data-product-field="defaultSize.height"`)}
            ${numberField("Default latime", product.defaultSize.width, `data-product-field="defaultSize.width"`)}
            ${numberField("Min inaltime produs", product.smallestSize.height, `data-product-field="smallestSize.height"`)}
            ${numberField("Min latime produs", product.smallestSize.width, `data-product-field="smallestSize.width"`)}
            ${numberField("Max inaltime produs", product.biggestSize.height, `data-product-field="biggestSize.height"`)}
            ${numberField("Max latime produs", product.biggestSize.width, `data-product-field="biggestSize.width"`)}
          </div>

          <div class="editor-block">
            <div class="editor-block-head">
              <h3>Materiale interne</h3>
              <span>${product.materials.length} elemente</span>
            </div>
            <div class="items-list">
              ${product.materials.map((item, itemIndex) => itemRow(productIndex, itemIndex, item, "material")).join("")}
            </div>
          </div>

          <div class="editor-block">
            <div class="editor-block-head">
              <h3>Suplimente</h3>
              <span>${product.optionGroups.length} categorii</span>
            </div>
            <div class="items-list">
              ${product.optionGroups.map((group, groupIndex) => groupRow(productIndex, groupIndex, group)).join("")}
            </div>
          </div>
        </div>
      </article>
    `).join("");
  }

  function itemRow(productIndex, itemIndex, item, type, groupIndex = null) {
    const prefix = groupIndex === null
      ? `data-${type}-field`
      : `data-option-field`;
    const groupAttr = groupIndex === null ? "" : `data-group-index="${groupIndex}"`;
    return `
      <div class="item-row" data-item-index="${itemIndex}" ${groupAttr}>
        ${field("Denumire", item.name, `${prefix}="name"`)}
        ${numberField("Pret MDL", item.priceMdl, `${prefix}="priceMdl" min="0"`)}
        ${unitSelect(item.unit, `${prefix}="unit"`)}
        ${checkbox("Status", item.available !== false, `${prefix}="available"`)}
        <button type="button" class="danger" data-delete-${type}="${productIndex}" data-group-index="${groupIndex ?? ""}" data-item-index="${itemIndex}">Sterge</button>
      </div>
    `;
  }

  function groupRow(productIndex, groupIndex, group) {
    return `
      <div class="group-row" data-group-index="${groupIndex}">
        <div class="editor-grid">
          ${field("Categorie", group.name, `data-group-field="name"`)}
          <label>Selectie<select data-group-field="selection"><option value="single" ${group.selection !== "multiple" ? "selected" : ""}>o singura optiune</option><option value="multiple" ${group.selection === "multiple" ? "selected" : ""}>mai multe optiuni</option></select></label>
          ${checkbox("Status categorie", group.available !== false, `data-group-field="available"`)}
          <label>Actiuni<button type="button" class="secondary" data-add-option="${productIndex}" data-group-index="${groupIndex}">Supliment nou</button></label>
        </div>
        <div class="items-list">
          ${(group.items || []).map((item, itemIndex) => itemRow(productIndex, itemIndex, item, "option", groupIndex)).join("")}
        </div>
        <button type="button" class="danger" data-delete-group="${productIndex}" data-group-index="${groupIndex}">Sterge categoria</button>
      </div>
    `;
  }

  function render() {
    renderSettings();
    renderProducts();
  }

  function readNumber(input) {
    const number = Number(input.value);
    if (!Number.isFinite(number) || number < 0) throw new Error("Valorile numerice trebuie sa fie pozitive.");
    return number;
  }

  function setDeep(target, path, value) {
    const parts = path.split(".");
    let cursor = target;
    parts.slice(0, -1).forEach((part) => {
      cursor[part] = cursor[part] || {};
      cursor = cursor[part];
    });
    cursor[parts[parts.length - 1]] = value;
  }

  function collectFromDom() {
    settingsTarget.querySelectorAll("[data-setting]").forEach((input) => {
      config.settings[input.dataset.setting] = readNumber(input);
    });

    productsTarget.querySelectorAll("[data-product-index]").forEach((productEl) => {
      const product = config.products[Number(productEl.dataset.productIndex)];
      productEl.querySelectorAll("[data-product-field]").forEach((input) => {
        const key = input.dataset.productField;
        const value = input.tagName === "SELECT" && (input.value === "true" || input.value === "false")
          ? input.value === "true"
          : input.type === "number" ? readNumber(input) : input.value.trim();
        setDeep(product, key, value);
      });

      productEl.querySelectorAll("[data-material-field]").forEach((input) => {
        const itemEl = input.closest("[data-item-index]");
        const item = product.materials[Number(itemEl.dataset.itemIndex)];
        const key = input.dataset.materialField;
        item[key] = input.tagName === "SELECT" && (input.value === "true" || input.value === "false")
          ? input.value === "true"
          : input.type === "number" ? readNumber(input) : input.value.trim();
      });

      productEl.querySelectorAll("[data-group-index]").forEach((groupEl) => {
        if (!groupEl.classList.contains("group-row")) return;
        const group = product.optionGroups[Number(groupEl.dataset.groupIndex)];
        groupEl.querySelectorAll(":scope > .editor-grid [data-group-field]").forEach((input) => {
          const key = input.dataset.groupField;
          group[key] = input.tagName === "SELECT" && (input.value === "true" || input.value === "false")
            ? input.value === "true"
            : input.value.trim();
        });
        groupEl.querySelectorAll("[data-option-field]").forEach((input) => {
          const itemEl = input.closest("[data-item-index]");
          const item = group.items[Number(itemEl.dataset.itemIndex)];
          const key = input.dataset.optionField;
          item[key] = input.tagName === "SELECT" && (input.value === "true" || input.value === "false")
            ? input.value === "true"
            : input.type === "number" ? readNumber(input) : input.value.trim();
        });
      });
    });
  }

  function newItem(name = "Supliment nou") {
    return {
      id: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`,
      name,
      priceMdl: 0,
      unit: "buc",
      available: true,
      description: ""
    };
  }

  productsTarget.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    collectFromDom();
    const productIndex = Number(button.dataset.addMaterial ?? button.dataset.addGroup ?? button.dataset.addOption ?? button.dataset.deleteProduct ?? button.dataset.deleteMaterial ?? button.dataset.deleteGroup ?? button.dataset.deleteOption);
    const product = config.products[productIndex];

    if (button.matches("[data-add-material]")) product.materials.push(newItem("Material nou"));
    if (button.matches("[data-add-group]")) product.optionGroups.push({ id: `categorie-${Date.now()}`, name: "Categorie noua", selection: "single", available: true, items: [] });
    if (button.matches("[data-add-option]")) product.optionGroups[Number(button.dataset.groupIndex)].items.push(newItem());
    if (button.matches("[data-delete-product]")) config.products.splice(productIndex, 1);
    if (button.matches("[data-delete-material]")) product.materials.splice(Number(button.dataset.itemIndex), 1);
    if (button.matches("[data-delete-group]")) product.optionGroups.splice(Number(button.dataset.groupIndex), 1);
    if (button.matches("[data-delete-option]")) product.optionGroups[Number(button.dataset.groupIndex)].items.splice(Number(button.dataset.itemIndex), 1);
    render();
  });

  addProductButton.addEventListener("click", () => {
    collectFromDom();
    config.products.push({
      id: `produs-${Date.now()}`,
      name: "Produs nou",
      slug: `produs-${Date.now()}`,
      category: "oglinzi",
      image: "",
      available: true,
      defaultSize: { width: 800, height: 800 },
      smallestSize: { width: 400, height: 400 },
      biggestSize: { width: 3000, height: 3000 },
      recommendedSizes: [],
      materials: [newItem("Material principal")],
      optionGroups: []
    });
    render();
  });

  saveButton.addEventListener("click", async () => {
    try {
      collectFromDom();
      const data = await request("/api/admin/config", {
        method: "PUT",
        body: JSON.stringify({ config })
      });
      config = data.config;
      render();
      setMessage(adminMessage, data.message, "ok");
    } catch (error) {
      setMessage(adminMessage, error.message, "error");
    }
  });

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const formData = new FormData(loginForm);
      await request("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({
          username: formData.get("username"),
          password: formData.get("password")
        })
      });
      await loadAdmin();
    } catch (error) {
      setMessage(loginMessage, error.message, "error");
    }
  });

  logoutButton.addEventListener("click", async () => {
    await request("/api/admin/logout", { method: "POST", body: "{}" });
    adminPanel.hidden = true;
    loginPanel.hidden = false;
  });

  async function loadAdmin() {
    const data = await request("/api/admin/config");
    config = data.config;
    loginPanel.hidden = true;
    adminPanel.hidden = false;
    render();
  }

  async function init() {
    try {
      const session = await request("/api/admin/session");
      if (session.authenticated) await loadAdmin();
    } catch (error) {
      setMessage(loginMessage, error.message, "error");
    }
  }

  init();
})();
