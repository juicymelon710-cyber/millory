const AdminViews = (function () {
    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function renderLogin(root, onSuccess) {
        root.innerHTML = `
            <div class="admin-login">
                <div class="admin-login-card">
                    <div class="admin-login-logo">
                        <img src="/assets/logos/millory-mark-premium.png" alt="">
                        <span>MILLORY</span>
                    </div>
                    <p class="admin-login-eyebrow">Panou administrare</p>
                    <h1>Autentificare</h1>
                    <p class="admin-login-subtitle">Introdu datele de acces pentru a gestiona produsele, categoriile si comenzile Millory.</p>
                    <form data-login-form novalidate>
                        <div class="admin-field">
                            <label for="adminUsername">Utilizator</label>
                            <input id="adminUsername" name="username" type="text" autocomplete="username" placeholder="admin" required>
                        </div>
                        <div class="admin-field">
                            <label for="adminPassword">Parola</label>
                            <input id="adminPassword" name="password" type="password" autocomplete="current-password" placeholder="••••••••" required>
                        </div>
                        <button class="admin-submit" type="submit">Intra in panou</button>
                        <p class="admin-message" data-login-message></p>
                    </form>
                    <p class="admin-login-footer">Millory Admin &middot; acces restrictionat</p>
                </div>
            </div>
        `;

        const form = root.querySelector("[data-login-form]");
        const message = root.querySelector("[data-login-message]");
        const submitBtn = form.querySelector(".admin-submit");

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            message.textContent = "";
            message.className = "admin-message";
            submitBtn.disabled = true;
            submitBtn.textContent = "Se autentifica...";

            const data = new FormData(form);
            try {
                await AdminApi.login(data.get("username"), data.get("password"));
                message.textContent = "Autentificat cu succes.";
                message.className = "admin-message ok";
                onSuccess();
            } catch (error) {
                message.textContent = error.message;
                message.className = "admin-message error";
                submitBtn.disabled = false;
                submitBtn.textContent = "Intra in panou";
            }
        });
    }

    const NAV_ITEMS = [
        { path: "/dashboard", label: "Dashboard", icon: "M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6V11h-6v9Zm0-16v5h6V4h-6Z" },
        { path: "/products", label: "Produse", icon: "M4 7l8-4 8 4v10l-8 4-8-4V7Zm8-4v18M4 7l8 4 8-4" },
        { path: "/categories", label: "Categorii", icon: "M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z" }
    ];

    function renderShell(root) {
        root.innerHTML = `
            <div class="admin-shell">
                <aside class="admin-sidebar">
                    <div class="admin-sidebar-logo">
                        <img src="/assets/logos/millory-mark-premium.png" alt="">
                        <span>MILLORY</span>
                    </div>
                    <nav class="admin-nav" data-admin-nav>
                        ${NAV_ITEMS.map((item) => `
                            <a href="#${item.path}" data-nav-link="${item.path}">
                                <svg class="admin-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${item.icon}"></path></svg>
                                <span>${item.label}</span>
                            </a>
                        `).join("")}
                    </nav>
                    <div class="admin-sidebar-footer">
                        <button class="admin-logout-btn" type="button" data-logout>
                            <svg class="admin-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"></path></svg>
                            <span>Iesire</span>
                        </button>
                    </div>
                </aside>
                <div class="admin-main">
                    <header class="admin-topbar">
                        <h1 data-page-title>Dashboard</h1>
                        <span class="admin-topbar-user">Admin Millory</span>
                    </header>
                    <main class="admin-content" data-admin-content></main>
                </div>
            </div>
        `;

        root.querySelector("[data-logout]").addEventListener("click", async () => {
            try { await AdminApi.logout(); } catch { /* ignore, redirect regardless */ }
            window.location.hash = "";
            window.location.reload();
        });
    }

    function setActiveNav(root, path) {
        root.querySelectorAll("[data-nav-link]").forEach((link) => {
            link.classList.toggle("active", link.dataset.navLink === path);
        });
        const titleItem = NAV_ITEMS.find((item) => item.path === path);
        const titleEl = root.querySelector("[data-page-title]");
        if (titleEl) titleEl.textContent = titleItem ? titleItem.label : "Millory Admin";
    }

    let dashboardLoadToken = 0;

    // Guards against out-of-order responses: if the admin navigates away and
    // back to the dashboard before a slower earlier request resolves, that
    // stale response must not overwrite the newer visit's render.
    async function renderDashboard(contentEl) {
        const token = ++dashboardLoadToken;
        contentEl.innerHTML = `<p class="admin-panel-card">Se incarca...</p>`;
        try {
            const data = await AdminApi.products("?limit=1");
            const categories = await AdminApi.categories();
            if (token !== dashboardLoadToken) return;
            contentEl.innerHTML = `
                <div class="admin-stats-grid">
                    <div class="admin-stat-card">
                        <span>Produse active</span>
                        <strong>${data.total}</strong>
                    </div>
                    <div class="admin-stat-card">
                        <span>Categorii</span>
                        <strong>${categories.categories.length}</strong>
                    </div>
                </div>
                <div class="admin-panel-card">
                    <h2>Bine ai venit</h2>
                    <p>Datele sunt incarcate direct din baza Turso prin API-ul public al site-ului. Sectiunile de gestionare a produselor, categoriilor si comenzilor vor fi adaugate in etapele urmatoare.</p>
                </div>
            `;
        } catch (error) {
            if (token !== dashboardLoadToken) return;
            contentEl.innerHTML = `<p class="admin-panel-card">Nu am putut incarca datele: ${escapeHtml(error.message)}</p>`;
        }
    }

    function renderStub(contentEl, label) {
        contentEl.innerHTML = `
            <div class="admin-stub">
                <div>
                    <strong>${escapeHtml(label)}</strong>
                    <p>Aceasta sectiune va fi construita intr-o etapa urmatoare.</p>
                </div>
            </div>
        `;
    }

    return { renderLogin, renderShell, setActiveNav, renderDashboard, renderStub, NAV_ITEMS };
})();
