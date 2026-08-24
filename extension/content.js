/**
 * Content script: listens for text selection on any page, shows a popup near
 * the selection with Explain / Translate buttons, and asks the background
 * worker to call the local DSH backend. Hotkeys: Alt+E / Alt+T.
 */
(function () {
  'use strict';

  let popup = null;
  let settings = { provider: '', model: '' };

  chrome.storage.sync.get(['provider', 'model'], (s) => {
    if (s) settings = Object.assign(settings, s);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') {
      if (changes.provider) settings.provider = changes.provider.newValue || '';
      if (changes.model) settings.model = changes.model.newValue || '';
    }
  });

  function closePopup() {
    if (popup) {
      popup.remove();
      popup = null;
    }
  }

  function runAsk(mode, text, outEl) {
    if (!text.trim()) return;
    outEl.className = 'lit-ext-out lit-ext-loading';
    outEl.textContent = mode === 'translate' ? '翻译中…' : '解释中…';
    chrome.runtime.sendMessage({ type: 'ask', text: text.trim(), mode, provider: settings.provider, model: settings.model }, (res) => {
      if (chrome.runtime.lastError) {
        outEl.className = 'lit-ext-out';
        outEl.textContent = '❌ ' + (chrome.runtime.lastError.message || '扩展错误');
        return;
      }
      outEl.className = 'lit-ext-out';
      if (res && res.ok) outEl.textContent = res.value.text || '(空响应)';
      else outEl.textContent = '❌ ' + ((res && res.error) || '请求失败');
    });
  }

  function showPopup(rect, text) {
    closePopup();
    const out = document.createElement('div');
    out.className = 'lit-ext-out';
    const card = document.createElement('div');
    card.className = 'lit-ext-popup';
    card.innerHTML =
      '<div class="lit-ext-text"></div>' +
      '<div class="lit-ext-actions">' +
      '<button data-mode="explain">📖 解释</button>' +
      '<button data-mode="translate">🌐 翻译</button>' +
      '<button data-close>✕</button>' +
      '</div>';
    card.appendChild(out);
    card.querySelector('.lit-ext-text').textContent = text.length > 140 ? text.slice(0, 140) + '…' : text;
    card.querySelector('[data-mode="explain"]').addEventListener('click', () => runAsk('explain', text, out));
    card.querySelector('[data-mode="translate"]').addEventListener('click', () => runAsk('translate', text, out));
    card.querySelector('[data-close]').addEventListener('click', closePopup);
    document.documentElement.appendChild(card);
    popup = card;
    const margin = 12;
    let left = rect.left + window.scrollX;
    let top = rect.bottom + window.scrollY + margin;
    if (top + card.offsetHeight > window.scrollY + window.innerHeight) {
      top = Math.max(8 + window.scrollY, rect.top + window.scrollY - card.offsetHeight - margin);
    }
    left = Math.min(Math.max(8, left), window.scrollX + window.innerWidth - card.offsetWidth - 8);
    card.style.left = left + 'px';
    card.style.top = top + 'px';
  }

  function handleSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) { closePopup(); return; }
    const text = sel.toString().trim();
    if (!text || text.length < 2) { closePopup(); return; }
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      const first = range.getClientRects()[0];
      if (!first) return;
      showPopup(first, text);
    } else {
      showPopup(rect, text);
    }
  }

  // Mouse selection popup.
  let lastMouseUp = 0;
  document.addEventListener('mouseup', () => {
    const now = Date.now();
    if (now - lastMouseUp < 80) return;
    lastMouseUp = now;
    setTimeout(handleSelection, 10);
  });

  // Hotkeys.
  document.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 'e' || e.key === 'E')) {
      e.preventDefault();
      const sel = window.getSelection();
      const text = sel && !sel.isCollapsed ? sel.toString().trim() : '';
      if (!text) return;
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      showPopup(rect.width ? rect : range.getClientRects()[0], text);
      const out = popup ? popup.querySelector('.lit-ext-out') : null;
      if (out) runAsk('explain', text, out);
    } else if (e.altKey && (e.key === 't' || e.key === 'T')) {
      e.preventDefault();
      const sel = window.getSelection();
      const text = sel && !sel.isCollapsed ? sel.toString().trim() : '';
      if (!text) return;
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      showPopup(rect.width ? rect : range.getClientRects()[0], text);
      const out = popup ? popup.querySelector('.lit-ext-out') : null;
      if (out) runAsk('translate', text, out);
    } else if (e.key === 'Escape') {
      closePopup();
    }
  });

  // Clicking elsewhere closes the popup (unless clicking inside it).
  document.addEventListener('mousedown', (e) => {
    if (popup && !popup.contains(e.target)) closePopup();
  });
})();
