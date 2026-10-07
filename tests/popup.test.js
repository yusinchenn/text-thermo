// 用 jsdom 載入真正的 popup.html + shared.js + popup.js，測設定面板的行為
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ext = path.join(__dirname, "../extension");
const manifest = JSON.parse(fs.readFileSync(path.join(ext, "manifest.json"), "utf8"));
const html = fs.readFileSync(path.join(ext, "popup.html"), "utf8").replace(/<script[^>]*><\/script>/g, "");

let failed = 0;
const assert = (c, m) => {
  if (!c) { failed++; console.error("FAIL:", m); process.exitCode = 1; } else console.log("ok  -", m);
};
const tick = () => new Promise((r) => setTimeout(r, 20));

// 每個情境都開一個新的 popup（等於使用者重新點開面板）
function open(initialStore) {
  const dom = new JSDOM(html, { runScripts: "outside-only" });
  const { window } = dom;
  const store = { ...initialStore };
  const sent = [];
  let reply = { data: { temperature: 28, emotion: "開心", humidity: 55, totalWords: 8, emotiveWords: 3, rewrite: "" } };

  window.chrome = {
    runtime: {
      getManifest: () => manifest,
      sendMessage: async (msg) => {
        sent.push({ msg, snapshot: { ...store } });
        return reply;
      },
    },
    storage: {
      local: {
        get: (defaults, cb) => {
          const out = { ...defaults, ...store };
          if (cb) { cb(out); return undefined; }
          return Promise.resolve(out);
        },
        set: (patch, cb) => {
          Object.assign(store, patch);
          if (cb) { cb(); return undefined; }
          return Promise.resolve();
        },
      },
    },
  };
  const ctx = dom.getInternalVMContext();
  vm.runInContext(fs.readFileSync(path.join(ext, "shared.js"), "utf8"), ctx);
  vm.runInContext(fs.readFileSync(path.join(ext, "popup.js"), "utf8"), ctx);

  const $ = (id) => window.document.getElementById(id);
  const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));
  return {
    window, store, sent, $, fire,
    setReply: (r) => (reply = r),
    hidden: (id) => $(id).classList.contains("hidden"),
    locked: () => $("settings").classList.contains("locked"),
  };
}

