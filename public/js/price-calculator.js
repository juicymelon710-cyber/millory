(function () {
    const root = document.querySelector("[data-price-calculator]");
    if (!root) return;

    const form = root.querySelector("[data-calculator-form]");
    const productSelect = root.querySelector("[data-calculator-product]");
    const optionsTarget = root.querySelector("[data-calculator-options]");
    const heightInput = root.querySelector("[data-calculator-height]");
    const widthInput = root.querySelector("[data-calculator-width]");
    const warning = root.querySelector("[data-calculator-warning]");
    const totalTarget = root.querySelector("[data-calculator-total]");
    const productTarget = root.querySelector("[data-summary-product]");
    const imageTarget = root.querySelector("[data-summary-image]");
    const sizeTarget = root.querySelector("[data-summary-size]");
    const areaTarget = root.querySelector("[data-summary-area]");
    const selectedTarget = root.querySelector("[data-selected-options]");

    let config = null;
    let activeProduct = null;
    let requestId = 0;
    let localMode = false;

    function formatMdl(value) {
        return `${Math.round(Number(value || 0)).toLocaleString("ro-RO")} LEI`;
    }

    function formatSize(size) {
        if (!size) return "La comanda";
        return `${size.height}x${size.width}`;
    }

    async function api(url, options) {
        const response = await fetch(url, {
            headers: { "Content-Type": "application/json" },
            ...options
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.ok === false) {
            throw new Error(data.message || "Calculatorul nu este disponibil momentan.");
        }
        return data;
    }

    function productById(id) {
        return config.products.find((product) => product.id === id) || config.products[0];
    }

    function groupInputType(group) {
        return group.selection === "multiple" ? "checkbox" : "radio";
    }

    function basisLabel(unit) {
        if (unit === "m2") return "calculat dupa m2";
        if (unit === "ml") return "calculat dupa metri liniari";
        if (unit === "mm") return "calculat dupa latime";
        return "pret pe bucata";
    }

    function cleanDescription(value) {
        return String(value || "")
            .replace(/\s*\{\{\{https?:\/\/\S+?}}}/gi, "")
            .replace(/\s*\{\{\{https?:\/\/\S+/gi, "")
            .replace(/\s+/g, " ")
            .trim();
    }

    function normalizeLegacyProducts(products) {
        return {
            settings: {
                markupPercent: 40,
                minHeight: 400,
                minWidth: 400,
                maxHeight: 3000,
                maxWidth: 3000
            },
            products: products.map((product) => ({
                id: product.id,
                name: product.name,
                category: product.category,
                image: product.image,
                defaultSize: product.defaultSize,
                smallestSize: product.smallestSize,
                biggestSize: product.biggestSize,
                recommendedSizes: product.recommendedSizes || [],
                materials: (product.materials || []).map((item) => ({
                    ...item,
                    unit: item.unit || item.type || "buc"
                })),
                smallCoefficient: product.smallCoefficient,
                mediumCoefficient: product.mediumCoefficient,
                bigCoefficient: product.bigCoefficient,
                mediumSize: product.mediumSize,
                bigSize: product.bigSize,
                optionGroups: (product.optionGroups || []).map((group) => ({
                    ...group,
                    selection: group.selection || groupSelection(group.name),
                    items: (group.items || []).map((item) => ({
                        ...item,
                        description: cleanDescription(item.description),
                        unit: item.unit || item.type || "buc"
                    }))
                }))
            }))
        };
    }

    function groupSelection(name) {
        const value = String(name || "").toLowerCase();
        if (value.includes("buton")) return "single";
        if (value.includes("dezabur")) return "single";
        if (value.includes("ram")) return "single";
        if (value.includes("foaie")) return "single";
        if (value.includes("lentil")) return "single";
        return "multiple";
    }

    function quantityByUnit(unit, metrics) {
        if (unit === "m2") return metrics.area;
        if (unit === "ml") return metrics.perimeter;
        if (unit === "mm") return metrics.width / 1000;
        return 1;
    }

    function localMetrics(extra = {}) {
        const minHeight = Math.max(config.settings.minHeight, Number(activeProduct.smallestSize?.height || config.settings.minHeight));
        const minWidth = Math.max(config.settings.minWidth, Number(activeProduct.smallestSize?.width || config.settings.minWidth));
        const maxHeight = Math.min(config.settings.maxHeight, Number(activeProduct.biggestSize?.height || config.settings.maxHeight));
        const maxWidth = Math.min(config.settings.maxWidth, Number(activeProduct.biggestSize?.width || config.settings.maxWidth));
        const rawHeight = Number(extra.height || heightInput.value || activeProduct.defaultSize?.height || minHeight);
        const rawWidth = Number(extra.width || widthInput.value || activeProduct.defaultSize?.width || minWidth);
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

    function localCoefficient(metrics) {
        const largestSide = Math.max(metrics.height, metrics.width);
        if (activeProduct.bigSize && largestSide > activeProduct.bigSize) return Number(activeProduct.bigCoefficient || 0);
        if (activeProduct.mediumSize && largestSide > activeProduct.mediumSize) return Number(activeProduct.mediumCoefficient || 0);
        return Number(activeProduct.smallCoefficient || config.settings.markupPercent / 100);
    }

    function localQuote(extra = {}) {
        const metrics = localMetrics(extra);
        const selectedIds = new Set(extra.optionIds || selectedOptionIds());
        const materialCost = (activeProduct.materials || []).reduce((sum, item) => {
            return sum + Number(item.priceMdl || 0) * quantityByUnit(item.unit, metrics);
        }, 0);
        const basePriceMdl = Math.round(materialCost * (1 + localCoefficient(metrics)));
        const optionGroups = (activeProduct.optionGroups || []).map((group) => ({
            id: group.id,
            name: group.name,
            selection: group.selection,
            items: (group.items || []).map((item) => ({
                id: item.id,
                name: item.name,
                unit: item.unit,
                priceMdl: Math.round(Number(item.priceMdl || 0) * quantityByUnit(item.unit, metrics)),
                selected: selectedIds.has(String(item.id))
            }))
        }));
        const selectedOptions = optionGroups.flatMap((group) => group.items
            .filter((item) => item.selected)
            .map((item) => ({
                group: group.name,
                id: item.id,
                name: item.name,
                priceMdl: item.priceMdl
            })));
        const optionTotal = selectedOptions.reduce((sum, item) => sum + item.priceMdl, 0);

        return {
            product: {
                id: activeProduct.id,
                name: activeProduct.name,
                image: activeProduct.image
            },
            metrics,
            basePriceMdl,
            optionGroups,
            selectedOptions,
            totalMdl: basePriceMdl + optionTotal
        };
    }

    function selectedOptionIds() {
        return Array.from(optionsTarget.querySelectorAll("input:checked"))
            .map((input) => input.value)
            .filter(Boolean);
    }

    function renderProducts() {
        productSelect.innerHTML = config.products.map((product) => `
            <option value="${product.id}">${product.name}</option>
        `).join("");
        productSelect.value = activeProduct.id;
    }

    function renderRecommendedSizes() {
        const sizes = [...(activeProduct.recommendedSizes || [])];
        if (!sizes.length) return "";

        return `
            <fieldset class="calculator-group">
                <legend>Dimensiuni recomandate</legend>
                <div class="choice-grid compact">
                    ${sizes.map((size) => `
                        <button class="choice-card size-choice" type="button" data-size-height="${size.height}" data-size-width="${size.width}">
                            <span>
                                <strong>${formatSize(size)}</strong>
                                <small>dimensiune recomandata</small>
                            </span>
                            <em data-size-price="${size.height}-${size.width}">...</em>
                        </button>
                    `).join("")}
                </div>
            </fieldset>
        `;
    }

    function renderOptions() {
        const groups = activeProduct.optionGroups || [];
        optionsTarget.innerHTML = renderRecommendedSizes() + groups.map((group) => `
            <fieldset class="calculator-group">
                <legend>${group.name}</legend>
                <div class="choice-grid ${group.items.length > 2 ? "compact" : ""}">
                    ${groupInputType(group) === "radio" ? `
                        <label class="choice-card">
                            <input type="radio" name="addon-${group.id}" value="" data-empty-option>
                            <span>
                                <strong>Fara</strong>
                                <small>nu se adauga</small>
                            </span>
                            <em>${formatMdl(0)}</em>
                        </label>
                    ` : ""}
                    ${group.items.map((item) => `
                        <label class="choice-card">
                            <input type="${groupInputType(group)}" name="addon-${group.id}" value="${item.id}" data-group-id="${group.id}">
                            <span>
                                <strong>${item.name}</strong>
                                <small>${basisLabel(item.unit)}</small>
                            </span>
                            <em data-option-price="${item.id}">...</em>
                        </label>
                    `).join("")}
                </div>
            </fieldset>
        `).join("");

        optionsTarget.querySelectorAll("[data-size-height]").forEach((button) => {
            button.addEventListener("click", () => {
                heightInput.value = button.dataset.sizeHeight;
                widthInput.value = button.dataset.sizeWidth;
                recalculate();
            });
        });
    }

    function syncProductDefaults() {
        const size = activeProduct.defaultSize || activeProduct.recommendedSizes?.[0] || activeProduct.smallestSize;
        const limits = activeProduct.smallestSize || config.settings;
        const maxLimits = activeProduct.biggestSize || config.settings;

        heightInput.min = Math.max(config.settings.minHeight, Number(limits.height || config.settings.minHeight));
        heightInput.max = Math.min(config.settings.maxHeight, Number(maxLimits.height || config.settings.maxHeight));
        widthInput.min = Math.max(config.settings.minWidth, Number(limits.width || config.settings.minWidth));
        widthInput.max = Math.min(config.settings.maxWidth, Number(maxLimits.width || config.settings.maxWidth));
        heightInput.value = size?.height || heightInput.min;
        widthInput.value = size?.width || widthInput.min;
        productTarget.textContent = activeProduct.name;
        imageTarget.src = activeProduct.image || "assets/images/millory-showroom-hero.png";
        imageTarget.alt = activeProduct.name;
        renderOptions();
    }

    async function getQuote(extra = {}) {
        if (localMode) {
            return { ok: true, quote: localQuote(extra) };
        }

        return api("/api/calculator/quote", {
            method: "POST",
            body: JSON.stringify({
                productId: activeProduct.id,
                height: Number(heightInput.value || 0),
                width: Number(widthInput.value || 0),
                optionIds: selectedOptionIds(),
                ...extra
            })
        });
    }

    function updateOptionPrices(quote) {
        quote.optionGroups.forEach((group) => {
            group.items.forEach((item) => {
                const target = optionsTarget.querySelector(`[data-option-price="${item.id}"]`);
                if (target) target.textContent = formatMdl(item.priceMdl);
            });
        });
    }

    async function updateRecommendedPrices() {
        const buttons = Array.from(optionsTarget.querySelectorAll("[data-size-height]"));
        await Promise.all(buttons.map(async (button) => {
            try {
                const data = await getQuote({
                    height: Number(button.dataset.sizeHeight),
                    width: Number(button.dataset.sizeWidth),
                    optionIds: []
                });
                const target = button.querySelector("[data-size-price]");
                if (target) target.textContent = formatMdl(data.quote.basePriceMdl);
            } catch (error) {
                const target = button.querySelector("[data-size-price]");
                if (target) target.textContent = "la cerere";
            }
        }));
    }

    function updateSummary(quote) {
        const metrics = quote.metrics;
        totalTarget.textContent = formatMdl(quote.totalMdl);
        sizeTarget.textContent = `${metrics.height} x ${metrics.width} mm`;
        areaTarget.textContent = `${metrics.area.toFixed(2)} m2`;
        warning.textContent = metrics.adjusted
            ? `Dimensiunile acceptate sunt intre ${metrics.limits.minHeight}x${metrics.limits.minWidth} si ${metrics.limits.maxHeight}x${metrics.limits.maxWidth} mm.`
            : "";

        selectedTarget.innerHTML = `
            <div>
                <span>Oglinda</span>
                <strong>${quote.product.name}</strong>
                <em>${formatMdl(quote.basePriceMdl)}</em>
            </div>
            ${quote.selectedOptions.map((entry) => `
                <div>
                    <span>${entry.group}</span>
                    <strong>${entry.name}</strong>
                    <em>${formatMdl(entry.priceMdl)}</em>
                </div>
            `).join("")}
        `;
    }

    async function recalculate() {
        const current = ++requestId;
        try {
            const data = await getQuote();
            if (current !== requestId) return;
            updateOptionPrices(data.quote);
            updateSummary(data.quote);
        } catch (error) {
            warning.textContent = error.message;
        }
    }

    async function init() {
        try {
            const data = await api("/api/calculator/config");
            config = data.config;
        } catch (error) {
            const fallbackProducts = window.MILLORY_CALCULATOR_PRODUCTS || [];
            if (!fallbackProducts.length) {
                warning.textContent = error.message;
                return;
            }
            localMode = true;
            config = normalizeLegacyProducts(fallbackProducts);
            warning.textContent = "Calculatorul ruleaza in modul local. Pentru admin si baza de date deschide site-ul prin server.";
        }

        try {
            activeProduct = config.products[0];
            renderProducts();
            syncProductDefaults();
            await recalculate();
            updateRecommendedPrices();
        } catch (error) {
            warning.textContent = error.message;
        }
    }

    productSelect.addEventListener("change", () => {
        activeProduct = productById(productSelect.value);
        syncProductDefaults();
        recalculate();
        updateRecommendedPrices();
    });

    form.addEventListener("input", recalculate);
    form.addEventListener("change", recalculate);

    init();
})();
