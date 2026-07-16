const AdminProductList = (function () {
    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function formatPrice(value) {
        return `${Number(value || 0).toLocaleString("ro-RO")} MDL`;
    }

    // priceMdl === 0 means the product has no fixed catalog price - it's a
    // made-to-order / calculator-priced item, not a data error (see the
    // price/stock dry-run: only one product in the whole catalog has ever
    // had a fixed price). "Epuizat" is reserved for products that DO have a
    // fixed price and are genuinely out of stock.
    function renderPriceCell(p) {
        if (Number(p.priceMdl) > 0) return `<span class="admin-price-value">${escapeHtml(formatPrice(p.priceMdl))}</span>`;
        return `<span class="admin-badge admin-badge-order">La comandă</span>`;
    }

    function renderStockCell(p) {
        if (p.inStock) {
            return `<span class="admin-badge admin-badge-success">În stoc</span>`;
        }
        if (Number(p.priceMdl) === 0) {
            return `<span class="admin-badge admin-badge-order">La comandă</span>`;
        }
        return `<span class="admin-badge admin-badge-muted">Epuizat</span>`;
    }

    // Product images are stored as root-relative paths (e.g. "assets/products/x.jpg").
    // The admin app lives under /admin/, so without a leading slash the browser
    // resolves them against /admin/ instead of the site root, breaking every thumbnail.
    function resolveImageUrl(path) {
        if (!path) return "";
        if (/^(https?:)?\/\//i.test(path) || path.startsWith("/")) return path;
        return `/${path}`;
    }

    // The API only knows the raw in_stock flag (true/false); "La comanda" vs
    // "Epuizat" is a distinction this admin view makes by also looking at
    // priceMdl (see renderStockCell), so both map to inStock=false server-side
    // and get split apart after the response arrives (see needsClientSplit).
    function buildQuery(state, overrides) {
        const params = new URLSearchParams();
        if (state.search) params.set("search", state.search);
        if (state.deleted) {
            params.set("deleted", "true");
        } else {
            if (state.category) params.set("category", state.category);
            if (state.stock === "true") params.set("inStock", "true");
            else if (state.stock === "la-comanda" || state.stock === "epuizat") params.set("inStock", "false");
            if (state.active) params.set("active", state.active);
        }
        const limit = overrides?.limit ?? state.limit;
        const offset = overrides?.offset ?? state.offset;
        params.set("limit", limit);
        params.set("offset", offset);
        return `?${params.toString()}`;
    }

    async function render(contentEl) {
        const state = { search: "", category: "", stock: "", active: "", deleted: false, limit: 20, offset: 0 };
        let categories = [];
        try {
            const categoriesResponse = await AdminApi.categories();
            categories = categoriesResponse.categories || [];
        } catch { /* filters still usable without categories */ }

        contentEl.innerHTML = `
            <div class="admin-toolbar">
                <div class="admin-toolbar-filters">
                    <input type="search" data-filter-search placeholder="Cauta dupa titlu sau id...">
                    <select data-filter-category>
                        <option value="">Toate categoriile</option>
                        ${categories.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join("")}
                    </select>
                    <select data-filter-stock>
                        <option value="">Toate</option>
                        <option value="true">În stoc</option>
                        <option value="la-comanda">La comandă</option>
                        <option value="epuizat">Epuizat</option>
                    </select>
                    <select data-filter-active>
                        <option value="">Status: toate</option>
                        <option value="true">Active</option>
                        <option value="false">Inactive</option>
                    </select>
                </div>
                <div class="admin-toolbar-actions">
                    <button class="admin-btn-ghost" type="button" data-toggle-trash>Cos de gunoi</button>
                    <button class="admin-btn-primary" type="button" data-add-product>+ Adauga produs</button>
                </div>
            </div>
            <div data-product-list-body></div>
        `;

        const searchInput = contentEl.querySelector("[data-filter-search]");
        const categorySelect = contentEl.querySelector("[data-filter-category]");
        const stockSelect = contentEl.querySelector("[data-filter-stock]");
        const activeSelect = contentEl.querySelector("[data-filter-active]");
        const listBody = contentEl.querySelector("[data-product-list-body]");
        const addBtn = contentEl.querySelector("[data-add-product]");
        const trashToggleBtn = contentEl.querySelector("[data-toggle-trash]");
        const filterFields = [categorySelect, stockSelect, activeSelect];

        function syncTrashUi() {
            trashToggleBtn.textContent = state.deleted ? "← Produse active" : "Cos de gunoi";
            addBtn.style.display = state.deleted ? "none" : "";
            filterFields.forEach((el) => { el.disabled = state.deleted; el.style.opacity = state.deleted ? 0.5 : 1; });
        }

        // Purely visual: a faint gold border on a select whose value isn't
        // the default ("Toate"/all), so an applied filter is visible without
        // having to open the dropdown. Doesn't affect filtering behavior.
        function syncFilterIndicator(select) {
            select.classList.toggle("is-filtered", Boolean(select.value));
        }

        addBtn.addEventListener("click", () => AdminRouter.navigate("/products/new"));
        trashToggleBtn.addEventListener("click", () => {
            state.deleted = !state.deleted;
            state.offset = 0;
            syncTrashUi();
            load();
        });

        let searchDebounce = null;
        searchInput.addEventListener("input", () => {
            clearTimeout(searchDebounce);
            searchDebounce = setTimeout(() => {
                state.search = searchInput.value.trim();
                state.offset = 0;
                load();
            }, 300);
        });
        categorySelect.addEventListener("change", () => { state.category = categorySelect.value; state.offset = 0; syncFilterIndicator(categorySelect); load(); });
        stockSelect.addEventListener("change", () => { state.stock = stockSelect.value; state.offset = 0; syncFilterIndicator(stockSelect); load(); });
        activeSelect.addEventListener("change", () => { state.active = activeSelect.value; state.offset = 0; syncFilterIndicator(activeSelect); load(); });

        let loadToken = 0;

        // Guards against out-of-order responses: if the user changes a filter
        // (or toggles the trash view) again before an in-flight request
        // resolves, an older/slower response must not overwrite the newer
        // request's render once it lands.
        async function load() {
            const token = ++loadToken;
            listBody.innerHTML = `<p class="admin-panel-card">Se incarca...</p>`;
            try {
                const needsClientSplit = state.stock === "la-comanda" || state.stock === "epuizat";
                let data;
                if (needsClientSplit) {
                    // The server only distinguishes in_stock true/false; "La comanda"
                    // vs "Epuizat" also depends on priceMdl, so fetch the full
                    // inStock=false set (well within one page - see the 200-item
                    // API limit) and do the price split and pagination client-side.
                    const raw = await AdminApi.adminProducts(buildQuery(state, { limit: 200, offset: 0 }));
                    const filtered = raw.products.filter((p) => (
                        state.stock === "la-comanda" ? Number(p.priceMdl) === 0 : Number(p.priceMdl) > 0
                    ));
                    data = {
                        total: filtered.length,
                        limit: state.limit,
                        offset: state.offset,
                        products: filtered.slice(state.offset, state.offset + state.limit)
                    };
                } else {
                    data = await AdminApi.adminProducts(buildQuery(state));
                }
                if (token !== loadToken) return;
                renderTable(data);
            } catch (error) {
                if (token !== loadToken) return;
                listBody.innerHTML = `<p class="admin-panel-card">Nu am putut incarca produsele: ${escapeHtml(error.message)}</p>`;
            }
        }

        function renderTable(data) {
            if (!data.products.length) {
                listBody.innerHTML = `<p class="admin-panel-card">${state.deleted ? "Cosul de gunoi este gol." : "Niciun produs gasit pentru filtrele curente."}</p>`;
                return;
            }

            const rows = data.products.map((p) => `
                <tr data-row="${escapeHtml(p.id)}">
                    <td data-label="Imagine" class="admin-cell-image">
                        ${p.image ? `<img src="${escapeHtml(resolveImageUrl(p.image))}" alt="" loading="lazy">` : `<div class="admin-image-placeholder"></div>`}
                    </td>
                    <td data-label="Titlu">
                        <strong>${escapeHtml(p.title)}</strong>
                        <span class="admin-cell-sub">${escapeHtml(p.id)}</span>
                    </td>
                    <td data-label="Categorie">${escapeHtml(p.categoryName || p.category || "-")}</td>
                    <td data-label="Pret">${renderPriceCell(p)}</td>
                    <td data-label="Stoc">${renderStockCell(p)}</td>
                    <td data-label="Status">
                        <span class="admin-badge ${p.active ? "admin-badge-success" : "admin-badge-danger"}">${p.active ? "Activ" : "Inactiv"}</span>
                    </td>
                    <td data-label="Actiuni" class="admin-cell-actions">
                        ${state.deleted
                            ? `<button type="button" class="admin-btn-ghost" data-restore="${escapeHtml(p.id)}">Restaureaza</button>`
                            : `<button type="button" class="admin-btn-ghost admin-btn-edit" data-edit="${escapeHtml(p.id)}">Editeaza</button>
                               <button type="button" class="admin-btn-ghost admin-btn-danger" data-delete="${escapeHtml(p.id)}">Sterge</button>`
                        }
                    </td>
                </tr>
            `).join("");

            const totalPages = Math.max(1, Math.ceil(data.total / data.limit));
            const currentPage = Math.floor(data.offset / data.limit) + 1;

            listBody.innerHTML = `
                <div class="admin-table-wrap">
                    <table class="admin-table">
                        <thead>
                            <tr>
                                <th></th><th>Titlu</th><th>Categorie</th><th>Pret</th><th>Stoc</th><th>Status</th><th>Actiuni</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
                <div class="admin-pagination">
                    <span>${data.total} produse &middot; pagina ${currentPage} din ${totalPages}</span>
                    <div class="admin-pagination-controls">
                        <button type="button" class="admin-btn-ghost" data-page-prev ${data.offset === 0 ? "disabled" : ""}>Anterior</button>
                        <button type="button" class="admin-btn-ghost" data-page-next ${data.offset + data.limit >= data.total ? "disabled" : ""}>Urmator</button>
                    </div>
                </div>
            `;

            listBody.querySelectorAll("[data-edit]").forEach((btn) => {
                btn.addEventListener("click", () => AdminRouter.navigate(`/products/${encodeURIComponent(btn.dataset.edit)}/edit`));
            });
            listBody.querySelectorAll("[data-delete]").forEach((btn) => {
                btn.addEventListener("click", () => handleDelete(btn.dataset.delete, btn));
            });
            listBody.querySelectorAll("[data-restore]").forEach((btn) => {
                btn.addEventListener("click", () => handleRestore(btn.dataset.restore, btn));
            });
            const prevBtn = listBody.querySelector("[data-page-prev]");
            const nextBtn = listBody.querySelector("[data-page-next]");
            if (prevBtn) prevBtn.addEventListener("click", () => { state.offset = Math.max(0, state.offset - state.limit); load(); });
            if (nextBtn) nextBtn.addEventListener("click", () => { state.offset += state.limit; load(); });
        }

        async function handleDelete(id, btn) {
            const confirmed = window.confirm(`Sigur stergi produsul "${id}"? Va disparea imediat de pe site-ul public si va fi mutat in cosul de gunoi, de unde poate fi restaurat oricand.`);
            if (!confirmed) return;
            btn.disabled = true;
            btn.textContent = "Se sterge...";
            try {
                await AdminApi.deleteProduct(id);
                load();
            } catch (error) {
                window.alert(`Nu am putut sterge produsul: ${error.message}`);
                btn.disabled = false;
                btn.textContent = "Sterge";
            }
        }

        async function handleRestore(id, btn) {
            btn.disabled = true;
            btn.textContent = "Se restaureaza...";
            try {
                await AdminApi.restoreProduct(id);
                load();
            } catch (error) {
                window.alert(`Nu am putut restaura produsul: ${error.message}`);
                btn.disabled = false;
                btn.textContent = "Restaureaza";
            }
        }

        syncTrashUi();
        load();
    }

    return { render };
})();
