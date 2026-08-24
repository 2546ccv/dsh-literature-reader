# dsh-literature-reader 📖

**文献阅读助手 · Literature Reading Assistant for DeepSeek Harness Web**

在 DeepSeek Harness 网页端阅读 PDF/文献时，用鼠标选中术语或段落，选区旁即刻弹出浮窗，一键**概念解释**或**翻译**——无需离开阅读流。快捷键 `Alt+L` 开关面板、`Alt+E` 解释、`Alt+T` 翻译。

*Read PDFs (or pasted text) inside the DSH web GUI, select a term or passage, and get a **concept explanation** or **translation** in a popup right next to the selection. Hotkeys: `Alt+L` panel, `Alt+E` explain, `Alt+T` translate.*

---

# 🇨🇳 中文说明

## 为什么省 token（核心特色）

- 插件在 host 侧通过**一次性 `ctx.llm.stream()`** 调用模型：请求**不进会话历史**、**不占 agent 上下文窗口**，问完即忘。
- system prompt 极简；选中文本自动截断（`maxChars`，默认 2000 字符）；输出硬性上限（解释 200 / 翻译 300 token，默认）。
- 会话内**结果缓存**：同一段文字重复询问 = 零 token 消耗。
- 默认使用轻量模型 `deepseek-v4-flash`；Provider / Model / 上限 / prompt 全部可配置。

## 功能

| 功能 | 说明 |
|---|---|
| PDF 阅读 | 在 GUI 内打开本地 PDF；pdf.js 从可配置 CDN 懒加载（默认 jsDelivr）。无网络时用纯文本模式。 |
| 纯文本模式 | 把论文文本粘贴进面板，完全离线可用。 |
| 选中弹窗 | 鼠标选中文字 → 选区旁自动弹出浮窗（📖 解释 / 🌐 翻译 按钮）。 |
| 快捷键 | `Alt+L` 开关面板、`Alt+E` 解释选中、`Alt+T` 翻译选中、`Esc` 关闭。 |
| 设置 | 面板内 ⚙️ 可配置 Provider/Model（留空用默认）、pdf.js CDN 地址。 |
| 轻量 | 手写 module-loader bundle，**零构建步骤、零运行时 npm 依赖**。 |

## 安装（Windows，一条命令）

```powershell
powershell -ExecutionPolicy Bypass -Command "Invoke-WebRequest 'https://raw.githubusercontent.com/2546ccv/dsh-literature-reader/main/install.ps1' -OutFile install.ps1; .\install.ps1"
```

安装脚本会下载仓库（zip 优先、git 兜底）、在 `%USERPROFILE%\.dsh\profiles\node_modules` 建立 junction，并在 `%USERPROFILE%\.dsh\profiles\web\cordis.patch.yml` 里注册插件（幂等，可重复运行）。然后**重启 dsh web**（或刷新 Web 界面）即可生效。

指定版本或跟随开发分支：

```powershell
.\install.ps1 -Version 'v0.1.0'   # 某个发布版本
.\install.ps1 -Version 'main'     # 开发分支
```

## 手动安装（macOS / Linux）

```sh
git clone --depth 1 https://github.com/2546ccv/dsh-literature-reader.git
ln -s "$PWD/dsh-literature-reader" "$DSH_HOME/profiles/node_modules/dsh-literature-reader"
```

再向 `$DSH_HOME/profiles/web/cordis.patch.yml` 追加：

```yaml
- insert:
    - id: literature-reader
      name: 'dsh-literature-reader'
```

重启 dsh web。

## 配置

开箱即用。可选设置都在面板的 ⚙️ 里（存于 `localStorage`）：

- **Provider / Model** —— 留空使用 host 插件默认值（`deepseek-official` / `deepseek-v4-flash`）。
- **pdf.js CDN** —— 默认 `https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build`；网络访问不了该 CDN 时可换镜像。

host 侧默认值（provider、model、token 上限、system prompt）可在 `cordis.patch.yml` 的插件 `config:` 里覆盖 —— 完整 schema 见 `lib/index.js` 的 `Config`。

## 工作原理

```
┌─ 浏览器 (client.js) ──────────────┐   ┌─ host (index.js) ──────────────┐
│ 侧边栏入口 / Alt+L                 │   │                                │
│  └─ 阅读面板 (pdf.js / 纯文本)      │   │  /lit 通道 (loopback RPC)      │
│     └─ 选中文本 → 浮窗             │──▶│   ask {text, mode}             │
│        ├─ 📖 解释 (Alt+E)          │   │    └─ ctx.llm.stream()         │
│        └─ 🌐 翻译 (Alt+T)          │   │       一次性、不入历史          │
│                                   │◀──│       精简 prompt + 上限        │
└───────────────────────────────────┘   └────────────────────────────────┘
```

