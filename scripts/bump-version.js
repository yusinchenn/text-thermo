// 同時更新 extension/manifest.json 與 package.json 的版本號。
// 用法：node scripts/bump-version.js 0.5.0
const fs = require("fs");
const path = require("path");

const v = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(v || "")) {
  console.error("用法：node scripts/bump-version.js <主.次.修>   例如 0.5.0");
  process.exit(1);
}
const root = path.join(__dirname, "..");
for (const f of ["extension/manifest.json", "package.json"]) {
  const p = path.join(root, f);
  const s = fs.readFileSync(p, "utf8");
  const next = s.replace(/("version":\s*")[^"]+(")/, `$1${v}$2`);
  fs.writeFileSync(p, next);
  console.log(`${f} → ${v}`);
}
console.log("\n接著：");
console.log("  1. 在 CHANGELOG.md 加上這個版本的說明");
console.log("  2. npm test && npm run package");
console.log(`  3. git commit -am "chore: release v${v}" && git tag v${v} && git push --follow-tags`);
