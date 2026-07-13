const header = document.getElementById("navbar");
const menuButton = document.querySelector(".menu");
const menuCloseButton = document.querySelector(".mobile-menu-close");
const navPanel = document.querySelector(".nav-links");
const navLinks = document.querySelectorAll(".nav-links a");
const languageButtons = document.querySelectorAll("[data-lang-toggle]");
let activeLanguage = "ro";

function updateHeaderState() {
    if (!header) return;
    header.classList.toggle("scrolled", window.scrollY > 40);
}

function closeMenu() {
    if (!header || !menuButton) return;
    header.classList.remove("nav-open");
    menuButton.setAttribute("aria-expanded", "false");
}

function toggleMenu() {
    if (!header || !menuButton) return;
    const isOpen = header.classList.toggle("nav-open");
    menuButton.setAttribute("aria-expanded", String(isOpen));
}

window.addEventListener("scroll", updateHeaderState);
updateHeaderState();

if (menuButton && header) menuButton.addEventListener("click", toggleMenu);
if (menuCloseButton) menuCloseButton.addEventListener("click", closeMenu);

navLinks.forEach((link) => {
    link.addEventListener("click", closeMenu);
});

document.addEventListener("click", (event) => {
    if (!header?.classList.contains("nav-open")) return;
    if (navPanel?.contains(event.target) || menuButton?.contains(event.target)) return;
    closeMenu();
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
});

