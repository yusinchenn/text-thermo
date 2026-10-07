// 產生 README 用截圖（docs/screenshots）與 Chrome 線上應用程式商店用圖片（store/）。
// 畫面都是「真的擴充功能」在示範聊天頁上跑出來的；AI 回應是假資料（見 tests/e2e/harness.js）。
// 用法：npm run store-assets   （CHROME_PATH 可指定 Chromium）
const fs = require("fs");
const path = require("path");
const { launch, widget, sleep, root } = require("../tests/e2e/harness");

const shotsDir = path.join(root, "docs/screenshots");
const storeDir = path.join(root, "store");
fs.mkdirSync(shotsDir, { recursive: true });
fs.mkdirSync(storeDir, { recursive: true });

const gemini = (o) => ({ json: { candidates: [{ content: { parts: [{ text: JSON.stringify(o) }] }, finishReason: "STOP" }] } });
const b64 = (f) => fs.readFileSync(f).toString("base64");
const img = (f) => `data:image/png;base64,${b64(f)}`;

const CSS = `
  *{box-sizing:border-box}
  body{margin:0;font-family:system-ui,"Noto Sans CJK TC","Noto Sans TC",sans-serif;color:#0f172a}
  .stage{position:relative;overflow:hidden;background:radial-gradient(1200px 700px at 85% -10%,#fde68a55,transparent 60%),radial-gradient(900px 600px at -10% 110%,#93c5fd66,transparent 60%),#f6f8fc}
  h1{margin:0;font-size:46px;line-height:1.2;letter-spacing:.5px}
  p.sub{margin:14px 0 0;font-size:22px;line-height:1.55;color:#475569}
  .card{background:#fff;border-radius:16px;box-shadow:0 18px 50px rgba(15,23,42,.22);overflow:hidden}
  .card img{display:block;width:100%}
  .pill{display:inline-block;padding:4px 14px;border-radius:999px;background:#0f172a;color:#fff;font-size:16px;margin-bottom:16px}
`;

async function render(browserPage, { w, h, html, out }) {
  await browserPage.setViewportSize({ width: w, height: h });
  await browserPage.setContent(`<style>${CSS}</style><div class="stage" style="width:${w}px;height:${h}px">${html}</div>`);
  await sleep(200);
  await browserPage.screenshot({ path: out, clip: { x: 0, y: 0, width: w, height: h } });
  console.log("寫入", path.relative(root, out));
}

