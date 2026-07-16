const AdminProductEditor = (function () {
    const UNITS = ["buc", "m2", "ml", "mm"];

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    // Product images are stored as root-relative paths (e.g. "assets/products/x.jpg").
    // The admin app lives under /admin/, so without a leading slash the browser
    // resolves them against /admin/ instead of the site root, breaking the preview.
    function resolveImageUrl(path) {
        if (!path) return "";
        if (/^(https?:)?\/\//i.test(path) || path.startsWith("/")) return path;
        return `/${path}`;
    }

    function slugify(value) {
        return String(value || "")
            .toLowerCase()
            .normalize("NFD").replace(/[̀-ͯ]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
    }

    function emptyState() {
        return {
            id: "", title: "", description: "", category: "", shape: "", priceMdl: 0,
            inStock: true, active: true, image: "",
            tags: [], filters: [],
            defaultSize: { width: null, height: null },
            smallestSize: { width: null, height: null },
            biggestSize: { width: null, height: null },
            recommendedSizes: [],
            smallCoefficient: 0, mediumCoefficient: 0, bigCoefficient: 0, mediumSize: null, bigSize: null,
            materials: [],
            optionGroups: []
        };
    }

    function toPayload(state) {
        const payload = { ...state };
        if (!isCreateMode) delete payload.id;
        return payload;
    }

    let isCreateMode = true;

    async function render(contentEl, params) {
        isCreateMode = !params || !params.id;
        const productId = params && params.id;

        contentEl.innerHTML = `<p class="admin-panel-card">Se incarca...</p>`;

        let state = emptyState();
        let categories = [];
        try {
            const categoriesResponse = await AdminApi.categories();
            categories = categoriesResponse.categories || [];
        } catch { /* optional */ }

        if (!isCreateMode) {
            try {
                const response = await AdminApi.adminProduct(productId);
                state = { ...emptyState(), ...response.product };
            } catch (error) {
                contentEl.innerHTML = `<p class="admin-panel-card">Nu am putut incarca produsul: ${escapeHtml(error.message)}</p>`;
                return;
            }
        }

        let initialSnapshot = JSON.stringify(state);
        let dirty = false;
        let editorActive = true;

        function markDirty() {
            dirty = JSON.stringify(state) !== initialSnapshot;
        }

        function confirmLeave() {
            if (!dirty) return true;
            return window.confirm("Ai modificari nesalvate la acest produs. Sigur vrei sa parasesti pagina fara sa salvezi?");
        }

        AdminRouter.setLeaveGuard(confirmLeave);

        function beforeUnloadHandler(event) {
            if (!editorActive || !dirty) return;
            event.preventDefault();
            event.returnValue = "";
        }
        window.addEventListener("beforeunload", beforeUnloadHandler);

        contentEl.innerHTML = `
            <div class="admin-editor">
                <div class="admin-editor-sticky">
                    <div class="admin-editor-header">
                        <button type="button" class="admin-btn-ghost" data-back>&larr; Inapoi la produse</button>
                        <div class="admin-editor-header-actions">
                            <span class="admin-message" data-editor-message></span>
                            <button type="button" class="admin-btn-primary" data-save>${isCreateMode ? "Creeaza produsul" : "Salveaza modificarile"}</button>
                        </div>
                    </div>
                    <div class="admin-tabs" data-tabs>
                        <button type="button" class="admin-tab active" data-tab="general">General</button>
                        <button type="button" class="admin-tab" data-tab="pricing">Pret</button>
                        <button type="button" class="admin-tab" data-tab="images">Imagini</button>
                        <button type="button" class="admin-tab" data-tab="tags">Etichete si filtre</button>
                        <button type="button" class="admin-tab" data-tab="sizes">Marimi</button>
                        <button type="button" class="admin-tab" data-tab="materials">Materiale</button>
                        <button type="button" class="admin-tab" data-tab="options">Optiuni si suplimente</button>
                    </div>
                </div>
                <div class="admin-tab-panels">
                    <section class="admin-tab-panel active" data-panel="general"></section>
                    <section class="admin-tab-panel" data-panel="pricing"></section>
                    <section class="admin-tab-panel" data-panel="images"></section>
                    <section class="admin-tab-panel" data-panel="tags"></section>
                    <section class="admin-tab-panel" data-panel="sizes"></section>
                    <section class="admin-tab-panel" data-panel="materials"></section>
                    <section class="admin-tab-panel" data-panel="options"></section>
                </div>
            </div>
        `;

        contentEl.querySelector("[data-back]").addEventListener("click", () => AdminRouter.navigate("/products"));
        contentEl.querySelectorAll("[data-tab]").forEach((tabBtn) => {
            tabBtn.addEventListener("click", () => {
                contentEl.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("active", b === tabBtn));
                contentEl.querySelectorAll("[data-panel]").forEach((p) => p.classList.toggle("active", p.dataset.panel === tabBtn.dataset.tab));
            });
        });

        const messageEl = contentEl.querySelector("[data-editor-message]");
        const saveBtn = contentEl.querySelector("[data-save]");

        renderGeneral(contentEl.querySelector('[data-panel="general"]'));
        renderPricing(contentEl.querySelector('[data-panel="pricing"]'));
        renderImages(contentEl.querySelector('[data-panel="images"]'));
        renderTagsFilters(contentEl.querySelector('[data-panel="tags"]'));
        renderSizes(contentEl.querySelector('[data-panel="sizes"]'));
        renderMaterials(contentEl.querySelector('[data-panel="materials"]'));
        renderOptions(contentEl.querySelector('[data-panel="options"]'));

        function renderGeneral(panel) {
            panel.innerHTML = `
                <div class="admin-form-grid">
                    <div class="admin-field">
                        <label>ID / slug</label>
                        <input type="text" data-f="id" value="${escapeHtml(state.id)}" placeholder="auto-generat din titlu" ${isCreateMode ? "" : "disabled"}>
                        ${isCreateMode ? '<small>Lasa gol pentru generare automata din titlu.</small>' : ""}
                    </div>
                    <div class="admin-field">
                        <label>Titlu *</label>
                        <input type="text" data-f="title" value="${escapeHtml(state.title)}" required>
                    </div>
                    <div class="admin-field admin-field-wide">
                        <label>Descriere</label>
                        <textarea data-f="description" rows="4">${escapeHtml(state.description)}</textarea>
                    </div>
                    <div class="admin-field">
                        <label>Categorie *</label>
                        <input type="text" list="admin-category-options" data-f="category" value="${escapeHtml(state.category)}" required>
                        <datalist id="admin-category-options">
                            ${categories.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join("")}
                        </datalist>
                    </div>
                    <div class="admin-field">
                        <label>Forma</label>
                        <input type="text" data-f="shape" value="${escapeHtml(state.shape)}" placeholder="rotund, oval, dreptunghiular...">
                    </div>
                    <div class="admin-field admin-field-wide admin-checkbox-row">
                        <label class="admin-field-inline"><input type="checkbox" data-f="inStock" ${state.inStock ? "checked" : ""}> In stoc</label>
                        <label class="admin-field-inline"><input type="checkbox" data-f="active" ${state.active ? "checked" : ""}> Activ (vizibil pe site)</label>
                    </div>
                </div>
            `;
            panel.querySelector('[data-f="id"]').addEventListener("input", (e) => { state.id = slugify(e.target.value); e.target.value = state.id; markDirty(); });
            panel.querySelector('[data-f="title"]').addEventListener("input", (e) => { state.title = e.target.value; markDirty(); });
            panel.querySelector('[data-f="description"]').addEventListener("input", (e) => { state.description = e.target.value; markDirty(); });
            panel.querySelector('[data-f="category"]').addEventListener("input", (e) => { state.category = e.target.value; markDirty(); });
            panel.querySelector('[data-f="shape"]').addEventListener("input", (e) => { state.shape = e.target.value; markDirty(); });
            panel.querySelector('[data-f="inStock"]').addEventListener("change", (e) => { state.inStock = e.target.checked; markDirty(); });
            panel.querySelector('[data-f="active"]').addEventListener("change", (e) => { state.active = e.target.checked; markDirty(); });
        }

        function sizeField(panel, selector, key, sub) {
            panel.querySelector(selector).addEventListener("input", (e) => {
                const value = e.target.value === "" ? null : Number(e.target.value);
                state[key][sub] = value;
                markDirty();
            });
        }

        function renderPricing(panel) {
            panel.innerHTML = `
                <div class="admin-form-grid">
                    <div class="admin-field">
                        <label>Pret de baza (MDL) *</label>
                        <input type="number" min="0" step="1" data-f="priceMdl" value="${state.priceMdl ?? 0}">
                    </div>
                    <div class="admin-field"></div>
                    <div class="admin-field-group admin-field-wide">
                        <label>Marime implicita (cm)</label>
                        <div class="admin-inline-inputs">
                            <input type="number" min="0" placeholder="latime" data-f="defaultWidth" value="${state.defaultSize?.width ?? ""}">
                            <input type="number" min="0" placeholder="inaltime" data-f="defaultHeight" value="${state.defaultSize?.height ?? ""}">
                        </div>
                    </div>
                    <div class="admin-field-group admin-field-wide">
                        <label>Marime minima (cm)</label>
                        <div class="admin-inline-inputs">
                            <input type="number" min="0" placeholder="latime" data-f="smallestWidth" value="${state.smallestSize?.width ?? ""}">
                            <input type="number" min="0" placeholder="inaltime" data-f="smallestHeight" value="${state.smallestSize?.height ?? ""}">
                        </div>
                    </div>
                    <div class="admin-field-group admin-field-wide">
                        <label>Marime maxima (cm)</label>
                        <div class="admin-inline-inputs">
                            <input type="number" min="0" placeholder="latime" data-f="biggestWidth" value="${state.biggestSize?.width ?? ""}">
                            <input type="number" min="0" placeholder="inaltime" data-f="biggestHeight" value="${state.biggestSize?.height ?? ""}">
                        </div>
                    </div>
                    <div class="admin-field">
                        <label>Coeficient mic</label>
                        <input type="number" min="0" step="0.01" data-f="smallCoefficient" value="${state.smallCoefficient ?? 0}">
                    </div>
                    <div class="admin-field">
                        <label>Coeficient mediu</label>
                        <input type="number" min="0" step="0.01" data-f="mediumCoefficient" value="${state.mediumCoefficient ?? 0}">
                    </div>
                    <div class="admin-field">
                        <label>Coeficient mare</label>
                        <input type="number" min="0" step="0.01" data-f="bigCoefficient" value="${state.bigCoefficient ?? 0}">
                    </div>
                    <div class="admin-field">
                        <label>Prag marime medie</label>
                        <input type="number" min="0" data-f="mediumSize" value="${state.mediumSize ?? ""}">
                    </div>
                    <div class="admin-field">
                        <label>Prag marime mare</label>
                        <input type="number" min="0" data-f="bigSize" value="${state.bigSize ?? ""}">
                    </div>
                </div>
            `;
            panel.querySelector('[data-f="priceMdl"]').addEventListener("input", (e) => { state.priceMdl = Number(e.target.value) || 0; markDirty(); });
            sizeField(panel, '[data-f="defaultWidth"]', "defaultSize", "width");
            sizeField(panel, '[data-f="defaultHeight"]', "defaultSize", "height");
            sizeField(panel, '[data-f="smallestWidth"]', "smallestSize", "width");
            sizeField(panel, '[data-f="smallestHeight"]', "smallestSize", "height");
            sizeField(panel, '[data-f="biggestWidth"]', "biggestSize", "width");
            sizeField(panel, '[data-f="biggestHeight"]', "biggestSize", "height");
            panel.querySelector('[data-f="smallCoefficient"]').addEventListener("input", (e) => { state.smallCoefficient = Number(e.target.value) || 0; markDirty(); });
            panel.querySelector('[data-f="mediumCoefficient"]').addEventListener("input", (e) => { state.mediumCoefficient = Number(e.target.value) || 0; markDirty(); });
            panel.querySelector('[data-f="bigCoefficient"]').addEventListener("input", (e) => { state.bigCoefficient = Number(e.target.value) || 0; markDirty(); });
            panel.querySelector('[data-f="mediumSize"]').addEventListener("input", (e) => { state.mediumSize = e.target.value === "" ? null : Number(e.target.value); markDirty(); });
            panel.querySelector('[data-f="bigSize"]').addEventListener("input", (e) => { state.bigSize = e.target.value === "" ? null : Number(e.target.value); markDirty(); });
        }

        function renderImages(panel) {
            panel.innerHTML = `
                <div class="admin-form-grid">
                    <div class="admin-field admin-field-wide">
                        <label>URL / cale imagine principala</label>
                        <input type="text" data-f="image" value="${escapeHtml(state.image)}" placeholder="/assets/products/exemplu.jpg sau https://...">
                        <small>Sistemul de incarcare a imaginilor va fi adaugat intr-o etapa urmatoare. Foloseste deocamdata un URL sau o cale existenta.</small>
                    </div>
                    <div class="admin-image-preview" data-image-preview>
                        ${state.image ? `<img src="${escapeHtml(resolveImageUrl(state.image))}" alt="">` : `<div class="admin-image-placeholder">Fara imagine</div>`}
                    </div>
                </div>
            `;
            panel.querySelector('[data-f="image"]').addEventListener("input", (e) => {
                state.image = e.target.value.trim();
                markDirty();
                const preview = panel.querySelector("[data-image-preview]");
                preview.innerHTML = state.image ? `<img src="${escapeHtml(resolveImageUrl(state.image))}" alt="">` : `<div class="admin-image-placeholder">Fara imagine</div>`;
            });
        }

        function renderTagsFilters(panel) {
            panel.innerHTML = `
                <div class="admin-subsection">
                    <div class="admin-subsection-header">
                        <h3>Etichete</h3>
                        <button type="button" class="admin-btn-ghost" data-add-tag>+ Adauga eticheta</button>
                    </div>
                    <div data-tags-list class="admin-chip-list"></div>
                </div>
                <div class="admin-subsection">
                    <div class="admin-subsection-header">
                        <h3>Filtre</h3>
                        <button type="button" class="admin-btn-ghost" data-add-filter>+ Adauga filtru</button>
                    </div>
                    <div data-filters-list></div>
                </div>
            `;
            const tagsList = panel.querySelector("[data-tags-list]");
            const filtersList = panel.querySelector("[data-filters-list]");

            function drawTags() {
                tagsList.innerHTML = state.tags.map((tag, i) => `
                    <div class="admin-chip">
                        <input type="text" data-tag-index="${i}" value="${escapeHtml(tag)}">
                        <button type="button" data-remove-tag="${i}" aria-label="Sterge">&times;</button>
                    </div>
                `).join("") || `<p class="admin-empty-hint">Nicio eticheta adaugata.</p>`;
                tagsList.querySelectorAll("[data-tag-index]").forEach((input) => {
                    input.addEventListener("input", (e) => { state.tags[Number(e.target.dataset.tagIndex)] = e.target.value; markDirty(); });
                });
                tagsList.querySelectorAll("[data-remove-tag]").forEach((btn) => {
                    btn.addEventListener("click", () => { state.tags.splice(Number(btn.dataset.removeTag), 1); markDirty(); drawTags(); });
                });
            }

            function drawFilters() {
                filtersList.innerHTML = state.filters.map((f, i) => `
                    <div class="admin-row-fields">
                        <input type="text" placeholder="nume (ex: culoare)" data-filter-name="${i}" value="${escapeHtml(f.name)}">
                        <input type="text" placeholder="valoare (ex: auriu)" data-filter-value="${i}" value="${escapeHtml(f.value)}">
                        <button type="button" class="admin-btn-ghost admin-btn-danger" data-remove-filter="${i}">Sterge</button>
                    </div>
                `).join("") || `<p class="admin-empty-hint">Niciun filtru adaugat.</p>`;
                filtersList.querySelectorAll("[data-filter-name]").forEach((input) => {
                    input.addEventListener("input", (e) => { state.filters[Number(e.target.dataset.filterName)].name = e.target.value; markDirty(); });
                });
                filtersList.querySelectorAll("[data-filter-value]").forEach((input) => {
                    input.addEventListener("input", (e) => { state.filters[Number(e.target.dataset.filterValue)].value = e.target.value; markDirty(); });
                });
                filtersList.querySelectorAll("[data-remove-filter]").forEach((btn) => {
                    btn.addEventListener("click", () => { state.filters.splice(Number(btn.dataset.removeFilter), 1); markDirty(); drawFilters(); });
                });
            }

            panel.querySelector("[data-add-tag]").addEventListener("click", () => { state.tags.push(""); markDirty(); drawTags(); });
            panel.querySelector("[data-add-filter]").addEventListener("click", () => { state.filters.push({ name: "", value: "" }); markDirty(); drawFilters(); });

            drawTags();
            drawFilters();
        }

        function renderSizes(panel) {
            panel.innerHTML = `
                <div class="admin-subsection">
                    <div class="admin-subsection-header">
                        <h3>Marimi recomandate</h3>
                        <button type="button" class="admin-btn-ghost" data-add-size>+ Adauga marime</button>
                    </div>
                    <div data-sizes-list></div>
                </div>
            `;
            const list = panel.querySelector("[data-sizes-list]");

            function draw() {
                list.innerHTML = state.recommendedSizes.map((s, i) => `
                    <div class="admin-row-fields">
                        <input type="text" placeholder="nume" data-size-name="${i}" value="${escapeHtml(s.name || "")}">
                        <input type="number" min="0" placeholder="latime" data-size-width="${i}" value="${s.width ?? ""}">
                        <input type="number" min="0" placeholder="inaltime" data-size-height="${i}" value="${s.height ?? ""}">
                        <input type="number" min="0" placeholder="pret MDL" data-size-price="${i}" value="${s.priceMdl ?? ""}">
                        <button type="button" class="admin-btn-ghost admin-btn-danger" data-remove-size="${i}">Sterge</button>
                    </div>
                `).join("") || `<p class="admin-empty-hint">Nicio marime adaugata.</p>`;
                list.querySelectorAll("[data-size-name]").forEach((el) => el.addEventListener("input", (e) => { state.recommendedSizes[Number(e.target.dataset.sizeName)].name = e.target.value; markDirty(); }));
                list.querySelectorAll("[data-size-width]").forEach((el) => el.addEventListener("input", (e) => { state.recommendedSizes[Number(e.target.dataset.sizeWidth)].width = Number(e.target.value) || 0; markDirty(); }));
                list.querySelectorAll("[data-size-height]").forEach((el) => el.addEventListener("input", (e) => { state.recommendedSizes[Number(e.target.dataset.sizeHeight)].height = Number(e.target.value) || 0; markDirty(); }));
                list.querySelectorAll("[data-size-price]").forEach((el) => el.addEventListener("input", (e) => { state.recommendedSizes[Number(e.target.dataset.sizePrice)].priceMdl = e.target.value === "" ? null : Number(e.target.value); markDirty(); }));
                list.querySelectorAll("[data-remove-size]").forEach((btn) => btn.addEventListener("click", () => { state.recommendedSizes.splice(Number(btn.dataset.removeSize), 1); markDirty(); draw(); }));
            }

            panel.querySelector("[data-add-size]").addEventListener("click", () => {
                state.recommendedSizes.push({ name: "", width: 0, height: 0, priceMdl: null });
                markDirty();
                draw();
            });

            draw();
        }

        function renderMaterials(panel) {
            panel.innerHTML = `
                <div class="admin-subsection">
                    <div class="admin-subsection-header">
                        <h3>Materiale</h3>
                        <button type="button" class="admin-btn-ghost" data-add-material>+ Adauga material</button>
                    </div>
                    <div data-materials-list></div>
                </div>
            `;
            const list = panel.querySelector("[data-materials-list]");

            function draw() {
                list.innerHTML = state.materials.map((m, i) => `
                    <div class="admin-row-fields">
                        <input type="text" placeholder="nume" data-m-name="${i}" value="${escapeHtml(m.name || "")}">
                        <input type="number" min="0" placeholder="pret MDL" data-m-price="${i}" value="${m.priceMdl ?? 0}">
                        <select data-m-unit="${i}">
                            ${UNITS.map((u) => `<option value="${u}" ${m.unit === u ? "selected" : ""}>${u}</option>`).join("")}
                        </select>
                        <label class="admin-inline-checkbox"><input type="checkbox" data-m-available="${i}" ${m.available !== false ? "checked" : ""}> Disponibil</label>
                        <button type="button" class="admin-btn-ghost admin-btn-danger" data-remove-material="${i}">Sterge</button>
                    </div>
                `).join("") || `<p class="admin-empty-hint">Niciun material adaugat.</p>`;
                list.querySelectorAll("[data-m-name]").forEach((el) => el.addEventListener("input", (e) => { state.materials[Number(e.target.dataset.mName)].name = e.target.value; markDirty(); }));
                list.querySelectorAll("[data-m-price]").forEach((el) => el.addEventListener("input", (e) => { state.materials[Number(e.target.dataset.mPrice)].priceMdl = Number(e.target.value) || 0; markDirty(); }));
                list.querySelectorAll("[data-m-unit]").forEach((el) => el.addEventListener("change", (e) => { state.materials[Number(e.target.dataset.mUnit)].unit = e.target.value; markDirty(); }));
                list.querySelectorAll("[data-m-available]").forEach((el) => el.addEventListener("change", (e) => { state.materials[Number(e.target.dataset.mAvailable)].available = e.target.checked; markDirty(); }));
                list.querySelectorAll("[data-remove-material]").forEach((btn) => btn.addEventListener("click", () => { state.materials.splice(Number(btn.dataset.removeMaterial), 1); markDirty(); draw(); }));
            }

            panel.querySelector("[data-add-material]").addEventListener("click", () => {
                state.materials.push({ name: "", priceMdl: 0, unit: "buc", available: true });
                markDirty();
                draw();
            });

            draw();
        }

        function renderOptions(panel) {
            panel.innerHTML = `
                <div class="admin-subsection">
                    <div class="admin-subsection-header">
                        <h3>Grupuri de optiuni</h3>
                        <button type="button" class="admin-btn-ghost" data-add-group>+ Adauga grup</button>
                    </div>
                    <div data-groups-list></div>
                </div>
            `;
            const list = panel.querySelector("[data-groups-list]");

            function drawGroups() {
                list.innerHTML = state.optionGroups.map((group, gi) => `
                    <div class="admin-option-group" data-group="${gi}">
                        <div class="admin-row-fields">
                            <input type="text" placeholder="nume grup" data-group-name="${gi}" value="${escapeHtml(group.name || "")}">
                            <select data-group-selection="${gi}">
                                <option value="single" ${group.selection !== "multiple" ? "selected" : ""}>Selectie unica</option>
                                <option value="multiple" ${group.selection === "multiple" ? "selected" : ""}>Selectie multipla</option>
                            </select>
                            <label class="admin-inline-checkbox"><input type="checkbox" data-group-available="${gi}" ${group.available !== false ? "checked" : ""}> Disponibil</label>
                            <button type="button" class="admin-btn-ghost admin-btn-danger" data-remove-group="${gi}">Sterge grup</button>
                        </div>
                        <div class="admin-supplements" data-supplements="${gi}"></div>
                        <button type="button" class="admin-btn-ghost admin-btn-small" data-add-item="${gi}">+ Adauga supliment</button>
                    </div>
                `).join("") || `<p class="admin-empty-hint">Niciun grup de optiuni adaugat.</p>`;

                state.optionGroups.forEach((group, gi) => drawItems(gi));

                list.querySelectorAll("[data-group-name]").forEach((el) => el.addEventListener("input", (e) => { state.optionGroups[Number(e.target.dataset.groupName)].name = e.target.value; markDirty(); }));
                list.querySelectorAll("[data-group-selection]").forEach((el) => el.addEventListener("change", (e) => { state.optionGroups[Number(e.target.dataset.groupSelection)].selection = e.target.value; markDirty(); }));
                list.querySelectorAll("[data-group-available]").forEach((el) => el.addEventListener("change", (e) => { state.optionGroups[Number(e.target.dataset.groupAvailable)].available = e.target.checked; markDirty(); }));
                list.querySelectorAll("[data-remove-group]").forEach((btn) => btn.addEventListener("click", () => { state.optionGroups.splice(Number(btn.dataset.removeGroup), 1); markDirty(); drawGroups(); }));
                list.querySelectorAll("[data-add-item]").forEach((btn) => btn.addEventListener("click", () => {
                    const gi = Number(btn.dataset.addItem);
                    state.optionGroups[gi].items.push({ name: "", priceMdl: 0, unit: "buc", description: "", available: true });
                    markDirty();
                    drawItems(gi);
                }));
            }

            function drawItems(gi) {
                const container = list.querySelector(`[data-supplements="${gi}"]`);
                if (!container) return;
                const items = state.optionGroups[gi].items;
                container.innerHTML = items.map((item, ii) => `
                    <div class="admin-row-fields admin-row-fields-nested">
                        <input type="text" placeholder="nume" data-item-name="${gi}-${ii}" value="${escapeHtml(item.name || "")}">
                        <input type="number" min="0" placeholder="pret MDL" data-item-price="${gi}-${ii}" value="${item.priceMdl ?? 0}">
                        <select data-item-unit="${gi}-${ii}">
                            ${UNITS.map((u) => `<option value="${u}" ${item.unit === u ? "selected" : ""}>${u}</option>`).join("")}
                        </select>
                        <input type="text" placeholder="descriere" data-item-description="${gi}-${ii}" value="${escapeHtml(item.description || "")}">
                        <label class="admin-inline-checkbox"><input type="checkbox" data-item-available="${gi}-${ii}" ${item.available !== false ? "checked" : ""}> Disponibil</label>
                        <button type="button" class="admin-btn-ghost admin-btn-danger" data-remove-item="${gi}-${ii}">Sterge</button>
                    </div>
                `).join("") || `<p class="admin-empty-hint">Niciun supliment adaugat.</p>`;

                container.querySelectorAll("[data-item-name]").forEach((el) => el.addEventListener("input", (e) => {
                    const [g, i] = e.target.dataset.itemName.split("-").map(Number);
                    state.optionGroups[g].items[i].name = e.target.value; markDirty();
                }));
                container.querySelectorAll("[data-item-price]").forEach((el) => el.addEventListener("input", (e) => {
                    const [g, i] = e.target.dataset.itemPrice.split("-").map(Number);
                    state.optionGroups[g].items[i].priceMdl = Number(e.target.value) || 0; markDirty();
                }));
                container.querySelectorAll("[data-item-unit]").forEach((el) => el.addEventListener("change", (e) => {
                    const [g, i] = e.target.dataset.itemUnit.split("-").map(Number);
                    state.optionGroups[g].items[i].unit = e.target.value; markDirty();
                }));
                container.querySelectorAll("[data-item-description]").forEach((el) => el.addEventListener("input", (e) => {
                    const [g, i] = e.target.dataset.itemDescription.split("-").map(Number);
                    state.optionGroups[g].items[i].description = e.target.value; markDirty();
                }));
                container.querySelectorAll("[data-item-available]").forEach((el) => el.addEventListener("change", (e) => {
                    const [g, i] = e.target.dataset.itemAvailable.split("-").map(Number);
                    state.optionGroups[g].items[i].available = e.target.checked; markDirty();
                }));
                container.querySelectorAll("[data-remove-item]").forEach((btn) => btn.addEventListener("click", () => {
                    const [g, i] = btn.dataset.removeItem.split("-").map(Number);
                    state.optionGroups[g].items.splice(i, 1); markDirty(); drawItems(g);
                }));
            }

            panel.querySelector("[data-add-group]").addEventListener("click", () => {
                state.optionGroups.push({ name: "", selection: "single", available: true, items: [] });
                markDirty();
                drawGroups();
            });

            drawGroups();
        }

        saveBtn.addEventListener("click", async () => {
            messageEl.textContent = "";
            messageEl.className = "admin-message";
            saveBtn.disabled = true;
            saveBtn.textContent = "Se salveaza...";
            try {
                const payload = toPayload(state);
                const response = isCreateMode
                    ? await AdminApi.createProduct(payload)
                    : await AdminApi.updateProduct(productId, payload);
                initialSnapshot = JSON.stringify({ ...state, id: response.product.id });
                dirty = false;
                editorActive = false;
                window.removeEventListener("beforeunload", beforeUnloadHandler);
                AdminRouter.clearLeaveGuard();
                messageEl.textContent = "Produsul a fost salvat cu succes.";
                messageEl.className = "admin-message ok";
                setTimeout(() => AdminRouter.navigate("/products"), 400);
            } catch (error) {
                messageEl.textContent = error.errors ? error.errors.join(" ") : error.message;
                messageEl.className = "admin-message error";
                saveBtn.disabled = false;
                saveBtn.textContent = isCreateMode ? "Creeaza produsul" : "Salveaza modificarile";
            }
        });
    }

    return { render };
})();