const ruText = {
    "Strada Ismail, Chisinau": "\u0423\u043b\u0438\u0446\u0430 \u0418\u0437\u043c\u0430\u0438\u043b, \u041a\u0438\u0448\u0438\u043d\u0435\u0432",
    "Telefon pentru comenzi": "\u0422\u0435\u043b\u0435\u0444\u043e\u043d \u0434\u043b\u044f \u0437\u0430\u043a\u0430\u0437\u043e\u0432",
    "Catalog": "\u041a\u0430\u0442\u0430\u043b\u043e\u0433",
    "Proces": "\u041f\u0440\u043e\u0446\u0435\u0441\u0441",
    "Lucrari": "\u0420\u0430\u0431\u043e\u0442\u044b",
    "Configurator": "\u041a\u043e\u043d\u0444\u0438\u0433\u0443\u0440\u0430\u0442\u043e\u0440",
    "Oglinzi cu iluminare LED": "\u0417\u0435\u0440\u043a\u0430\u043b\u0430 \u0441 LED \u043f\u043e\u0434\u0441\u0432\u0435\u0442\u043a\u043e\u0439",
    "Oglinzi in rame": "\u0417\u0435\u0440\u043a\u0430\u043b\u0430 \u0432 \u0440\u0430\u043c\u0430\u0445",
    "Oglinzi simple": "\u041f\u0440\u043e\u0441\u0442\u044b\u0435 \u0437\u0435\u0440\u043a\u0430\u043b\u0430",
    "Oglinzi cu becuri": "\u0417\u0435\u0440\u043a\u0430\u043b\u0430 \u0441 \u043b\u0430\u043c\u043f\u043e\u0447\u043a\u0430\u043c\u0438",
    "Oglinzi in stoc": "\u0417\u0435\u0440\u043a\u0430\u043b\u0430 \u0432 \u043d\u0430\u043b\u0438\u0447\u0438\u0438",
    "Cabine de dus": "\u0414\u0443\u0448\u0435\u0432\u044b\u0435 \u043a\u0430\u0431\u0438\u043d\u044b",
    "Accesorii": "\u0410\u043a\u0441\u0435\u0441\u0441\u0443\u0430\u0440\u044b",
    "# Reducere": "# \u0421\u043a\u0438\u0434\u043a\u0430",
    "Lucrarile noastre": "\u041d\u0430\u0448\u0438 \u0440\u0430\u0431\u043e\u0442\u044b",
    "Despre noi": "\u041e \u043d\u0430\u0441",
    "Blog": "\u0411\u043b\u043e\u0433",
    "Contacte": "\u041a\u043e\u043d\u0442\u0430\u043a\u0442\u044b",
    "Informatie": "\u0418\u043d\u0444\u043e\u0440\u043c\u0430\u0446\u0438\u044f",
    "Cere oferta": "\u0417\u0430\u043f\u0440\u043e\u0441\u0438\u0442\u044c \u0446\u0435\u043d\u0443",
    "Oglinzi premium realizate la comanda": "\u041f\u0440\u0435\u043c\u0438\u0430\u043b\u044c\u043d\u044b\u0435 \u0437\u0435\u0440\u043a\u0430\u043b\u0430 \u043d\u0430 \u0437\u0430\u043a\u0430\u0437",
    "Oglinzi care schimba atmosfera unei incaperi": "\u0417\u0435\u0440\u043a\u0430\u043b\u0430, \u043a\u043e\u0442\u043e\u0440\u044b\u0435 \u043c\u0435\u043d\u044f\u044e\u0442 \u0430\u0442\u043c\u043e\u0441\u0444\u0435\u0440\u0443 \u043a\u043e\u043c\u043d\u0430\u0442\u044b",
    "Millory proiecteaza oglinzi LED, decorative si solutii personalizate pentru interioare moderne, cu finisaje curate si consultanta de la idee pana la montaj.": "Millory \u043f\u0440\u043e\u0435\u043a\u0442\u0438\u0440\u0443\u0435\u0442 LED-\u0437\u0435\u0440\u043a\u0430\u043b\u0430, \u0434\u0435\u043a\u043e\u0440\u0430\u0442\u0438\u0432\u043d\u044b\u0435 \u0437\u0435\u0440\u043a\u0430\u043b\u0430 \u0438 \u0438\u043d\u0434\u0438\u0432\u0438\u0434\u0443\u0430\u043b\u044c\u043d\u044b\u0435 \u0440\u0435\u0448\u0435\u043d\u0438\u044f \u0434\u043b\u044f \u0441\u043e\u0432\u0440\u0435\u043c\u0435\u043d\u043d\u044b\u0445 \u0438\u043d\u0442\u0435\u0440\u044c\u0435\u0440\u043e\u0432.",
    "Vezi catalogul": "\u0421\u043c\u043e\u0442\u0440\u0435\u0442\u044c \u043a\u0430\u0442\u0430\u043b\u043e\u0433",
    "Configureaza oglinda": "\u041d\u0430\u0441\u0442\u0440\u043e\u0438\u0442\u044c \u0437\u0435\u0440\u043a\u0430\u043b\u043e",
    "Noutati": "\u041d\u043e\u0432\u0438\u043d\u043a\u0438",
    "Modele cautate acum": "\u041f\u043e\u043f\u0443\u043b\u044f\u0440\u043d\u044b\u0435 \u043c\u043e\u0434\u0435\u043b\u0438",
    "Catalog Millory": "\u041a\u0430\u0442\u0430\u043b\u043e\u0433 Millory",
    "Produse principale": "\u041e\u0441\u043d\u043e\u0432\u043d\u044b\u0435 \u0442\u043e\u0432\u0430\u0440\u044b",
    "Toate": "\u0412\u0441\u0435",
    "Baie": "\u0412\u0430\u043d\u043d\u0430\u044f",
    "Decor": "\u0414\u0435\u043a\u043e\u0440",
    "Panouri": "\u041f\u0430\u043d\u0435\u043b\u0438",
    "0 produse disponibile momentan": "0 \u0442\u043e\u0432\u0430\u0440\u043e\u0432 \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u043e \u0441\u0435\u0439\u0447\u0430\u0441",
    "Compartimentul este pastrat in meniu, dar produsele pentru aceasta categorie vor fi adaugate ulterior.": "\u0420\u0430\u0437\u0434\u0435\u043b \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d \u0432 \u043c\u0435\u043d\u044e, \u0442\u043e\u0432\u0430\u0440\u044b \u0434\u043b\u044f \u044d\u0442\u043e\u0439 \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u0438 \u0431\u0443\u0434\u0443\u0442 \u0434\u043e\u0431\u0430\u0432\u043b\u0435\u043d\u044b \u043f\u043e\u0437\u0436\u0435.",
    "Marime la comanda": "\u0418\u043d\u0434\u0438\u0432\u0438\u0434\u0443\u0430\u043b\u044c\u043d\u044b\u0439 \u0440\u0430\u0437\u043c\u0435\u0440",
    "Alege dimensiunea": "\u0412\u044b\u0431\u0440\u0430\u0442\u044c \u0440\u0430\u0437\u043c\u0435\u0440",
    "Dimensiune": "\u0420\u0430\u0437\u043c\u0435\u0440",
    "pret la cerere": "\u0446\u0435\u043d\u0430 \u043f\u043e \u0437\u0430\u043f\u0440\u043e\u0441\u0443"
};

const roText = Object.fromEntries(Object.entries(ruText).map(([ro, ru]) => [ru, ro]));

function translateTextNode(node, dictionary) {
    const value = node.nodeValue;
    const trimmed = value.trim();
    if (!trimmed || !dictionary[trimmed]) return;
    node.nodeValue = value.replace(trimmed, dictionary[trimmed]);
}

function translatePage(language) {
    const dictionary = language === "ru" ? ruText : roText;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => translateTextNode(node, dictionary));
    languageButtons.forEach((button) => {
        button.textContent = language === "ru" ? "RO" : "RU";
    });
    document.documentElement.lang = language;
}

languageButtons.forEach((button) => {
    button.addEventListener("click", () => {
        activeLanguage = activeLanguage === "ro" ? "ru" : "ro";
        translatePage(activeLanguage);
    });
});

const translator = new MutationObserver(() => {
    if (activeLanguage === "ru") translatePage("ru");
});

if (document.body) {
    translator.observe(document.body, { childList: true, subtree: true });
}
