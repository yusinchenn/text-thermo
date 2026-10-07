const $ = (id) => document.getElementById(id);
const statusEl = $("status");
let statusTimer = null;

// 目前載入的設定（只在這個 popup 裡）
let state = { provider: "gemini", consentVersion: 0 };

function flash(msg) {
  statusEl.textContent = msg;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => (statusEl.textContent = ""), 1200);
}

function save(patch) {
  return new Promise((resolve) =>
    chrome.storage.local.set(patch, () => {
      flash("已儲存");
      resolve();
    })
  );
}

const consented = () => Number(state.consentVersion) >= CONSENT_VERSION;

// 依目前狀態更新畫面：同意區塊、設定區塊是否鎖住、目前服務的欄位
function paint() {
  const p = PROVIDERS[state.provider];
  $("consent").classList.toggle("hidden", consented());
  $("settings").classList.toggle("locked", !consented());
  $("revoke").classList.toggle("hidden", !consented());

  $("provider").value = state.provider;
  $("keyLabel").textContent = `${p.label} API key`;
  $("apiKey").value = state[p.keyField] || "";
  $("model").value = state[p.modelField] || p.defaultModel;
  $("model").placeholder = p.defaultModel;
  $("keyLink").href = p.keyUrl;
  $("keyHint").textContent = p.keyHint;
  $("providerPrivacy").textContent = `這個服務怎麼處理資料：${p.privacy}`;
  $("testResult").textContent = "";
}

for (const [key, t] of Object.entries(TARGETS)) {
  const opt = document.createElement("option");
  opt.value = key;
  opt.textContent = t.label;
  $("target").appendChild(opt);
}
for (const [key, p] of Object.entries(PROVIDERS)) {
  const opt = document.createElement("option");
  opt.value = key;
  opt.textContent = p.label;
  $("provider").appendChild(opt);
}

$("ver").textContent = `v${chrome.runtime.getManifest().version}`;

chrome.storage.local.get(
  {
    ...DEFAULT_SETTINGS,
    provider: "",
    deepseekKey: "",
    dsModel: "",
    geminiKey: "",
    gmModel: "",
  },
  (s) => {
    state = { ...s, provider: resolveProvider(s) };
    $("enabled").checked = !!s.enabled;
    $("rewrite").checked = !!s.rewrite;
    $("target").value = TARGETS[s.target] ? s.target : DEFAULT_SETTINGS.target;
    paint();
  }
);

// 把輸入框目前的 key／模型寫進儲存空間（測試前呼叫，避免還沒觸發 change 就測試）
async function commitFields() {
  const p = PROVIDERS[state.provider];
  const patch = {
    provider: state.provider,
    [p.keyField]: $("apiKey").value.trim(),
    [p.modelField]: $("model").value.trim() || p.defaultModel,
  };
  Object.assign(state, patch);
  await chrome.storage.local.set(patch);
}

$("agree").addEventListener("click", async () => {
  state.consentVersion = CONSENT_VERSION;
  await save({ consentVersion: CONSENT_VERSION, provider: state.provider });
  paint();
});

$("revoke").addEventListener("click", async () => {
  state.consentVersion = 0;
  await save({ consentVersion: 0 });
  paint();
});

$("provider").addEventListener("change", async (e) => {
  state.provider = e.target.value;
  await save({ provider: state.provider });
  paint();
});

$("test").addEventListener("click", async () => {
  const out = $("testResult");
  out.textContent = "測試中…";
  try {
    await commitFields();
    const res = await chrome.runtime.sendMessage({
      type: "analyze",
      text: "今天終於放假了，晚上一起去吃火鍋好不好",
      target: $("target").value,
      rewrite: true,
      noCache: true, // 測試一定要真的打一次 API，不能拿快取充數
    });
    if (!res || res.error) {
      const err = new Error((res && res.error) || "EMPTY");
      err.provider = res && res.provider;
      throw err;
    }
    const d = res.data;
    out.textContent =
      `✅ 成功：溫度 ${d.temperature}℃・${d.emotion}，濕度 ${d.humidity}（互動／情感詞 ${d.emotiveWords}/${d.totalWords}）`;
  } catch (e) {
    out.textContent = `❌ ${describeError(e.message, e.provider || state.provider)}（${e.message}）`;
  }
});

$("enabled").addEventListener("change", (e) => save({ enabled: e.target.checked }));
$("rewrite").addEventListener("change", (e) => save({ rewrite: e.target.checked }));
$("target").addEventListener("change", (e) => save({ target: e.target.value }));
$("apiKey").addEventListener("change", () => commitFields().then(() => flash("已儲存")));
$("model").addEventListener("change", () => commitFields().then(() => flash("已儲存")));
