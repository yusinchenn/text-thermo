# Chrome 線上應用程式商店：上架欄位範本

在開發人員主頁逐欄貼上。**凡是標示 ⚠️ 的地方，請依你實際的情況調整**（尤其是支援網站清單，要與 `manifest.json` 一致）。

## 商店資訊（Store listing）

**名稱**

```
字溫計 TextThermo
```

**簡短說明**（上限 132 字元，與 `manifest.json` 的 `description` 一致）

```
打字停下來一秒後，偵測訊息的溫度與濕度，並依收訊對象提供語氣改寫建議。使用你自己的 Gemini 或 DeepSeek API key。
```

**詳細說明**

```
字溫計在你打字時，替「還沒送出」的訊息量兩個指標：

🌡 溫度（0–50℃）：語氣的熱度。冷（厭惡、冷淡）→ 涼 → 常溫（平和、親切）→ 暖（熱情、關愛）→ 熱（生氣、激動、興奮），並附上一個情緒標籤。
💧 濕度（10–100）：句子裡「互動詞與情感詞」占多少比例。客觀陳述偏乾，滿滿的「我、你、愛、想念」偏濕。

另外會依收訊對象（同事、親人、朋友、對象、前輩、後輩）給出語氣改寫建議，按「取代」就直接換掉輸入框的文字，也可以還原成原文。

【怎麼用】
1. 安裝後點工具列的字溫計圖示，閱讀說明並按「同意並開始使用」。
2. 選擇 AI 服務（Google Gemini 有免費層、免信用卡；或 DeepSeek），貼上你自己的 API key，按「測試 API」。
3. 到聊天室打字，停 1 秒，輸入框上方就會出現溫度與濕度。

【支援網站】⚠️ 只列你實測過的
Instagram 網頁版私訊。

【請先知道】
• 需要自備 API key（取得方式見設定面板）。
• 停止打字 1 秒後，輸入框裡目前的文字（最多 300 字）會從你的瀏覽器直接傳送到你選擇的 AI 服務（Google Gemini 或 DeepSeek）做分析。不會送對話紀錄、帳號或其他頁面內容；作者沒有伺服器，收不到你的文字或 API key。
• 按下「同意並開始使用」之前，不會送出任何文字；之後可隨時撤回同意。
• Gemini 免費層：Google 會將內容用於改進產品，人工審查人員可能讀到。DeepSeek：資料儲存在中華人民共和國境內的伺服器。請不要在輸入框輸入密碼、證件號碼等機密內容。
• 溫度與濕度是語言模型的主觀判斷，不是科學量測，僅供參考。

本擴充功能為獨立作品，與 Instagram、Meta、Google、DeepSeek 等公司皆無隸屬或背書關係，商標屬於各自的擁有者。

開放原始碼（MIT）：https://github.com/yusinchenn/text-thermo
隱私權政策：https://github.com/yusinchenn/text-thermo/blob/main/docs/PRIVACY.md
```

**類別**：選最接近的（例如 Productivity／Communication，依後台提供的選項）。
**語言**：繁體中文（Chinese, Traditional）。

**圖片**（都在 `store/`）

| 欄位 | 檔案 | 規格 |
| --- | --- | --- |
| 商店圖示 | `store/icon-128x128.png` | 128×128 PNG |
| 小型宣傳圖（必填） | `store/promo-small-440x280.png` | 440×280 |
| 螢幕截圖 1–3 | `store/screenshot-1-1280x800.png`、`-2-`、`-3-` | 1280×800（最多 5 張） |

> 截圖是用「示範聊天室」跑真實擴充功能產生的。要重做：`CHROME_PATH=/path/to/chrome npm run store-assets`。

## 隱私權（Privacy practices）

**單一用途（Single purpose）**

```
分析使用者正在聊天輸入框中輸入的文字語氣（溫度與濕度），並依收訊對象提供語氣改寫建議。
```

**權限理由（Permission justification）**

`storage`

```
儲存使用者的設定（收訊對象、開關、選擇的 AI 服務與模型）、使用者自己填入的 API key，以及使用者是否已同意資料傳送說明。只存在本機的 chrome.storage.local，不同步、不上傳。
```

主機權限（Host permissions）

```
https://generativelanguage.googleapis.com/* ：使用者選擇 Google Gemini 時，背景服務會把待分析的文字傳到 Gemini API 取得語氣分析結果。
https://api.deepseek.com/* ：使用者選擇 DeepSeek 時，背景服務會把待分析的文字傳到 DeepSeek API 取得語氣分析結果。
兩者都只在使用者已同意並填入自己的 API key 之後才會連線；擴充功能沒有其他伺服器。
```

