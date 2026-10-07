// 用 jsdom 模擬聊天室頁面，測 content.js 的 debounce / IME / 顯示 / 取代 / 送出行為
const { JSDOM } = require("jsdom");
const fs = require("fs");
const dir = require("path").join(__dirname, "../extension") + "/";

const dom = new JSDOM(
  `<!doctype html><body>
    <div id="composer" role="textbox" contenteditable="true"></div>
    <div id="composer2" role="textbox" contenteditable="true"></div>
    <textarea id="ta"></textarea>
    <input id="search" type="text">
  </body>`,
  { runScripts: "outside-only", pretendToBeVisual: true }
);
const { window } = dom;

// 捕捉 closed shadow root 以便檢查
let shadowRoot = null;
const origAttach = window.Element.prototype.attachShadow;
window.Element.prototype.attachShadow = function (init) {
  shadowRoot = origAttach.call(this, { ...init, mode: "open" });
  return shadowRoot;
};

// jsdom 沒有版面：補上 rect 與 innerText
window.Element.prototype.getBoundingClientRect = function () {
  return { top: 500, bottom: 540, left: 20, right: 400, width: 380, height: 40 };
};
Object.defineProperty(window.HTMLElement.prototype, "innerText", {
  get() { return this.textContent; },
  set(v) { this.textContent = v; },
});

const calls = [];
const changeListeners = [];
let nextReply = { data: { temperature: 45, emotion: "生氣", humidity: 85, totalWords: 8, emotiveWords: 7, rewrite: "我有點不開心，想跟你談談。" } };
let delay = 0;
window.chrome = {
  storage: {
    local: { get: (d, cb) => cb({ ...d, target: "partner" }) },
    onChanged: { addListener(fn) { changeListeners.push(fn); } },
  },
  runtime: {
    id: "test-id",
    sendMessage: (msg) => {
      calls.push(msg);
      return new Promise((r) => setTimeout(() => r(nextReply), delay));
    },
  },
};
const clip = [];
window.navigator.clipboard = { writeText: async (t) => { clip.push(t); } };

const vm = require("vm");
const vmctx = dom.getInternalVMContext();
vm.runInContext(fs.readFileSync(dir + "shared.js", "utf8"), vmctx);
vm.runInContext(fs.readFileSync(dir + "content.js", "utf8"), vmctx);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (c, m) => { if (!c) { console.error("FAIL:", m); process.exitCode = 1; } else console.log("ok  -", m); };
const composer = window.document.getElementById("composer");
const composer2 = window.document.getElementById("composer2");
const ta = window.document.getElementById("ta");
const type = (el, text) => {
  if (el.tagName === "TEXTAREA") el.value = text;
  else el.textContent = text;
  el.dispatchEvent(new window.InputEvent("input", { bubbles: true }));
};
const host = () => window.document.documentElement.lastElementChild;
const boxText = () => (shadowRoot ? shadowRoot.getElementById("box").textContent : "");
const visible = () => shadowRoot && host().style.display !== "none";
const btn = (label) => [...shadowRoot.querySelectorAll("button")].find((b) => b.textContent === label);

