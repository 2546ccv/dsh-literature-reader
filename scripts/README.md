# 全局桌面快捷键（AutoHotkey）—— 在 WPS / Word / 任何软件里用

> 在 **WPS、Word、浏览器、PDF 阅读器**等任意 Windows 软件里，选中文字按快捷键，光标旁弹出小窗口，直接给出**解释**或**翻译**。不需要把文件导入 DSH 面板。

## 效果

| 操作 | 结果 |
|---|---|
| 选中文字 → **Alt+E** | 弹出小窗口，解释选中内容（光标右下侧） |
| 选中文字 → **Alt+T** | 弹出小窗口，翻译选中内容 |
| **Alt+L** | 弹出输入框，手动输入内容 → 解释 |
| 点击结果窗口 / 再按热键 | 关闭旧窗口（新请求替换） |

原理：脚本模拟 `Ctrl+C` 复制选中文字 → 请求本机 DSH 后台 `http://127.0.0.1:3080/lit-http/ask` → 复用 DSH 已配置的模型与 token 策略（一次性调用、不入会话历史）。

## 安装

1. **安装 AutoHotkey v2**：https://www.autohotkey.com （一路 Next 即可）
2. 双击运行本目录的 **`lit-reader.ahk`** —— 托盘出现 "H" 图标即生效
   - 或双击 **`启动文献助手.bat`**（自动定位脚本并启动）

> 需要 dsh web 在本机运行（127.0.0.1:3080）且已安装 literature-reader 插件（后台端点 `/lit-http`）。

## 开机自启（可选）

把 `启动文献助手.bat` 的快捷方式放入：

```
Win+R → shell:startup → 回车 → 把快捷方式粘贴进去
```

## 配置

编辑 `lit-reader.ahk` 顶部：

```ahk
BASE_URL   := "http://127.0.0.1:3080/lit-http"   ; DSH 后台端点
PROVIDER   := ""                                  ; 留空用 host 默认 (deepseek-official)
MODEL      := ""                                  ; 留空用 host 默认 (deepseek-v4-flash)
WIN_W      := 460                                 ; 结果窗口宽度
WIN_MAX_H  := 320                                 ; 结果窗口最大高度
```

改热键（默认 `!e`=Alt+E、`!t`=Alt+T、`!l`=Alt+L）：

```ahk
!e::   AskSelected("explain")     ; 改成 ^!e 就是 Ctrl+Alt+E
!t::   AskSelected("translate")
!l::   AskPrompt()
```

## 常见问题

**Q: 按热键没反应？**
A: 确认托盘有 AHK 图标；确认 dsh web 在运行；确认插件已装（后台端点存在）。可在脚本里把 `TIMEOUT_MS` 调大。

**Q: 提示"未检测到选中的文字"？**
A: 某些软件（如部分 PDF 阅读器）不支持程序化复制，或选区在非标准控件里。此时用 **Alt+L** 手动输入，或改用「浏览器扩展」/「DSH 面板」。

**Q: 剪贴板被清空？**
A: 脚本会保存并在用完后恢复剪贴板，但个别软件（如虚拟机、远程桌面）可能拦截。这是该方案在那些环境下的已知限制。

**Q: 与 DSH 面板里的使用有区别吗？**
A: 没有。走同一个 `/lit-http/ask` 后台端点，同样的模型、token 上限、system prompt，同样不入会话历史。

## 文件

```
scripts/
├── lit-reader.ahk        # 主脚本（热键 + 取词 + 弹窗）
├── 启动文献助手.bat      # 双击启动（自动定位脚本目录）
└── README.md             # 本说明
```