內容指令碼的網站（Content scripts，有些後台會把它併在主機權限理由裡）⚠️ 與 manifest 一致

```
https://www.instagram.com/* ：在使用者的聊天輸入框旁顯示分析結果的浮動框，並在使用者按「取代」時把建議文字寫回輸入框。腳本只讀取使用者正在輸入的那個輸入框（textarea／contenteditable）的文字，不讀取對話紀錄或其他頁面內容。
```

**是否使用遠端程式碼（Remote code）**：**否**（所有程式碼都包含在套件裡；不使用 eval、不載入遠端指令碼。）

**資料使用（Data usage）** — 勾選：

| 資料類別 | 勾選 | 原因 |
| --- | --- | --- |
| Personal communications（個人通訊） | ✅ | 使用者輸入的聊天訊息文字會傳給 AI 服務 |
| Website content（網站內容） | ✅ | 內容來自聊天網站的輸入框（保守起見一併勾選） |
| Authentication information（驗證資訊） | ✅ | 使用者自己的 API key 存在本機並傳給對應的 AI 服務驗證身分 |
| 其他（PII、健康、財務、位置、瀏覽紀錄、使用者活動） | ❌ | 不收集 |

**認證（三項都勾選，且必須屬實）**

- 我不會把使用者資料出售或轉讓給第三方，但核准的使用情境除外（為提供功能而傳送給使用者自己選擇的 AI 服務）。
- 我不會把使用者資料用於與本項目單一用途無關的目的。
- 我不會把使用者資料用於判定信用或貸款資格。

**隱私權政策網址**：`https://github.com/yusinchenn/text-thermo/blob/main/docs/PRIVACY.md`（或你的 GitHub Pages 網址）

> 隱私權政策中已包含 CWS 要求的聲明：對於從 Chrome 擴充功能 API 取得的資料，使用方式遵守 Chrome 線上應用程式商店使用者資料政策（含有限度使用）。

## 發布範圍（Distribution）

- 價格：免費
- 能見度：不公開（Unlisted）← 建議先用這個
- 地區：見 `docs/PUBLISHING.md` 的〈地區〉

## 測試說明（Test instructions）

這個欄位只有審查員看得到。⚠️ 把 `<…>` 填好。

```
This extension analyses the tone of the text a user is typing in a chat box and suggests a rewrite. It requires the user's own API key (it has no server of its own), so a temporary, quota-limited Google Gemini API key is provided below for review only and will be revoked after review:

  Gemini API key: <臨時審查用 key>

How to test:
1. Click the extension icon. Read the notice and press "同意並開始使用" (Agree and start). Until this is pressed, no text is sent anywhere.
2. "AI 服務" is Google Gemini by default. Paste the key above into the API key field and press "測試 API" (Test API). A green "✅ 成功" with a temperature (℃) and humidity should appear.
3. Open https://www.instagram.com/direct/inbox/ (any account; opening a conversation is enough), click the message box and type e.g. "你到底有沒有在聽！！我講了三次了", then stop typing for one second. A small floating box appears above the input showing temperature, humidity, an emotion tag and a suggested rewrite.
4. Press "取代" (Replace) to replace the input text with the suggestion; "還原成原文" restores the original.
5. Press "撤回同意（停止傳送文字）" in the popup to withdraw consent; nothing is sent afterwards.

If you do not have an Instagram account, a screen recording of steps 1–5 is here: <不公開的影片連結>

Notes: the only host permissions are the two AI service endpoints; the extension reads only the text of the chat input the user is typing in, only after consent, and sends at most the last 300 characters. Source code: https://github.com/yusinchenn/text-thermo
```

## 給審查員的補充（如果被問到）

- **為什麼要在聊天網站執行？** 因為功能就是在使用者打字的當下顯示分析結果；腳本只處理使用者正在輸入的輸入框。
- **資料送到哪裡？** 只送給使用者自己選擇、並自己提供 API key 的那一個服務；沒有開發者伺服器。
- **為什麼要列兩個 AI 服務的主機權限？** 使用者可以二選一；沒選的那個不會連線。
- **API key 怎麼保存？** 只存在使用者本機的 `chrome.storage.local`，只有 background service worker 與設定面板讀取；不同步、不傳給作者。
