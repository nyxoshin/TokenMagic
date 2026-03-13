import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const srcHtmlPath = path.join(root, "src", "ui.html");
const srcCssPath = path.join(root, "src", "ui.css");
const srcFontPath = path.join(root, "src", "Proyavlyaisya-VF.ttf");
const distDir = path.join(root, "dist");
const distHtmlPath = path.join(distDir, "ui.html");

const html = fs.readFileSync(srcHtmlPath, "utf8");
const fontBase64 = fs.readFileSync(srcFontPath).toString("base64");
const css = fs
  .readFileSync(srcCssPath, "utf8")
  .replace("__PROYAVLYAISYA_FONT__", `data:font/ttf;base64,${fontBase64}`);

const inlined = html.replace(
  /<link\s+rel="stylesheet"\s+href="ui\.css"\s*\/?>/i,
  `<style>\n${css}\n</style>`
);

fs.mkdirSync(distDir, { recursive: true });
fs.writeFileSync(distHtmlPath, inlined);
