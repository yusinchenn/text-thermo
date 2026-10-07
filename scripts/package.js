// 把 extension/ 打包成可上傳 Chrome 線上應用程式商店（或給人手動安裝）的 zip。
// 用法：npm run package   →   dist/text-thermo-v<版本>.zip
// 注意：zip 的根目錄就是 manifest.json（不要多包一層資料夾），而且只包含執行時需要的檔案。
const AdmZip = require("adm-zip");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const extDir = path.join(root, "extension");
const manifest = JSON.parse(fs.readFileSync(path.join(extDir, "manifest.json"), "utf8"));
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

if (manifest.version !== pkg.version) {
  console.error(`版本不一致：manifest.json 是 ${manifest.version}，package.json 是 ${pkg.version}。請先執行 node scripts/bump-version.js <版本>`);
  process.exit(1);
}

function walk(dir, base = "") {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const rel = base ? `${base}/${d.name}` : d.name;
    if (d.name.startsWith(".")) return []; // 不打包隱藏檔（.DS_Store 等）
    return d.isDirectory() ? walk(path.join(dir, d.name), rel) : [rel];
  });
}

const files = walk(extDir).sort();
const zip = new AdmZip();
for (const rel of files) zip.addFile(rel, fs.readFileSync(path.join(extDir, rel)));

fs.mkdirSync(path.join(root, "dist"), { recursive: true });
const out = path.join(root, "dist", `text-thermo-v${manifest.version}.zip`);
zip.writeZip(out);

// 檢查剛寫出的 zip
const check = new AdmZip(out);
const names = check.getEntries().map((e) => e.entryName);
if (!names.includes("manifest.json")) {
  console.error("zip 根目錄沒有 manifest.json");
  process.exit(1);
}
console.log(`已產生 ${path.relative(root, out)}（${(fs.statSync(out).size / 1024).toFixed(1)} KB，${names.length} 個檔案）`);
for (const n of names) console.log("  ", n);
