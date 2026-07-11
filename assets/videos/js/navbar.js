const header = document.getElementById("navbar");
const menuButton = document.querySelector(".menu");
const navLinks = document.querySelectorAll(".nav-links a");

function updateHeaderState() {
    if (!header) return;
    header.classList.toggle("scrolled", window.scrollY > 40);
}

window.addEventListener("scroll", updateHeaderState);
updateHeaderState();

if (menuButton && header) {
    menuButton.addEventListener("click", () => {
        const isOpen = header.classList.toggle("nav-open");
        menuButton.setAttribute("aria-expanded", String(isOpen));
    });
}

navLinks.forEach((link) => {
    link.addEventListener("click", () => {
        if (!header || !menuButton) return;
        header.classList.remove("nav-open");
        menuButton.setAttribute("aria-expanded", "false");
    });
});
