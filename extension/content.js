(() => {
  const DEBOUNCE_MS = 1000; // 停止打字多久後才分析
  const MIN_CHARS = 2; // 中文短句（「好喔」「知道了」）也有語氣，所以門檻很低
  const MAX_CHARS = 300; // 只送最後這麼多字（模型要逐詞標記，太長會變慢）
  const TICK_MS = 500; // 浮動框定位 / 輸入框清空檢查的頻率
  const POLL_MS = 300; // 輪詢輸入框文字的頻率（保險：有些編輯器不會送出 input 事件）

  const log = (...a) => console.log("[字溫計]", ...a);

  // 溫度 0～50℃，五段：0～9 冷、10～19 涼、20～29 常溫、30～39 暖、40～50 熱
  const TEMP_MAX = 50;
  function tempBand(n) {
    if (n < 10) return "冷";
    if (n < 20) return "涼";
    if (n < 30) return "常溫";
    if (n < 40) return "暖";
    return "熱";
  }

  // 顏色以各段中心點為錨點線性漸變：5 藍 → 15 青 → 25 綠 → 35 琥珀 → 45 紅
  const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
  const TEMP_STOPS = [
    [5, [59, 130, 246]],
    [15, [6, 182, 212]],
    [25, [34, 160, 107]],
    [35, [245, 158, 11]],
    [45, [239, 68, 68]],
  ];
  function tempColor(n) {
    const v = Math.min(TEMP_MAX, Math.max(0, n));
    if (v <= TEMP_STOPS[0][0]) return rgb(TEMP_STOPS[0][1]);
    for (let i = 1; i < TEMP_STOPS.length; i++) {
      const [x1, c1] = TEMP_STOPS[i];
      if (v <= x1) {
        const [x0, c0] = TEMP_STOPS[i - 1];
        const f = (v - x0) / (x1 - x0);
        return rgb(c0.map((a0, k) => Math.round(a0 + (c1[k] - a0) * f)));
      }
    }
    return rgb(TEMP_STOPS[TEMP_STOPS.length - 1][1]);
  }

  let settings = { ...DEFAULT_SETTINGS };
  let activeEl = null;
  let timer = null;
  let tick = null;
  let composing = false;
  let reqId = 0;
  let dead = false; // 擴充功能連線已失效（舊分頁）
  let shownKey = ""; // 目前浮動框顯示結果所對應的「文字＋對象＋改寫開關」
  let pendingKey = ""; // 正在請求中的 key
  let lastReplace = null; // 最近一次「取代」：{ original, replaced }，用來提供還原
  let hintShown = false; // 「請先完成設定」提示每次設定變動後只顯示一次，之後安靜等待，不要每次打字都跳出來

  let host = null;
  let box = null;

  /* ---------- 設定 ---------- */

  // 這些欄位一變（同意、換服務、換 key／模型），就重新分析目前的文字
  const SETUP_KEYS = new Set(["consentVersion", "provider", "deepseekKey", "geminiKey", "dsModel", "gmModel"]);

  function loadSettings() {
    try {
      chrome.storage.local.get(DEFAULT_SETTINGS, (s) => {
        settings = { ...DEFAULT_SETTINGS, ...s };
      });
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return;
        const prev = { ...settings };
        for (const k of Object.keys(changes)) {
          if (k in DEFAULT_SETTINGS) settings[k] = changes[k].newValue;
        }
        if (!settings.enabled) {
          cancelAll();
          return;
        }
        // 這裡只看「哪些欄位變了」，不讀 API key 的內容
        const setupChanged = Object.keys(changes).some((k) => SETUP_KEYS.has(k));
        if (setupChanged) hintShown = false;
        if (
          setupChanged ||
          prev.target !== settings.target ||
          prev.rewrite !== settings.rewrite ||
          !prev.enabled
        ) {
          shownKey = "";
          if (activeEl) schedule();
        }
      });
    } catch (_) {
      /* 擴充功能被重新載入時 chrome.* 會丟錯，忽略 */
    }
  }

  /* ---------- 輸入框 ---------- */

  function toEl(node) {
    if (!node) return null;
    return node instanceof Element ? node : node.parentElement;
  }

  // 只處理 textarea 與 contenteditable（聊天室的輸入框），不處理一般 <input>（例如搜尋列）
  function findEditable(node) {
    const el = toEl(node);
    if (!el) return null;
    return el.closest(
      'textarea, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]'
    );
  }

  function getText(el) {
    if (!el) return "";
    if (el.tagName === "TEXTAREA") return el.value || "";
    return el.innerText || el.textContent || "";
  }

  const squash = (t) => String(t || "").replace(/\s+/g, "");
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function cancelAll() {
    clearTimeout(timer);
    reqId++;
    shownKey = "";
    pendingKey = "";
    hide();
  }

  function keyFor(el) {
    const text = getText(el).trim().slice(-MAX_CHARS);
    return [text, settings.target, settings.rewrite].join("\u0000");
  }

  function schedule() {
    clearTimeout(timer);
    if (dead || !settings.enabled || !activeEl) return;
    if (getText(activeEl).trim().length < MIN_CHARS) {
      cancelAll();
      return;
    }
    const key = keyFor(activeEl);
    if (key === shownKey) {
      // 文字回到已顯示結果的版本：不必重送
      if (box) box.classList.remove("loading");
      return;
    }
    if (key === pendingKey) return; // 同樣內容已在請求中
    if (pendingKey) {
      // 文字又變了：丟棄進行中的舊請求，結果回來也不顯示
      reqId++;
      pendingKey = "";
    }
    timer = setTimeout(run, DEBOUNCE_MS);
  }

  // 輪詢保險：IG、Discord 這類編輯器可能攔截輸入而不送出 input 事件，
  // 所以每 300ms 比對一次目前聚焦輸入框的文字，有變化就當成輸入。
  let watchedEl = null;
  let watchedText = "";

  function poll() {
    if (dead || !settings.enabled || composing) return;
    const el = findEditable(document.activeElement);
    if (!el) return;
    const t = getText(el);
    if (el !== watchedEl) {
      // 剛聚焦到新的輸入框：只記錄現況，不算輸入
      watchedEl = el;
      watchedText = t;
      log("已鎖定輸入框：", el.tagName.toLowerCase());
      return;
    }
    if (t !== watchedText) {
      watchedText = t;
      activeEl = el;
      schedule();
    }
  }
  setInterval(poll, POLL_MS);

  document.addEventListener(
    "input",
    (e) => {
      const el = findEditable(e.target);
      if (!el) return;
      activeEl = el;
      watchedEl = el;
      watchedText = getText(el); // 讓輪詢不要重複觸發
      if (composing || e.isComposing) return; // 注音/拼音選字中，不觸發
      schedule();
    },
    true
  );

  document.addEventListener(
    "compositionstart",
    () => {
      composing = true;
      clearTimeout(timer);
    },
    true
  );

  document.addEventListener(
    "compositionend",
    (e) => {
      composing = false;
      const el = findEditable(e.target) || findEditable(document.activeElement);
      if (el) {
        activeEl = el;
        watchedEl = el;
        watchedText = getText(el);
        schedule();
      }
    },
    true
  );

  // 按 Enter 送出訊息：隱藏浮動框，並放棄進行中的請求
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Enter" && !e.shiftKey && !composing && !e.isComposing && findEditable(e.target)) {
        cancelAll();
      }
    },
    true
  );

  /* ---------- 分析 ---------- */

  async function run() {
    if (!activeEl || !activeEl.isConnected) return;
    if (isStale()) {
      markStale();
      return;
    }
    const text = getText(activeEl).trim().slice(-MAX_CHARS);
    if (text.length < MIN_CHARS) return;

    const key = keyFor(activeEl);
    if (key === shownKey || key === pendingKey) return;
    pendingKey = key;

    const myId = ++reqId;
    let provider; // 失敗時由背景回報，用來顯示對應服務的錯誤說明
    log(`分析中：${text.length} 字，對象 ${settings.target}，改寫 ${settings.rewrite ? "開" : "關"}`);
    showLoading();
    try {
      const res = await chrome.runtime.sendMessage({
        type: "analyze",
        text,
        target: settings.target,
        rewrite: !!settings.rewrite,
      });
      if (myId !== reqId) return; // 已過期（使用者又打字了）
      if (!res || res.error) {
        provider = res && res.provider;
        throw new Error((res && res.error) || "EMPTY");
      }
      shownKey = key;
      pendingKey = "";
      log(`完成：溫度 ${res.data.temperature}、濕度 ${res.data.humidity}`);
      render(res.data);
    } catch (err) {
      const code = String((err && err.message) || err);
      if (/context invalidated/i.test(code)) {
        markStale(); // 擴充功能被重新載入，這個分頁裡的舊腳本已失效
        return;
      }
      if (myId !== reqId) return;
      shownKey = "";
      pendingKey = "";
      log("失敗：", code);
      if (code === "NO_KEY" || code === "NO_CONSENT") {
        // 還沒設定完：提示一次就好，之後不要每次打字都跳出來
        if (hintShown) {
          hide();
          return;
        }
        hintShown = true;
      }
      renderError(describeError(code, provider));
    }
  }

  // 擴充功能被重新載入或更新後，已開著的分頁裡的舊 content script 會失去與擴充功能的連線
  // （錯誤訊息是 "Extension context invalidated."），只能重新整理分頁。
  function isStale() {
    try {
      return !chrome.runtime || !chrome.runtime.id;
    } catch (_) {
      return true;
    }
  }

  function markStale() {
    if (dead) return;
    dead = true;
    clearTimeout(timer);
    reqId++;
    pendingKey = "";
    log("擴充功能剛更新或重新載入，這個分頁需要重新整理（F5）");
    renderError(describeError("STALE"), true);
  }

  /* ---------- 浮動框 UI（Shadow DOM，避免被網頁樣式影響） ---------- */

  function ensureWidget() {
    if (host && host.isConnected) return;
    host = document.createElement("div");
    host.style.cssText = "all:initial;position:fixed;z-index:2147483647;left:0;top:0;";
    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = `
        .box{font:13px/1.45 system-ui,-apple-system,"Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif;
          background:#fff;color:#1f2937;border:1px solid rgba(0,0,0,.12);border-radius:12px;
          box-shadow:0 4px 16px rgba(0,0,0,.18);padding:8px 10px;min-width:170px;max-width:340px;
          transition:opacity .15s}
        .box.loading{opacity:.55}
        @media (prefers-color-scheme: dark){
          .box{background:#1f2125;color:#e5e7eb;border-color:rgba(255,255,255,.16)}
          .sug{border-top-color:rgba(255,255,255,.14)}
          .track{background:rgba(255,255,255,.14)}
        }
        .row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
        .cnt{opacity:.55;font-size:11px}
        .blk{display:flex;align-items:center;gap:5px;font-variant-numeric:tabular-nums;white-space:nowrap}
        .num{font-weight:600;display:inline-block;text-align:right;font-variant-numeric:tabular-nums}
        .tag{border:1px solid rgba(128,128,128,.5);border-radius:999px;padding:1px 9px;font-size:12px;
          white-space:nowrap;background:rgba(128,128,128,.12)}
        .track{width:46px;height:6px;border-radius:3px;background:rgba(0,0,0,.1);overflow:hidden}
        .fill{height:100%;border-radius:3px;background:#0ea5e9}
        .x{margin-left:auto;border:0;background:none;color:inherit;opacity:.5;cursor:pointer;font-size:16px;line-height:1;padding:0 2px}
        .x:hover{opacity:1}
        .sug{margin-top:8px;padding-top:8px;border-top:1px solid rgba(0,0,0,.1)}
        .lab{font-size:11px;opacity:.65;margin-bottom:3px}
        .txt{white-space:pre-wrap;word-break:break-word}
        .btn{margin-top:6px;border:1px solid rgba(128,128,128,.5);background:transparent;color:inherit;
          border-radius:6px;padding:2px 10px;font-size:12px;cursor:pointer}
        .btn:hover{background:rgba(128,128,128,.15)}
        .btn:disabled{opacity:.6;cursor:default}
        .msg{opacity:.85}
    `;
    box = document.createElement("div");
    box.className = "box";
    box.id = "box";
    shadow.append(style, box);
    // 點浮動框（包含按鈕）時不要讓輸入框失焦，「取代」才能直接寫回輸入框；按鈕的 click 仍會觸發
    box.addEventListener("mousedown", (e) => e.preventDefault());
    document.documentElement.appendChild(host);
  }

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text; // 一律用 textContent，模型輸出不會被當成 HTML
    return n;
  }

  function startTick() {
    if (tick) return;
    tick = setInterval(() => {
      if (!activeEl || !activeEl.isConnected || getText(activeEl).trim().length === 0) {
        cancelAll();
        return;
      }
      position();
    }, TICK_MS);
  }

  function position() {
    if (!host || !box || !activeEl || !activeEl.isConnected) return;
    const r = activeEl.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) {
      host.style.visibility = "hidden";
      return;
    }
    host.style.visibility = "visible";
    const bh = box.offsetHeight || 40;
    const bw = box.offsetWidth || 200;
    let top = r.top - bh - 8;
    if (top < 4) top = Math.min(r.bottom + 8, window.innerHeight - bh - 4);
    const left = Math.max(4, Math.min(r.left, window.innerWidth - bw - 4));
    host.style.top = `${Math.round(top)}px`;
    host.style.left = `${Math.round(left)}px`;
  }

  function hide() {
    if (host) host.style.display = "none";
    if (tick) {
      clearInterval(tick);
      tick = null;
    }
  }

  function reveal() {
    ensureWidget();
    host.style.display = "block";
    startTick();
  }

  function showLoading() {
    reveal();
    if (box.childElementCount === 0 || host.dataset.error === "1") {
      box.replaceChildren(el("div", "msg", "分析中…"));
      host.dataset.error = "0";
    }
    box.classList.add("loading");
    position();
  }

  function renderError(message, withReload) {
    reveal();
    box.classList.remove("loading");
    host.dataset.error = "1";
    const row = el("div", "row");
    row.append(el("div", "msg", `⚠️ ${message}`), closeBtn());
    const parts = [row];
    if (withReload) {
      const b = el("button", "btn", "重新整理頁面");
      b.addEventListener("click", () => location.reload());
      parts.push(b);
    }
    box.replaceChildren(...parts);
    position();
  }

  function closeBtn() {
    const b = el("button", "x", "×");
    b.title = "關閉";
    b.addEventListener("click", () => {
      cancelAll();
    });
    return b;
  }

  function bar(pct, color) {
    const track = el("span", "track");
    const fill = el("span", "fill");
    fill.style.display = "block";
    fill.style.width = `${Math.max(4, Math.min(100, Math.round(pct)))}%`;
    fill.style.background = color;
    track.append(fill);
    return track;
  }

  function render(d) {
    reveal();
    host.dataset.error = "0";
    box.classList.remove("loading");

    const band = tempBand(d.temperature);
    const tColor = tempColor(d.temperature);

    // 溫度區塊：🌡️ 23℃ ▬▬▬ 常溫
    const temp = el("span", "blk");
    temp.title = `溫度 ${d.temperature}℃（${band}）`;
    temp.append(
      el("span", null, "🌡️"),
      el("span", "num", `${d.temperature}℃`),
      bar((d.temperature / TEMP_MAX) * 100, tColor),
      el("span", "cnt", band)
    );

    // 濕度區塊：💧 61 ▬▬▬ 4/7（互動／情感詞 ÷ 總詞數，方便檢查模型怎麼數的）
    const humi = el("span", "blk");
    humi.append(
      el("span", null, "💧"),
      el("span", "num", `${d.humidity}`),
      bar(((d.humidity - 10) / 90) * 100, "#0ea5e9")
    );
    if (d.totalWords) {
      humi.append(el("span", "cnt", `${d.emotiveWords}/${d.totalWords}`));
      humi.title = `互動／情感詞 ${d.emotiveWords} 個，共 ${d.totalWords} 個詞`;
    }

    const row = el("div", "row");
    row.append(temp, humi);
    if (d.emotion) {
      // 情緒標籤：獨立區塊，框線顏色跟著溫度
      const tag = el("span", "tag", d.emotion);
      tag.title = "情緒標籤";
      tag.style.borderColor = tColor;
      row.append(tag);
    }
    row.append(closeBtn());
    const parts = [row];

    // 輸入框裡目前就是剛取代的文字：提供還原
    if (lastReplace && activeEl && squash(getText(activeEl)) === squash(lastReplace.replaced)) {
      const ud = el("div", "sug");
      ud.append(el("div", "lab", "已用建議取代輸入框內容"));
      const b = el("button", "btn", "還原成原文");
      b.addEventListener("click", () => undoReplace(b));
      ud.append(b);
      parts.push(ud);
    }

    if (settings.rewrite && d.rewrite) {
      const targetLabel = (TARGETS[settings.target] || TARGETS.friend).label;
      const sug = el("div", "sug");
      sug.append(el("div", "lab", `建議語氣（傳給${targetLabel}）`), el("div", "txt", d.rewrite));
      const btn = el("button", "btn", "取代");
      btn.title = "用這段建議取代輸入框裡的文字";
      btn.addEventListener("click", () => applyRewrite(d.rewrite, btn));
      sug.append(btn);
      parts.push(sug);
    }

    box.replaceChildren(...parts);
    position();
  }

  /* ---------- 取代輸入框內容 ---------- */

  function selectAllIn(target) {
    if (target.tagName === "TEXTAREA") {
      target.select();
      return;
    }
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(target);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  // IG、Discord 這類編輯器（Lexical、Slate…）不能直接改 DOM，否則畫面和編輯器內部狀態會不一致，
  // 要用編輯器認得的輸入方式。依序嘗試三種，每一步都檢查輸入框的文字是不是真的變了：
  //   1. 全選後 execCommand("insertText")：會送出 beforeinput / input，等同使用者打字
  //   2. 全選後模擬貼上事件
  //   3. 一般 textarea：用原生 setter 寫入再送出 input（相容 React 受控元件）
  async function replaceText(target, text) {
    const done = () => squash(getText(target)) === squash(text);

    try {
      target.focus();
      selectAllIn(target);
      document.execCommand("insertText", false, text);
    } catch (_) {}
    await sleep(150);
    if (done()) return true;

    try {
      target.focus();
      selectAllIn(target);
      const dt = new DataTransfer();
      dt.setData("text/plain", text);
      target.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    } catch (_) {}
    await sleep(150);
    if (done()) return true;

    if (target.tagName === "TEXTAREA") {
      try {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
        setter.call(target, text);
        target.dispatchEvent(new Event("input", { bubbles: true }));
      } catch (_) {}
      await sleep(50);
      if (done()) return true;
    }
    return false;
  }

  function afterReplace(target) {
    activeEl = target;
    watchedEl = target;
    watchedText = getText(target); // 讓輪詢不要重複觸發
    if (box) box.classList.add("loading"); // 舊的分數已不適用，等重新分析
    schedule();
  }

  async function applyRewrite(text, btn) {
    const target = activeEl;
    if (!target || !target.isConnected) return;
    const original = getText(target).replace(/\s+$/, "");
    btn.disabled = true;
    btn.textContent = "取代中…";
    const ok = await replaceText(target, text);
    if (ok) {
      lastReplace = { original, replaced: text };
      log("已取代輸入框內容");
      btn.textContent = "已取代";
      afterReplace(target);
      return;
    }
    // 這個輸入框不接受程式寫入：退回複製，請使用者手動貼上
    log("取代失敗，退回複製");
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = "此輸入框不支援取代，已複製，請手動貼上";
    } catch (_) {
      btn.textContent = "取代失敗";
    }
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = "取代";
    }, 2500);
  }

  async function undoReplace(btn) {
    const target = activeEl;
    if (!target || !target.isConnected || !lastReplace) return;
    btn.disabled = true;
    btn.textContent = "還原中…";
    const ok = await replaceText(target, lastReplace.original);
    if (ok) {
      lastReplace = null;
      log("已還原成原文");
      afterReplace(target);
    } else {
      btn.textContent = "還原失敗，請按 Ctrl+Z";
    }
  }

  loadSettings();
  log("content script 已載入", location.hostname);
})();
