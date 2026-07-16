(function () {
    const root = document.getElementById("adminRoot");

    async function isAuthenticated() {
        try {
            const data = await AdminApi.session();
            return Boolean(data.authenticated);
        } catch {
            return false;
        }
    }

    function startApp() {
        AdminViews.renderShell(root);

        AdminRouter.on("/dashboard", (path) => {
            AdminViews.setActiveNav(root, path);
            AdminViews.renderDashboard(root.querySelector("[data-admin-content]"));
        });
        AdminRouter.on("/products", (path) => {
            AdminViews.setActiveNav(root, path);
            AdminProductList.render(root.querySelector("[data-admin-content]"));
        });
        AdminRouter.on("/products/new", (path) => {
            AdminViews.setActiveNav(root, "/products");
            root.querySelector("[data-page-title]").textContent = "Produs nou";
            AdminProductEditor.render(root.querySelector("[data-admin-content]"), {});
        });
        AdminRouter.on("/products/:id/edit", (path, params) => {
            AdminViews.setActiveNav(root, "/products");
            root.querySelector("[data-page-title]").textContent = "Editeaza produs";
            AdminProductEditor.render(root.querySelector("[data-admin-content]"), params);
        });
        AdminRouter.on("/categories", (path) => {
            AdminViews.setActiveNav(root, path);
            AdminViews.renderStub(root.querySelector("[data-admin-content]"), "Categorii");
        });
        AdminRouter.on("/404", () => {
            AdminViews.renderStub(root.querySelector("[data-admin-content]"), "Pagina negasita");
        });

        AdminRouter.start();
    }

    async function boot() {
        root.innerHTML = `<div class="admin-loading">Se incarca...</div>`;
        const authed = await isAuthenticated();
        if (!authed) {
            AdminViews.renderLogin(root, startApp);
            return;
        }
        startApp();
    }

    boot();
})();
