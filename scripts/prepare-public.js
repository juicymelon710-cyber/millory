const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const publicRoot = path.join(root, "public");

const files = [
  "index.html",
  "robots.txt",
  "sitemap.xml"
];

const directories = [
  "admin",
  "assets",
  "css",
  "js",
  "pages"
];

const dataFiles = [
  "calculator-products.js",
  "products.js"
];

function copyFile(relativePath) {
  const source = path.join(root, relativePath);
  const target = path.join(publicRoot, relativePath);
  if (!fs.existsSync(source)) return;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function copyDirectory(relativePath) {
  const source = path.join(root, relativePath);
  const target = path.join(publicRoot, relativePath);
  if (!fs.existsSync(source)) return;
  fs.cpSync(source, target, { recursive: true });
}

fs.rmSync(publicRoot, { recursive: true, force: true });
fs.mkdirSync(publicRoot, { recursive: true });

files.forEach(copyFile);
directories.forEach(copyDirectory);
dataFiles.forEach((file) => copyFile(path.join("data", file)));

console.log("Prepared public static files.");
