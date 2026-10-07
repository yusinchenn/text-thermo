// 真實 Chromium + 真正載入的擴充功能 + 真實 Lexical 編輯器：
// 從「全新安裝」走完 同意 → 設定 → 打字 → 分析 → 取代 → 還原 的整條流程。
// 只有「AI 服務的網路回應」是假的（取代 service worker 的 fetch）；其餘（manifest、權限、圖示、
// service worker、訊息傳遞、chrome.storage、popup、content script、編輯器）都是真的。
const path = require("path");
const fs = require("fs");
const { launch, widget, sleep, tmpDir } = require("./harness");

let failed = 0;
const assert = (c, m) => { if (!c) { failed++; console.error("FAIL:", m); } else console.log("ok  -", m); };
const shots = path.join(tmpDir, "shots");
fs.mkdirSync(shots, { recursive: true });

const gemini = (obj) => ({ json: { candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] }, finishReason: "STOP" }] } });
const ORIGINAL = "你每次都這樣，我真的好失望好難過";
const REWRITE = "我有點失望也有點難過，想跟你好好談談。";
const ANALYSIS = { temperature: 23, emotion: "失望", words: "*你｜每次｜這樣｜*我｜真的｜*好失望｜*好難過", rewrite: REWRITE };

(async () => {
  const app = await launch();
  const { extId } = app;
  console.log("擴充功能已載入，id =", extId);
  assert(/^[a-p]{32}$/.test(extId), "擴充功能成功載入（manifest 有效、service worker 啟動）");
  await app.fakeAi(gemini(ANALYSIS));

  /* ---------- A. 全新安裝：同意前什麼都不送 ---------- */
  console.log("\n=== A. 全新安裝，還沒同意 ===");
  const chat0 = await app.openChat("plain");
  await chat0.click("#editor");
  await chat0.keyboard.type(ORIGINAL, { delay: 20 });
  await sleep(1600);
  const hint = await widget.waitText(chat0, (t) => t.includes("同意並開始使用"));
  assert(!!hint, "未同意：浮動框提示先到設定面板同意");
  assert((await app.aiCalls()).length === 0, "未同意：沒有任何文字被送出（fetch 零次呼叫）");
  await chat0.keyboard.type("啊", { delay: 20 });
  await sleep(1600);
  assert(await widget.waitHidden(chat0), "設定提示只出現一次，之後打字不再跳出");
  await chat0.close();

  /* ---------- B. 設定面板：同意、選服務、填 key、測試 API ---------- */
  console.log("\n=== B. 設定面板 ===");
  const pop = await app.openPopup();
  assert(await pop.locator("#consent").isVisible(), "popup：顯示資料傳送說明");
  assert(await pop.locator("#settings.locked").count() === 1, "popup：同意前設定區鎖住");
  await pop.screenshot({ path: path.join(shots, "popup-consent.png") });
  await pop.click("#agree");
  await pop.waitForSelector("#consent", { state: "hidden" });
  assert(await pop.locator("#provider").inputValue() === "gemini", "popup：預設選 Gemini");
  await pop.fill("#apiKey", "AIza-test-key-123");
  await pop.press("#apiKey", "Tab");
  await pop.click("#test");
  await pop.waitForFunction(() => /✅|❌/.test(document.getElementById("testResult").textContent));
  const t1 = await pop.locator("#testResult").textContent();
  assert(t1.includes("✅") && t1.includes("23℃"), `popup：測試 API 成功（${t1}）`);
  let calls = await app.aiCalls();
  const gc = calls[calls.length - 1];
  assert(gc.url === "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent", "Gemini：請求打到正確的網址與預設模型");
  assert(gc.headers["x-goog-api-key"] === "AIza-test-key-123" && !gc.url.includes("AIza"), "Gemini：key 在標頭，不在網址");
  assert(gc.body.contents[0].parts[0].text.includes("今天終於放假了"), "Gemini：測試句送出");
  await app.setAiReply({ status: 400, json: { error: { status: "INVALID_ARGUMENT", message: "API key not valid. Please pass a valid API key.", details: [{ reason: "API_KEY_INVALID" }] } } });
  await pop.click("#test");
  await pop.waitForFunction(() => document.getElementById("testResult").textContent.includes("❌"));
  const t2 = await pop.locator("#testResult").textContent();
  assert(t2.includes("API key 無效") && t2.includes("BAD_KEY"), `popup：key 無效時顯示白話說明（${t2}）`);
  await app.setAiReply({ status: 429, json: { error: { status: "RESOURCE_EXHAUSTED", message: "quota" } } });
  await pop.click("#test");
  await pop.waitForFunction(() => document.getElementById("testResult").textContent.includes("免費額度"));
  assert(true, "popup：429 顯示免費額度用完的說明");
  await app.setAiReply(gemini(ANALYSIS));
  await pop.click("#test");
  await pop.waitForFunction(() => document.getElementById("testResult").textContent.includes("✅"));
  assert(pop.errors.length === 0, `popup：沒有 JS／CSP 錯誤${pop.errors.length ? "：" + pop.errors.join(" | ") : ""}`);
  await pop.screenshot({ path: path.join(shots, "popup-ready.png") });
  await pop.close();

  /* ---------- C/D. 兩種 Lexical 編輯器：打字 → 分析 → 取代 → 還原 ---------- */
  for (const mode of ["plain", "rich"]) {
    console.log(`\n=== C. Lexical ${mode}-text：完整流程 ===`);
    await app.setAiReply(gemini(ANALYSIS));
    const chat = await app.openChat(mode);
    const lex = () => chat.evaluate(() => window.__lexText);
    const dom = () => chat.evaluate(() => document.getElementById("editor").innerText.trim());
    await chat.click("#editor");
    const before = (await app.aiCalls()).length;
    await chat.keyboard.type(ORIGINAL, { delay: 25 });
    assert((await lex()) === ORIGINAL, `[${mode}] 真實鍵盤輸入後，Lexical 內部狀態 = 輸入的文字`);
    const text = await widget.waitText(chat, (t) => t.includes("23℃"), 8000);
    assert(text.includes("常溫") && text.includes("失望") && text.includes("4/7"), `[${mode}] 浮動框顯示 23℃ 常溫、情緒「失望」、詞數 4/7（${text.replace(/\n/g, " ")}）`);
    assert(text.includes("61"), `[${mode}] 濕度 = 10 + 90×4/7 ≈ 61（由背景程式依詞數計算，不是模型給的）`);
    assert(text.includes("建議語氣") && (await widget.hasButton(chat, "取代")) && !(await widget.hasButton(chat, "複製")), `[${mode}] 建議區有「取代」按鈕，沒有舊的「複製」`);
    calls = await app.aiCalls();
    // 第二輪（rich）的文字與第一輪（plain）完全相同，會直接用快取，所以是 0 次；第一輪一定是 1 次
    assert(mode === "plain" ? calls.length - before === 1 : calls.length - before <= 1, `[${mode}] 停打後只送出 ${calls.length - before} 次分析請求（打字過程中不會每個字都送）`);
    await widget.screenshot(chat, path.join(shots, `widget-${mode}-1.png`));

    // 取代（真的滑鼠點擊）。取代之後新文字的分析結果換成另一組
    await app.setAiReply(gemini({ temperature: 27, emotion: "平和", words: "我｜有點｜失望｜想｜跟｜你｜好好｜談談" }));
    await widget.click(chat, "取代");
    await sleep(500);
    assert((await chat.evaluate(() => document.activeElement && document.activeElement.id)) === "editor", `[${mode}] 點「取代」時輸入框沒有失焦`);
    assert((await lex()) === REWRITE, `[${mode}] 取代後 Lexical 內部狀態 = 建議內容`);
    assert((await dom()) === REWRITE, `[${mode}] 取代後畫面上的文字 = 建議內容`);
    const t3 = await widget.waitText(chat, (t) => t.includes("27℃") && t.includes("還原成原文"), 8000);
    assert(!!t3, `[${mode}] 取代後自動重新分析新文字，並出現「還原成原文」`);
    await widget.screenshot(chat, path.join(shots, `widget-${mode}-2-replaced.png`));

    // 還原
    await widget.click(chat, "還原成原文");
    await sleep(500);
    assert((await lex()) === ORIGINAL && (await dom()) === ORIGINAL, `[${mode}] 還原後文字回到原文（內部狀態與畫面一致）`);
    await chat.keyboard.type("！！", { delay: 25 });
    assert((await lex()) === ORIGINAL + "！！", `[${mode}] 還原後可繼續正常打字`);

    // 快取：回到分析過的同一段文字，不會再打一次 API
    await sleep(1500);
    const n1 = (await app.aiCalls()).length;
    await chat.keyboard.press("Backspace");
    await chat.keyboard.press("Backspace");
    await sleep(2200); // 文字回到 ORIGINAL，這段已分析過
    const n2 = (await app.aiCalls()).length;
    assert(n2 === n1, `[${mode}] 刪回已分析過的文字：直接用快取，沒有多打 API（${n1} → ${n2}）`);

    // Enter 送出 → 隱藏
    await chat.keyboard.press("Enter");
    assert(await widget.waitHidden(chat), `[${mode}] 按 Enter 後浮動框隱藏`);
    const errs = chat.logs.filter((l) => /PAGEERROR|Uncaught/.test(l));
    assert(errs.length === 0, `[${mode}] 網頁沒有 JS 錯誤${errs.length ? "：" + errs.join(" | ") : ""}`);
    await chat.close();
  }

  /* ---------- E. 換成 DeepSeek ---------- */
  console.log("\n=== E. 切換到 DeepSeek ===");
  const pop2 = await app.openPopup();
  await pop2.selectOption("#provider", "deepseek");
  await pop2.fill("#apiKey", "sk-deepseek-test");
  await pop2.press("#apiKey", "Tab");
  await app.setAiReply({ json: { choices: [{ message: { content: JSON.stringify({ temperature: 41, emotion: "生氣", words: "*你｜*我" }) } }] } });
  await pop2.click("#test");
  await pop2.waitForFunction(() => /✅|❌/.test(document.getElementById("testResult").textContent));
  const t4 = await pop2.locator("#testResult").textContent();
  calls = await app.aiCalls();
  const dc = calls[calls.length - 1];
  assert(t4.includes("✅") && t4.includes("41℃"), `DeepSeek：測試成功（${t4}）`);
  assert(dc.url === "https://api.deepseek.com/chat/completions" && dc.headers.Authorization === "Bearer sk-deepseek-test", "DeepSeek：網址與 Bearer 標頭正確");
  assert(!JSON.stringify(dc).includes("AIza-test-key-123"), "DeepSeek：不會帶出 Gemini 的 key");
  await pop2.screenshot({ path: path.join(shots, "popup-deepseek.png") });

  /* ---------- F. 撤回同意 ---------- */
  console.log("\n=== F. 撤回同意 ===");
  await pop2.click("#revoke");
  await pop2.waitForSelector("#consent", { state: "visible" });
  const nBefore = (await app.aiCalls()).length;
  const chat2 = await app.openChat("plain");
  await chat2.click("#editor");
  await chat2.keyboard.type("撤回同意之後打的字", { delay: 20 });
  await sleep(1800);
  assert((await app.aiCalls()).length === nBefore, "撤回同意後：不再送出任何文字");
  await widget.waitText(chat2, (t) => t.includes("同意並開始使用"));
  await chat2.close();
  await pop2.close();

  await app.close();
  console.log(failed ? `\n${failed} 項失敗` : "\n真實瀏覽器端對端測試全部通過");
  console.log("截圖輸出：", shots);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
