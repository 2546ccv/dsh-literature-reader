# dsh-literature-reader 📖

**Literature reading assistant for DeepSeek Harness Web** — read PDFs (or pasted text) inside the DSH web GUI, select a term or passage with the mouse, and get a **concept explanation** or **translation** in a popup right next to the selection. Hotkeys: `Alt+L` panel, `Alt+E` explain, `Alt+T` translate.

## Why it saves tokens

- The plugin calls the model through a **one-shot `ctx.llm.stream()`** on the host: the request **never enters the session history** and **never occupies the agent's context window**.
- The system prompt is minimal, selected text is clipped (`maxChars`, default 2000), and output is capped (`maxTokensExplain` 200 / `maxTokensTranslate` 300 by default).
- In-session **result cache**: re-asking the same text costs zero tokens.
- Defaults to the lightweight `deepseek-v4-flash` model; everything is configurable.

## Features

| Feature | Description |
|---|---|
| PDF reader | Open a local PDF inside the GUI; pdf.js is lazily loaded from a configurable CDN (default jsDelivr). No network → use text mode. |
| Text mode | Paste paper text into the panel; works fully offline. |
| Selection popup | Select text with the mouse → popup appears beside the selection with Explain / Translate buttons. |
| Hotkeys | `Alt+L` open/close panel, `Alt+E` explain selection, `Alt+T` translate selection, `Esc` close. |
| Settings | Provider/model (or leave default), pdf.js CDN URL, in-panel settings gear. |
| Lightweight | Hand-written module-loader bundle, **zero build step, zero runtime npm deps**. |

## Install (Windows, one command)

```powershell
powershell -ExecutionPolicy Bypass -Command "Invoke-WebRequest 'https://raw.githubusercontent.com/2546ccv/dsh-literature-reader/main/install.ps1' -OutFile install.ps1; .\install.ps1"
```

The installer downloads the repo (zip, git fallback), creates a junction into
`%USERPROFILE%\.dsh\profiles\node_modules`, and registers the plugin in
`%USERPROFILE%\.dsh\profiles\web\cordis.patch.yml` (idempotent). Then
**restart dsh web** (or reload the Web UI).

Pin a version or track a branch:

```powershell
.\install.ps1 -Version 'v0.1.0'   # a release tag
.\install.ps1 -Version 'main'     # dev branch
```

## Manual install (macOS / Linux)

```sh
git clone --depth 1 https://github.com/2546ccv/dsh-literature-reader.git
ln -s "$PWD/dsh-literature-reader" "$DSH_HOME/profiles/node_modules/dsh-literature-reader"
```

Then append to `$DSH_HOME/profiles/web/cordis.patch.yml`:

```yaml
- insert:
    - id: literature-reader
      name: 'dsh-literature-reader'
```

Restart dsh web.

## Configuration

The plugin works out of the box. Optional settings live in the panel's gear
(⚙️) and are stored in `localStorage`:

- **Provider / Model** — leave blank to use the host plugin defaults
  (`deepseek-official` / `deepseek-v4-flash`).
- **pdf.js CDN** — default `https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build`;
  change it if your network blocks that CDN.

Host-side defaults (provider, model, token caps, system prompts) can be
overridden in the plugin's `config:` in `cordis.patch.yml` — see
`lib/index.js` `Config` for the full schema.

## How it works

```
┌─ browser (client.js) ─────────────┐   ┌─ host (index.js) ──────────────┐
│ sidebar entry / Alt+L             │   │                                │
│  └─ reading panel (pdf.js/text)   │   │  /lit channel (loopback RPC)   │
│     └─ select text → popup        │──▶│   ask {text, mode}             │
│        ├─ 📖 Explain (Alt+E)      │   │    └─ ctx.llm.stream()         │
│        └─ 🌐 Translate (Alt+T)    │   │       one-shot, no history     │
│                                   │◀──│       minimal prompt + caps    │
└───────────────────────────────────┘   └────────────────────────────────┘
```

## Development

No build step: `lib/client.js` is the shipped browser bundle
(`window.__ModuleLoader__.load`), `lib/index.js` is the host plugin. To tweak,
edit the files and re-run the installer, or link your clone directly.

```bash
node --check lib/index.js && node --check lib/client.js   # syntax check
node test/client-test.cjs                                  # client functional tests (17 assertions)
node test/client-test2.cjs                                 # hotkey + PDF path tests (9 assertions)
```

The tests run the browser bundle inside a tiny DOM harness (no browser, no
jsdom, no network) and drive the full chain: sidebar registration → panel
open → text mode → selection → popup → RPC call → result rendering, plus the
hotkey and PDF render paths.

## License

MIT
