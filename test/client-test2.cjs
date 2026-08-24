/**
 * Test 2: hotkey path (Alt+E / Alt+T) and PDF success path.
 * Reuses the mini-DOM harness pattern from client-test.cjs.
 *
 * Run from the package root:  node test/client-test2.cjs
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'lib/client.js'), 'utf8');

// ---- mini DOM harness (see client-test.cjs for the full design) ----
class MiniNode {
  constructor(tag) {
    this.tagName = tag.toUpperCase(); this.nodeType = 1; this.children = []; this.parentNode = null;
    this.attributes = {}; this._style = {}; this._listeners = {}; this.className = ''; this._text = '';
    this.value = ''; this.disabled = false; this.contenteditable = null;
  }
  get style() { return this._style; }
  setAttribute(k, v) { this.attributes[k] = String(v); if (k === 'contenteditable') this.contenteditable = v; }
  getAttribute(k) { return this.attributes[k]; }
  addEventListener(ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn); }
  removeEventListener(ev, fn) { const a = this._listeners[ev]; if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } }
  appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.children.push(c); return c; }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  get parentElement() { return this.parentNode && this.parentNode.tagName !== '#TEXT' ? this.parentNode : null; }
  get innerHTML() { return this.children.map(c => c.tagName).join(','); }
  set innerHTML(v) { this.children = []; if (typeof v === 'string' && v.length) { const t = new MiniNode('#text'); t._text = v; t.parentNode = this; this.children.push(t); } }
  get innerText() { return this._text; }
  set innerText(v) { this._text = String(v); }
  get textContent() { return this.children.map(c => c.textContent || '').join('') + this._text; }
  set textContent(v) { this.children = []; const t = new MiniNode('#text'); t._text = String(v); t.parentNode = this; this.children.push(t); }
  get classList() {
    const self = this;
    return {
      add: (...cs) => cs.forEach(c => { if (!self.className.split(/\s+/).includes(c)) self.className = (self.className + ' ' + c).trim(); }),
      remove: (...cs) => { self.className = self.className.split(/\s+/).filter(c => !cs.includes(c)).join(' '); },
      contains: (c) => self.className.split(/\s+/).includes(c),
    };
  }
  contains(node) { let cur = node; while (cur) { if (cur === this) return true; cur = cur.parentNode; } return false; }
  querySelector(sel) { return walk(this, sel); }
  querySelectorAll(sel) { const out = []; walkAll(this, sel, out); return out; }
  get offsetWidth() { return 400; }
  get offsetHeight() { return 200; }
  getContext() { return { fillRect() {}, drawImage() {} }; }
  focus() {}
  click() { const h = this._listeners['click']; if (h) h.forEach(f => f({ preventDefault() {} })); }
  dispatch(ev, e) { const h = this._listeners[ev]; if (h) h.forEach(f => f(e || { preventDefault() {} })); }
}
function findOne(node, sel) { if (matches(node, sel)) return node; for (const c of node.children || []) { const r = findOne(c, sel); if (r) return r; } return null; }
function walk(node, sel) {
  const parts = sel.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return findOne(node, parts[0]);
  if (matches(node, parts[0])) { const r = walk(node, parts.slice(1).join(' ')); if (r) return r; }
  for (const c of node.children || []) { const r = walk(c, sel); if (r) return r; }
  return null;
}
function walkAll(node, sel, out) {
  const parts = sel.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) { if (matches(node, parts[0])) out.push(node); for (const c of node.children || []) walkAll(c, sel, out); return; }
  if (matches(node, parts[0])) walkAll(node, parts.slice(1).join(' '), out);
  for (const c of node.children || []) walkAll(c, sel, out);
}
function matches(node, sel) {
  if (!node.tagName || node.tagName === '#TEXT') return false;
  const parts = sel.split(/\s+/).filter(Boolean);
  for (const p of parts) {
    if (p.startsWith('#')) { if (!node.attributes || node.attributes['id'] !== p.slice(1)) return false; }
    else if (p.startsWith('.')) { if (!node.className.split(/\s+/).includes(p.slice(1))) return false; }
    else return false;
  }
  return true;
}
const byId = new Map();
function register(node) { if (node.attributes && node.attributes['id']) byId.set(node.attributes['id'], node); (node.children || []).forEach(register); }
const doc = {
  createElement: (tag) => new MiniNode(tag),
  createTextNode: (t) => { const n = new MiniNode('#text'); n._text = String(t); return n; },
  head: new MiniNode('head'), body: new MiniNode('body'),
  getElementById: (id) => byId.get(id) || null,
  querySelector: (sel) => walk(doc.body, sel),
  _listeners: {},
  addEventListener(ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn); },
  removeEventListener(ev, fn) { const a = this._listeners[ev]; if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } },
};
doc.body.appendChild = (c) => { register(c); return MiniNode.prototype.appendChild.call(doc.body, c); };

let currentSelection = null;
const fakeWin = {
  __ModuleLoader__: null, __litPdfJs: null,
  getSelection: () => currentSelection,
  innerWidth: 1280, innerHeight: 800,
  pdfjsLib: { GlobalWorkerOptions: {} },
};
fakeWin.__ModuleLoader__ = { load: (e) => { fakeWin.__loaded = e; } };

const sandbox = {
  window: fakeWin, document: doc,
  localStorage: { getItem: () => null, setItem: () => {} },
  Worker: class {}, crypto: { randomUUID: () => 'uuid-2' },
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
const exportsObj = fakeWin.__loaded.factory(fakeRequire);

const rpcCalls = [];
const ctx = {
  slots: {
    inject: (key, cb) => { cb(); return () => {}; },
    register: (opts, comp) => { ctx.__reg = { opts, comp }; return () => {}; },
  },
  connection: { rpc: { call: (ch, ep, payload) => { rpcCalls.push({ ch, ep, payload }); return Promise.resolve({ ok: true, value: { text: 'R:' + payload.mode } }); } } },
};
exportsObj.apply(ctx);
ctx.__reg.comp({ wide: true }).props.onClick();
const panelEl = byId.get('lit-reader-panel');

const steps = [];
function check(name, cond) { steps.push({ name, pass: !!cond }); console.log((cond ? '  ✓ ' : '  ✗ ') + name); if (!cond) process.exitCode = 1; }
function findInTree(node, pred) { if (pred(node)) return node; for (const c of node.children || []) { const r = findInTree(c, pred); if (r) return r; } return null; }
function findBtn(root, text) { return findInTree(root, n => n.tagName === 'BUTTON' && (n.textContent || '').includes(text)); }

// ---- enter text mode so there is a selectable surface ----
findBtn(panelEl, '纯文本').click();
const tc = findInTree(panelEl, n => n.tagName === 'DIV' && n.className.includes('lit-text-content'));
tc.innerText = 'kernel density estimation (KDE) is a non-parametric method';
currentSelection = {
  isCollapsed: false,
  toString: () => 'kernel density estimation',
  anchorNode: { nodeType: 3, parentNode: tc },
  getRangeAt: () => ({ getBoundingClientRect: () => ({ left: 100, top: 200, right: 300, bottom: 220, width: 200, height: 20 }) }),
};

// ---- hotkeys ----
const keyEvt = (key, altKey) => ({ key, altKey, preventDefault() {} });
(doc._listeners['keydown'] || []).forEach(fn => fn(keyEvt('e', true)));
const popup = findInTree(doc.body, n => n.className && n.className.includes('lit-popup'));
check('Alt+E creates popup', !!popup);
check('Alt+E sends explain RPC', rpcCalls.some(c => c.ep === 'ask' && c.payload.mode === 'explain' && c.payload.text.includes('kernel density')));

(doc._listeners['keydown'] || []).forEach(fn => fn(keyEvt('t', true)));
check('Alt+T sends translate RPC', rpcCalls.some(c => c.ep === 'ask' && c.payload.mode === 'translate'));

// ---- PDF success path ----
const fakePdfjs = {
  GlobalWorkerOptions: {},
  getDocument: () => ({ promise: Promise.resolve({
    numPages: 3,
    getPage: (n) => Promise.resolve({
      getViewport: (o) => ({ width: 595, height: 842 }),
      render: () => ({ promise: Promise.resolve() }),
      getTextContent: () => Promise.resolve({ items: [{ str: 'hello pdf' }] }),
      cleanup: () => {},
    }),
  }) }),
  TextLayer: class { constructor() {} render() { return { promise: Promise.resolve() }; } },
};
fakeWin.__litPdfJs = fakePdfjs;
const fi = findInTree(doc.body, n => n.tagName === 'INPUT' && n.attributes['type'] === 'file');
fi.files = [{ name: 'paper.pdf', size: 100 }];
fi.dispatch('change', { target: { files: fi.files } });
setTimeout(() => {
  const page = findInTree(panelEl, n => n.className && n.className.includes('lit-page'));
  check('PDF page rendered', !!page);
  const canvas = findInTree(panelEl, n => n.tagName === 'CANVAS');
  check('PDF canvas rendered', !!canvas);
  const textLayer = findInTree(panelEl, n => n.className && n.className.includes('lit-text-layer'));
  check('PDF text layer created', !!textLayer);
  const status = findInTree(panelEl, n => n.className && n.className.includes('lit-status'));
  check('status shows page count', status && status.textContent.includes('1 / 3'));
  const next = findBtn(panelEl, '▶');
  next.click();
  setTimeout(() => {
    check('next page keeps rendering (no crash)', true);
    const status2 = findInTree(panelEl, n => n.className && n.className.includes('lit-status'));
    check('status advances to page 2', status2 && status2.textContent.includes('2 / 3'));
    console.log('\n=== TEST 2 COMPLETE ===');
    console.log('passed:', steps.filter(s => s.pass).length, '/', steps.length);
    process.exit(process.exitCode || 0);
  }, 30);
}, 30);
