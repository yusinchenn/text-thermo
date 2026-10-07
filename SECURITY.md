# 安全性政策

## 回報漏洞

如果你發現**安全性問題**（例如：API key 可能外洩、文字被送到非預期的地方、可以被網頁指令碼利用的漏洞），請**不要**開公開的 issue。請使用 GitHub 的私下回報功能：

> 本 repo 的 **Security** 分頁 → **Report a vulnerability**

回報時請盡量附上：影響範圍、重現步驟、受影響的版本。我會盡快回覆。

一般的 bug、功能建議請用 [Issues](../../issues)。**任何時候都不要在 issue、PR 或截圖裡貼出你的 API key 或私人對話內容。**

## 這個專案的安全設計

- 沒有作者的伺服器：文字與 API key 只在你的瀏覽器與你選擇的 AI 服務之間傳送（HTTPS）。
- API key 只存在 `chrome.storage.local`，只有 background service worker 與設定面板會讀取；content script 不讀取 key，也不會把 key 傳進網頁。
- Gemini 的 key 放在 `x-goog-api-key` 請求標頭，不放在網址。
- `host_permissions` 只有兩個 AI 服務的網域；content script 只注入在 `manifest.json` 明確列出的聊天網站。
- 浮動框使用 closed Shadow DOM，網頁指令碼讀不到內容；模型輸出一律以 `textContent` 顯示，不當成 HTML。
- 沒有 `eval`、遠端程式碼或行內事件處理器（測試會檢查）。
- 送給模型的訊息被明確標示為「待分析資料」，提示詞要求忽略其中的指令。這**不能**百分之百防止提示詞注入，但模型的輸出只會被當成純文字顯示（以及使用者按下「取代」時寫入輸入框），不會執行任何動作。

## 已知的取捨

- API key 在本機**未加密**（瀏覽器擴充功能沒有安全的金鑰儲存空間）。請使用額度受限、可隨時撤銷的 key，不要使用有付款能力的主要帳戶 key。
- 分析的文字會被傳送到第三方 AI 服務，請見 [隱私權政策](docs/PRIVACY.md)。
