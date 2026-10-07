# 隱私權政策 · Privacy Policy

**字溫計 TextThermo** · 最後更新：2026-10-07 · [English version below](#english)

## 一句話版本

字溫計只在你**按下「同意並開始使用」之後**，把你正在輸入框裡打的文字（最多 300 字）**直接從你的瀏覽器**傳給**你自己選擇的** AI 服務（Google Gemini 或 DeepSeek）來分析語氣。作者沒有伺服器，收不到你的文字，也收不到你的 API key。

## 擴充功能會處理哪些資料

| 資料 | 用途 | 去向 | 保存 |
| --- | --- | --- | --- |
| **輸入框目前的文字**（最多最後 300 字），只限在擴充功能列出的聊天網站上、你正在輸入的聊天輸入框（`textarea`／`contenteditable`），停止打字約 1 秒後 | 分析語氣的溫度與濕度，並產生改寫建議（這是擴充功能唯一的用途） | 傳給你選擇的那一個 AI 服務（見下表） | 擴充功能**不保存**；同一段文字的分析結果會暫存在 service worker 記憶體（最多 100 筆），瀏覽器關閉或擴充功能休眠後清除 |
| **收訊對象類別**（同事、親人、朋友…）與**是否要改寫**的開關 | 讓改寫建議符合對象 | 隨文字一起傳給同一個 AI 服務 | 存在本機設定 |
| **你的 API key**、選擇的服務與模型、各項開關、同意紀錄 | 呼叫你選擇的 AI 服務、記住你的設定 | 只有 API key 會被放在**請求標頭**傳給對應的 AI 服務，用來驗證你的帳戶 | 存在瀏覽器的 `chrome.storage.local`（只在這台裝置、**未加密**、不跨裝置同步）。解除安裝擴充功能即刪除 |

擴充功能**不會**收集或傳送：對話紀錄、他人的訊息、帳號或個人資料、瀏覽紀錄、網址、cookie、其他頁面內容。內容只會從你正在打字的那個輸入框讀取，並且只在你同意之後。擴充功能不含任何統計、追蹤或廣告程式碼，也不會載入遠端程式碼。

## 資料會送給誰

資料只會傳給**你在設定裡選擇的那一個**服務。擴充功能只被允許連線到這兩個網域：

| 服務 | 網域 | 他們如何處理資料 |
| --- | --- | --- |
| Google Gemini API | `generativelanguage.googleapis.com` | 依 [Gemini API 條款](https://ai.google.dev/gemini-api/terms)：**免費層**的內容會被 Google 用於改進產品與機器學習技術，且人工審查人員可能讀取（Google 會先去除與你帳戶、API key 的關聯）；**付費層**則不會用於改進產品。請不要在輸入框輸入機密或敏感內容。條款要求使用者年滿 18 歲。 |
| DeepSeek API | `api.deepseek.com` | 依 [DeepSeek 隱私政策](https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html)：資料儲存在中華人民共和國境內的伺服器；政策提到使用者可選擇退出模型訓練，但沒有明確說明 API 內容是否預設用於訓練。 |

這些服務如何保存、使用你的資料，由它們自己的條款與隱私政策決定，**不在本擴充功能的控制範圍內**。作者不會、也無法存取這些資料。

## 你的選擇與控制

- **同意之前不會送出任何文字**。設定面板有「使用前請先看這個」說明，按「同意並開始使用」才會啟用；之後可隨時按「撤回同意（停止傳送文字）」。
- 可以隨時關閉「啟用偵測」；在聊天室浮動框按 × 可暫時隱藏。
- 刪除設定面板裡的 API key，或解除安裝擴充功能，就會清除本機保存的所有設定與 key。若要讓 AI 服務那邊的資料也被刪除，請依該服務的方式處理。
- 說明內容有實質變動時，會提高同意版本，所有使用者都必須重新閱讀並同意。

## 我們不做的事

- 不出售、出租或轉讓使用者資料給任何第三方，除了「為了提供功能而傳給你選擇的 AI 服務」之外。
- 不把資料用於廣告、個人化行銷、信用或貸款評估。
- 不允許任何人（包含作者）讀取你的文字——因為作者根本沒有這些資料。
- 不以任何與「分析語氣、提供改寫建議」無關的目的使用資料。

「字溫計」對於從 Chrome 擴充功能 API 取得的資料，使用方式遵守 [Chrome 線上應用程式商店使用者資料政策](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)，包括其中的「有限度使用」（Limited Use）規定。

## 兒童

本服務並非針對未成年人設計。Google Gemini API 的條款要求使用者年滿 18 歲。

## 修改

政策有變動時，會更新本頁的「最後更新」日期並記錄在 [CHANGELOG](../CHANGELOG.md)；若涉及資料用途的實質變動，會在擴充功能內重新徵求同意。

## 聯絡

請到 [GitHub Issues](https://github.com/yusinchenn/text-thermo/issues) 提問（請不要在公開 issue 貼上 API key 或私人對話內容）。安全相關問題見 [SECURITY.md](../SECURITY.md)。

---

<a id="english"></a>

# Privacy Policy (English)

**TextThermo (字溫計)** · Last updated: 2026-10-07

**Short version:** only after you press "同意並開始使用" (Agree and start) in the popup, the text you are typing in a chat input box (at most the last 300 characters) is sent **directly from your browser** to the **AI service you chose** (Google Gemini or DeepSeek) to analyse its tone. The author runs no server and receives neither your text nor your API key.

**Data handled**

| Data | Purpose | Where it goes | Retention |
| --- | --- | --- | --- |
| Text currently in the chat input box you are typing in (last ≤300 chars), only on the chat sites listed in the extension, about 1 second after you stop typing | Rate the message's temperature/humidity and generate a rewrite suggestion (the extension's single purpose) | The one AI service you selected | Not stored by the extension; analysis results are cached in the service worker's memory only (max 100 entries) and cleared when the browser closes or the worker sleeps |
| Recipient category and the rewrite toggle | Tailor the suggestion | Sent with the text to the same service | Local settings |
| Your API key, chosen service/model, toggles, consent record | Authenticate with your chosen service, remember settings | The API key is sent only in the request header to the matching service | `chrome.storage.local` on this device, **unencrypted**, not synced; removed on uninstall |

The extension does **not** collect or transmit conversation history, other people's messages, account or personal information, browsing history, URLs, cookies or other page content. It contains no analytics, tracking or advertising code and loads no remote code.

**Recipients.** Data is sent only to the service you select, via `generativelanguage.googleapis.com` (Google Gemini API — on the free tier Google may use content to improve its products and human reviewers may read it; paid tier does not; see the [Gemini API terms](https://ai.google.dev/gemini-api/terms); users must be 18+) or `api.deepseek.com` ([DeepSeek privacy policy](https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html): data is stored on servers in the People's Republic of China; the policy mentions an opt-out from model training but does not clearly say whether API content is used for training by default). Those services' handling of your data is governed by their own terms and is outside this extension's control.

**Your controls.** Nothing is sent before you consent; you can withdraw consent, turn detection off, delete your key, or uninstall at any time.

**We do not** sell or transfer user data to third parties (other than sending it to the AI service you chose in order to provide the feature), use it for advertising, or use it for credit/lending decisions, and no human (including the author) reads your text. Use of information received from Chrome extension APIs adheres to the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), including the Limited Use requirements.

**Children.** Not directed at minors; the Gemini API terms require users to be 18 or older.

**Contact.** [GitHub Issues](https://github.com/yusinchenn/text-thermo/issues) (never post API keys or private conversations).