## 开发

无构建步骤：`lib/client.js` 就是发布的浏览器 bundle（`window.__ModuleLoader__.load` 格式），`lib/index.js` 是 host 插件。改完直接重新运行安装脚本或链接自己的克隆即可。

```bash
node --check lib/index.js && node --check lib/client.js   # 语法检查
node test/client-test.cjs                                  # client 功能测试（17 项断言）
node test/client-test2.cjs                                 # 快捷键 + PDF 路径测试（9 项断言）
```

测试在一个微型 DOM harness 里运行浏览器 bundle（无需浏览器、无需 jsdom、无需网络），驱动完整链路：侧边栏注册 → 面板打开 → 文本模式 → 选中 → 浮窗 → RPC 调用 → 结果渲染，以及快捷键和 PDF 渲染路径。

## 📖 中文详解文档

工作原理 / 代码结构逐文件讲解 / 配置详解 / 开发扩展指南 / 常见问题 FAQ：
👉 **[docs/中文详解.md](docs/中文详解.md)**

## 🖥️ 在浏览器任意网页中使用（扩展）

插件除了在 DSH 网页面板内使用，还提供一个**本机后台 HTTP 端点** `/lit-http/ask`（复用 DSH 的模型与 token 策略），配合同仓库的 **Chrome/Edge 扩展**，即可在**任意网页**（arXiv、浏览器内 PDF、Google Scholar、WPS 网页版等）选中文字弹浮窗解释/翻译：

```bash
# 安装扩展：打开 chrome://extensions 或 edge://extensions
# 开启开发者模式 → 加载已解压的扩展程序 → 选择 extension/ 目录
```

- 详情见 **[extension/README.zh-CN.md](extension/README.zh-CN.md)**
- 后端要求：DSH web 在本机运行（127.0.0.1:3080）
- 快捷键同面板：`Alt+E` 解释、`Alt+T` 翻译

## ⌨️ 桌面全局快捷键（WPS / Word / 任何软件，AutoHotkey）

在 **WPS、Word、浏览器、PDF 阅读器**等任意 Windows 软件里，选中文字按快捷键，光标旁弹出小窗口直接解释/翻译——**无需把文件导入 DSH 面板**：

| 操作 | 结果 |
|---|---|
| 选中文字 → `Alt+E` | 小窗口解释选中内容 |
| 选中文字 → `Alt+T` | 小窗口翻译选中内容 |
| `Alt+L` | 输入框手动输入 → 解释 |

1. 安装 AutoHotkey v2（https://www.autohotkey.com）
2. 双击 `scripts/lit-reader.ahk`（或 `scripts/启动文献助手.bat`）

详情见 **[scripts/README.md](scripts/README.md)**。原理：模拟 Ctrl+C 取选中文字 → 调本机 `/lit-http/ask` 后台 → 弹出结果，复用 DSH 模型与 token 策略。

## 许可证

MIT

---

# 🇬🇧 English

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

## 📖 Chinese deep-dive docs

Architecture / code walkthrough / configuration reference / extension guide /
FAQ (in Chinese): **[docs/中文详解.md](docs/中文详解.md)**

## 🖥️ Use it on any webpage (browser extension)

Beyond the in-GUI panel, the plugin also exposes a **local background HTTP
endpoint** `/lit-http/ask` (reusing your DSH provider/model and token-saving
policy). The bundled **Chrome/Edge extension** lets you select text on **any
webpage** (arXiv, in-browser PDF, Google Scholar, WPS web, etc.) and get an
explain/translate popup:

```bash
# Install: open chrome://extensions or edge://extensions
# enable Developer mode → Load unpacked → choose the extension/ folder
```

- Docs: **[extension/README.zh-CN.md](extension/README.zh-CN.md)**
- Backend requirement: DSH web running locally (127.0.0.1:3080)
- Same hotkeys as the panel: `Alt+E` explain, `Alt+T` translate

## ⌨️ Desktop global hotkeys (WPS / Word / any app, AutoHotkey)

Select text in **any Windows app** (WPS, Word, browser, PDF reader) and press a
hotkey — a small window pops up next to the cursor with the explanation or
translation, **no file import needed**:

| Action | Result |
|---|---|
| Select text → `Alt+E` | Popup explains the selection |
| Select text → `Alt+T` | Popup translates the selection |
| `Alt+L` | Input box for manual text → explain |

1. Install AutoHotkey v2 (https://www.autohotkey.com)
2. Run `scripts/lit-reader.ahk` (or `scripts/启动文献助手.bat`)

Details: **[scripts/README.md](scripts/README.md)**. How it works: simulates
Ctrl+C to grab the selection → calls the local `/lit-http/ask` backend →
shows the result, reusing your DSH model and token-saving policy.

## License

MIT
