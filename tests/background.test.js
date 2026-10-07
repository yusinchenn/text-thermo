// 在 vm 裡載入 shared.js + background.js，模擬 chrome 與 fetch（DeepSeek 格式）
const vm = require("vm");
const fs = require("fs");
const dir = require("path").join(__dirname, "../extension") + "/";

let listener = null;
let installedListener = null;
let removedKeys = null;
let lastReq = null;
let calls = 0;
let queue = [];
let store = { consentVersion: 1, provider: "deepseek", deepseekKey: "sk-test", dsModel: "deepseek-flash", apiKey: "OLD_GEMINI_KEY", model: "gemini-2.5-flash-lite" };

const ctx = {
  console, JSON, Math, Number, Array, String, Error, Object, Map, RegExp,
  chrome: {
    storage: { local: { get: async (d) => ({ ...d, ...store }), remove: (k) => { removedKeys = k; } } },
    runtime: {
      onMessage: { addListener: (fn) => (listener = fn) },
      onInstalled: { addListener: (fn) => (installedListener = fn) },
    },
  },
  fetch: async (url, opts) => {
    calls++;
    lastReq = { url, opts, body: JSON.parse(opts.body) };
    const r = queue.length > 1 ? queue.shift() : queue[0];
    if (r instanceof Error) throw r;
    return r;
  },
};
ctx.importScripts = (f) => vm.runInContext(fs.readFileSync(dir + f, "utf8"), ctx);
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(dir + "background.js", "utf8"), ctx);

const ask = (msg) => new Promise((resolve) => {
  const ret = listener(msg, {}, resolve);
  if (ret !== true) throw new Error("listener must return true");
});
const raw = (content) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }) });
const ds = (obj) => raw(JSON.stringify(obj));
const reply = (...rs) => { queue = rs; calls = 0; };
const assert = (c, m) => { if (!c) { console.error("FAIL:", m); process.exitCode = 1; } else console.log("ok  -", m); };
// 預設不用快取，讓每個測試都真的走一次請求流程；快取測試另外用 C()
const A = (over = {}) => ask({ type: "analyze", text: "測試文字", target: "partner", rewrite: false, noCache: true, ...over });
const C = (over = {}) => A({ noCache: false, ...over });

