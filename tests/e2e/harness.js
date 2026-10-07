// e2e 共用：打包 Lexical 編輯器、啟動載入了「真正擴充功能」的 Chromium、透過 CDP 操作（closed）Shadow DOM 裡的浮動框
const { chromium } = require("playwright-core");
const esbuild = require("esbuild");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.join(__dirname, "../..");
const extDir = path.join(root, "extension");
const tmpDir = path.join(__dirname, ".tmp");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 測試頁：假裝是聊天網站（網址會被路由成 https://www.instagram.com/，好讓 content script 被注入）。
// 這只是一個含有 Lexical 編輯器的示範頁，不是 Instagram 的介面。
const PAGE = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>示範聊天室</title>
<style>
  body{margin:0;font-family:system-ui,"Noto Sans CJK TC","Noto Sans TC",sans-serif;background:#fff;color:#222}
  .top{padding:14px 16px;border-bottom:1px solid #e5e7eb;font-weight:600}
  .chat{height:calc(100vh - 128px);min-height:160px;background:#f3f4f6;padding:16px;display:flex;flex-direction:column;gap:8px}
  .chat,.bar-in{max-width:760px;margin:0 auto;box-sizing:border-box}
  .chat{background:linear-gradient(#f3f4f6,#f3f4f6) center/100% 100% no-repeat}
  .msg{max-width:60%;padding:8px 12px;border-radius:16px;background:#e5e7eb}
  .msg.me{align-self:flex-end;background:#dbeafe}
  .bar{position:fixed;left:0;right:0;bottom:0;padding:12px 16px;border-top:1px solid #ddd;background:#fff}
  #editor{min-height:22px;max-height:120px;overflow:auto;outline:none;border:1px solid #ccc;border-radius:20px;padding:8px 14px;white-space:pre-wrap}
</style></head><body>
<div class="top">示範聊天室（測試頁）</div>
<div class="chat">
  <div class="msg">明天的報告你準備好了嗎？</div>
  <div class="msg me">還沒，這幾天真的太忙了</div>
  <div class="msg">我等你一整天了耶</div>
</div>
<div class="bar"><div class="bar-in"><div id="editor" role="textbox" contenteditable="true" aria-label="訊息"></div></div></div>
<script src="/__test/editor.bundle.js"></script>
</body></html>`;

async function buildEditorBundle() {
  fs.mkdirSync(tmpDir, { recursive: true });
  const out = path.join(tmpDir, "editor.bundle.js");
  await esbuild.build({ entryPoints: [path.join(__dirname, "editor.js")], bundle: true, outfile: out, format: "iife", logLevel: "error" });
  return fs.readFileSync(out, "utf8");
}

// 啟動 Chromium 並載入 extension/。回傳 { context, worker, extId, openChat, openPopup, close }
async function launch() {
  const bundle = await buildEditorBundle();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "textthermo-e2e-"));
  const context = await chromium.launchPersistentContext(userDataDir, {
    // 沒有指定 CHROME_PATH 時用 Playwright 的 "chromium" channel（完整 Chromium 的新版 headless，才能載入擴充功能）
    executablePath: process.env.CHROME_PATH || undefined,
    channel: process.env.CHROME_PATH ? undefined : "chromium",
    headless: true,
    viewport: { width: 420, height: 760 },
    deviceScaleFactor: 2,
    args: ["--no-sandbox", `--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
  });
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 15000 });
  const extId = new URL(worker.url()).host;

  // 聊天網站的網址由我們自己回應，不會真的連到 Instagram
  await context.route("https://www.instagram.com/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/__test/editor.bundle.js") return route.fulfill({ contentType: "text/javascript", body: bundle });
    return route.fulfill({ contentType: "text/html; charset=utf-8", body: PAGE });
  });

  return {
    context, worker, extId,
    async openChat(mode = "plain", size) {
      const page = await context.newPage();
      if (size) await page.setViewportSize(size);
      page.logs = [];
      page.on("console", (m) => page.logs.push(m.text()));
      page.on("pageerror", (e) => page.logs.push("PAGEERROR " + e.message));
      await page.goto(`https://www.instagram.com/direct/?mode=${mode}`);
      await page.waitForFunction(() => !!window.__editor);
      page.cdp = await context.newCDPSession(page);
      return page;
    },
    async openPopup(size = { width: 360, height: 640 }) {
      const page = await context.newPage();
      page.errors = [];
      page.on("pageerror", (e) => page.errors.push(e.message));
      page.on("console", (m) => m.type() === "error" && page.errors.push(m.text()));
      await page.setViewportSize(size);
      await page.goto(`chrome-extension://${extId}/popup.html`);
      return page;
    },
    // 取代 service worker 裡的 fetch：不真的連網，只記錄請求並回傳假的 AI 回應
    // （service worker 的 CSP 不允許 eval，所以回應用資料傳進去，不用函式）
    async fakeAi(reply) {
      await worker.evaluate((r) => {
        self.__calls = [];
        self.__reply = r;
        self.fetch = async (url, opts) => {
          self.__calls.push({ url, headers: opts.headers, body: JSON.parse(opts.body) });
          const rep = self.__reply;
          return { ok: (rep.status || 200) < 300, status: rep.status || 200, json: async () => rep.json };
        };
      }, reply);
    },
    async setAiReply(reply) { await worker.evaluate((r) => { self.__reply = r; }, reply); },
    async aiCalls() { return worker.evaluate(() => self.__calls); },
    async close() { await context.close(); fs.rmSync(userDataDir, { recursive: true, force: true }); },
  };
}

/* ---- 浮動框（closed shadow root）：用 CDP 穿透讀取與操作 ---- */

async function boxObject(page) {
  const { root: doc } = await page.cdp.send("DOM.getDocument", { depth: -1, pierce: true });
  let found = null;
  (function walk(n) {
    if (found || !n) return;
    const a = n.attributes || [];
    const i = a.indexOf("id");
    if (i >= 0 && a[i + 1] === "box" && n.nodeName === "DIV") { found = n; return; }
    for (const c of [...(n.children || []), ...(n.shadowRoots || []), ...(n.contentDocument ? [n.contentDocument] : [])]) walk(c);
  })(doc);
  return found;
}

async function callOnBox(page, fn, args = []) {
  const node = await boxObject(page);
  if (!node) return undefined;
  const { object } = await page.cdp.send("DOM.resolveNode", { backendNodeId: node.backendNodeId });
  const r = await page.cdp.send("Runtime.callFunctionOn", {
    objectId: object.objectId, functionDeclaration: fn, arguments: args.map((value) => ({ value })), returnByValue: true,
  });
  return r.result.value;
}

const widget = {
  // 浮動框目前顯示的文字（沒有浮動框或被隱藏時回傳 null）
  text: (page) => callOnBox(page, `function(){ const h=this.getRootNode().host; if(!h||h.style.display==="none") return null; return this.innerText; }`),
  async waitText(page, pred, timeout = 6000) {
    const t0 = Date.now();
    let last = null;
    while (Date.now() - t0 < timeout) {
      last = await widget.text(page);
      if (last != null && pred(last)) return last;
      await sleep(150);
    }
    throw new Error(`等不到預期的浮動框內容，最後內容：${JSON.stringify(last)}`);
  },
  async waitHidden(page, timeout = 4000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if ((await widget.text(page)) == null) return true;
      await sleep(150);
    }
    return false;
  },
  // 用真的滑鼠點擊按鈕（依按鈕文字），這樣才能驗證「點按鈕不會讓輸入框失焦」
  async click(page, label) {
    const node = await boxObject(page);
    if (!node) throw new Error("找不到浮動框");
    const { object } = await page.cdp.send("DOM.resolveNode", { backendNodeId: node.backendNodeId });
    const r = await page.cdp.send("Runtime.callFunctionOn", {
      objectId: object.objectId,
      functionDeclaration: `function(label){ const b=[...this.querySelectorAll("button")].find(b=>b.textContent.trim()===label); if(!b) return null; const r=b.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; }`,
      arguments: [{ value: label }], returnByValue: true,
    });
    if (!r.result.value) throw new Error(`浮動框裡沒有「${label}」按鈕`);
    await page.mouse.click(r.result.value.x, r.result.value.y);
  },
  hasButton: (page, label) => callOnBox(page, `function(label){ return [...this.querySelectorAll("button")].some(b=>b.textContent.trim()===label); }`, [label]),
  screenshot: async (page, file) => {
    const node = await boxObject(page);
    const { model } = await page.cdp.send("DOM.getBoxModel", { backendNodeId: node.backendNodeId });
    const [x1, y1, , , x3, y3] = model.content;
    await page.screenshot({ path: file, clip: { x: Math.max(0, x1 - 12), y: Math.max(0, y1 - 12), width: x3 - x1 + 24, height: y3 - y1 + 24 } });
  },
};

module.exports = { launch, widget, sleep, root, extDir, tmpDir };
