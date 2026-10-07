// 把專案裡的 YOUR_GITHUB_USERNAME 全部換成你的 GitHub 使用者名稱（或組織名稱）。
// 用法：node scripts/set-username.js your-name
const fs = require("fs");
const path = require("path");

const name = process.argv[2];
if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(name || "")) {
  console.error("用法：node scripts/set-username.js <GitHub 使用者名稱>");
  process.exit(1);
}
const root = path.join(__dirname, "..");
const skip = new Set(["node_modules", ".git", "dist", ".tmp"]);
const exts = new Set([".md", ".json", ".yml", ".yaml", ".js", ".html", ".txt"]);
const self = path.join("scripts", "set-username.js");

let changed = 0;
(function walk(dir) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(d.name)) continue;
    const p = path.join(dir, d.name);
    if (d.isDirectory()) { walk(p); continue; }
    if (!exts.has(path.extname(d.name)) || path.relative(root, p) === self) continue;
    const s = fs.readFileSync(p, "utf8");
    if (!s.includes("YOUR_GITHUB_USERNAME")) continue;
    fs.writeFileSync(p, s.replaceAll("YOUR_GITHUB_USERNAME", name));
    console.log("已更新", path.relative(root, p));
    changed++;
  }
})(root);
console.log(changed ? `完成，共 ${changed} 個檔案。` : "沒有找到 YOUR_GITHUB_USERNAME（可能已經換過了）。");