(async () => {
  // 1. 連續打字只在停 1 秒後呼叫一次
  composer.focus();
  type(composer, "你每次");
  await sleep(400);
  type(composer, "你每次都這樣！");
  await sleep(700);
  assert(calls.length === 0, "停打不到 1 秒不呼叫 API");
  await sleep(600);
  assert(calls.length === 1, "停打 1 秒後恰好呼叫一次");
  assert(calls[0].target === "partner" && calls[0].rewrite === true && calls[0].text === "你每次都這樣！", "帶上對象、改寫開關、當前文字");
  await sleep(50);
  assert(visible() && boxText().includes("45℃") && boxText().includes("熱") && boxText().includes("85") && boxText().includes("7/8"), "顯示 45℃・熱・濕度85・詞數 7/8");
  const blks = shadowRoot.querySelectorAll(".blk");
  assert(blks.length === 2 && blks[0].textContent.includes("🌡️") && blks[1].textContent.includes("💧"), "溫度與濕度各一個區塊（🌡️／💧）");
  assert(shadowRoot.querySelectorAll(".track").length === 2, "溫度與濕度都有橫條");
  const tag = shadowRoot.querySelector(".tag");
  assert(tag && tag.textContent === "生氣" && !blks[0].textContent.includes("生氣") && !blks[1].textContent.includes("生氣"), "情緒標籤是獨立區塊");
  assert(boxText().includes("建議語氣（傳給對象）") && boxText().includes("想跟你談談"), "顯示改寫建議與對象");

  // 2. 相同文字不重送
  composer.dispatchEvent(new window.InputEvent("input", { bubbles: true }));
  await sleep(1100);
  assert(calls.length === 1, "文字沒變不重送");

  // 3. 注音選字中不觸發，選字完成才觸發
  calls.length = 0;
  composer.dispatchEvent(new window.CompositionEvent("compositionstart", { bubbles: true }));
  composer.textContent = "我覺得這樣不太好";
  composer.dispatchEvent(new window.InputEvent("input", { bubbles: true, isComposing: true }));
  await sleep(1200);
  assert(calls.length === 0, "IME 組字中不呼叫 API");
  composer.dispatchEvent(new window.CompositionEvent("compositionend", { bubbles: true }));
  await sleep(1100);
  assert(calls.length === 1, "compositionend 後 1 秒呼叫 API");

  // 4. 太短（1 字）不分析且隱藏
  type(composer, "好");
  await sleep(100);
  assert(!visible(), "字數太短時隱藏浮動框");

  // 4b. 2 個字（「你好」）就會觸發
  calls.length = 0;
  nextReply = { data: { temperature: 25, emotion: "親切", humidity: 30, rewrite: "" } };
  type(composer, "你好");
  await sleep(1300);
  assert(calls.length === 1 && calls[0].text === "你好" && visible() && boxText().includes("25℃"), "4b 兩個字「你好」也會分析並顯示");

  // 4c. 編輯器不送 input 事件（只改 DOM）→ 輪詢保險仍會偵測
  calls.length = 0;
  composer.focus();
  await sleep(700);                      // 讓輪詢先鎖定這個輸入框
  composer.textContent = "今天好累喔";     // 不 dispatch input
  await sleep(1900);
  assert(calls.length === 1 && calls[0].text === "今天好累喔", "4c 沒有 input 事件時，輪詢仍會觸發分析");

  // 4d. 溫度五段：區間名稱、℃、溫度計 icon、顏色
  const bands = [[5, "冷"], [15, "涼"], [25, "常溫"], [35, "暖"], [45, "熱"]];
  const colors = [];
  for (const [t, name] of bands) {
    nextReply = { data: { temperature: t, emotion: "測", humidity: 40, totalWords: 2, emotiveWords: 1, rewrite: "" } };
    type(composer, `溫度分段測試${t}`);
    await sleep(1300);
    const tb = shadowRoot.querySelectorAll(".blk")[0];
    assert(tb.textContent.includes(`${t}℃`) && tb.textContent.includes(name) && tb.textContent.includes("🌡️"), `4d ${t}℃ → ${name}`);
    colors.push(tb.querySelector(".fill").style.background);
  }
  assert(new Set(colors).size === 5, "4d 五段的橫條顏色各不相同");
  for (const [t, name] of [[0, "冷"], [9, "冷"], [10, "涼"], [19, "涼"], [20, "常溫"], [29, "常溫"], [30, "暖"], [39, "暖"], [40, "熱"], [50, "熱"]]) {
    nextReply = { data: { temperature: t, emotion: "測", humidity: 40, rewrite: "" } };
    type(composer, `邊界測試${t}`);
    await sleep(1250);
    assert(shadowRoot.querySelectorAll(".blk")[0].textContent.includes(`${t}℃`) && shadowRoot.querySelectorAll(".blk")[0].textContent.endsWith(name), `4e 邊界 ${t}℃ → ${name}`);
  }

  // 5. 一般 <input>（搜尋列）不處理
  calls.length = 0;
  const search = window.document.getElementById("search");
  search.value = "這是搜尋列的文字內容";
  search.dispatchEvent(new window.InputEvent("input", { bubbles: true }));
  await sleep(1200);
  assert(calls.length === 0, "不處理一般 <input>");

  // 6. 過期請求被丟棄：請求回來前又打字
  calls.length = 0;
  delay = 800;
  nextReply = { data: { temperature: 6, emotion: "冷淡", humidity: 15, rewrite: "" } };
  type(composer, "知道了。");
  await sleep(1100); // 已送出請求，尚未回來
  assert(calls.length === 1, "第一次請求已送出");
  type(composer, "知道了。我會處理");
  await sleep(1000); // 舊請求回來，應被丟棄
  assert(!boxText().includes("冷淡"), "舊請求回來的結果被丟棄");
  delay = 0;
  nextReply = { data: { temperature: 27, emotion: "親切", humidity: 40, rewrite: "" } };
  await sleep(1300);
  assert(boxText().includes("27℃") && boxText().includes("親切") && !boxText().includes("建議語氣"), "新結果顯示；rewrite 為空時不顯示建議區");

  // 6b. 請求被丟棄後刪回已顯示的文字：不重送、不卡在 loading
  calls.length = 0;
  delay = 800;
  type(composer, "知道了。我會處理好");
  await sleep(1100); // 請求已送出（尚未回來）
  assert(calls.length === 1, "6b 新文字送出請求");
  type(composer, "知道了。我會處理");     // 刪回已顯示的版本
  await sleep(1500);
  assert(calls.length === 1, "6b 刪回已顯示文字不重送");
  assert(!shadowRoot.getElementById("box").classList.contains("loading") && boxText().includes("親切"), "6b 浮動框回到已顯示結果、沒有卡在 loading");
  delay = 0;

  // 7. 按 Enter 送出 → 隱藏
  composer.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  assert(!visible(), "Enter 送出後隱藏");

  // 8. 錯誤顯示
  calls.length = 0;
  nextReply = { error: "NO_KEY", provider: "gemini" };
  type(composer, "測試錯誤訊息");
  await sleep(1300);
  assert(boxText().includes("Gemini API key"), "NO_KEY 顯示設定提示，並指名目前的服務（Gemini）");
  type(composer, "測試錯誤訊息再多打一些");
  await sleep(1300);
  assert(!visible(), "8b 設定提示只出現一次，之後每次打字不再跳出來");
  changeListeners.forEach((fn) => fn({ geminiKey: { newValue: "gk" } }, "local")); // 使用者在設定面板改了 key
  await sleep(1400);
  assert(visible() && boxText().includes("Gemini API key"), "8c 設定變動後重新分析（仍未設定好時會再提示一次）");
  nextReply = { error: "NO_CONSENT", provider: "deepseek" };
  changeListeners.forEach((fn) => fn({ provider: { newValue: "deepseek" } }, "local"));
  await sleep(1400);
  assert(boxText().includes("同意並開始使用"), "8d NO_CONSENT 提示使用者先同意資料傳送");
  nextReply = { error: "HTTP_429", provider: "gemini" };
  type(composer, "額度用完的測試");
  await sleep(1300);
  assert(boxText().includes("免費額度"), "8e Gemini 429 顯示免費額度說明");
  nextReply = { error: "HTTP_429", provider: "deepseek" };
  type(composer, "額度用完的測試二");
  await sleep(1300);
  assert(boxText().includes("同時請求太多") && !boxText().includes("免費"), "8f DeepSeek 429 顯示不同的說明");

  // 9. 模型輸出不會被當 HTML
  nextReply = { data: { temperature: 25, emotion: "<b>x</b>", humidity: 30, rewrite: "<img src=x onerror=alert(1)>" } };
  type(composer, "測試注入內容");
  await sleep(1300);
  assert(shadowRoot.querySelectorAll("img, b").length === 0 && boxText().includes("<img"), "模型輸出以純文字顯示，不解析 HTML");

  // 10. 輸入框被清空（程式清空，無 input 事件）→ 輪詢後隱藏
  composer.textContent = "";
  await sleep(700);
  assert(!visible(), "輸入框被清空後自動隱藏");

  // 12. 「取代」：建議區的按鈕、execCommand 路徑、重新分析、還原
  const execLog = [];
  window.document.execCommand = (cmd, _ui, val) => {
    execLog.push(cmd);
    if (cmd === "insertText") {
      composer.textContent = val;
      composer.dispatchEvent(new window.InputEvent("input", { bubbles: true }));
      return true;
    }
    return false;
  };
  nextReply = { data: { temperature: 40, emotion: "生氣", humidity: 70, totalWords: 4, emotiveWords: 3, rewrite: "我有點不開心，想跟你談談。" } };
  composer.focus();
  type(composer, "你每次都這樣！！");
  await sleep(1400);
  assert(!!btn("取代") && !btn("複製"), "12 建議區的按鈕是「取代」，不再是「複製」");
  const md = new window.MouseEvent("mousedown", { bubbles: true, cancelable: true });
  btn("取代").dispatchEvent(md);
  assert(md.defaultPrevented, "12 按鈕的 mousedown 會被攔下，輸入框不會失焦");
  nextReply = { data: { temperature: 28, emotion: "平和", humidity: 40, totalWords: 5, emotiveWords: 2, rewrite: "" } };
  calls.length = 0;
  btn("取代").click();
  await sleep(400);
  assert(composer.textContent === "我有點不開心，想跟你談談。" && execLog.includes("insertText"), "12 按「取代」後輸入框文字被換成建議內容");
  await sleep(1300);
  assert(calls.length === 1 && calls[0].text === "我有點不開心，想跟你談談。", "12 取代後會重新分析新的文字");
  assert(boxText().includes("28℃") && !!btn("還原成原文"), "12 重新分析後顯示新分數與「還原成原文」");
  btn("還原成原文").click();
  await sleep(400);
  assert(composer.textContent === "你每次都這樣！！", "12 按「還原成原文」後回到原本的文字");
  await sleep(1300);
  assert(!btn("還原成原文"), "12 還原後不再顯示還原按鈕");

  // 12b. execCommand 沒作用 → 改走模擬貼上
  window.document.execCommand = () => false;
  window.DataTransfer = class { constructor() { this.d = {}; } setData(t, v) { this.d[t] = v; } getData(t) { return this.d[t] || ""; } };
  window.ClipboardEvent = class extends window.Event { constructor(type, init) { super(type, init); this.clipboardData = init && init.clipboardData; } };
  composer.addEventListener("paste", (e) => {
    composer.textContent = e.clipboardData.getData("text/plain");
    composer.dispatchEvent(new window.InputEvent("input", { bubbles: true }));
  });
  nextReply = { data: { temperature: 45, emotion: "生氣", humidity: 80, totalWords: 3, emotiveWords: 3, rewrite: "我現在有點生氣，晚點再聊好嗎。" } };
  type(composer, "我真的很生氣！！");
  await sleep(1400);
  nextReply = { data: { temperature: 22, emotion: "平和", humidity: 30, rewrite: "" } };
  btn("取代").click();
  await sleep(700);
  assert(composer.textContent === "我現在有點生氣，晚點再聊好嗎。", "12b execCommand 失效時，改用模擬貼上仍能取代");

  // 12c. 三種方式都失敗（例如不接受程式寫入的輸入框）→ 退回複製並提示
  clip.length = 0;
  nextReply = { data: { temperature: 45, emotion: "生氣", humidity: 80, totalWords: 3, emotiveWords: 3, rewrite: "這是不會被寫進去的建議。" } };
  composer2.focus();
  type(composer2, "我現在好生氣");
  await sleep(1400);
  btn("取代").click();
  await sleep(800);
  assert(composer2.textContent === "我現在好生氣" && clip[0] === "這是不會被寫進去的建議。" && boxText().includes("已複製"), "12c 全部失敗時：不動輸入框、退回複製並提示手動貼上");

  // 12d. textarea：execCommand、貼上都沒用時，用原生 setter
  nextReply = { data: { temperature: 45, emotion: "生氣", humidity: 80, totalWords: 3, emotiveWords: 3, rewrite: "textarea 的建議內容" } };
  ta.focus();
  type(ta, "我現在好生氣啊");
  await sleep(1400);
  btn("取代").click();
  await sleep(600);
  assert(ta.value === "textarea 的建議內容", "12d textarea 以原生 setter 取代");

  // 11. 擴充功能被重新載入後（舊分頁）：顯示明確提示與重新整理按鈕，之後不再打 API
  calls.length = 0;
  window.chrome.runtime.sendMessage = (msg) => { calls.push(msg); return Promise.reject(new Error("Extension context invalidated.")); };
  composer.focus();
  type(composer, "舊分頁測試文字");
  await sleep(1300);
  assert(boxText().includes("需要重新整理") && !boxText().includes("context invalidated"), "11 舊分頁：顯示友善提示而不是英文原始錯誤");
  assert(!!btn("重新整理頁面"), "11 有「重新整理頁面」按鈕");
  const before = calls.length;
  type(composer, "舊分頁測試文字再多打一些");
  await sleep(1300);
  assert(calls.length === before, "11 失效後不再重複呼叫 API");

  process.exit(process.exitCode || 0);
})();
