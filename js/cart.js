(function () {
    const STORAGE_KEY = "millory:cart";
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
    const productGrid = document.getElementById("productGrid");
    let checkoutChannel = "whatsapp";

    let cart = readCart();

    function readCart() {
        try {
            const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    function saveCart() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
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
            priceMdl: Number(size.priceMdl || product.priceMdl || (product.priceRon ? product.priceRon * 4 : 0)),
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

    function addToCart(productId, button) {
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
                quantity: 1,
            });
        }

        saveCart();
        renderCart();
        pulseCartButton();
        markAdded(button);
    }

    function markAdded(button) {
        if (!button) return;
        const previous = button.innerHTML;
        button.classList.add("is-added");
        button.innerHTML = "<span>✓</span> Adaugat";
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

    function injectProductButtons() {
        document.querySelectorAll(".product-card[data-product-id]").forEach((card) => {
            if (card.querySelector(".cart-card-button")) return;
            const body = card.querySelector(".product-body");
            if (!body) return;

            const button = document.createElement("button");
            button.className = "cart-card-button";
            button.type = "button";
            button.innerHTML = "<span aria-hidden=\"true\">🛒</span> Adauga in cos";
            button.addEventListener("click", (event) => {
                event.stopPropagation();
                addToCart(card.dataset.productId, button);
            });
            body.appendChild(button);
        });
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
                                <button type="button" data-cart-minus aria-label="Scade cantitatea">−</button>
                                <strong>${item.quantity}</strong>
                                <button type="button" data-cart-plus aria-label="Creste cantitatea">+</button>
                            </div>
                            <button class="cart-remove" type="button" data-cart-remove aria-label="Sterge produsul">×</button>
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

    function updateQuantity(key, delta) {
        const item = cart.find((entry) => entry.key === key);
        if (!item) return;
        item.quantity += delta;
        if (item.quantity <= 0) {
            cart = cart.filter((entry) => entry.key !== key);
        }
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
                `  Subtotal: ${formatMdl(Number(item.priceMdl || 0) * item.quantity)}`,
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
            `Observatii: ${notes || "-"}`,
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
                // Viber does not reliably support prefilling a direct chat message from browsers.
            }
        }

        window.location.href = `viber://chat?number=${encodeURIComponent(STORE_PHONE_INTERNATIONAL)}`;
    }

    function bindEvents() {
        document.querySelectorAll("[data-cart-open]").forEach((button) => {
            button.addEventListener("click", openCart);
        });
        document.querySelectorAll("[data-cart-close]").forEach((button) => {
            button.addEventListener("click", closeCart);
        });
        document.querySelectorAll("[data-checkout-open]").forEach((button) => {
            button.addEventListener("click", openCheckout);
        });
        document.querySelectorAll("[data-checkout-close]").forEach((button) => {
            button.addEventListener("click", closeCheckout);
        });

        if (itemsRoot) {
            itemsRoot.addEventListener("click", (event) => {
                const item = event.target.closest(".cart-item");
                if (!item) return;
                if (event.target.closest("[data-cart-plus]")) updateQuantity(item.dataset.cartKey, 1);
                if (event.target.closest("[data-cart-minus]")) updateQuantity(item.dataset.cartKey, -1);
                if (event.target.closest("[data-cart-remove]")) removeItem(item.dataset.cartKey);
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
            }
        });
    }

    if (productGrid) {
        const observer = new MutationObserver(injectProductButtons);
        observer.observe(productGrid, { childList: true });
    }

    injectProductButtons();
    renderCart();
    bindEvents();
})();
