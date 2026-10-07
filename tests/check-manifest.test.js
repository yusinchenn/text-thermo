// 檢查 manifest 與發布前會被商店審查擋下的常見問題（不需要瀏覽器）
const fs = require("fs");
const path = require("path");

const ext = path.join(__dirname, "../extension");
const root = path.join(__dirname, "..");
const m = JSON.parse(fs.readFileSync(path.join(ext, "manifest.json"), "utf8"));
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

let failed = 0;
const assert = (c, msg) => {
  if (!c) { failed++; console.error("FAIL:", msg); } else console.log("ok  -", msg);
};
const exists = (p) => fs.existsSync(path.join(ext, p));

assert(m.manifest_version === 3, "Manifest V3");
assert(/^\d+(\.\d+){0,3}$/.test(m.version), `版本號格式合法（${m.version}）`);
assert(m.version === pkg.version, "manifest 與 package.json 版本一致");
assert(m.name.length <= 75, "名稱不超過 75 字元");
assert(m.description.length > 0 && m.description.length <= 132, `描述不超過 132 字元（${m.description.length}）`);
assert(JSON.stringify(m.permissions) === JSON.stringify(["storage"]), "只要求 storage 權限");
assert(!("optional_permissions" in m) && !("externally_connectable" in m) && !("web_accessible_resources" in m), "沒有多餘的 optional／externally_connectable／web_accessible_resources");
assert(
  m.host_permissions.every((h) => /^https:\/\/[a-z.]+\/\*$/.test(h) && !h.includes("*://") && !h.includes("<all_urls>")),
  "host_permissions 只有明確的 https 網域，沒有萬用字元"
);
assert(
  JSON.stringify(m.host_permissions.sort()) ===
    JSON.stringify(["https://api.deepseek.com/*", "https://generativelanguage.googleapis.com/*"]),
  "host_permissions 只有兩家 AI 服務"
);
const matches = m.content_scripts.flatMap((c) => c.matches);
assert(matches.every((x) => x.startsWith("https://") && !x.startsWith("https://*/") && x !== "<all_urls>"), "content script 只注入在明確列出的聊天網站");
assert(m.content_scripts.every((c) => c.js.every(exists)), "content script 檔案都存在");
assert(exists(m.background.service_worker), "service worker 檔案存在");
assert(exists(m.action.default_popup), "popup 檔案存在");
for (const size of ["16", "32", "48", "128"]) assert(exists(m.icons[size]), `圖示 ${size}px 存在`);
assert(!("content_security_policy" in m), "沒有放寬 CSP");

// 商店不允許遠端程式碼：不得有 eval、new Function、遠端 script
const files = fs.readdirSync(ext).filter((f) => /\.(js|html)$/.test(f));
for (const f of files) {
  const src = fs.readFileSync(path.join(ext, f), "utf8");
  assert(!/\beval\s*\(|new\s+Function\s*\(/.test(src), `${f}：沒有 eval / new Function`);
  assert(!/<script[^>]+src=["']https?:/i.test(src), `${f}：沒有載入遠端 script`);
  assert(!/\son(click|load|error|change)=/i.test(src), `${f}：沒有行內事件處理器（MV3 CSP 不允許）`);
  assert(!/innerHTML\s*=|insertAdjacentHTML|document\.write/.test(src), `${f}：沒有用 innerHTML 注入內容`);
}
// popup.html 不得有行內 <script>
const popup = fs.readFileSync(path.join(ext, "popup.html"), "utf8");
assert(!/<script(?![^>]*\bsrc=)[^>]*>\s*\S/i.test(popup), "popup.html 沒有行內 script");

// 沒有把 key 寫死在程式裡
const all = files.map((f) => fs.readFileSync(path.join(ext, f), "utf8")).join("\n");
assert(!/AIza[0-9A-Za-z_-]{20,}/.test(all) && !/sk-[0-9a-f]{24,}/i.test(all), "程式碼裡沒有寫死的 API key");

// 圖示是 PNG 且尺寸正確
for (const size of [16, 32, 48, 128]) {
  const buf = fs.readFileSync(path.join(ext, `icons/icon${size}.png`));
  const isPng = buf.slice(0, 8).toString("hex") === "89504e470d0a1a0a";
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  assert(isPng && w === size && h === size, `icon${size}.png 是 ${size}×${size} 的 PNG`);
}

process.exit(failed ? 1 : 0);
