// 由 assets/icon.svg 產生 extension/icons 的 PNG（16/32/48/128）與商店用圖示。
// 用法：npm run icons   （需要 Chromium：npx playwright-core install chromium，或設定 CHROME_PATH）
const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

(async () => {
  const svg = fs.readFileSync(path.join(root, "assets/icon.svg"), "utf8");
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  for (const size of [16, 32, 48, 128]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<body style="margin:0;background:transparent">${svg.replace(/width="128" height="128"/, `width="${size}" height="${size}"`)}</body>`
    );
    const out = path.join(root, "extension/icons", `icon${size}.png`);
    await page.screenshot({ path: out, omitBackground: true });
    console.log("寫入", path.relative(root, out));
  }
  await browser.close();
})();
