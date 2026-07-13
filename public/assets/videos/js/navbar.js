const header = document.getElementById("navbar");
const menuButton = document.querySelector(".menu");
const menuCloseButton = document.querySelector(".mobile-menu-close");
const navPanel = document.querySelector(".nav-links");
const navLinks = document.querySelectorAll(".nav-links a");

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
