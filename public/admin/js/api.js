const AdminApi = (function () {
    async function request(url, options = {}) {
        const response = await fetch(url, {
            headers: { "Content-Type": "application/json" },
            ...options
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.ok === false) {
            const error = new Error(data.message || "A aparut o eroare.");
            error.status = response.status;
            if (Array.isArray(data.errors)) error.errors = data.errors;
            throw error;
        }
        return data;
    }

    return {
        session: () => request("/api/admin/session"),
        login: (username, password) => request("/api/admin/login", {
            method: "POST",
            body: JSON.stringify({ username, password })
        }),
        logout: () => request("/api/admin/logout", { method: "POST", body: "{}" }),
        products: (query = "") => request(`/api/products${query}`),
        categories: () => request("/api/categories"),
        adminProducts: (query = "") => request(`/api/admin/products${query}`),
        adminProduct: (id) => request(`/api/admin/products/${encodeURIComponent(id)}`),
        createProduct: (payload) => request("/api/admin/products", {
            method: "POST",
            body: JSON.stringify(payload)
        }),
        updateProduct: (id, payload) => request(`/api/admin/products/${encodeURIComponent(id)}`, {
            method: "PUT",
            body: JSON.stringify(payload)
        }),
        deleteProduct: (id) => request(`/api/admin/products/${encodeURIComponent(id)}`, {
            method: "DELETE",
            body: JSON.stringify({ confirm: true })
        }),
        restoreProduct: (id) => request(`/api/admin/products/${encodeURIComponent(id)}/restore`, {
            method: "POST",
            body: "{}"
        })
    };
})();
