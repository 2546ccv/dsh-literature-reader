/**
 * dsh-literature-reader — client half (hand-written module-loader bundle).
 *
 * No build step, no JSX, no runtime npm dependencies: this file is the
 * browser bundle itself, registered through the shell's module loader. The
 * shell provides `react`, the client runtime, and the slots service as
 * externals.
 *
 * Features:
 *  - Sidebar footer entry ("📖 文献") opens a floating reading panel.
 *  - The panel renders a PDF (pdf.js lazily loaded from a configurable CDN)
 *    OR a plain-text mode that needs no network at all.
 *  - Select text with the mouse: a popup appears next to the selection with
 *    Explain / Translate buttons; Alt+E / Alt+T trigger them directly.
 *  - Results come from the host `/lit` channel: one-shot LLM calls that never
 *    enter the session history (token-saving).
 *  - In-session result cache: re-asking the same text costs zero tokens.
 */
window.__ModuleLoader__.load({
  id: 'dsh-literature-reader',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

    let react = require('react');
    let _runtime = require('@deepseek-ai/dsh-client-runtime/client');
    let _slots = require('@deepseek-ai/dsh-client-ui-slots');

    /** Required services: slot registry (sidebar entry) + wire (RPC calls). */
    exports.inject = ['slots', 'connection'];

    var STYLE_ID = 'dsh-lit-reader-style';
    var STORE_KEY = 'dsh-lit-reader:settings';
    var PDF_CDN_DEFAULT = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build';

    var cache = new Map(); // mode|text -> {text, ts}
    var panel = null; // live panel controller while open

    // ------------------------------------------------------------------ ui --
    function el(tag, attrs, children) {
      var node = document.createElement(tag);
      if (attrs) {
        for (var k in attrs) {
          var v = attrs[k];
          if (k === 'class') node.className = v;
          else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
          else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
          else if (v !== null && v !== undefined) node.setAttribute(k, v);
        }
      }
      // children may be a node, a string, or an array of those.
      var list = Array.isArray(children) ? children : children == null ? [] : [children];
      list.forEach(function (c) {
        node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
      return node;
    }

    function loadStyles() {
      if (document.getElementById(STYLE_ID)) return;
      var style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `
#lit-reader-panel{position:fixed;inset:0;z-index:2147483000;background:rgba(10,12,18,.55);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
#lit-reader-panel .lit-card{position:relative;width:min(1100px,94vw);height:min(780px,92vh);background:#10141c;color:#e8ecf4;border:1px solid #2a3142;border-radius:14px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,.5)}
#lit-reader-panel .lit-toolbar{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid #232a3a;background:#161b26;flex-wrap:wrap;z-index:2}
#lit-reader-panel .lit-toolbar button,#lit-reader-panel .lit-popup button{background:#232b3d;color:#e8ecf4;border:1px solid #35405a;border-radius:8px;padding:6px 12px;font-size:13px;cursor:pointer}
#lit-reader-panel .lit-toolbar button:hover,#lit-reader-panel .lit-popup button:hover{background:#2c3750}
#lit-reader-panel .lit-toolbar button:disabled{opacity:.4;cursor:default}
#lit-reader-panel .lit-toolbar .lit-title{font-weight:600;margin-right:auto;font-size:14px}
#lit-reader-panel .lit-body{flex:1;position:relative;overflow:auto;background:#0b0e14}
#lit-reader-panel .lit-text-content{position:absolute;inset:0;border:0;outline:0;background:transparent;color:#e8ecf4;font:14px/1.8 ui-monospace,Consolas,monospace;padding:20px 24px;box-sizing:border-box;white-space:pre-wrap;word-break:break-word;overflow:auto}
#lit-reader-panel .lit-pdf-wrap{min-height:100%;display:flex;justify-content:center;padding:16px;box-sizing:border-box}
#lit-reader-panel .lit-page{position:relative;background:#fff;box-shadow:0 4px 24px rgba(0,0,0,.6)}
#lit-reader-panel .lit-page canvas{display:block}
#lit-reader-panel .lit-text-layer{position:absolute;inset:0;overflow:hidden;line-height:1;color:transparent}
#lit-reader-panel .lit-text-layer span{position:absolute;white-space:pre;transform-origin:0 0;color:transparent;cursor:text}
#lit-reader-panel ::selection{background:rgba(64,145,255,.45);color:inherit}
#lit-reader-panel .lit-hint{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px;color:#8b94a8;text-align:center;padding:24px;z-index:1}
#lit-reader-panel .lit-hint .lit-big{font-size:15px;color:#c3cadb}
#lit-reader-panel .lit-hint button{background:#232b3d;color:#e8ecf4;border:1px solid #35405a;border-radius:8px;padding:8px 16px;font-size:13px;cursor:pointer}
#lit-reader-panel .lit-hint button:hover{background:#2c3750}
#lit-reader-panel .lit-status{color:#8b94a8;font-size:12px;padding:0 4px;white-space:nowrap}
#lit-reader-panel .lit-popup{position:fixed;z-index:2147483001;background:#161b26;border:1px solid #35405a;border-radius:10px;box-shadow:0 12px 40px rgba(0,0,0,.55);max-width:min(640px,86vw);padding:10px 12px;display:flex;flex-direction:column;gap:8px;color:#e8ecf4;font-size:13px}
#lit-reader-panel .lit-popup .lit-pop-text{color:#b7c0d4;max-height:60px;overflow:hidden;word-break:break-all;font-size:12px;line-height:1.4}
#lit-reader-panel .lit-popup .lit-pop-actions{display:flex;gap:8px;flex-wrap:wrap}
#lit-reader-panel .lit-popup .lit-pop-actions button{padding:5px 12px}
#lit-reader-panel .lit-popup .lit-pop-out{max-height:300px;overflow:auto;white-space:pre-wrap;line-height:1.6;color:#e8ecf4;border-top:1px solid #262e40;padding-top:8px;margin-top:2px;font-size:13px}
#lit-reader-panel .lit-popup .lit-pop-out.lit-loading{color:#8b94a8}
#lit-reader-panel .lit-settings{position:absolute;inset:0;background:rgba(11,14,20,.94);display:none;flex-direction:column;gap:12px;padding:24px;overflow:auto;z-index:3}
#lit-reader-panel .lit-settings.lit-open{display:flex}
#lit-reader-panel .lit-settings label{display:flex;flex-direction:column;gap:6px;font-size:13px;color:#c3cadb}
#lit-reader-panel .lit-settings input,#lit-reader-panel .lit-settings select{background:#1a2130;color:#e8ecf4;border:1px solid #35405a;border-radius:8px;padding:8px 10px;font-size:13px;outline:none}
#lit-reader-panel .lit-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
#lit-reader-footer-btn{display:flex;align-items:center;gap:6px;font-size:13px;padding:6px 10px;border-radius:8px;background:transparent;border:0;color:inherit;cursor:pointer;white-space:nowrap}
#lit-reader-footer-btn:hover{background:rgba(255,255,255,.08)}
`;
      document.head.appendChild(style);
    }

    // ------------------------------------------------------------- settings --
    function defaultSettings() {
      return { provider: '', model: '', pdfCdn: PDF_CDN_DEFAULT, maxChars: 2000 };
    }
    function loadSettings() {
      try {
        var raw = localStorage.getItem(STORE_KEY);
        if (raw) return Object.assign(defaultSettings(), JSON.parse(raw));
      } catch (e) {}
      return defaultSettings();
    }
    function saveSettings(s) {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(s));
      } catch (e) {}
    }

    // ------------------------------------------------------------------ rpc --
    function ask(ctx, text, mode, settings) {
      var key = mode + '|' + text;
      var hit = cache.get(key);
      if (hit) return Promise.resolve(hit);
      return ctx.connection.rpc
        .call('/lit', 'ask', {
          text: text.slice(0, settings.maxChars || 2000),
          mode,
          provider: settings.provider || undefined,
          model: settings.model || undefined,
        })
        .then(function (res) {
          if (res.ok) {
            var value = { text: res.value.text, ts: Date.now() };
            cache.set(key, value);
            if (cache.size > 200) {
              var oldest = cache.keys().next().value;
              cache.delete(oldest);
            }
            return value;
          }
          throw new Error(res.error?.message || 'request failed');
        });
    }

    // ------------------------------------------------------------------ pdf --
    function loadPdfJs(settings) {
      if (window.__litPdfJs) return Promise.resolve(window.__litPdfJs);
      var cdn = (settings.pdfCdn || PDF_CDN_DEFAULT).replace(/\/+$/, '');
      return new Promise(function (resolve, reject) {
        var script = document.createElement('script');
        script.src = cdn + '/pdf.min.js';
        script.onload = function () {
          try {
            if (!window.pdfjsLib) return reject(new Error('pdf.min.js loaded but pdfjsLib missing'));
            var worker = new Worker(cdn + '/pdf.worker.min.mjs', { type: 'module' });
            window.pdfjsLib.GlobalWorkerOptions.workerPort = worker;
            window.__litPdfJs = window.pdfjsLib;
            resolve(window.pdfjsLib);
          } catch (err) {
            reject(err);
          }
        };
        script.onerror = function () {
          reject(new Error('failed to load pdf.js from ' + cdn));
        };
        document.head.appendChild(script);
      });
    }

    function renderPdfPage(pdfjs, doc, num, scale, holder) {
      return doc.getPage(num).then(function (page) {
        var viewport = page.getViewport({ scale: scale });
        var wrap = el('div', { class: 'lit-page', style: { width: viewport.width + 'px', height: viewport.height + 'px' } });
        var canvas = el('canvas', { width: viewport.width, height: viewport.height });
        var layer = el('div', { class: 'lit-text-layer' });
        wrap.appendChild(canvas);
        wrap.appendChild(layer);
        holder.appendChild(wrap);
        holder.scrollTop = 0;
        return page
          .render({ canvasContext: canvas.getContext('2d'), viewport: viewport })
          .promise.then(function () {
            return page.getTextContent().then(function (textContent) {
              var tl = new pdfjs.TextLayer({ textContentSource: textContent, container: layer, viewport: viewport });
              return tl.render().promise.then(function () {
                page.cleanup();
              });
            });
          });
      });
    }

    // --------------------------------------------------------------- panel --
    function openPanel(ctx) {
      if (panel) {
        panel.close();
      }
      var settings = loadSettings();
      var pdfState = { doc: null, num: 1, scale: 1.4, textMode: false, text: '' };

      var popup = null;
      var bodyEl, pageHolder, textContentEl, hintEl, statusEl, btnPrev, btnNext, btnZoomIn, btnZoomOut, pageInput, pdfBtn, textBtn;
      var fileInput = el('input', { type: 'file', accept: 'application/pdf,.pdf', style: { display: 'none' } });

      function closePopup() {
        if (popup) {
          popup.remove();
          popup = null;
        }
      }

      function showPopup(rect, text) {
        closePopup();
        var out = el('div', { class: 'lit-pop-out' });
        var card = el('div', { class: 'lit-popup' }, [
          el('div', { class: 'lit-pop-text' }, text.length > 140 ? text.slice(0, 140) + '…' : text),
          el('div', { class: 'lit-pop-actions' }, [
            el('button', { onclick: function () { runAsk('explain', text, out); } }, '📖 解释'),
            el('button', { onclick: function () { runAsk('translate', text, out); } }, '🌐 翻译'),
            el('button', { onclick: closePopup }, '✕'),
          ]),
          out,
        ]);
        // Mount under the panel overlay so `#lit-reader-panel .lit-popup`
        // selectors (hotkey path) always find it; position:fixed keeps it
        // visually attached to the selection regardless.
        overlay.appendChild(card);
        popup = card;
        var margin = 12;
        var left = Math.min(Math.max(8, rect.left), window.innerWidth - card.offsetWidth - 8);
        var top = rect.bottom + margin + card.offsetHeight > window.innerHeight ? Math.max(8, rect.top - card.offsetHeight - margin) : rect.bottom + margin;
        card.style.left = left + 'px';
        card.style.top = top + 'px';
      }

      function runAsk(mode, text, outEl) {
        if (!text.trim()) return;
        outEl.className = 'lit-pop-out lit-loading';
        outEl.textContent = mode === 'translate' ? '翻译中…' : '解释中…';
        ask(ctx, text.trim(), mode, loadSettings())
          .then(function (v) {
            outEl.className = 'lit-pop-out';
            outEl.textContent = v.text || '(empty response)';
          })
          .catch(function (err) {
            outEl.className = 'lit-pop-out';
            outEl.textContent = '❌ ' + (err.message || String(err));
          });
      }

      /** Ask the current selection (hotkey path): ensure a popup exists, then run. */
      function askSelection(mode) {
        var sel = window.getSelection();
        if (!sel || sel.isCollapsed || !bodyEl.contains(sel.anchorNode)) return;
        var text = sel.toString().trim();
        if (!text) return;
        var card = document.querySelector('#lit-reader-panel .lit-popup');
        var out = card ? card.querySelector('.lit-pop-out') : null;
        if (!out) {
          showPopup(sel.getRangeAt(0).getBoundingClientRect(), text);
          card = document.querySelector('#lit-reader-panel .lit-popup');
          out = card ? card.querySelector('.lit-pop-out') : null;
        }
        if (out) runAsk(mode, text, out);
      }

      /** Popup on mouse selection inside the reading area. */
      function handleSelection() {
        var sel = window.getSelection();
        if (!sel || sel.isCollapsed) {
          closePopup();
          return;
        }
        var text = sel.toString().trim();
        if (!text || text.length < 2) {
          closePopup();
          return;
        }
        var node = sel.anchorNode;
        if (!node || !bodyEl || !bodyEl.contains(node)) {
          closePopup();
          return;
        }
        var range = sel.getRangeAt(0);
        var rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) {
          rect = range.getClientRects()[0] || rect;
        }
        showPopup(rect, text);
      }

      // -------- body view management: hint | pdf | text (mutually exclusive) --
      function showHint(message) {
        pdfState.textMode = false;
        pageHolder.style.display = 'none';
        if (textContentEl) textContentEl.style.display = 'none';
        hintEl.style.display = 'flex';
        hintEl.innerHTML = '';
        hintEl.appendChild(
          el('div', { class: 'lit-big' }, '📖 文献阅读助手'),
        );
        if (message) hintEl.appendChild(el('div', null, message));
        hintEl.appendChild(
          el('div', { class: 'lit-row', style: { justifyContent: 'center' } }, [
            el('button', { onclick: function () { fileInput.click(); } }, '📄 打开 PDF'),
            el('button', { onclick: enterTextMode }, '✍️ 纯文本模式'),
          ]),
        );
        statusEl.textContent = '未打开文件';
        pdfBtn.disabled = false;
        textBtn.disabled = false;
        btnPrev.disabled = true;
        btnNext.disabled = true;
        btnZoomIn.disabled = true;
        btnZoomOut.disabled = true;
        pageInput.disabled = true;
      }

      function showPdfView() {
        pdfState.textMode = false;
        if (textContentEl) textContentEl.style.display = 'none';
        hintEl.style.display = 'none';
        pageHolder.style.display = '';
        pdfBtn.disabled = false;
        textBtn.disabled = false;
      }

      function enterTextMode() {
        pdfState.textMode = true;
        hintEl.style.display = 'none';
        pageHolder.style.display = 'none';
        if (!textContentEl) {
          textContentEl = el('div', { class: 'lit-text-content', contenteditable: 'true', spellcheck: 'false' });
          textContentEl.addEventListener('input', function () { pdfState.text = textContentEl.innerText; });
          bodyEl.appendChild(textContentEl);
        }
        textContentEl.style.display = '';
        if (pdfState.text) textContentEl.innerText = pdfState.text;
        statusEl.textContent = '文本模式';
        pdfBtn.disabled = false;
        textBtn.disabled = true;
        btnPrev.disabled = true;
        btnNext.disabled = true;
        btnZoomIn.disabled = true;
        btnZoomOut.disabled = true;
        pageInput.disabled = true;
        setTimeout(function () { textContentEl.focus(); }, 50);
      }

      function renderPdf() {
        var pdfjs = window.__litPdfJs;
        var doc = pdfState.doc;
        if (!doc) return;
        var num = Math.min(Math.max(1, pdfState.num), doc.numPages);
        pdfState.num = num;
        showPdfView();
        pageHolder.innerHTML = '';
        renderPdfPage(pdfjs, doc, num, pdfState.scale, pageHolder).catch(function (err) {
          pageHolder.innerHTML = '';
          showHint('PDF 渲染失败：' + (err.message || err));
        });
        pageInput.value = String(num);
        pageInput.disabled = false;
        btnPrev.disabled = num <= 1;
        btnNext.disabled = num >= doc.numPages;
        btnZoomIn.disabled = false;
        btnZoomOut.disabled = false;
        statusEl.textContent = num + ' / ' + doc.numPages;
      }

      function openFile(file) {
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          showHint('正在加载 PDF…');
          loadPdfJs(loadSettings())
            .then(function (pdfjs) {
              return pdfjs.getDocument({ data: new Uint8Array(reader.result) }).promise;
            })
            .then(function (doc) {
              pdfState.doc = doc;
              pdfState.num = 1;
              pdfState.text = '';
              if (textContentEl) textContentEl.innerText = '';
              renderPdf();
            })
            .catch(function (err) {
              showHint('PDF 打开失败：' + (err.message || err) + '（可改用纯文本模式粘贴内容，无需网络）');
            });
        };
        reader.readAsArrayBuffer(file);
      }

      function openSettingsPanel() {
        var s = loadSettings();
        var providerSel = el('select');
        var pInput = el('input', { value: s.provider });
        var mInput = el('input', { value: s.model });
        var cdnInput = el('input', { value: s.pdfCdn });

        function refreshModels() {
          ctx.connection.rpc
            .call('/lit', 'models', {})
            .then(function (res) {
              if (!res.ok) return;
              var providers = res.value.providers || [];
              var current = pInput.value || '';
              providerSel.innerHTML = '';
              providerSel.appendChild(el('option', { value: '' }, '（使用默认）'));
              providers.forEach(function (p) {
                var opt = el('option', { value: p.provider }, p.name + ' (' + p.provider + ')');
                providerSel.appendChild(opt);
              });
              if (current) providerSel.value = current;
            })
            .catch(function () {});
        }

        providerSel.addEventListener('change', function () {
          pInput.value = providerSel.value;
        });

        var settingsOverlay = el('div', { class: 'lit-settings lit-open' }, [
          el('div', { class: 'lit-row', style: { justifyContent: 'space-between' } }, [
            el('div', { class: 'lit-title' }, '设置'),
            el('button', { onclick: function () { settingsOverlay.classList.remove('lit-open'); } }, '关闭'),
          ]),
          el('label', null, ['Provider（留空用默认）', pInput]),
          el('label', null, ['Model（留空用默认）', mInput]),
          el('label', null, ['pdf.js CDN 地址', cdnInput]),
          el('label', null, ['从可用模型目录选择', providerSel]),
          el('div', { class: 'lit-row' }, [
            el('button', {
              onclick: function () {
                s.provider = pInput.value.trim();
                s.model = mInput.value.trim();
                s.pdfCdn = cdnInput.value.trim() || PDF_CDN_DEFAULT;
                saveSettings(s);
                settingsOverlay.classList.remove('lit-open');
              },
            }, '保存'),
            el('button', { onclick: refreshModels }, '刷新模型目录'),
          ]),
        ]);
        bodyEl.parentElement.appendChild(settingsOverlay);
        refreshModels();
      }

      // ---- build the card ----
      hintEl = el('div', { class: 'lit-hint' });
      bodyEl = el('div', { class: 'lit-body' }, [hintEl]);
      pageHolder = el('div', { class: 'lit-pdf-wrap', style: { display: 'none' } });

      pageInput = el('input', {
        type: 'number',
        min: '1',
        value: '1',
        style: { width: '56px', padding: '4px 6px', background: '#1a2130', color: '#e8ecf4', border: '1px solid #35405a', borderRadius: '6px' },
      });
      pageInput.addEventListener('change', function () {
        if (pdfState.doc) {
          pdfState.num = parseInt(pageInput.value, 10) || 1;
          renderPdf();
        }
      });

      btnPrev = el('button', { disabled: true, onclick: function () { if (pdfState.doc) { pdfState.num -= 1; renderPdf(); } } }, '◀');
      btnNext = el('button', { disabled: true, onclick: function () { if (pdfState.doc) { pdfState.num += 1; renderPdf(); } } }, '▶');
      btnZoomIn = el('button', { disabled: true, onclick: function () { if (pdfState.doc) { pdfState.scale = Math.min(4, pdfState.scale + 0.2); renderPdf(); } } }, '＋');
      btnZoomOut = el('button', { disabled: true, onclick: function () { if (pdfState.doc) { pdfState.scale = Math.max(0.4, pdfState.scale - 0.2); renderPdf(); } } }, '－');
      statusEl = el('span', { class: 'lit-status' }, '未打开文件');
      pdfBtn = el('button', { onclick: function () { fileInput.click(); } }, '打开 PDF');
      textBtn = el('button', { onclick: enterTextMode }, '纯文本');

      var card = el('div', { class: 'lit-card' }, [
        el('div', { class: 'lit-toolbar' }, [
          el('span', { class: 'lit-title' }, '📖 文献'),
          pdfBtn, textBtn,
          btnPrev, btnNext,
          pageInput,
          btnZoomIn, btnZoomOut,
          el('span', { style: { flex: 1 } }),
          statusEl,
          el('button', { onclick: openSettingsPanel }, '⚙️'),
          el('button', { onclick: function () { panel.close(); } }, '✕'),
        ]),
        bodyEl,
      ]);

      bodyEl.appendChild(pageHolder);
      var overlay = el('div', { id: 'lit-reader-panel' }, [card]);
      // Keep the hidden file input mounted (some engines are stricter about
      // clicking a detached input) and position it above everything.
      fileInput.style.position = 'absolute';
      fileInput.style.zIndex = '2147483002';
      overlay.appendChild(fileInput);
      fileInput.addEventListener('change', function () {
        openFile(fileInput.files[0]);
        fileInput.value = '';
      });
      document.body.appendChild(overlay);
      showHint();

      var lastMouseUp = 0;
      function onMouseUp(e) {
        var now = Date.now();
        if (now - lastMouseUp < 80) return;
        lastMouseUp = now;
        setTimeout(handleSelection, 10);
      }
      function onKeyUp(e) {
        if (e.key === 'Shift' || e.key.startsWith('Arrow')) setTimeout(handleSelection, 10);
      }
      function onKeyDown(e) {
        if (e.altKey && (e.key === 'e' || e.key === 'E')) {
          e.preventDefault();
          askSelection('explain');
        } else if (e.altKey && (e.key === 't' || e.key === 'T')) {
          e.preventDefault();
          askSelection('translate');
        } else if (e.key === 'Escape') {
          if (popup) closePopup();
          else panel.close();
        }
      }

      document.addEventListener('mouseup', onMouseUp);
      document.addEventListener('keyup', onKeyUp);
      document.addEventListener('keydown', onKeyDown);

      panel = {
        close: function () {
          document.removeEventListener('mouseup', onMouseUp);
          document.removeEventListener('keyup', onKeyUp);
          document.removeEventListener('keydown', onKeyDown);
          overlay.remove();
          panel = null;
        },
      };
    }

    // -------------------------------------------------------- sidebar entry --
    function SidebarEntry(props) {
      return react.createElement(
        'button',
        {
          id: 'lit-reader-footer-btn',
          title: '文献阅读助手（Alt+L）',
          onClick: function () {
            var ctx = window.__dshLitReaderCtx;
            if (ctx) openPanel(ctx);
          },
        },
        props.wide ? '📖 文献' : '📖',
      );
    }

    exports.apply = function apply(ctx) {
      loadStyles();
      window.__dshLitReaderCtx = ctx;

      ctx.slots.inject('sidebar.footer.action', function () {
        return ctx.slots.register(
          { name: 'sidebar.footer.action', id: 'literature-reader', order: 90 },
          SidebarEntry,
        );
      });

      // Alt+L toggles the panel from anywhere in the GUI.
      function onGlobalKeyDown(e) {
        if (e.altKey && (e.key === 'l' || e.key === 'L')) {
          e.preventDefault();
          if (panel) panel.close();
          else openPanel(ctx);
        }
      }
      document.addEventListener('keydown', onGlobalKeyDown);

      return function () {
        document.removeEventListener('keydown', onGlobalKeyDown);
        if (panel) panel.close();
        window.__dshLitReaderCtx = null;
        var style = document.getElementById(STYLE_ID);
        if (style) style.remove();
      };
    };

    return module.exports;
  },
});
