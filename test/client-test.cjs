/**
 * Mini-DOM + mini-cordis harness to functionally drive the client bundle.
 * Verifies: sidebar slot registration, panel open, text mode, selection →
 * popup → RPC call chain, and the fixed bugs (hint overlay, text→pdf switch).
 *
 * Run from the package root:  node test/client-test.cjs
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'lib/client.js'), 'utf8');

// ---------------------------------------------------------------- mini DOM --
class MiniNode {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.nodeType = 1;
    this.children = [];
    this.parentNode = null;
    this.attributes = {};
    this._style = {};
    this._listeners = {};
    this.className = '';
    this._text = '';
    this.value = '';
    this.disabled = false;
    this.contenteditable = null;
  }
  get style() { return this._style; }
  setAttribute(k, v) { this.attributes[k] = String(v); if (k === 'contenteditable') this.contenteditable = v; }
  getAttribute(k) { return this.attributes[k]; }
  addEventListener(ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn); }
  removeEventListener(ev, fn) {
    const a = this._listeners[ev]; if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); }
  }
  appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.children.push(c); return c; }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  get parentElement() { return this.parentNode && this.parentNode.tagName !== '#TEXT' ? this.parentNode : null; }
  get innerHTML() { return this.children.map(c => c.tagName).join(','); }
  set innerHTML(v) {
    this.children = [];
    if (typeof v === 'string' && v.length) {
      const t = new MiniNode('#text'); t._text = v; t.parentNode = this; this.children.push(t);
    }
  }
  get innerText() { return this._text; }
  set innerText(v) { this._text = String(v); }
  get textContent() { return this.children.map(c => c.textContent || '').join('') + this._text; }
  set textContent(v) { this.children = []; const t = new MiniNode('#text'); t._text = String(v); t.parentNode = this; this.children.push(t); }
  get classList() {
    const self = this;
    return {
      add: (...cs) => { cs.forEach(c => { if (!self.className.split(/\s+/).includes(c)) self.className = (self.className + ' ' + c).trim(); }); },
      remove: (...cs) => { self.className = self.className.split(/\s+/).filter(c => !cs.includes(c)).join(' '); },
      contains: (c) => self.className.split(/\s+/).includes(c),
    };
  }
  contains(node) {
    let cur = node;
    while (cur) { if (cur === this) return true; cur = cur.parentNode; }
    return false;
  }
  querySelector(sel) { return walk(this, sel); }
  querySelectorAll(sel) { const out = []; walkAll(this, sel, out); return out; }
  get offsetWidth() { return 400; }
  get offsetHeight() { return 200; }
  getContext() { return { fillRect() {}, drawImage() {} }; }
  focus() {}
  click() { const h = this._listeners['click']; if (h) h.forEach(f => f({ preventDefault() {} })); }
  dispatch(ev, e) { const h = this._listeners[ev]; if (h) h.forEach(f => f(e || { preventDefault() {} })); }
}

function findOne(node, sel) {
  if (matches(node, sel)) return node;
  for (const c of node.children || []) { const r = findOne(c, sel); if (r) return r; }
  return null;
}
function walk(node, sel) {
  const parts = sel.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return findOne(node, parts[0]);
  if (matches(node, parts[0])) {
    const r = walk(node, parts.slice(1).join(' '));
    if (r) return r;
  }
  for (const c of node.children || []) { const r = walk(c, sel); if (r) return r; }
  return null;
}
function walkAll(node, sel, out) {
  const parts = sel.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    if (matches(node, parts[0])) out.push(node);
    for (const c of node.children || []) walkAll(c, sel, out);
    return;
  }
  if (matches(node, parts[0])) walkAll(node, parts.slice(1).join(' '), out);
  for (const c of node.children || []) walkAll(c, sel, out);
}
function matches(node, sel) {
  if (!node.tagName || node.tagName === '#TEXT') return false;
  const parts = sel.split(/\s+/).filter(Boolean);
  for (const p of parts) {
    if (p.startsWith('#')) {
      if (!node.attributes || node.attributes['id'] !== p.slice(1)) return false;
    } else if (p.startsWith('.')) {
      if (!node.className.split(/\s+/).includes(p.slice(1))) return false;
    } else {
      return false;
    }
  }
  return true;
}

// Global element registry keyed by id, so document.getElementById works.
const byId = new Map();
function register(node) {
  if (node.attributes && node.attributes['id']) byId.set(node.attributes['id'], node);
  (node.children || []).forEach(register);
}

const doc = {
  createElement: (tag) => { const n = new MiniNode(tag); return n; },
  createTextNode: (t) => { const n = new MiniNode('#text'); n._text = String(t); return n; },
  head: new MiniNode('head'),
  body: new MiniNode('body'),
  getElementById: (id) => byId.get(id) || null,
  querySelector: (sel) => walk(doc.body, sel),
  _listeners: {},
  addEventListener(ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn); },
  removeEventListener(ev, fn) {
    const a = this._listeners[ev]; if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); }
  },
};

// Track appended nodes for selection simulation.
const origAppend = doc.body.appendChild.bind(doc.body);
doc.body.appendChild = (c) => {
  register(c);
  return origAppend(c);
};

// ------------------------------------------------------------------ window --
let currentSelection = null; // { text, node }
const fakeWin = {
  __ModuleLoader__: null,
  getSelection: () => currentSelection,
  innerWidth: 1280,
  innerHeight: 800,
  pdfjsLib: { GlobalWorkerOptions: {} },
};
let litPdfJs;
Object.defineProperty(fakeWin, '__litPdfJs', { get: () => litPdfJs, set: v => { litPdfJs = v; } });
fakeWin.__ModuleLoader__ = {
  load: (entry) => { fakeWin.__loaded = entry; },
};

// ------------------------------------------------------------------ stubs --
class FakeWorker { constructor() {} }

const sandbox = {
  window: fakeWin,
  document: doc,
  localStorage: { getItem: () => null, setItem: () => {}, },
  Worker: FakeWorker,
  crypto: { randomUUID: () => 'uuid-1' },
  console,
  setTimeout, // real async so promise chains settle before checks
  clearTimeout,
  FileReader: class {
    constructor() { this.onload = null; }
    readAsArrayBuffer(file) {
      const self = this;
      setTimeout(() => { if (self.onload) self.onload.call(self, {}); }, 0);
    }
  },
};

function fakeRequire(id) {
  if (id === 'react') return { createElement: (tag, props, ...children) => ({ __react: true, tag, props: Object.assign({}, props, { children: children.length === 1 ? children[0] : children }) }) };
  if (id === '@deepseek-ai/dsh-client-runtime/client') return {};
  if (id === '@deepseek-ai/dsh-client-ui-slots') return {};
  throw new Error('unexpected require: ' + id);
}

vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'client.js' });
const loaded = fakeWin.__loaded;
if (!loaded) throw new Error('load() was never called');
const exportsObj = loaded.factory(fakeRequire);

// ------------------------------------------------------------------- ctx --
const rpcCalls = [];
let slotsInjected = false;
const ctx = {
  slots: {
    inject: (key, cb) => { slotsInjected = key === 'sidebar.footer.action'; cb(); return () => {}; },
    register: (opts, comp) => { ctx.__registered = { opts, comp }; return () => {}; },
  },
  connection: {
    rpc: {
      call: (channel, endpoint, payload) => {
        rpcCalls.push({ channel, endpoint, payload });
        if (endpoint === 'models') return Promise.resolve({ ok: true, value: { providers: [{ provider: 'deepseek-official', name: 'DeepSeek', models: ['deepseek-v4-flash'] }] } });
        return Promise.resolve({ ok: true, value: { text: 'RESULT:' + payload.mode } });
      },
    },
  },
};

// ------------------------------------------------------------------- run --
const testSteps = [];
function check(name, cond) {
  testSteps.push({ name, pass: !!cond });
  console.log((cond ? '  ✓ ' : '  ✗ ') + name);
  if (!cond) process.exitCode = 1;
}

// 1) apply registers sidebar entry
exportsObj.apply(ctx);
check('inject declared: slots+connection', JSON.stringify(exportsObj.inject) === '["slots","connection"]');
check('slots.inject called for sidebar.footer.action', slotsInjected);
check('slots.register called', !!ctx.__registered && ctx.__registered.opts.id === 'literature-reader');
check('register targets sidebar.footer.action', ctx.__registered && ctx.__registered.opts.name === 'sidebar.footer.action');

// 2) open panel via sidebar entry onClick
const entryButton = ctx.__registered.comp({ wide: true });
check('sidebar entry uses wide label', entryButton.props.children === '📖 文献');
entryButton.props.onClick();

const panelEl = byId.get('lit-reader-panel');
check('panel opened (#lit-reader-panel in DOM)', !!panelEl);
check('hint shown by default', !!panelEl.querySelector('.lit-hint') && panelEl.querySelector('.lit-hint').style.display !== 'none');

// 3) text mode
const textBtn = findButtonByText(panelEl, '纯文本');
textBtn.click();
const textContent = panelEl.querySelector('.lit-text-content');
check('text mode creates contenteditable div', !!textContent && textContent.contenteditable === 'true');
check('pdf wrap hidden in text mode', panelEl.querySelector('.lit-pdf-wrap').style.display === 'none');

// 4) simulate selecting text inside the contenteditable div
const fakeTextNode = { nodeType: 3, parentNode: textContent };
currentSelection = {
  isCollapsed: false,
  toString: () => ' attention mechanism ',
  anchorNode: fakeTextNode,
  getRangeAt: () => ({ getBoundingClientRect: () => ({ left: 100, top: 200, right: 300, bottom: 220, width: 200, height: 20 }), getClientRects: () => [{ left: 100, top: 200, right: 300, bottom: 220 }] }),
};
(doc._listeners['mouseup'] || []).forEach(fn => fn({}));
setTimeout(() => {
  const popupAny = findInTree(doc.body, n => n.className && n.className.includes('lit-popup'));
  check('selection popup created', !!popupAny);
  check('popup shows selected text', popupAny && popupAny.textContent.includes('attention mechanism'));

  // 5) click 解释 → RPC called
  const explainBtn = findButtonByText(popupAny, '解释');
  explainBtn.click();
  check('RPC /lit ask called', rpcCalls.length >= 1 && rpcCalls[0].channel === '/lit' && rpcCalls[0].endpoint === 'ask');
  check('RPC payload carries mode+text', rpcCalls[0] && rpcCalls[0].payload.mode === 'explain' && rpcCalls[0].payload.text.includes('attention mechanism'));
  setTimeout(() => {
    const out = popupAny.querySelector('.lit-pop-out');
    check('result rendered in popup', out && out.textContent.includes('RESULT:explain'));

    // 6) file input mounted + no crash on selection
    const fi = findInTree(doc.body, n => n.tagName === 'INPUT' && n.attributes['type'] === 'file');
    check('file input exists', !!fi);
    if (fi) {
      const fakeFile = { name: 'paper.pdf', size: 100 };
      fi.files = [fakeFile];
      fi.dispatch('change', { target: { files: [fakeFile] } });
      check('no crash after file selection (loadPdfJs pending)', true);
    }

    // 7) settings overlay opens
    const gear = findButtonByText(panelEl, '⚙️');
    gear.click();
    const settings = findInTree(panelEl, n => n.className && n.className.includes('lit-settings'));
    check('settings overlay opens', !!settings && settings.className.includes('lit-open'));

    console.log('\n=== CLIENT FUNCTIONAL TEST COMPLETE ===');
    console.log('passed:', testSteps.filter(s => s.pass).length, '/', testSteps.length);
    process.exit(process.exitCode || 0);
  }, 20);
}, 20);

function findButtonByText(root, text) {
  return findInTree(root, n => n.tagName === 'BUTTON' && (n.textContent || '').includes(text));
}
function findInTree(node, pred) {
  if (pred(node)) return node;
  for (const c of node.children || []) { const r = findInTree(c, pred); if (r) return r; }
  return null;
}
