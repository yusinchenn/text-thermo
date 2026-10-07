# 參與貢獻

謝謝你想幫忙！這是個小專案，流程盡量簡單。

## 開始之前

- 先開一個 [issue](../../issues) 討論想做的事，尤其是會**改變送出資料**、**新增權限／網域**或**新增支援網站**的變更。
- 請遵守 [行為準則](CODE_OF_CONDUCT.md)。
- 安全性問題請看 [SECURITY.md](SECURITY.md)，不要公開回報。
- **不要把 API key 或私人對話內容放進 issue、PR、測試或截圖。**

## 開發環境

需要 Node.js 20.19+ / 22.13+ / 24+。

```bash
git clone https://github.com/yusinchenn/text-thermo.git
cd text-thermo
npm install
npm test          # 單元測試，約 1 分鐘，不需要瀏覽器
```

在瀏覽器裡試：`chrome://extensions` → 開啟開發人員模式 → 載入未封裝項目 → 選 `extension/` 資料夾。改完程式後按「重新載入」，並把聊天分頁重新整理。

端對端測試會把擴充功能真的載入 Chromium：

```bash
npx playwright-core install chromium     # 第一次
npm run test:e2e
# 或使用現成的瀏覽器：CHROME_PATH=/path/to/chrome npm run test:e2e
```

## 程式結構

| 檔案 | 職責 |
| --- | --- |
| `extension/shared.js` | `TARGETS`（收訊對象）、`PROVIDERS`（AI 服務）、預設設定、`describeError`（錯誤說明）。content／background／popup 都會載入，**只放不含機密的常數與純函式**。 |
| `extension/background.js` | service worker。`analyze()` 負責同意檢查 → 讀 key → 快取 → 呼叫 `CALLERS[provider]` → 解析 → 計算濕度。**API key 只在這裡使用。** |
| `extension/content.js` | 偵測輸入（`input`、輸入法組字、輪詢保險）、1 秒 debounce、浮動框（closed Shadow DOM）、取代／還原。 |
| `extension/popup.*` | 設定面板。 |

設計原則：

1. **同意之前不送任何文字**（`analyze()` 的第一個檢查）。
2. **模型輸出一律當純文字**：用 `textContent`，不要用 `innerHTML`（`tests/check-manifest.test.js` 會檢查）。
3. **權限最小化**：只有 `storage`；`host_permissions` 只有 AI 服務的網域；不要加 `<all_urls>`、`tabs` 等。
4. **溫度與濕度的計算分工**：模型給溫度、情緒、分詞；濕度由程式依分詞計算（`humidityFromWords`）。

## 常見的修改

**新增支援的網站**

1. 在 `extension/manifest.json` 的 `content_scripts[0].matches` 加上網址（要是明確的 `https://…/*`）。
2. 載入擴充功能，到該網站試：能不能出現浮動框？「取代」能不能寫進輸入框？（打開 Console 篩選「字溫計」看紀錄。）
3. 若「取代」不行，看 `content.js` 的 `replaceText`（依序嘗試 `execCommand` → 模擬貼上 → 原生 setter）。
4. 更新 README 的〈支援的網站〉表格，並在 PR 說明你實測了什麼。

**新增 AI 服務**

1. `shared.js` 的 `PROVIDERS` 加一項（`keyField`、`modelField`、`defaultModel`、`keyUrl`、`privacy` 說明）。
2. `background.js` 寫 `callXxx({ apiKey, model, system, user })`，回傳模型文字；錯誤用 `HTTP_<status>` 或更具體的代碼（要在 `describeError` 加說明）。登錄到 `CALLERS`。
3. `manifest.json` 的 `host_permissions` 加上網域；**同步更新 `docs/PRIVACY.md`、README 與設定面板的說明**。
4. `tests/background.test.js` 加請求格式與錯誤處理的測試；`tests/check-manifest.test.js` 的網域清單也要更新。

**調整提示詞或溫度定義**：改 `background.js` 的 `BASE_PROMPT`，並把改動前後的幾個例句結果貼在 PR 裡（模型輸出無法自動測試，所以請附證據）。

## 提交 PR

- 一個 PR 做一件事；提交訊息用簡短的祈使句（例如 `fix: Gemini 429 顯示額度說明`）。
- `npm test` 要通過；改到偵測或「取代」時也請跑 `npm run test:e2e`。
- 使用者看得到的變更請更新 `CHANGELOG.md`。
- 若會變更送出的資料或權限，請更新隱私權政策，並在 PR 說明理由。

## 發布流程（維護者）

1. `node scripts/bump-version.js X.Y.Z`（同時更新 `manifest.json` 與 `package.json`）。
2. 更新 `CHANGELOG.md`。
3. `npm test && npm run test:e2e && npm run package`。
4. `git commit -am "chore: release vX.Y.Z" && git tag vX.Y.Z && git push --follow-tags`。
   推送標籤後，GitHub Actions 會自動建立 Release 並附上 zip。
5. 要上架到 Chrome 線上應用程式商店時，見 [docs/PUBLISHING.md](docs/PUBLISHING.md)。