(async () => {
  const app = await launch();
  const tmp = path.join(__dirname, "../tests/e2e/.tmp/assets");
  fs.mkdirSync(tmp, { recursive: true });

  // 先在設定面板同意並填入示範用 key（只存在這次的暫時瀏覽器，AI 回應是假的）
  await app.fakeAi(gemini({ temperature: 23, emotion: "失望", words: "*你｜每次｜這樣", rewrite: "" }));
  const pop = await app.openPopup({ width: 340, height: 600 });
  await pop.screenshot({ path: path.join(tmp, "popup-consent.png") });
  await pop.click("#agree");
  await pop.fill("#apiKey", "demo-key-not-real");
  await pop.press("#apiKey", "Tab");
  await pop.evaluate(() => document.activeElement && document.activeElement.blur());
  await sleep(200);
  await pop.screenshot({ path: path.join(tmp, "popup-ready.png") });
  await pop.close();

  // 單一情境：在 1280×800 的示範頁上輸入文字，等浮動框出現後截整頁
  async function scene({ text, temperature, emotion, words, rewrite, target }, file, { size = { width: 700, height: 500 }, replace = false } = {}) {
    await app.setAiReply(gemini({ temperature, emotion, words, rewrite }));
    const chat = await app.openChat("plain", size);
    await chat.click("#editor");
    await chat.keyboard.type(text, { delay: 8 });
    await widget.waitText(chat, (t) => t.includes(`${temperature}℃`), 8000);
    await sleep(300);
    if (replace) {
      await app.setAiReply(gemini({ temperature: 27, emotion: "平和", words: "我｜*有點｜*失望｜想｜*跟｜*你｜*好好｜談談" }));
      await widget.click(chat, "取代");
      await widget.waitText(chat, (t) => t.includes("27℃") && t.includes("還原成原文"), 8000);
      await sleep(300);
    }
    await chat.screenshot({ path: file });
    await chat.close();
  }

  const ANGRY = { text: "你到底有沒有在聽！！我講了三次了", temperature: 46, emotion: "生氣", words: "*你｜到底｜有沒有｜在聽｜*我｜講｜三次", rewrite: "我已經說過三次了，可以請你再認真聽一下嗎？" };
  await scene(ANGRY, path.join(tmp, "scene-angry.png"));
  await scene(ANGRY, path.join(tmp, "scene-angry-replaced.png"), { replace: true });
  await scene({ text: "這幾天工作辛苦了，你要好好休息喔", temperature: 31, emotion: "關心", words: "這幾天｜工作｜*辛苦了｜*你｜*好好｜休息", rewrite: "" }, path.join(tmp, "scene-warm.png"));

  // 五段溫度的浮動框並排（README 用）
  const bands = [
    ["隨便，不想講了", 5, "冷淡", "*隨便｜*不想｜講"],
    ["好喔", 14, "敷衍", "好"],
    ["明天下午三點開會", 24, "平淡", "明天｜下午｜三點｜開會"],
    ["我很在意你，想知道你還好嗎", 34, "關心", "*我｜*在意｜*你｜想｜知道｜*你｜*還好"],
    ["太棒了吧！！我超開心", 44, "興奮", "太棒｜*我｜*超｜*開心"],
  ];
  const bandFiles = [];
  for (const [text, t, emo, words] of bands) {
    await app.setAiReply(gemini({ temperature: t, emotion: emo, words, rewrite: "" }));
    const chat = await app.openChat("plain", { width: 420, height: 380 });
    await chat.click("#editor");
    await chat.keyboard.type(text, { delay: 8 });
    await widget.waitText(chat, (x) => x.includes(`${t}℃`), 8000);
    const f = path.join(tmp, `band-${t}.png`);
    await widget.screenshot(chat, f);
    bandFiles.push(f);
    await chat.close();
  }
  await app.close();

  // ---------- 組合成成品圖 ----------
  const { chromium } = require("playwright-core");
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ deviceScaleFactor: 1 });
  const pg = await ctx.newPage();

  // README：五段溫度
  await render(pg, {
    w: 760, h: 760,
    out: path.join(shotsDir, "bands.png"),
    html: `<div style="padding:34px 40px"><div class="pill">0～50℃ 五段溫度</div>
      <div style="display:flex;flex-direction:column;gap:14px">${bandFiles.map((f) => `<div class="card" style="width:560px"><img src="${img(f)}"></div>`).join("")}</div></div>`,
  });
  // README：設定面板
  await render(pg, {
    w: 760, h: 700, out: path.join(shotsDir, "popup.png"),
    html: `<div style="display:flex;gap:28px;padding:30px 36px;align-items:flex-start">
      <div class="card" style="width:330px"><img src="${img(path.join(tmp, "popup-consent.png"))}"></div>
      <div class="card" style="width:330px"><img src="${img(path.join(tmp, "popup-ready.png"))}"></div></div>`,
  });
  // README：示範頁
  fs.copyFileSync(path.join(tmp, "scene-angry.png"), path.join(shotsDir, "demo-chat.png"));
  fs.copyFileSync(path.join(tmp, "scene-angry-replaced.png"), path.join(shotsDir, "demo-chat-replaced.png"));

  // 商店截圖 1280×800
  const shot = (n, title, sub, left, rightImg, rightW) =>
    render(pg, {
      w: 1280, h: 800, out: path.join(storeDir, `screenshot-${n}-1280x800.png`),
      html: `<div style="display:flex;height:100%;align-items:center;padding:0 70px;gap:56px">
        <div style="flex:0 0 360px"><div class="pill">${left}</div><h1>${title}</h1><p class="sub">${sub}</p></div>
        <div class="card" style="width:${rightW}px;margin-left:auto"><img src="${img(rightImg)}"></div></div>`,
    });
  await shot(1, "打字停一秒，<br>看見語氣的溫度", "即時顯示溫度（0–50℃）與濕度，一眼知道這句話是冷是熱、是客觀還是帶感情。", "字溫計 TextThermo", path.join(tmp, "scene-angry.png"), 760);
  await shot(2, "換成更適合<br>對方的語氣", "依收訊對象（同事、親人、朋友、對象、前輩、後輩）給出改寫建議，按「取代」直接換掉，也能還原。", "語氣改寫", path.join(tmp, "scene-angry-replaced.png"), 760);
  await render(pg, {
    w: 1280, h: 800, out: path.join(storeDir, "screenshot-3-1280x800.png"),
    html: `<div style="display:flex;height:100%;align-items:center;padding:0 70px;gap:44px">
      <div style="flex:0 0 340px"><div class="pill">隱私優先</div><h1>你的 key，<br>你的資料</h1>
      <p class="sub">使用你自己的 Gemini 或 DeepSeek API key。文字直接從瀏覽器傳給你選的服務，不經過作者的伺服器；第一次使用前會先說明並徵求同意。</p></div>
      <div class="card" style="width:330px;margin-left:auto"><img src="${img(path.join(tmp, "popup-consent.png"))}"></div>
      <div class="card" style="width:330px"><img src="${img(path.join(tmp, "popup-ready.png"))}"></div></div>`,
  });

  // 小型宣傳圖 440×280
  await render(pg, {
    w: 440, h: 280, out: path.join(storeDir, "promo-small-440x280.png"),
    html: `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:14px">
      <img src="${img(path.join(root, "extension/icons/icon128.png"))}" style="width:96px;height:96px">
      <div style="font-size:34px;font-weight:700;letter-spacing:1px">字溫計 TextThermo</div>
      <div style="font-size:17px;color:#475569">打字停一秒，看見語氣的溫度與濕度</div></div>`,
  });
  fs.copyFileSync(path.join(root, "extension/icons/icon128.png"), path.join(storeDir, "icon-128x128.png"));
  await browser.close();
  console.log("完成");
})().catch((e) => { console.error(e); process.exit(1); });