(async () => {
  let r, r1, r2;

  // 1. 使用者的兩個例句：「我愛你」濕度要高於「這幾天工作辛苦了…」
  reply(ds({ temperature: 33, emotion: "深情", words: "*我｜*愛｜*你" }));
  r1 = await A({ text: "我愛你" });
  assert(r1.data.humidity === 100 && r1.data.totalWords === 3 && r1.data.emotiveWords === 3, "「我愛你」3/3 → 濕度 100");
  reply(ds({ temperature: 31, emotion: "關心", words: "這幾天｜工作｜*辛苦了｜*你｜*好好｜休息" }));
  r2 = await A({ text: "這幾天工作辛苦了，你要好好休息喔" });
  assert(r2.data.humidity === 55 && r2.data.emotiveWords === 3 && r2.data.totalWords === 6, "辛苦了那句 3/6 → 濕度 55");
  assert(r1.data.humidity > r2.data.humidity, "短但全是互動詞的句子，濕度高於長而稀釋的句子");

  // 2. 請求格式
  assert(lastReq.url === "https://api.deepseek.com/chat/completions", "URL 正確");
  assert(lastReq.opts.headers.Authorization === "Bearer sk-test" && !JSON.stringify(lastReq).includes("OLD_GEMINI_KEY"), "用 deepseekKey，不會送出舊 Gemini key");
  assert(lastReq.body.model === "deepseek-flash", "使用 dsModel");
  assert(lastReq.body.thinking.type === "disabled", "關閉思考模式");
  assert(lastReq.body.response_format.type === "json_object", "JSON 模式");
  assert(lastReq.body.temperature === 0 && lastReq.body.max_tokens >= 800, "temperature 0、max_tokens 足夠");
  const sys = lastReq.body.messages[0].content;
  assert(sys.includes("json") && sys.includes("JSON") && sys.includes('"words"'), "提示詞含 json 字樣與格式範例");
  assert(sys.includes("0～50") && sys.includes("℃") && sys.includes("占比"), "提示詞說明溫度 0～50℃ 與占比規則");
  assert(["冷", "涼", "常溫", "暖", "熱"].every((w) => sys.includes(`（${w}）`)), "提示詞列出冷／涼／常溫／暖／熱五段");
  assert(!sys.includes("0～100"), "提示詞不再出現舊的 0～100");
  assert(lastReq.body.messages[1].content.includes("收訊對象：對象"), "帶入收訊對象");

  // 3. 客觀句 → 濕度 10
  reply(ds({ temperature: 24, emotion: "平淡", words: "明天｜下午｜三點｜開會" }));
  r = await A();
  assert(r.data.humidity === 10 && r.data.emotiveWords === 0, "全客觀 → 濕度 10");

  // 4. rewrite 開關
  reply(ds({ temperature: 45, emotion: "生氣", words: "*你｜每次｜這樣", rewrite: "我有點不開心，想跟你談談。" }));
  r = await A({ rewrite: true });
  assert(r.data.rewrite.includes("談談") && lastReq.body.messages[0].content.includes('"rewrite"'), "rewrite 開：提示詞含 rewrite 欄位且回傳");
  reply(ds({ temperature: 45, emotion: "生氣", words: "*你", rewrite: "不該出現" }));
  r = await A({ rewrite: false });
  assert(r.data.rewrite === "" && !lastReq.body.messages[0].content.includes('"rewrite"'), "rewrite 關：提示詞不含 rewrite、回傳丟棄");

  // 5. 正規化與寬鬆解析
  reply(ds({ temperature: 180, emotion: "超級長的情緒標籤超級長", words: "*a" }));
  r = await A();
  assert(r.data.temperature === 50 && r.data.emotion.length <= 8, "溫度上限 50、標籤截斷");
  reply(ds({ temperature: -5, emotion: "x", words: "*a" }));
  assert((await A()).data.temperature === 0, "溫度下限 0");
  reply(ds({ temperature: "abc", emotion: "x", words: "" }));
  r = await A();
  assert(r.data.temperature === 25 && r.data.humidity === 50 && r.data.totalWords === 0, "壞值 → 溫度 25（常溫）、濕度 50");
  reply(ds({ temperature: 40, emotion: "x", words: ["*我", "愛"] }));
  assert((await A()).data.humidity === 55, "words 給陣列也能算");
  reply(ds({ temperature: 40, emotion: "x", words: "＊我|愛|*你|*" }));
  r = await A();
  assert(r.data.totalWords === 3 && r.data.emotiveWords === 2, "支援全形＊與半形 |，忽略空標記");
  reply(raw("```json\n" + JSON.stringify({ temperature: 40, emotion: "開心", words: "*我｜開心" }) + "\n```"));
  assert((await A()).data.temperature === 40, "能解析被 ``` 包住的 JSON");

  reply(ds({ temperature: 92, emotion: "生氣", words: "*你" }));
  assert((await A()).data.temperature === 50, "模型誤用 0～100 刻度時，夾在 50（不會超出）");

  // 6. 空內容重試
  reply(raw(""), ds({ temperature: 25, emotion: "平和", words: "*你好" }));
  r = await A();
  assert(r.data && r.data.temperature === 25 && calls === 2, "第一次空內容 → 自動重試一次成功");
  reply(raw(""));
  r = await A();
  assert(r.error === "EMPTY" && calls === 2, "連兩次空內容 → EMPTY");

  // 7. 錯誤碼
  const fail = (status) => ({ ok: false, status, json: async () => ({}) });
  reply(fail(402)); assert((await A()).error === "HTTP_402", "402 餘額不足");
  reply(fail(429)); assert((await A()).error === "HTTP_429", "429");
  reply(fail(401)); assert((await A()).error === "HTTP_401", "401");
  reply(raw("not json")); assert((await A()).error === "PARSE", "壞 JSON → PARSE");
  reply(new TypeError("Failed to fetch")); assert((await A()).error === "NETWORK", "斷線 → NETWORK");
  store.deepseekKey = "";
  reply(ds({ temperature: 50, emotion: "x", words: "*a" }));
  r = await A();
  assert(r.error === "NO_KEY" && calls === 0, "沒有 deepseekKey（即使有舊 Gemini key）→ NO_KEY 且不發請求");
  store.deepseekKey = "sk-test";


  /* ===================== v0.4：Gemini / 同意 / 快取 ===================== */

  const gem = (obj, extra = {}) => ({
    ok: true, status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] }, finishReason: "STOP", ...extra }] }),
  });
  const gemRaw = (body) => ({ ok: true, status: 200, json: async () => body });
  const gemErr = (status, error) => ({ ok: false, status, json: async () => ({ error }) });
  const G = (over = {}) => A({ text: "Gemini 測試文字", ...over });
  const GOOD = { temperature: 31, emotion: "關心", words: "這幾天｜*辛苦了｜*你" };

  // 9. 同意閘門：沒按「同意」之前，什麼都不送
  store.consentVersion = 0;
  reply(ds(GOOD));
  r = await A();
  assert(r.error === "NO_CONSENT" && calls === 0, "尚未同意 → NO_CONSENT，而且不發出任何請求");
  assert(r.provider === "deepseek", "錯誤回應帶有目前的服務名稱");
  store.consentVersion = 0.5;
  assert((await A()).error === "NO_CONSENT", "同意版本低於目前版本 → 要求重新同意");
  store.consentVersion = 1;

  // 10. Gemini 請求格式
  store.provider = "gemini"; store.geminiKey = "gk-test"; delete store.gmModel;
  reply(gem(GOOD));
  r = await G({ rewrite: false });
  assert(r.data && r.data.temperature === 31 && r.data.humidity === 70 && r.provider === "gemini", "Gemini：回應解析、濕度計算與 DeepSeek 一致");
  assert(lastReq.url === "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent", "Gemini：預設模型與網址正確");
  assert(lastReq.opts.headers["x-goog-api-key"] === "gk-test" && !lastReq.url.includes("gk-test") && !lastReq.url.includes("key="), "Gemini：API key 放在標頭，不在網址");
  assert(!JSON.stringify(lastReq).includes("sk-test") && !JSON.stringify(lastReq).includes("OLD_GEMINI_KEY"), "Gemini：不會送出 DeepSeek key 或舊版 key");
  assert(lastReq.opts.headers.Authorization === undefined, "Gemini：不帶 Bearer 標頭");
  const gb = lastReq.body;
  assert(gb.generationConfig.responseMimeType === "application/json" && gb.generationConfig.temperature === 0 && gb.generationConfig.maxOutputTokens >= 1200, "Gemini：JSON 模式、temperature 0、足夠的輸出上限");
  assert(gb.systemInstruction.parts[0].text.includes("0～50") && gb.systemInstruction.parts[0].text.includes('"words"'), "Gemini：系統提示與 DeepSeek 相同（溫度 0～50、words）");
  assert(gb.contents[0].role === "user" && gb.contents[0].parts[0].text.includes("Gemini 測試文字"), "Gemini：使用者訊息放在 contents");
  assert(gb.thinking === undefined && gb.messages === undefined, "Gemini：不含 DeepSeek 專用欄位");

  store.gmModel = "models/gemini-custom-1";
  reply(gem(GOOD));
  await G({ text: "另一段文字" });
  assert(lastReq.url.endsWith("/models/gemini-custom-1:generateContent"), "Gemini：自訂模型名稱可帶 models/ 前綴");
  store.gmModel = "../evil?x=1";
  reply(gem(GOOD));
  r = await G({ text: "第三段文字" });
  assert(r.error === "BAD_MODEL" && calls === 0, "Gemini：不安全的模型名稱 → BAD_MODEL，不發請求");
  store.gmModel = "";

  // 思考過程的 part 要排除；多個 part 要接起來
  reply(gemRaw({ candidates: [{ content: { parts: [{ thought: true, text: "思考中…" }, { text: '{"temperature": 12, ' }, { text: '"emotion": "敷衍", "words": "好喔"}' }] } }] }));
  r = await G({ text: "多 part 回應" });
  assert(r.data && r.data.temperature === 12 && r.data.emotion === "敷衍", "Gemini：略過 thought、串接多個 part");

  // 11. Gemini 錯誤
  reply(gemErr(400, { status: "INVALID_ARGUMENT", message: "API key not valid. Please pass a valid API key.", details: [{ reason: "API_KEY_INVALID" }] }));
  r = await G({ text: "e1" });
  assert(r.error === "BAD_KEY" && r.provider === "gemini", "Gemini：400 + API_KEY_INVALID → BAD_KEY");
  reply(gemErr(400, { status: "FAILED_PRECONDITION", message: "User location is not supported" }));
  assert((await G({ text: "e2" })).error === "REGION", "Gemini：FAILED_PRECONDITION → REGION");
  reply(gemErr(429, { status: "RESOURCE_EXHAUSTED", message: "quota" }));
  assert((await G({ text: "e3" })).error === "HTTP_429", "Gemini：429 → HTTP_429（額度用完）");
  reply(gemErr(403, { status: "PERMISSION_DENIED", message: "denied" }));
  assert((await G({ text: "e4" })).error === "HTTP_403", "Gemini：403 → HTTP_403");
  reply(gemErr(404, { status: "NOT_FOUND", message: "model not found" }));
  assert((await G({ text: "e5" })).error === "HTTP_404", "Gemini：404 → HTTP_404（模型名稱錯）");
  reply({ ok: false, status: 503, json: async () => { throw new Error("not json"); } });
  assert((await G({ text: "e6" })).error === "HTTP_503", "Gemini：錯誤內容不是 JSON 也能處理");
  reply(gemRaw({ promptFeedback: { blockReason: "SAFETY" } }));
  r = await G({ text: "e7" });
  assert(r.error === "BLOCKED" && calls === 1, "Gemini：被安全設定擋下 → BLOCKED，不重試");
  reply(gemRaw({ candidates: [{ finishReason: "SAFETY" }] }));
  assert((await G({ text: "e8" })).error === "BLOCKED", "Gemini：finishReason SAFETY → BLOCKED");
  reply(gemRaw({ candidates: [{ content: { parts: [{ text: "" }] }, finishReason: "MAX_TOKENS" }] }));
  r = await G({ text: "e9" });
  assert(r.error === "EMPTY" && calls === 2, "Gemini：空內容會重試一次，仍空 → EMPTY");
  reply(new TypeError("Failed to fetch"));
  assert((await G({ text: "e10" })).error === "NETWORK", "Gemini：斷線 → NETWORK");
  store.geminiKey = "";
  reply(gem(GOOD));
  r = await G({ text: "e11" });
  assert(r.error === "NO_KEY" && calls === 0 && r.provider === "gemini", "Gemini：沒有 geminiKey（即使有 deepseekKey）→ NO_KEY，不發請求");
  store.geminiKey = "gk-test";

  // 12. 快取
  reply(gem(GOOD));
  await C({ text: "快取測試", target: "friend" });
  assert(calls === 1, "快取：第一次呼叫 API");
  r = await C({ text: "快取測試", target: "friend" });
  assert(calls === 1 && r.data.temperature === 31, "快取：同樣的文字與設定不再呼叫 API");
  await C({ text: "快取測試", target: "partner" });
  assert(calls === 2, "快取：換收訊對象 → 重新分析");
  await C({ text: "快取測試", target: "friend", rewrite: true });
  assert(calls === 3, "快取：改寫開關不同 → 重新分析");
  await C({ text: "快取測試", target: "friend", noCache: true });
  assert(calls === 4, "快取：noCache（測試 API 按鈕）一定真的呼叫");
  store.gmModel = "gemini-other";
  await C({ text: "快取測試", target: "friend" });
  assert(calls === 5, "快取：換模型 → 重新分析");
  store.gmModel = "";
  store.provider = "deepseek";
  reply(ds(GOOD));
  await C({ text: "快取測試", target: "friend" });
  assert(calls === 1, "快取：換服務 → 重新分析（不會拿到別家的結果）");
  store.provider = "gemini";
  reply(gemErr(500, { message: "oops" }));
  await C({ text: "錯誤不快取" });
  reply(gem(GOOD));
  r = await C({ text: "錯誤不快取" });
  assert(calls === 1 && r.data, "快取：失敗的結果不會被快取，下次會重試");
  reply(gem(GOOD));
  for (let i = 0; i < 101; i++) await C({ text: `LRU-${i}` });
  assert(calls === 101, "快取：寫入 101 筆");
  await C({ text: "LRU-100" });
  assert(calls === 101, "快取：最近的仍在快取內");
  await C({ text: "LRU-0" });
  assert(calls === 102, "快取：超過上限後最舊的被淘汰");

  // 13. 服務選擇與錯誤說明（shared.js）
  const run = (code) => vm.runInContext(code, ctx);
  assert(run('resolveProvider({provider:"deepseek"})') === "deepseek", "resolveProvider：明確選擇優先");
  assert(run('resolveProvider({})') === "gemini", "resolveProvider：全新安裝預設 Gemini");
  assert(run('resolveProvider({deepseekKey:"sk"})') === "deepseek", "resolveProvider：舊版升級（已有 DeepSeek key）沿用 DeepSeek");
  assert(run('resolveProvider({provider:"nope",deepseekKey:""})') === "gemini", "resolveProvider：未知值退回預設");
  assert(run('describeError("HTTP_429","gemini")').includes("免費額度"), "describeError：Gemini 的 429 說明免費額度");
  assert(!run('describeError("HTTP_429","deepseek")').includes("免費"), "describeError：DeepSeek 的 429 不提免費額度");
  assert(run('describeError("NO_KEY","gemini")').includes("Gemini") && run('describeError("NO_KEY","deepseek")').includes("DeepSeek"), "describeError：NO_KEY 指名對應服務");
  assert(run('describeError("WEIRD")').includes("WEIRD"), "describeError：未知代碼仍顯示代碼");
  const codes = ["NO_CONSENT","NO_KEY","BAD_KEY","HTTP_400","HTTP_401","HTTP_402","HTTP_403","HTTP_404","HTTP_422","HTTP_429","HTTP_500","HTTP_503","REGION","BLOCKED","BAD_MODEL","NETWORK","STALE","PARSE","EMPTY"];
  assert(codes.every((c) => !run(`describeError("${c}","gemini")`).startsWith("分析失敗")), "describeError：所有已知代碼都有專屬說明");
  assert(run("PROVIDERS.gemini.defaultModel") === "gemini-3.5-flash-lite" && run("PROVIDERS.deepseek.defaultModel") === "deepseek-flash", "預設模型");

  // 8. 更新時清除舊欄位
  installedListener({ reason: "update" });
  assert(Array.isArray(removedKeys) && removedKeys.includes("apiKey") && removedKeys.includes("model"), "onInstalled 清掉舊版 Gemini key 與模型名稱");
})();
