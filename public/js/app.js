(function () {
    const products = window.MILLORY_PRODUCTS || [];
    const calculatorProducts = window.MILLORY_CALCULATOR_PRODUCTS || [];
    const productGrid = document.getElementById("productGrid");
    const featuredTrack = document.getElementById("featuredTrack");
    const featuredPrev = document.querySelector("[data-featured-prev]");
    const featuredNext = document.querySelector("[data-featured-next]");
    const filters = document.querySelectorAll(".filter");
    const menuFilterLinks = document.querySelectorAll("[data-catalog-filter]");
    const revealItems = document.querySelectorAll(".reveal");
    const shapeSelect = document.getElementById("shapeSelect");
    const lightSelect = document.getElementById("lightSelect");
    const widthRange = document.getElementById("widthRange");
    const widthValue = document.getElementById("widthValue");
    const previewMirror = document.getElementById("previewMirror");
    const summaryShape = document.getElementById("summaryShape");
    const summaryLight = document.getElementById("summaryLight");
    const summaryWidth = document.getElementById("summaryWidth");
    const contactForm = document.querySelector(".contact-form");
    const formNote = document.getElementById("formNote");
    const productModal = document.getElementById("productModal");
    const modalImage = document.getElementById("modalImage");
    const modalTitle = document.getElementById("modalTitle");
    const modalDescription = document.getElementById("modalDescription");
    const modalTags = document.getElementById("modalTags");
    const modalFacts = document.getElementById("modalFacts");
    const modalHeight = document.getElementById("modalHeight");
    const modalWidth = document.getElementById("modalWidth");
    const activeSizeLabel = document.getElementById("activeSizeLabel");
    const modalSizes = document.getElementById("modalSizes");
    const modalOptions = document.getElementById("modalOptions");
    const modalTotal = document.getElementById("modalTotal");
    const modalBasePrice = document.getElementById("modalBasePrice");
    const modalOrder = document.getElementById("modalOrder");
    let activeProduct = null;
    let activeSize = null;
    let featuredAutoplay = null;

    const shapeLabels = {
        rect: "Dreptunghiulara",
        round: "Rotunda",
        arch: "Arcuita"
    };

    const lightLabels = {
        warm: "LED cald",
        neutral: "LED neutru",
        cool: "LED rece"
    };

    function cleanDescription(value) {
        return String(value || "")
            .replace(/\s*\{\{\{https?:\/\/\S+?}}}/gi, "")
            .replace(/\s*\{\{\{https?:\/\/\S+/gi, "")
            .replace(/\s+/g, " ")
            .trim();
    }

    function renderProducts(activeFilter) {
        if (!productGrid) return;

        const visibleProducts = activeFilter === "all"
            ? products
            : products.filter((product) => product.category === activeFilter);

        if (!visibleProducts.length) {
            productGrid.innerHTML = `
                <div class="catalog-empty reveal visible">
                    <strong>0 produse disponibile momentan</strong>
                    <p>Compartimentul este pastrat in meniu, dar produsele pentru aceasta categorie vor fi adaugate ulterior.</p>
                </div>
            `;
            return;
        }

        productGrid.innerHTML = sortPricedProducts(visibleProducts).map((product) => `
            <article class="product-card reveal visible" data-category="${product.category}" data-product-id="${product.id}" tabindex="0" role="button" aria-label="Deschide detaliile pentru ${product.title}">
                <div class="product-visual">
                    ${product.image ? `<img src="${product.image}" alt="${product.title}">` : `<div class="product-mirror ${product.shape}" aria-hidden="true"></div>`}
                </div>
                <div class="product-body">
                    <h3>${product.title}</h3>
                    <strong class="product-price">${displayProductPrice(product)}</strong>
                    <div class="product-quick">
                        <span>Dimensiune</span>
                        <strong>${primarySize(product)}</strong>
                    </div>
                    <p>${cardDescription(product)}</p>
                    <div class="product-meta">
                        ${compactTags(product).map((tag) => `<span>${tag}</span>`).join("")}
                    </div>
                </div>
            </article>
        `).join("");

        productGrid.querySelectorAll(".product-card").forEach((card) => {
            card.addEventListener("click", () => openProductModal(card.dataset.productId));
            card.addEventListener("keydown", (event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openProductModal(card.dataset.productId);
                }
            });
        });
    }

    function renderFeaturedProducts() {
        if (!featuredTrack) return;

        const featuredProducts = products
            .filter((product) => product.image)
            .slice(0, 10);

        featuredTrack.innerHTML = featuredProducts.map((product) => `
            <article class="featured-card" data-product-id="${product.id}" tabindex="0" role="button" aria-label="Deschide detaliile pentru ${product.title}">
                <div class="featured-image">
                    <img src="${product.image}" alt="${product.title}">
                    <span>Marime la comanda</span>
                </div>
                <div class="featured-body">
                    <h3>${product.title}</h3>
                    <p>${primarySize(product)}</p>
                    <strong>${displayProductPrice(product)}</strong>
                    <button type="button" class="featured-select">Alege dimensiunea</button>
                </div>
            </article>
        `).join("");

        featuredTrack.querySelectorAll(".featured-card").forEach((card) => {
            const open = () => openProductModal(card.dataset.productId);
            card.addEventListener("click", open);
            card.addEventListener("keydown", (event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    open();
                }
            });
            const button = card.querySelector(".featured-select");
            if (button) {
                button.addEventListener("click", (event) => {
                    event.stopPropagation();
                    open();
                });
            }
        });
    }

    function scrollFeatured(direction) {
        if (!featuredTrack) return;
        const card = featuredTrack.querySelector(".featured-card");
        const distance = card ? card.offsetWidth + 18 : 280;
        featuredTrack.scrollBy({ left: direction * distance, behavior: "smooth" });
    }

    function autoplayFeatured() {
        if (!featuredTrack || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

        const maxScroll = featuredTrack.scrollWidth - featuredTrack.clientWidth;
        if (maxScroll <= 0) return;

        window.clearInterval(featuredAutoplay);
        featuredAutoplay = window.setInterval(() => {
            const max = featuredTrack.scrollWidth - featuredTrack.clientWidth;
            if (featuredTrack.scrollLeft >= max - 4) {
                featuredTrack.scrollTo({ left: 0, behavior: "smooth" });
                return;
            }
            scrollFeatured(1);
        }, 3000);
    }

    function pauseFeaturedAutoplay() {
        window.clearInterval(featuredAutoplay);
        featuredAutoplay = null;
    }

    function resumeFeaturedAutoplay() {
        pauseFeaturedAutoplay();
        autoplayFeatured();
    }

    function cardDescription(product) {
        const fallback = "Oglinda premium la comanda, configurabila dupa dimensiune, lumina si finisaj.";
        const text = cleanDescription(product.description || fallback);
        if (text.length <= 112) return text;

        const shortText = text.slice(0, 112);
        const lastSpace = shortText.lastIndexOf(" ");
        return `${shortText.slice(0, lastSpace > 72 ? lastSpace : 112)}...`;
    }

    function primarySize(product) {
        const size = product.defaultSize || (product.recommendedSizes && product.recommendedSizes[0]);
        if (!size) return "La comanda";
        return formatSizeName(size);
    }

    function formatSizeName(size) {
        if (!size) return "La comanda";
        if (size.width && size.height) return `${size.width} x ${size.height} mm`;

        const name = String(size.name || "La comanda").trim();
        if (!name || name === "La comanda") return "La comanda";
        return `${name.replace(/\s*x\s*/i, " x ")}${/mm$/i.test(name) ? "" : " mm"}`;
    }

    function compactTags(product) {
        const tags = (product.tags || []).filter(Boolean);
        const unique = [...new Set(tags)];
        return unique.slice(0, 3);
    }

    function formatRon(value) {
        if (!Number(value || 0)) return "pret la cerere";
        return `${Math.round(Number(value || 0)).toLocaleString("ro-RO")} LEI`;
    }

    function hasDisplayPrice(product) {
        const calcProduct = calculatorProductFor(product);
        if (calcProduct) {
            const size = calcProduct.smallestSize || calcProduct.defaultSize || calcProduct.recommendedSizes[0];
            return legacyBasePrice(calcProduct, size) > 0;
        }
        return Number(product.priceMdl || 0) > 0;
    }

    function sortPricedProducts(productList) {
        return [...productList].sort((a, b) => {
            const aMissing = hasDisplayPrice(a) ? 0 : 1;
            const bMissing = hasDisplayPrice(b) ? 0 : 1;
            return aMissing - bMissing;
        });
    }

    function displayProductPrice(product) {
        const calcProduct = calculatorProductFor(product);
        if (!calcProduct) return product.priceMdl ? `de la ${formatRon(product.priceMdl)}` : "pret la cerere";
        const size = calcProduct.smallestSize || calcProduct.defaultSize || calcProduct.recommendedSizes[0];
        return `de la ${formatRon(legacyBasePrice(calcProduct, size))}`;
    }

    function calculatorProductFor(product) {
        return calculatorProducts.find((item) => {
            return item.id === product.id || item.slug === product.id || item.name === product.title;
        });
    }

    function metricsFromSize(size) {
        const height = Number(size?.height || 0);
        const width = Number(size?.width || 0);
        return {
            height,
            width,
            area: (height * width) / 1000000,
            perimeter: ((height + width) * 2) / 1000
        };
    }

    function quantityByType(type, metrics) {
        if (type === "ml") return metrics.perimeter;
        if (type === "mm") return metrics.width / 1000;
        if (type === "m2") return metrics.area;
        return 1;
    }

    function legacyCoefficient(product, metrics) {
        const largestSide = Math.max(metrics.height, metrics.width);
        if (product.bigSize && largestSide > product.bigSize) return Number(product.bigCoefficient || 0);
        if (product.mediumSize && largestSide > product.mediumSize) return Number(product.mediumCoefficient || 0);
        return Number(product.smallCoefficient || 0);
    }

    function legacyBasePrice(product, size) {
        if (!product || !size) return 0;
        const metrics = metricsFromSize(size);
        const cost = product.materials.reduce((total, material) => {
            return total + Number(material.priceMdl || 0) * quantityByType(material.type, metrics);
        }, 0);
        return Math.round(cost * (1 + legacyCoefficient(product, metrics)));
    }

    function productSizePrice(product, size) {
        const calcProduct = calculatorProductFor(product);
        if (calcProduct) return legacyBasePrice(calcProduct, size);
        return Number(size?.priceMdl || product.priceMdl || 0);
    }

    function modalProductData(product) {
        return calculatorProductFor(product) || product;
    }

    function modalSizesFor(product) {
        const source = modalProductData(product);
        return [...(source.recommendedSizes || product.recommendedSizes || [])]
            .filter(Boolean)
            .sort((a, b) => Number(a.id || 0) - Number(b.id || 0));
    }

    function modalOptionPrice(item) {
        if (!activeSize) return Number(item.priceMdl || item.priceRon || 0);
        const metrics = metricsFromSize(activeSize);
        return Math.round(Number(item.priceMdl || item.priceRon || 0) * quantityByType(item.type, metrics));
    }

    function getSelectedOptionsTotal() {
        if (!modalOptions) return 0;
        return Array.from(modalOptions.querySelectorAll("input:checked"))
            .reduce((total, input) => total + Number(input.dataset.price || 0), 0);
    }

    function updateModalTotal() {
        if (!activeProduct || !activeSize) return;
        updateModalOptionPrices();
        const total = productSizePrice(activeProduct, activeSize) + getSelectedOptionsTotal();
        modalTotal.textContent = formatRon(total);
        modalBasePrice.textContent = `Baza: ${formatRon(productSizePrice(activeProduct, activeSize))} | optiuni incluse separat`;
        activeSizeLabel.textContent = formatSizeName(activeSize);
    }

    function selectSize(sizeId) {
        if (!activeProduct) return;
        const sizes = modalSizesFor(activeProduct);
        activeSize = sizes.find((size) => String(size.id) === String(sizeId)) || sizes[0] || activeSize;
        if (!activeSize) return;
        modalHeight.value = activeSize.height;
        modalWidth.value = activeSize.width;

        modalSizes.querySelectorAll(".size-option").forEach((item) => {
            item.classList.toggle("active", String(item.dataset.sizeId) === String(activeSize.id));
        });

        updateModalTotal();
    }

    function estimateCustomPrice(product, width, height) {
        const calcProduct = calculatorProductFor(product);
        if (calcProduct) return legacyBasePrice(calcProduct, { width: Number(width), height: Number(height) });
        if (!product.m2PriceMdl) return product.priceMdl;
        const area = (Number(width || 0) * Number(height || 0)) / 1000000;
        return Math.max(product.priceMdl || 0, Math.round(area * product.m2PriceMdl));
    }

    function renderOptions(product) {
        const source = modalProductData(product);
        const optionGroups = source.optionGroups || [];

        if (!optionGroups.length) {
            modalOptions.innerHTML = `
                <div class="option-empty">
                    <strong>Configurare la comanda</strong>
                    <small>Alegem dimensiunea, iluminarea si finisajele impreuna, in functie de spatiu.</small>
                </div>
            `;
            return;
        }

        modalOptions.innerHTML = optionGroups.map((group, groupIndex) => `
            <details class="option-group" ${groupIndex < 4 ? "open" : ""}>
                <summary>${group.name}</summary>
                <div class="option-list">
                    ${group.items.map((item) => `
                        <label class="option-row">
                            <input type="checkbox" data-option-id="${item.id}" data-price="${modalOptionPrice(item)}" value="${item.id}">
                            <span>
                                <strong>${item.name}</strong>
                            </span>
                            <em data-modal-option-price="${item.id}">${formatRon(modalOptionPrice(item))}</em>
                        </label>
                    `).join("")}
                </div>
            </details>
        `).join("");

        modalOptions.querySelectorAll("input").forEach((input) => {
            input.addEventListener("change", updateModalTotal);
        });
    }

    function updateModalOptionPrices() {
        if (!modalOptions || !activeProduct || !activeSize) return;
        const source = modalProductData(activeProduct);
        (source.optionGroups || []).forEach((group) => {
            group.items.forEach((item) => {
                const price = modalOptionPrice(item);
                modalOptions.querySelectorAll(`[data-option-id="${item.id}"]`).forEach((input) => {
                    input.dataset.price = String(price);
                });
                modalOptions.querySelectorAll(`[data-modal-option-price="${item.id}"]`).forEach((target) => {
                    target.textContent = formatRon(price);
                });
            });
        });
    }

    function openProductModal(productId) {
        activeProduct = products.find((product) => String(product.id) === String(productId));
        if (!activeProduct || !productModal) return;
        const source = modalProductData(activeProduct);
        const sizes = modalSizesFor(activeProduct);
        const defaultSize = source.defaultSize || activeProduct.defaultSize;
        const smallestSize = source.smallestSize || activeProduct.smallestSize;
        const biggestSize = source.biggestSize || activeProduct.biggestSize;

        activeSize = sizes[0] || {
            id: "default",
            name: defaultSize ? defaultSize.name : "La comanda",
            width: defaultSize ? defaultSize.width : 800,
            height: defaultSize ? defaultSize.height : 800,
            priceMdl: activeProduct.priceMdl
        };

        modalImage.src = activeProduct.image || "assets/images/millory-showroom-hero.png";
        modalImage.alt = activeProduct.title;
        modalTitle.textContent = activeProduct.title;
        modalDescription.textContent = cleanDescription(activeProduct.description);
        modalTags.innerHTML = activeProduct.tags.map((tag) => `<span>${tag}</span>`).join("");
        modalFacts.innerHTML = [
            defaultSize ? ["Dimensiune standard", defaultSize.name] : null,
            smallestSize ? ["Minim", smallestSize.name] : null,
            biggestSize ? ["Maxim", biggestSize.name] : null,
            activeProduct.filters && activeProduct.filters[0] ? [activeProduct.filters[0].name, activeProduct.filters[0].value] : null,
            activeProduct.filters && activeProduct.filters[1] ? [activeProduct.filters[1].name, activeProduct.filters[1].value] : null
        ].filter(Boolean).map(([label, value]) => `
            <div>
                <span>${label}</span>
                <strong>${value}</strong>
            </div>
        `).join("");
        modalHeight.min = smallestSize ? smallestSize.height : 400;
        modalHeight.max = biggestSize ? biggestSize.height : 3000;
        modalWidth.min = smallestSize ? smallestSize.width : 400;
        modalWidth.max = biggestSize ? biggestSize.width : 3000;

        modalSizes.innerHTML = sizes.map((size) => `
            <button class="size-option" type="button" data-size-id="${size.id}">
                <span>${formatSizeName(size)}</span>
                <strong>${formatRon(productSizePrice(activeProduct, size))}</strong>
            </button>
        `).join("");

        modalSizes.querySelectorAll(".size-option").forEach((button) => {
            button.addEventListener("click", () => selectSize(button.dataset.sizeId));
        });

        renderOptions(activeProduct);
        selectSize(activeSize.id);
        productModal.classList.add("open");
        productModal.setAttribute("aria-hidden", "false");
        document.body.classList.add("product-modal-open");
    }

    function closeProductModal() {
        if (!productModal) return;
        productModal.classList.remove("open");
        productModal.setAttribute("aria-hidden", "true");
        document.body.classList.remove("product-modal-open");
    }

    [modalHeight, modalWidth].forEach((input) => {
        if (!input) return;
        input.addEventListener("input", () => {
            if (!activeProduct) return;
            activeSize = {
                id: "custom",
                name: `${modalWidth.value}x${modalHeight.value}`,
                width: Number(modalWidth.value),
                height: Number(modalHeight.value),
                priceMdl: estimateCustomPrice(activeProduct, modalWidth.value, modalHeight.value)
            };
            modalSizes.querySelectorAll(".size-option").forEach((item) => item.classList.remove("active"));
            updateModalTotal();
        });
    });

    document.querySelectorAll("[data-close-modal]").forEach((button) => {
        button.addEventListener("click", closeProductModal);
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeProductModal();
    });

    if (modalOrder) {
        modalOrder.addEventListener("click", closeProductModal);
    }

    if (featuredPrev) {
        featuredPrev.addEventListener("click", () => {
            scrollFeatured(-1);
            resumeFeaturedAutoplay();
        });
    }

    if (featuredNext) {
        featuredNext.addEventListener("click", () => {
            scrollFeatured(1);
            resumeFeaturedAutoplay();
        });
    }

    if (featuredTrack) {
        featuredTrack.addEventListener("mouseenter", pauseFeaturedAutoplay);
        featuredTrack.addEventListener("mouseleave", resumeFeaturedAutoplay);
        featuredTrack.addEventListener("touchstart", pauseFeaturedAutoplay, { passive: true });
        featuredTrack.addEventListener("touchend", resumeFeaturedAutoplay);
        featuredTrack.addEventListener("focusin", pauseFeaturedAutoplay);
        featuredTrack.addEventListener("focusout", resumeFeaturedAutoplay);
    }

    filters.forEach((button) => {
        button.addEventListener("click", () => {
            filters.forEach((item) => item.classList.remove("active"));
            button.classList.add("active");
            renderProducts(button.dataset.filter);
        });
    });

    menuFilterLinks.forEach((link) => {
        link.addEventListener("click", () => {
            const filter = link.dataset.catalogFilter;
            filters.forEach((item) => item.classList.toggle("active", item.dataset.filter === filter));
            renderProducts(filter);
            document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth" });
        });
    });

    function updateConfigurator() {
        if (!previewMirror) return;

        const shape = shapeSelect.value;
        const light = lightSelect.value;
        const width = widthRange.value;
        const previewWidth = Math.max(150, Math.min(310, Number(width) * 1.55));

        previewMirror.className = `preview-mirror ${shape} ${light}`;
        previewMirror.style.width = `${previewWidth}px`;
        widthValue.textContent = `${width} cm`;
        summaryShape.textContent = shapeLabels[shape];
        summaryLight.textContent = lightLabels[light];
        summaryWidth.textContent = `${width} cm`;
    }

    [shapeSelect, lightSelect, widthRange].forEach((control) => {
        if (control) control.addEventListener("input", updateConfigurator);
    });

    if ("IntersectionObserver" in window) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add("visible");
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: .16 });

        revealItems.forEach((item) => observer.observe(item));
    } else {
        revealItems.forEach((item) => item.classList.add("visible"));
    }

    if (contactForm) {
        contactForm.addEventListener("submit", (event) => {
            event.preventDefault();
            const data = new FormData(contactForm);
            const name = data.get("name") || "Client";
            const message = data.get("message") || "Vreau o oferta pentru o oglinda la comanda.";
            formNote.textContent = `${name}, mesajul este pregatit: "${message}"`;
        });
    }

    renderProducts("all");
    renderFeaturedProducts();
    autoplayFeatured();
    updateConfigurator();
})();