(async () => {
  // 1. 全新安裝
  let p = open({});
  await tick();
  assert(!p.hidden("consent") && p.locked(), "全新安裝：顯示資料傳送說明，設定區鎖住（未同意前不能用）");
  assert(p.$("provider").value === "gemini", "全新安裝：預設 Gemini");
  assert(p.$("keyLabel").textContent.includes("Google Gemini"), "顯示對應服務的 key 欄位名稱");
  assert(p.$("apiKey").type === "password", "API key 欄位是 password 型態");
  assert(p.$("keyLink").href.startsWith("https://aistudio.google.com/"), "有取得 Gemini key 的連結");
  assert(p.$("keyLink").rel.includes("noopener"), "外部連結帶 noopener");
  assert(p.$("model").placeholder === "gemini-3.5-flash-lite" && p.$("model").value === "gemini-3.5-flash-lite", "預設模型顯示");
  assert(p.$("ver").textContent === `v${manifest.version}`, "顯示 manifest 的版本號");
  assert(p.$("providerPrivacy").textContent.includes("改進產品"), "Gemini 的資料處理說明（免費層會用於改進產品）");
  assert(p.hidden("revoke"), "未同意時不顯示「撤回同意」");
  assert(p.$("consent").textContent.includes("300 字") && p.$("consent").textContent.includes("不經過本擴充功能作者的伺服器"), "同意說明寫明送什麼、送去哪");

  // 2. 同意
  p.$("agree").click();
  await tick();
  assert(p.store.consentVersion === 1, "按「同意並開始使用」→ 寫入 consentVersion");
  assert(p.store.provider === "gemini", "同意時一併記下目前選擇的服務");
  assert(p.hidden("consent") && !p.locked() && !p.hidden("revoke"), "同意後：說明收起、設定解鎖、出現「撤回同意」");

  // 3. 填 key 與模型
  p.$("apiKey").value = "  gk-123  ";
  p.fire(p.$("apiKey"), "change");
  p.$("model").value = "gemini-custom";
  p.fire(p.$("model"), "change");
  await tick();
  assert(p.store.geminiKey === "gk-123" && p.store.gmModel === "gemini-custom", "key（去除空白）與模型存到 Gemini 專屬欄位");
  assert(p.store.deepseekKey === undefined, "沒有碰 DeepSeek 的欄位");
  p.$("model").value = "";
  p.fire(p.$("model"), "change");
  await tick();
  assert(p.store.gmModel === "gemini-3.5-flash-lite", "模型清空 → 存回預設模型");

  // 4. 切換服務，兩邊各自保留
  p.$("provider").value = "deepseek";
  p.fire(p.$("provider"), "change");
  await tick();
  assert(p.store.provider === "deepseek" && p.$("apiKey").value === "" && p.$("keyLabel").textContent.includes("DeepSeek"), "切到 DeepSeek：欄位換成 DeepSeek 的（目前是空的）");
  assert(p.$("model").value === "deepseek-flash" && p.$("keyLink").href.startsWith("https://platform.deepseek.com/"), "DeepSeek 的預設模型與 key 連結");
  assert(p.$("providerPrivacy").textContent.includes("中華人民共和國"), "DeepSeek 的資料處理說明（資料在中國境內伺服器）");
  p.$("apiKey").value = "sk-456";
  p.fire(p.$("apiKey"), "change");
  await tick();
  assert(p.store.deepseekKey === "sk-456" && p.store.geminiKey === "gk-123", "兩個服務的 key 各自保存、互不覆蓋");
  p.$("provider").value = "gemini";
  p.fire(p.$("provider"), "change");
  await tick();
  assert(p.$("apiKey").value === "gk-123", "切回 Gemini：key 還在");

  // 5. 測試 API
  p.$("apiKey").value = "gk-typed-but-not-blurred";
  p.$("test").click();
  await tick();
  const call = p.sent[p.sent.length - 1];
  assert(call.msg.noCache === true && call.msg.rewrite === true && call.msg.type === "analyze", "測試 API 一定帶 noCache，真的打一次 API");
  assert(call.snapshot.geminiKey === "gk-typed-but-not-blurred", "測試前先把輸入框目前的 key 存起來（不必先離開欄位）");
  assert(p.$("testResult").textContent.includes("✅") && p.$("testResult").textContent.includes("28℃"), "測試成功顯示溫度與詞數");
  p.setReply({ error: "HTTP_429", provider: "gemini" });
  p.$("test").click();
  await tick();
  assert(p.$("testResult").textContent.includes("❌") && p.$("testResult").textContent.includes("免費額度") && p.$("testResult").textContent.includes("HTTP_429"), "測試失敗：顯示白話說明與錯誤代碼");
  p.setReply({ error: "NO_KEY", provider: "deepseek" });
  p.$("test").click();
  await tick();
  assert(p.$("testResult").textContent.includes("DeepSeek API key"), "失敗說明以回報的服務為準");

  // 6. 開關與收訊對象
  p.$("enabled").checked = false; p.fire(p.$("enabled"), "change");
  p.$("rewrite").checked = false; p.fire(p.$("rewrite"), "change");
  p.$("target").value = "senior"; p.fire(p.$("target"), "change");
  await tick();
  assert(p.store.enabled === false && p.store.rewrite === false && p.store.target === "senior", "啟用／改寫／收訊對象都會儲存");
  assert(p.$("target").options.length === 6, "六種收訊對象");

  // 7. 撤回同意
  p.$("revoke").click();
  await tick();
  assert(p.store.consentVersion === 0 && !p.hidden("consent") && p.locked(), "撤回同意：consentVersion 歸零、設定鎖住、再次顯示說明");

  // 8. 舊版升級（已有 DeepSeek key、沒有 provider 欄位）
  p = open({ deepseekKey: "sk-old", dsModel: "deepseek-v4-pro", enabled: true });
  await tick();
  assert(p.$("provider").value === "deepseek" && p.$("apiKey").value === "sk-old" && p.$("model").value === "deepseek-v4-pro", "舊版升級：沿用 DeepSeek 與原本的 key、模型");
  assert(!p.hidden("consent") && p.locked(), "舊版升級：也必須重新看過說明並同意");

  // 9. 已同意過的使用者重新打開
  p = open({ consentVersion: 1, provider: "gemini", geminiKey: "gk-x", target: "partner", enabled: false, rewrite: true });
  await tick();
  assert(p.hidden("consent") && !p.locked() && p.$("enabled").checked === false && p.$("rewrite").checked === true && p.$("target").value === "partner", "已同意：直接顯示設定，並還原各開關");

  // 10. 說明版本提高後要重新同意
  p = open({ consentVersion: 0 });
  await tick();
  assert(!p.hidden("consent"), "consentVersion 低於目前版本 → 重新要求同意");

  process.exit(failed ? 1 : 0);
})();
