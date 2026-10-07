# 🌡 TextThermo (字溫計)

A Chrome extension that, **one second after you stop typing** in a chat box, rates the unsent message's **temperature** (how cold or hot the tone is) and **humidity** (how objective vs. emotionally/interpersonally loaded it is), and suggests a **rewrite** that fits the recipient (colleague, family, friend, partner, senior, junior). One click replaces your draft.

[繁體中文](README.md) · [Changelog](CHANGELOG.md) · [Privacy policy](docs/PRIVACY.md)

![Demo](docs/screenshots/demo-chat.png)

> The demo page is a fake chat room for testing; AI responses are canned.
> The extension UI is currently in Traditional Chinese only.

## What it shows

- **Temperature 0–50 ℃** – five bands: 0–9 cold, 10–19 cool, 20–29 neutral, 30–39 warm, 40–50 hot (blue → red).
- **Humidity 10–100** – the share of interactive/emotive words in the sentence: `10 + 90 × emotive ÷ total`. Computed in code from the model's word segmentation, so "I love you" (3 of 3 words) scores higher than a long, mostly factual sentence.
- **Emotion tag** – a short label such as "caring" or "angry".
- **Rewrite suggestion** – tailored to the recipient type; "取代" (Replace) swaps it into the input box, "還原成原文" restores your original.

## Privacy model

- **Bring your own API key** – Google Gemini (free tier available, no credit card) or DeepSeek (pay-as-you-go).
- Text goes **directly from your browser to the provider you chose**. There is no developer server, no analytics.
- Nothing is sent until you press **同意並開始使用** ("Agree and start") in the popup; you can withdraw consent at any time.
- Only the current input box text (≤300 chars), the recipient category and the rewrite toggle are sent.
- Gemini free tier: Google may use submitted content to improve its products and human reviewers may read it. DeepSeek: data is stored on servers in the PRC. See [docs/PRIVACY.md](docs/PRIVACY.md).

## Install

1. Download the latest `text-thermo-vX.Y.Z.zip` from [Releases](../../releases) and unzip it (or clone this repo and use the `extension/` folder).
2. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, select the folder that contains `manifest.json`.
3. Click the extension icon → read and accept the notice → choose a provider → paste your API key → **測試 API** (Test API).
4. Reload any already-open chat tab, type something and pause for a second.

Supported sites: Instagram web DM (used by the author), Messenger (same Lexical editor family; tested against a real Lexical editor, not the live site), Discord and Telegram Web (experimental, untested).

## Develop

```bash
npm install     # Node.js 20.19+ / 22.13+ / 24+
npm test        # unit tests (no browser needed)
npm run test:e2e   # loads the real extension into Chromium (set CHROME_PATH or run `npx playwright-core install chromium`)
npm run package    # dist/text-thermo-vX.Y.Z.zip
```

See [CONTRIBUTING.md](CONTRIBUTING.md). To publish on the Chrome Web Store, see [docs/PUBLISHING.md](docs/PUBLISHING.md) (Traditional Chinese).

## Disclaimer

Temperature and humidity are subjective judgements by a language model, not measurements. This is an independent project, not affiliated with or endorsed by Instagram, Meta, Discord, Telegram, Google or DeepSeek. Licensed under the [MIT License](LICENSE).
