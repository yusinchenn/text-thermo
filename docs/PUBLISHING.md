# 上架到 Chrome 線上應用程式商店：評估、檢查清單與步驟

> 這份文件是依 2026-10 查到的 Chrome 線上應用程式商店（以下簡稱 CWS）與 Gemini API 官方文件整理的，**規定會變，送出前請以官方頁面為準**（連結在文末）。這不是法律意見。

## 1. 結論先講

**可以上架，但我不建議「直接公開上架」。建議的路線：**

1. **先用 GitHub 發布**（zip／原始碼，載入未封裝項目安裝）——專案已經準備好了。
2. 自己與 2～3 位朋友**實測 1～2 週**，補完下面〈必須完成〉清單。
3. 再以 **「不公開（Unlisted）」** 上架 CWS：只有拿到連結的人找得到，審核與政策要求跟公開上架一樣，但曝光與客服壓力小。
4. 穩定、沒有被審查員或使用者挑出問題之後，再考慮改成「公開」。

### 為什麼不建議一開始就公開上架

| 原因 | 說明 |
| --- | --- |
| **資料性質敏感，審查較嚴** | 這個擴充功能在私人聊天網站讀取你正在輸入的內容，並傳到第三方 AI。CWS 把這類資料歸為「個人通訊（Personal communications）」，要求：隱私權政策、在**擴充功能介面內**的明確告知與同意（不能只寫在商店說明）、隱私欄位的完整揭露。已做的部分見〈已經做好的部分〉；但這類擴充功能被退件或要求補件的機率，高於一般小工具。新開發者＋新擴充功能本來就審得比較久。 |
| **受眾小、門檻高** | 使用者要自己申請 API key、理解資料會傳到 Google／DeepSeek。多數一般使用者會卡在這一步，然後留下負評或客服問題。 |
| **你要負責一個「會處理私人訊息」的產品** | 公開後你就是隱私權政策的責任人：政策要持續準確、使用者可能把機密內容送出去、Gemini 免費層（會被用於改進產品、人工可能讀到、條款對年齡與地區有規定）等風險都要在文案中講清楚。 |
| **維護成本** | Instagram、Discord 等網站改版，輸入框偵測或「取代」就可能壞掉；模型名稱也會被服務商下架（`gemini-3.5-flash-lite` 之類的名稱不保證長久）。公開版壞了，會直接反映在評分上。 |
| **尚未驗證的部分** | 我（Claude）沒有真實的 Gemini／DeepSeek key，所以 **Gemini 路徑只用依官方文件寫的模擬回應測過，沒有打過真實 API**；Messenger／Discord／Telegram 也沒有在真實網站上測過。上架前這些都該補驗證（見清單）。 |
| **名稱與商標** | 商店頁面提到 Instagram、Discord 等名稱必須小心，不能暗示官方合作或背書（CWS 的 Impersonation 政策）。本專案不是這些公司的官方整合；也要自行評估各網站服務條款對「瀏覽器擴充功能」的態度。 |

### 但它不是不可行——對你有利的地方

- 權限很少：只有 `storage` ＋兩個 AI 服務網域；沒有 `<all_urls>`、`tabs`、`webRequest`，**審查會比較快**。
- 沒有遠端程式碼、沒有 `eval`、沒有統計追蹤、沒有廣告（測試會檢查）。
- 「使用者自備 API key」本身是被允許的模式；你沒有把任何 key 放在程式裡，也沒有中間伺服器，隱私模型很乾淨。
- 同意畫面、撤回同意、隱私權政策、有限度使用（Limited Use）聲明都已完成。

## 2. 已經做好的部分

| CWS 要求 | 專案裡的對應 |
| --- | --- |
| 隱私權政策 | `docs/PRIVACY.md`（中英文），需要有公開網址（見下） |
| 擴充功能內的明確告知與同意（Prominent disclosure & consent） | 設定面板「使用前請先看這個」＋「同意並開始使用」；`analyze()` 在同意之前拒絕送出（有單元與端對端測試）；可「撤回同意」；說明有版本號，內容有實質變動時要求重新同意 |
| 最小權限 | `permissions: ["storage"]`；`host_permissions` 只有 2 個網域；`content_scripts.matches` 只有明確列出的網站（`tests/check-manifest.test.js` 檢查） |
| 無遠端程式碼 | 沒有 `eval`／`new Function`／遠端 `<script>`／行內事件處理器；不使用 `innerHTML` |
| 安全傳輸 | 只用 HTTPS；Gemini 的 key 放標頭不放網址 |
| 圖示、截圖、宣傳圖 | `extension/icons/`（16/32/48/128）、`store/`（128 圖示、440×280 小宣傳圖、3 張 1280×800 截圖），可用 `npm run store-assets` 重產 |
| 商店文案、權限理由、測試說明範本 | `docs/STORE_LISTING.md` |
| 打包 | `npm run package` → `dist/text-thermo-vX.Y.Z.zip`（根目錄就是 `manifest.json`） |

