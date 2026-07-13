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

if (menuButton && header) {
    menuButton.addEventListener("click", toggleMenu);
}

if (menuCloseButton) {
    menuCloseButton.addEventListener("click", closeMenu);
}

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

const ruText = new Map(Object.entries({
    "Strada Ismail, Chisinau": "Улица Измаил, Кишинев",
    "Telefon pentru comenzi": "Телефон для заказов",
    "Catalog": "Каталог",
    "Proces": "Процесс",
    "Lucrari": "Работы",
    "Configurator": "Конфигуратор",
    "Oglinzi cu iluminare LED": "Зеркала с LED подсветкой",
    "Oglinzi in rame": "Зеркала в рамах",
    "Oglinzi simple": "Простые зеркала",
    "Oglinzi cu becuri": "Зеркала с лампочками",
    "Oglinzi in stoc": "Зеркала в наличии",
    "Cabine de dus": "Душевые кабины",
    "Accesorii": "Аксессуары",
    "# Reducere": "# Скидка",
    "Lucrarile noastre": "Наши работы",
    "Despre noi": "О нас",
    "Blog": "Блог",
    "Contacte": "Контакты",
    "Informatie": "Информация",
    "Cere oferta": "Запросить цену",
    "Oglinzi premium realizate la comanda": "Премиальные зеркала на заказ",
    "Oglinzi care schimba atmosfera unei incaperi": "Зеркала, которые меняют атмосферу комнаты",
    "Millory proiecteaza oglinzi LED, decorative si solutii personalizate pentru interioare moderne, cu finisaje curate si consultanta de la idee pana la montaj.": "Millory проектирует LED-зеркала, декоративные зеркала и индивидуальные решения для современных интерьеров.",
    "Vezi catalogul": "Смотреть каталог",
    "Configureaza oglinda": "Настроить зеркало",
    "Noutati": "Новинки",
    "Modele cautate acum": "Популярные модели",
    "Produse anterioare": "Предыдущие товары",
    "Produse urmatoare": "Следующие товары",
    "Catalog Millory": "Каталог Millory",
    "Produse principale": "Основные товары",
    "Toate": "Все",
    "Baie": "Ванная",
    "Decor": "Декор",
    "Panouri": "Панели",
    "0 produse disponibile momentan": "0 товаров доступно сейчас",
    "Compartimentul este pastrat in meniu, dar produsele pentru aceasta categorie vor fi adaugate ulterior.": "Раздел сохранен в меню, товары для этой категории будут добавлены позже.",
    "Marime la comanda": "Индивидуальный размер",
    "Alege dimensiunea": "Выбрать размер",
    "Dimensiune": "Размер",
    "pret la cerere": "цена по запросу"
}));

const roText = new Map(Array.from(ruText, ([ro, ru]) => [ru, ro]));

function translateTextNode(node, dictionary) {
    const value = node.nodeValue;
    const trimmed = value.trim();
    if (!trimmed || !dictionary.has(trimmed)) return;
    node.nodeValue = value.replace(trimmed, dictionary.get(trimmed));
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
