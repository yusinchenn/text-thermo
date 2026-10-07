// 共用設定：content script、background、popup 都會載入這個檔案。
// 注意：API key 只放在 chrome.storage.local，不放在這裡，也不會被傳進網頁。

const TARGETS = {
  colleague: { label: "同事", hint: "專業、清楚、有禮貌，不過度親暱" },
  family: { label: "親人", hint: "親切自然、帶關心，避免嗆聲或賭氣" },
  friend: { label: "朋友", hint: "輕鬆自然，可以口語" },
  partner: { label: "對象", hint: "溫柔真誠，說出感受而不是指責" },
  senior: { label: "前輩", hint: "尊重、禮貌、謙和，適度使用敬語" },
  junior: { label: "後輩", hint: "友善清楚、帶鼓勵，不居高臨下" },
};

// AI 服務。keyField / modelField 是 chrome.storage.local 裡的欄位名稱。
const PROVIDERS = {
  gemini: {
    label: "Google Gemini",
    short: "Gemini",
    keyField: "geminiKey",
    modelField: "gmModel",
    defaultModel: "gemini-3.5-flash-lite",
    keyUrl: "https://aistudio.google.com/apikey",
    keyHint: "到 Google AI Studio 免費建立（不需信用卡）",
    privacy:
      "Gemini 免費層：Google 會把送出的內容用於改進產品，人工審查人員可能讀到；" +
      "請不要輸入機密內容。改用付費帳戶則不會用於改進產品。",
  },
  deepseek: {
    label: "DeepSeek",
    short: "DeepSeek",
    keyField: "deepseekKey",
    modelField: "dsModel",
    defaultModel: "deepseek-flash",
    keyUrl: "https://platform.deepseek.com/api_keys",
    keyHint: "到 DeepSeek 開放平台建立，需要儲值（用量計費）",
    privacy:
      "DeepSeek：依其隱私政策，資料儲存在中華人民共和國境內的伺服器；" +
      "政策提到可選擇退出模型訓練，但未明確說明 API 內容是否預設用於訓練。",
  },
};

// 資料傳送說明的版本。說明有實質變動時加 1，所有使用者就必須重新同意。
const CONSENT_VERSION = 1;

const DEFAULT_SETTINGS = {
  enabled: true,
  rewrite: true,
  target: "friend",
  consentVersion: 0, // 尚未同意前，不會把任何文字送出
};

// 沒選過服務時：舊版（只有 DeepSeek）升級上來、已經有 key 的人沿用 DeepSeek，其餘預設 Gemini
function resolveProvider(stored) {
  const s = stored || {};
  if (PROVIDERS[s.provider]) return s.provider;
  return s.deepseekKey ? "deepseek" : "gemini";
}

// 錯誤代碼 → 給使用者看的說明（浮動框與設定面板共用）
function describeError(code, provider) {
  const p = PROVIDERS[provider];
  const name = p ? p.short : "AI 服務";
  const gemini = provider === "gemini";
  const table = {
    NO_CONSENT: "請先點瀏覽器右上角的字溫計圖示（可能在拼圖選單裡），閱讀資料傳送說明並按「同意並開始使用」",
    NO_KEY: `請先點瀏覽器右上角的字溫計圖示（可能在拼圖選單裡），填入 ${name} API key`,
    BAD_KEY: `${name} API key 無效或已過期，請到設定重新貼上`,
    HTTP_401: `${name} API key 無效，請到設定重新貼上`,
    HTTP_403: `${name} 拒絕這把 API key（沒有權限，或該服務在你的地區不可用）`,
    HTTP_400: "請求格式錯誤，請到設定檢查模型名稱",
    HTTP_402: `${name} 帳戶餘額不足，請先儲值`,
    HTTP_404: "找不到這個模型，請到設定檢查模型名稱",
    HTTP_422: "參數錯誤，請到設定檢查模型名稱",
    HTTP_429: gemini
      ? "已達 Gemini 的免費額度上限（每分鐘或每日），稍後再試，或改用別的模型／服務"
      : `${name} 同時請求太多，稍後再試`,
    HTTP_500: `${name} 伺服器出錯，稍後再試`,
    HTTP_502: `${name} 伺服器出錯，稍後再試`,
    HTTP_503: `${name} 伺服器忙碌，稍後再試`,
    HTTP_504: `${name} 伺服器逾時，稍後再試`,
    REGION: "Gemini 免費層在你所在的地區不可用，需要先在 Google AI Studio 啟用帳單",
    BLOCKED: `${name} 因安全設定拒絕分析這段文字`,
    BAD_MODEL: "模型名稱格式不正確，請到設定檢查",
    NETWORK: `連不上 ${name}，請檢查網路`,
    STALE: "擴充功能剛更新過，這個分頁需要重新整理才能繼續使用",
    PARSE: "模型回傳格式錯誤，繼續打字會重試",
    EMPTY: "模型沒有回傳內容",
  };
  return table[code] || `分析失敗（${code}）`;
}