## 3. 上架前必須完成／建議調整

### 必須完成

- [ ] **替換使用者名稱**：`node scripts/set-username.js <你的 GitHub 使用者名稱>`（把所有 `yusinchenn` 換掉，包含隱私權政策裡的聯絡連結），然後 push。
- [ ] **隱私權政策要有公開、可直接開啟的網址**，上架時要填進去。兩個做法：
  - 最簡單：`https://github.com/<你>/text-thermo/blob/main/docs/PRIVACY.md`（要先把 repo 設成 public）。
  - 較正式：Settings → Pages → 發布 `main` 分支的 `/docs` 資料夾，網址會像 `https://<你>.github.io/text-thermo/PRIVACY`。
  - 不要用 `raw.githubusercontent.com`（顯示成純文字，閱讀體驗差）。
- [ ] **用真實的 Gemini key 實測**：設定面板按「測試 API」要出現 ✅，並在真實的 Instagram 私訊裡打字、取代、還原。同時到 [Gemini 模型頁](https://ai.google.dev/gemini-api/docs/models) 確認預設模型 `gemini-3.5-flash-lite` 仍然存在、仍有免費層；名稱若變了，改 `extension/shared.js` 的 `PROVIDERS.gemini.defaultModel`、`tests`、README、`docs/STORE_LISTING.md`。（DeepSeek 路徑已有真實使用經驗。）
- [ ] **縮減 `content_scripts.matches` 到你真的驗證過的網站**。目前列了 Instagram、Messenger、Discord、Telegram Web，其中只有 Instagram 是實際用過的。CWS 要求「最窄的權限」，列了沒驗證的網站，審查員問起來你答不出來；之後確認可用再逐一加回去（每次加網站＝新增主機權限，**使用者端會被要求重新同意**）。
- [ ] **版本號**：公開上架通常用 `1.0.0` 起跳。`node scripts/bump-version.js 1.0.0`，更新 `CHANGELOG.md`。
- [ ] **開發人員帳號**（見下一節）：2 步驟驗證、註冊費、聯絡 email、trader 聲明。
- [ ] **商店圖片**：`store/` 裡有現成的，截圖是用「示範聊天室」跑真的擴充功能產生的（頁面標題寫了「示範聊天室（測試頁）」）。商店要求截圖要真實呈現使用體驗，這樣是誠實的。**若你改用真實 Instagram 截圖**：遮住對方名稱與訊息、不要出現 Instagram 的 logo／品牌，並確認你有權使用畫面內容。
- [ ] **隱私欄位**照 `docs/STORE_LISTING.md` 填，**勾選的資料類別要與實際行為一致**。
- [ ] **測試說明（Test instructions）**：審查員沒有你的 API key，也不一定有 Instagram 帳號。請準備：(a) 一把**專門給審查用、額度受限、審查完就撤銷**的 Gemini key（只填在這個欄位，審查員看得到、一般使用者看不到）；(b) 範本中的操作步驟；(c) 建議再錄一支 1～2 分鐘的操作影片（YouTube 不公開連結）放在說明裡。沒有這些，最常見的結果是「無法驗證功能」而被退件。

### 強烈建議

- [ ] 商店詳細說明**開頭就寫明**：需要自備 API key；輸入的文字會傳到你選的 Google Gemini 或 DeepSeek；Gemini 免費層內容可能被 Google 用於改進產品；與 Instagram 等平台無關係（範本已寫好）。誠實揭露是通過審查最有效的做法，也能減少負評。
- [ ] **地區**：Gemini 條款對歐盟／英國／瑞士使用者有額外規定（向這些地區提供 API 用戶端時須使用付費服務）。要避免爭議，可以在 Distribution 的地區選項**排除這些地區**，或在說明中標明；兩者都要自行判斷，我無法替你確認條款適用方式。
- [ ] 請 2～3 位朋友在不同電腦上實測（至少含 Windows 與 macOS 各一），特別是注音／倉頡輸入法選字時不會誤觸發。
- [ ] 確認儲存庫與壓縮檔裡沒有任何 API key（`npm test` 會掃描常見格式，但請自己再 `git log -p | grep -i "AIza\|sk-"` 檢查一次歷史）。
- [ ] 在 GitHub 啟用 **Private vulnerability reporting**（Settings → Code security），讓 `SECURITY.md` 的回報管道有效。

### 選擇性

- 同一個 zip 也可以上架 **Microsoft Edge Add-ons**（免費註冊，審核規則類似）。
- Firefox 需要另外調整（MV3 的背景指令碼寫法不同），目前不支援。
- 加英文介面（`_locales`）可以擴大受眾，但也會增加審查要看的文案。

## 4. 發布步驟

### A. 準備好套件

```bash
git pull
npm ci
npm test
CHROME_PATH=/path/to/chrome npm run test:e2e     # 或先 npx playwright-core install chromium
node scripts/bump-version.js 1.0.0               # 視情況；同時改 manifest.json 與 package.json
# 編輯 CHANGELOG.md
npm run package                                  # → dist/text-thermo-v1.0.0.zip
```

打開 zip 確認：根目錄直接看到 `manifest.json`，只有 `background.js`、`content.js`、`shared.js`、`popup.*`、`manifest.json`、`icons/`。

### B. GitHub

```bash
node scripts/set-username.js <你的使用者名稱>   # 只需要做一次
git add -A && git commit -m "chore: release v1.0.0"
git tag v1.0.0
git push --follow-tags
```

推送標籤後，`.github/workflows/release.yml` 會自動跑測試、建立 GitHub Release 並附上 zip。再確認隱私權政策的公開網址可以開啟。

### C. 註冊 Chrome 線上應用程式商店開發人員帳號（只需一次）

1. 用要當作發行者的 Google 帳戶登入 [開發人員資訊主頁](https://chrome.google.com/webstore/devconsole)。**建議用專用或固定的 email**：註冊後無法更改，之後審查結果都會寄到這裡。
2. 帳戶必須開啟 **2 步驟驗證**（發布前的硬性要求）。
3. 同意開發人員合約，**支付一次性註冊費（約 US$5，以頁面顯示為準）**。
4. 在帳戶設定填入發行者名稱、聯絡 email 並完成驗證。
5. **Trader／non-trader 聲明**（歐盟 DSA）：個人、非商業、免費的興趣專案，通常選 **non-trader**。若你把它當作事業或會收費，要選 trader，並提供姓名、地址、電話等，**這些資料會公開顯示給歐盟使用者**。拿不準時請看 [Trader FAQ](https://developer.chrome.com/docs/webstore/program-policies/trader-verification-faq)。

### D. 建立項目並填寫

1. 主頁面按 **新增項目（Add new item）** → 上傳 `dist/text-thermo-vX.Y.Z.zip`。
2. **商店資訊（Store listing）**：名稱、簡短說明、詳細說明、類別、語言、圖示、截圖、小型宣傳圖——全部照 `docs/STORE_LISTING.md` 貼上，圖片用 `store/` 裡的。
3. **隱私權（Privacy）**：單一用途、各權限的理由、是否使用遠端程式碼（**否**）、資料使用（勾選 Personal communications、Website content、Authentication information）、三項認證、隱私權政策網址——照 `docs/STORE_LISTING.md`。
4. **發布範圍（Distribution）**：
   - 價格：免費。
   - 能見度：**不公開（Unlisted）**（建議）或公開。
   - 地區：見上面〈地區〉。
5. **測試說明（Test instructions）**：貼上範本，填入審查用的臨時 key 與影片連結。
6. 回到頂端按 **送出審查（Submit for review）**。

### E. 審查中與通過後

- 多數項目幾天內完成，可能拉長到數週；新開發者、新擴充功能、要求敏感權限都會更久。超過三週沒有進展，向開發人員支援聯絡。
- 結果會寄到開發人員 email。被退件時會寫明違反哪一條政策——對照〈可能被退件的原因〉修正後重新送出，不要重複送同樣的內容。
- 「送出時選擇延後發布」可以讓你審查通過後自己決定上線時間（通過後 30 天內要發布）。
- 通過後，把商店網址補進 README 的〈安裝〉章節，並在 GitHub 專案描述放連結。

### F. 之後的更新

1. 改程式 → `node scripts/bump-version.js X.Y.Z` → 更新 CHANGELOG → `npm test && npm run package`。
2. 開發人員主頁 → 該項目 → **套件（Package）** → 上傳新版 zip → 送出審查。
3. **會觸發重新審查或使用者端重新確認的變更**：新增權限／主機權限（例如新增支援網站、新增 AI 服務）、改變資料用途。使用者端也可能被暫時停用，直到他們重新同意——所以新增網站要成批做，不要頻繁加。
4. 資料用途有實質變更時，同時提高 `shared.js` 的 `CONSENT_VERSION`（所有人要重新同意）並更新隱私權政策。

## 5. 可能被退件的原因與對策

| 常見退件原因 | 對策 |
| --- | --- |
| 隱私揭露不足（個人通訊／網站內容資料未勾選或未說明） | 勾選資料類別、隱私權政策寫明資料送往何處、擴充功能內有同意畫面（都已備好） |
| 單一用途描述不清或功能過多 | 只寫「分析輸入框文字的語氣並提供改寫建議」；不要在說明裡暗示別的功能 |
| 權限理由不具體 | 用範本中逐項的理由；強調沒有 `tabs`、沒有 `<all_urls>` |
| 主機權限（content script 網站）過廣或未實測 | 只留實測過的網站 |
| 商店說明暗示官方關係、使用他人商標當賣點 | 範本已有免責聲明；名稱、圖示不使用 Instagram 等品牌元素 |
| 截圖與實際功能不符、含他人隱私 | 使用示範頁截圖，或遮住真實截圖中的個資 |
| 隱私權政策連結失效或與實際行為不符 | 上架前實際開啟檢查；行為變了就先改政策 |
| 審查員無法測試 | 提供臨時 key、步驟與影片 |
| 說明中使用過多重複關鍵字、誇大宣稱 | 說明據實撰寫（「建議／估計」而非「精準偵測」） |

## 6. 風險與維護清單

- **模型名稱被下架**：定期（至少每季）看 Gemini／DeepSeek 的模型頁；使用者看到「找不到這個模型」會直接怪擴充功能。
- **網站改版**：IG 輸入框結構改變 → 偵測或取代失效；留意 issue。
- **Gemini 免費層規則變動**（額度、資料用途、地區）：同步更新設定面板說明、隱私權政策與商店文案。
- **個資與責任**：不要自己開後台收集任何資料；若日後想加統計或錯誤回報，這會變成需要重新審查與重新徵求同意的大變更。
- **帳號安全**：開發人員帳號被盜等於可以替所有使用者推送惡意更新——務必用 2 步驟驗證，最好用安全金鑰。

## 7. 若不想走商店

- 維持 GitHub-only：使用者下載 Release 的 zip、載入未封裝項目（缺點：Chrome 可能不時出現開發人員模式相關的提示，而且沒有自動更新，每次都要手動覆蓋）。
- CWS 的「私人／受信任測試人員」：限定 email 名單可安裝，適合給朋友用，不必公開。
- Edge Add-ons：同一個 zip，審核壓力較小。

## 參考資料

- [發布擴充功能（Chrome for Developers）](https://developer.chrome.com/docs/webstore/publish)
- [使用者資料政策與常見問題](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq) · [有限度使用](https://developer.chrome.com/docs/webstore/program-policies/limited-use)
- [隱私權分頁填寫說明](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [審查流程](https://developer.chrome.com/docs/webstore/review-process) · [計畫政策](https://developer.chrome.com/docs/webstore/program-policies/policies)
- [商店圖片規格](https://developer.chrome.com/docs/webstore/images)
- [Trader 聲明](https://developer.chrome.com/docs/webstore/program-policies/trader-disclosure)
- [Gemini API 條款](https://ai.google.dev/gemini-api/terms) · [Gemini 模型](https://ai.google.dev/gemini-api/docs/models) · [費率與額度](https://ai.google.dev/gemini-api/docs/rate-limits)
- [DeepSeek 隱私政策](https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html)
