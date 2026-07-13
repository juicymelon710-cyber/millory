(function () {
    const CART_KEY = "millory:cart";
    const FAVORITES_KEY = "millory:favorites";
    const STORE_PHONE = "37369482034";
    const STORE_PHONE_INTERNATIONAL = "+37369482034";
    const products = window.MILLORY_PRODUCTS || [];
    const productMap = new Map(products.map((product) => [String(product.id), product]));

    const drawer = document.getElementById("cartDrawer");
    const overlay = document.querySelector(".cart-overlay");
    const itemsRoot = document.querySelector("[data-cart-items]");
    const countNodes = document.querySelectorAll("[data-cart-count]");
    const titleNode = document.querySelector("[data-cart-title]");
    const totalNode = document.querySelector("[data-cart-total]");
    const checkoutModal = document.getElementById("checkoutModal");
    const checkoutSummary = document.querySelector("[data-checkout-summary]");
    const checkoutForm = document.querySelector("[data-checkout-form]");
    const favoritesDrawer = document.getElementById("favoritesDrawer");
    const favoritesOverlay = document.querySelector(".favorites-overlay");
    const favoritesItemsRoot = document.querySelector("[data-favorites-items]");
    const favoritesTitle = document.querySelector("[data-favorites-title]");
    const favoritesToCart = document.querySelector("[data-favorites-to-cart]");
    const productGrid = document.getElementById("productGrid");
    let checkoutChannel = "whatsapp";

    let cart = readList(CART_KEY);
    let favorites = readList(FAVORITES_KEY).map(String);

    function readList(key) {
        try {
            const parsed = JSON.parse(localStorage.getItem(key) || "[]");
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    function saveCart() {
        localStorage.setItem(CART_KEY, JSON.stringify(cart));
    }

    function saveFavorites() {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    }

    function formatMdl(value) {
        const number = Number(value || 0);
        if (!number) return "La cerere";
        return `${Math.round(number).toLocaleString("ro-RO")} MDL`;
    }

    function productSize(product) {
        const size = (product.recommendedSizes || [])[0] || product.defaultSize || null;
        if (!size) return { id: "default", name: "La comanda", priceMdl: product.priceMdl || 0 };
        return {
            id: String(size.id || size.name || "default"),
            name: size.name || `${size.width || ""}x${size.height || ""}`,
            priceMdl: Number(size.priceMdl || product.priceMdl || (product.priceRon ? product.priceRon * 4 : 0))
        };
    }

    function itemKey(product, size) {
        return `${product.id}::${size.id}`;
    }

    function totalQuantity() {
        return cart.reduce((sum, item) => sum + item.quantity, 0);
    }

    function totalMdl() {
        return cart.reduce((sum, item) => sum + (Number(item.priceMdl || 0) * item.quantity), 0);
    }

    function addToCart(productId, button, options = {}) {
        const product = productMap.get(String(productId));
        if (!product) return;

        const size = productSize(product);
        const key = itemKey(product, size);
        const existing = cart.find((item) => item.key === key);

        if (existing) {
            existing.quantity += 1;
        } else {
            cart.push({
                key,
                productId: product.id,
                title: product.title,
                image: product.image,
                size: size.name,
                priceMdl: size.priceMdl,
                quantity: 1
            });
        }

        saveCart();
        renderCart();
        pulseCartButton();
        if (!options.silent) markAdded(button);
    }

    function markAdded(button) {
        if (!button) return;
        const previous = button.innerHTML;
        button.classList.add("is-added");
        button.innerHTML = "<span>&#10003;</span> Adaugat";
        window.setTimeout(() => {
            button.classList.remove("is-added");
            button.innerHTML = previous;
        }, 850);
    }

    function pulseCartButton() {
        document.querySelectorAll("[data-cart-open]").forEach((button) => {
            button.classList.remove("cart-pulse");
            void button.offsetWidth;
            button.classList.add("cart-pulse");
        });
    }

    function isFavorite(productId) {
        return favorites.includes(String(productId));
    }

    function toggleFavorite(productId) {
        const id = String(productId);
        favorites = isFavorite(id)
            ? favorites.filter((item) => item !== id)
            : [...favorites, id];
        saveFavorites();
        renderFavorites();
        syncFavoriteButtons();
    }

    function syncFavoriteButtons() {
        document.querySelectorAll("[data-favorite-toggle]").forEach((button) => {
            const active = isFavorite(button.dataset.favoriteToggle);
            button.classList.toggle("is-favorite", active);
            button.setAttribute("aria-pressed", String(active));
        });
        if (favoritesTitle) {
            favoritesTitle.textContent = favorites.length === 1 ? "1 produs" : `${favorites.length} produse`;
        }
    }

    function injectProductButtons() {
        document.querySelectorAll(".product-card[data-product-id], .featured-card[data-product-id]").forEach((card) => {
            if (card.querySelector(".cart-card-button")) return;
            const target = card.querySelector(".product-body") || card.querySelector(".featured-body");
            if (!target) return;

            const favoriteButton = document.createElement("button");
            favoriteButton.className = "favorite-card-button";
            favoriteButton.type = "button";
            favoriteButton.dataset.favoriteToggle = card.dataset.productId;
            favoriteButton.setAttribute("aria-label", "Adauga la favorite");
            favoriteButton.innerHTML = `
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M20.8 4.6c-2.1-2-5.3-1.7-7.2.4L12 6.8 10.4 5C8.5 2.9 5.3 2.6 3.2 4.6 1 6.8.9 10.3 3 12.6l9 8.6 9-8.6c2.1-2.3 2-5.8-.2-8Z"></path>
                </svg>
            `;
            favoriteButton.addEventListener("click", (event) => {
                event.stopPropagation();
                toggleFavorite(card.dataset.productId);
            });
            card.appendChild(favoriteButton);

            const button = document.createElement("button");
            button.className = "cart-card-button";
            button.type = "button";
            button.innerHTML = "<span aria-hidden=\"true\">&#128722;</span> Adauga in cos";
            button.addEventListener("click", (event) => {
                event.stopPropagation();
                addToCart(card.dataset.productId, button);
            });
            target.appendChild(button);
        });
        syncFavoriteButtons();
    }

    function renderCart() {
        const quantity = totalQuantity();
        countNodes.forEach((node) => {
            node.textContent = quantity;
        });
        if (titleNode) titleNode.textContent = quantity === 1 ? "1 produs" : `${quantity} produse`;
        if (totalNode) totalNode.textContent = formatMdl(totalMdl());

        if (!itemsRoot) return;
        if (!cart.length) {
            itemsRoot.innerHTML = "<div class=\"cart-empty\">Cosul este gol. Alege o oglinda din catalog si adaug-o aici.</div>";
            renderCheckoutSummary();
            return;
        }

        itemsRoot.innerHTML = cart.map((item) => {
            const subtotal = Number(item.priceMdl || 0) * item.quantity;
            return `
                <article class="cart-item" data-cart-key="${item.key}">
                    <img src="${item.image || "assets/images/millory-showroom-hero.png"}" alt="${item.title}">
                    <div>
                        <h3>${item.title}</h3>
                        <small>Dimensiune: ${item.size || "La comanda"}</small>
                        <small>Pret: ${formatMdl(item.priceMdl)}</small>
                        <div class="cart-item-meta">
                            <div class="cart-qty">
                                <button type="button" data-cart-minus aria-label="Scade cantitatea">&minus;</button>
                                <strong>${item.quantity}</strong>
                                <button type="button" data-cart-plus aria-label="Creste cantitatea">+</button>
                            </div>
                            <button class="cart-remove" type="button" data-cart-remove aria-label="Sterge produsul">&times;</button>
                        </div>
                        <div class="cart-line-total">
                            <span>Subtotal</span>
                            <strong>${formatMdl(subtotal)}</strong>
                        </div>
                    </div>
                </article>
            `;
        }).join("");

        renderCheckoutSummary();
    }

    function renderFavorites() {
        syncFavoriteButtons();
        if (!favoritesItemsRoot) return;
        const favoriteProducts = favorites.map((id) => productMap.get(id)).filter(Boolean);

        if (!favoriteProducts.length) {
            favoritesItemsRoot.innerHTML = "<div class=\"cart-empty\"><strong>Nu exista produse favorite</strong><span>Produsele salvate din catalog vor aparea aici.</span></div>";
            return;
        }

        favoritesItemsRoot.innerHTML = favoriteProducts.map((product) => {
            const size = productSize(product);
            return `
                <article class="cart-item favorite-item" data-favorite-id="${product.id}">
                    <img src="${product.image || "assets/images/millory-showroom-hero.png"}" alt="${product.title}">
                    <div>
                        <h3>${product.title}</h3>
                        <small>Dimensiune: ${size.name || "La comanda"}</small>
                        <small>Pret: ${formatMdl(size.priceMdl)}</small>
                        <div class="favorite-actions">
                            <button type="button" data-favorite-add-cart>Adauga in cos</button>
                            <button type="button" data-favorite-remove>Sterge</button>
                        </div>
                    </div>
                </article>
            `;
        }).join("");
    }

    function updateQuantity(key, delta) {
        const item = cart.find((entry) => entry.key === key);
        if (!item) return;
        item.quantity += delta;
        if (item.quantity <= 0) cart = cart.filter((entry) => entry.key !== key);
        saveCart();
        renderCart();
    }

    function removeItem(key) {
        cart = cart.filter((entry) => entry.key !== key);
        saveCart();
        renderCart();
    }

    function openCart() {
        if (!drawer || !overlay) return;
        closeFavorites();
        drawer.classList.add("open");
        drawer.setAttribute("aria-hidden", "false");
        overlay.hidden = false;
        document.body.classList.add("product-modal-open");
    }

    function closeCart() {
        if (!drawer || !overlay) return;
        drawer.classList.remove("open");
        drawer.setAttribute("aria-hidden", "true");
        overlay.hidden = true;
        document.body.classList.remove("product-modal-open");
    }

    function openFavorites() {
        if (!favoritesDrawer || !favoritesOverlay) return;
        closeCart();
        renderFavorites();
        favoritesDrawer.classList.add("open");
        favoritesDrawer.setAttribute("aria-hidden", "false");
        favoritesOverlay.hidden = false;
        document.body.classList.add("product-modal-open");
    }

    function closeFavorites() {
        if (!favoritesDrawer || !favoritesOverlay) return;
        favoritesDrawer.classList.remove("open");
        favoritesDrawer.setAttribute("aria-hidden", "true");
        favoritesOverlay.hidden = true;
        document.body.classList.remove("product-modal-open");
    }

    function openCheckout() {
        if (!cart.length || !checkoutModal) return;
        renderCheckoutSummary();
        checkoutModal.classList.add("open");
        checkoutModal.setAttribute("aria-hidden", "false");
    }

    function closeCheckout() {
        if (!checkoutModal) return;
        checkoutModal.classList.remove("open");
        checkoutModal.setAttribute("aria-hidden", "true");
    }

    function renderCheckoutSummary() {
        if (!checkoutSummary) return;
        if (!cart.length) {
            checkoutSummary.innerHTML = "<strong>Rezumat comanda</strong><span>Cosul este gol.</span>";
            return;
        }

        checkoutSummary.innerHTML = `
            <strong>Rezumat comanda</strong>
            ${cart.map((item) => `<span>${item.title} x${item.quantity} - ${formatMdl(item.priceMdl)} / buc. - subtotal ${formatMdl(Number(item.priceMdl || 0) * item.quantity)}</span>`).join("")}
            <strong>Total: ${formatMdl(totalMdl())}</strong>
        `;
    }

    function checkoutMessage(formData) {
        const notes = String(formData.get("notes") || "").trim();
        const lines = [
            "Buna ziua!",
            "Doresc sa comand:",
            "",
            ...cart.map((item) => [
                `- ${item.title} x${item.quantity}${item.size ? ` (${item.size})` : ""}`,
                `  Pret: ${formatMdl(item.priceMdl)} / buc.`,
                `  Subtotal: ${formatMdl(Number(item.priceMdl || 0) * item.quantity)}`
            ].join("\n")),
            "",
            `Total: ${formatMdl(totalMdl())}`,
            "",
            `Nume: ${formData.get("lastName")}`,
            `Prenume: ${formData.get("firstName")}`,
            `Telefon: ${formData.get("phone")}`,
            `Email: ${formData.get("email") || "-"}`,
            `Oras: ${formData.get("city")}`,
            `Adresa: ${formData.get("address")}`,
            `Observatii: ${notes || "-"}`
        ];

        return lines.join("\n");
    }

    function renderConfirmedSummary(message) {
        if (!checkoutSummary) return;
        checkoutSummary.innerHTML = `
            <strong>Rezumat generat</strong>
            <pre>${message}</pre>
        `;
    }

    async function sendViber(message) {
        if (navigator.clipboard && window.isSecureContext) {
            try {
                await navigator.clipboard.writeText(message);
            } catch {
                // Browser support varies for Viber deep links with prefilled text.
            }
        }
        window.location.href = `viber://chat?number=${encodeURIComponent(STORE_PHONE_INTERNATIONAL)}`;
    }

    function bindEvents() {
        document.querySelectorAll("[data-cart-open]").forEach((button) => button.addEventListener("click", openCart));
        document.querySelectorAll("[data-cart-close]").forEach((button) => button.addEventListener("click", closeCart));
        document.querySelectorAll("[data-favorites-open]").forEach((button) => button.addEventListener("click", openFavorites));
        document.querySelectorAll("[data-favorites-close]").forEach((button) => button.addEventListener("click", closeFavorites));
        document.querySelectorAll("[data-checkout-open]").forEach((button) => button.addEventListener("click", openCheckout));
        document.querySelectorAll("[data-checkout-close]").forEach((button) => button.addEventListener("click", closeCheckout));

        if (itemsRoot) {
            itemsRoot.addEventListener("click", (event) => {
                const item = event.target.closest(".cart-item");
                if (!item) return;
                if (event.target.closest("[data-cart-plus]")) updateQuantity(item.dataset.cartKey, 1);
                if (event.target.closest("[data-cart-minus]")) updateQuantity(item.dataset.cartKey, -1);
                if (event.target.closest("[data-cart-remove]")) removeItem(item.dataset.cartKey);
            });
        }

        if (favoritesItemsRoot) {
            favoritesItemsRoot.addEventListener("click", (event) => {
                const item = event.target.closest(".favorite-item");
                if (!item) return;
                if (event.target.closest("[data-favorite-add-cart]")) addToCart(item.dataset.favoriteId, event.target.closest("button"));
                if (event.target.closest("[data-favorite-remove]")) toggleFavorite(item.dataset.favoriteId);
            });
        }

        if (favoritesToCart) {
            favoritesToCart.addEventListener("click", () => {
                favorites.forEach((id) => addToCart(id, null, { silent: true }));
                closeFavorites();
                openCart();
            });
        }

        if (checkoutForm) {
            checkoutForm.addEventListener("submit", (event) => {
                event.preventDefault();
                if (!cart.length) return;
                const message = checkoutMessage(new FormData(checkoutForm));
                renderConfirmedSummary(message);

                if (checkoutChannel === "viber") {
                    sendViber(message);
                    return;
                }

                window.open(`https://wa.me/${STORE_PHONE}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
            });

            checkoutForm.querySelectorAll("[data-checkout-channel]").forEach((button) => {
                button.addEventListener("click", () => {
                    checkoutChannel = button.dataset.checkoutChannel || "whatsapp";
                });
            });
        }

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                closeCheckout();
                closeCart();
                closeFavorites();
            }
        });
    }

    if (productGrid) {
        const observer = new MutationObserver(injectProductButtons);
        observer.observe(productGrid, { childList: true });
    }

    injectProductButtons();
    renderCart();
    renderFavorites();
    bindEvents();
})();
