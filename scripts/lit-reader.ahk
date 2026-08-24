; =============================================================================
; dsh-literature-reader — 全局桌面快捷键 (AutoHotkey v2)
; -----------------------------------------------------------------------------
; 在任何软件（WPS、浏览器、PDF 阅读器、Word……）里：
;   选中文字后按  Alt+E  → 解释（光标旁弹出小窗口）
;   选中文字后按  Alt+T  → 翻译（光标旁弹出小窗口）
;   按             Alt+L  → 弹出输入框，手动输入要解释/翻译的内容
;
; 原理：模拟 Ctrl+C 复制选中文字 → 请求本机 DSH 后台
;       (http://127.0.0.1:3080/lit-http/ask) → 弹出结果小窗口。
;       复用 DSH 已配置的模型与 token 策略，一次性调用、不入会话历史。
;
; 要求：AutoHotkey v2 (https://www.autohotkey.com)；
;       dsh web 在本机运行 (127.0.0.1:3080) 且已安装 literature-reader 插件。
; =============================================================================
#Requires AutoHotkey v2.0

; ---- 配置 ----
BASE_URL   := "http://127.0.0.1:3080/lit-http"   ; DSH 后台端点
MAX_CHARS  := 2000                                ; 与 host maxChars 一致
PROVIDER   := ""                                  ; 留空用 host 默认
MODEL      := ""                                  ; 留空用 host 默认
WIN_W      := 460                                 ; 结果窗口宽度
WIN_MAX_H  := 320                                 ; 结果窗口最大高度
FONT_SIZE  := 13
TIMEOUT_MS := 60000                               ; 请求超时

; ---- 全局热键 ----
!e::   AskSelected("explain")    ; Alt+E 解释
!t::   AskSelected("translate")  ; Alt+T 翻译
!l::   AskPrompt()               ; Alt+L 输入框

; =============================================================================
; 取当前选中文字（模拟 Ctrl+C）
; =============================================================================
GetSelectedText() {
    prevClip := A_Clipboard                      ; 保存原剪贴板
    A_Clipboard := ""                            ; 清空，便于判断是否复制成功
    Send "^c"
    if !ClipWait(1, 1) {
        A_Clipboard := prevClip
        return ""
    }
    Sleep 30                                     ; 等剪贴板稳定
    txt := A_Clipboard
    A_Clipboard := prevClip                      ; 恢复原剪贴板
    return txt
}

; =============================================================================
; 对选中文字发起请求并在光标旁弹出小窗口
; =============================================================================
AskSelected(mode) {
    txt := GetSelectedText()
    if (txt = "") {
        ShowResult("未检测到选中的文字。请先在文档/网页中选中一段文字，再按热键。", "提示")
        return
    }
    txt := Trim(txt)
    if (StrLen(txt) > MAX_CHARS)
        txt := SubStr(txt, 1, MAX_CHARS)
    AskAndShow(txt, mode)
}

; =============================================================================
; 弹出输入框手动输入
; =============================================================================
AskPrompt() {
    ib := InputBox("输入要解释/翻译的内容（或留空取消）：", "文献助手", "w480 h120")
    if ib.Result = "Cancel"
        return
    txt := Trim(ib.Value)
    if (txt = "")
        return
    AskAndShow(txt, "explain")
}

; =============================================================================
; 请求后台并显示结果窗口
; =============================================================================
AskAndShow(txt, mode) {
    ShowResult(mode = "translate" ? "翻译中…" : "解释中…", "文献助手")
    payload := '{'
        . '"text":' . JSONEscape(txt) . ','
        . '"mode":"' . mode . '",'
        . '"provider":"' . PROVIDER . '",'
        . '"model":"' . MODEL . '"'
        . '}'
    try {
        whr := ComObject("WinHttp.WinHttpRequest.5.1")
        whr.Open("POST", BASE_URL . "/ask", true)
        whr.SetRequestHeader("Content-Type", "application/json")
        whr.SetTimeouts(TIMEOUT_MS, TIMEOUT_MS, TIMEOUT_MS, TIMEOUT_MS)
        whr.Send(payload)
        whr.WaitForResponse(TIMEOUT_MS)
        if (whr.Status = 200) {
            res := JSONParse(whr.ResponseText)
            if (res.HasOwnProp("ok") && res.ok)
                ShowResult(res.value.text, mode = "translate" ? "翻译" : "解释")
            else
                ShowResult("后台返回错误：" . GetErrMsg(res), "错误")
        } else {
            ShowResult("HTTP " . whr.Status . " —— 请确认 dsh web 正在运行且已安装 literature-reader 插件。", "错误")
        }
    } catch as e {
        ShowResult("无法连接 DSH 后台 (" . e.Message . ")。`n请确认：`n1. dsh web 正在运行 (127.0.0.1:3080)`n2. literature-reader 插件已安装", "错误")
    }
}

GetErrMsg(res) {
    try {
        if res.HasOwnProp("error") && res.error.HasOwnProp("message")
            return res.error.message
    }
    return "未知错误"
}

; =============================================================================
; 显示结果小窗口（跟随鼠标，自动换行可滚动，Esc 关闭）
; =============================================================================
ShowResult(content, title) {
    static lastShow := 0
    static hwnd := 0
    now := A_TickCount
    if (now - lastShow < 150)                     ; 防抖
        return
    lastShow := now

    ; 关闭已有窗口
    if (hwnd && WinExist("ahk_id " hwnd)) {
        WinClose("ahk_id " hwnd)
        hwnd := 0
    }

    myGui := Gui("+AlwaysOnTop +ToolWindow -Caption +Border", title)
    myGui.SetFont("s" FONT_SIZE, "Microsoft YaHei")
    ; 只读多行 Edit：自动换行 + 超高滚动
    edit := myGui.Add("Edit", "ReadOnly +Wrap -Border vScroll", content)
    edit.SetFont("s" FONT_SIZE, "Microsoft YaHei")

    ; 估算高度：行数 = 字符数 / 每行约 42 字符（宽度 430px @ 13px），封顶
    lineCount := Ceil(StrLen(content) / 42)
    contentH := Min(lineCount * 20 + 20, WIN_MAX_H)
    myGui.Opt("w" WIN_W " h" contentH)
    edit.Move(10, 8, WIN_W - 20, contentH - 16)

    ; 窗口定位在鼠标右下侧
    MouseGetPos(&mx, &my)
    myGui.Show("x" (mx + 16) " y" (my + 16) " NoActivate")

    hwnd := myGui.Hwnd
    ; Esc 关闭（NoActivate 窗口无焦点，Esc 仅当用户点击窗口后有效；再按热键也会替换关闭）
    myGui.OnEvent("Escape", (*) => myGui.Destroy())
    ; 点击窗口外部不自动关闭——由下一次热键自然替换
}

; =============================================================================
; JSON 工具（最小实现，避免外部依赖）
; =============================================================================
JSONEscape(s) {
    s := StrReplace(s, "\", "\\")
    s := StrReplace(s, '"', '\"')
    s := StrReplace(s, "`r", "\r")
    s := StrReplace(s, "`n", "\n")
    s := StrReplace(s, "`t", "\t")
    return s
}

JSONParse(s) {
    ; 用 JScript 引擎解析（Windows 自带，无需外部库）
    static doc := ""
    if (doc = "") {
        doc := ComObject("htmlfile")
        doc.write("<meta http-equiv='X-UA-Compatible' content='IE=edge'>")
        doc.close()
    }
    ; 包装为表达式并求值
    doc.parentWindow.execScript("var __lit_json = (" . s . ");", "JScript")
    return doc.parentWindow.__lit_json
}
