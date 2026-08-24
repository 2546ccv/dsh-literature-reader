/**
 * Background service worker: relays explain/translate requests to the local
 * DeepSeek Harness backend (http://127.0.0.1:3080/lit-http/ask), which reuses
 * the user's configured provider/model and token-saving one-shot policy.
 */
const BASE = 'http://127.0.0.1:3080/lit-http';

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && (msg.type === 'ask' || msg.type === 'models')) {
    const endpoint = msg.type === 'ask' ? '/ask' : '/models';
    const body = msg.type === 'ask' ? { text: msg.text, mode: msg.mode, provider: msg.provider, model: msg.model } : {};
    fetch(BASE + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(async (res) => {
        let data = null;
        try { data = await res.json(); } catch { data = null; }
        if (res.ok && data && data.ok) {
          sendResponse({ ok: true, value: data.value });
        } else {
          sendResponse({ ok: false, error: (data && data.error && data.error.message) || 'backend error ' + res.status });
        }
      })
      .catch((err) => {
        sendResponse({
          ok: false,
          error: '无法连接 DeepSeek Harness 后端（' + err.message + '）。请确认 dsh web 正在运行（127.0.0.1:3080）。',
        });
      });
    return true; // async response
  }
});

// Keep the service worker alive briefly for pending fetches.
chrome.runtime.onSuspend?.addListener(() => {});
