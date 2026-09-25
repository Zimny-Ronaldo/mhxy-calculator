/**
 * 测试用迷你 DOM —— 零依赖，够跑本项目的 UI 冒烟测试。
 *
 * 支持：标签/属性解析、#id / .class / tag / [attr] / [attr=值] / 后代组合选择器、
 *       classList、dataset、type / value / checked / disabled / hidden、
 *       innerHTML 读写、textContent、closest、事件绑定与触发（带冒泡）。
 *
 * 文本与子元素按原始顺序保存在 children 里（文本为 #TEXT 节点），
 * 因此 innerHTML 能原样还原混合内容。
 * 只解析 <body> 内容；<script> / <style> 内容当作文本节点整体吃进去。
 */

const VOID = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
const RAW = new Set(['SCRIPT', 'STYLE']);

class El {
  constructor(tag){
    this.tagName = String(tag).toUpperCase();
    this.attrs = {};
    this.children = [];
    this.parent = null;
    this._handlers = {};
    this._value = null;
    this._checked = null;
    this._disabled = null;
    this._hidden = null;
    this._text = '';
    this.style = {};          // 只记录 JS 赋的样式（模板里的 style="" 仍走 attrs）
  }

  /* ---------- 属性 ---------- */
  get id(){ return this.attrs.id || ''; }
  get className(){ return this.attrs.class || ''; }
  set className(v){ this.attrs.class = String(v); }
  getAttribute(k){ return k in this.attrs ? this.attrs[k] : null; }
  setAttribute(k, v){ this.attrs[k] = String(v); }
  removeAttribute(k){ delete this.attrs[k]; }
  hasAttribute(k){ return k in this.attrs; }

  get classList(){
    const self = this;
    const set = () => (self.attrs.class || '').split(/\s+/).filter(Boolean);
    const write = arr => { self.attrs.class = [...new Set(arr)].join(' '); };
    return {
      contains: c => set().includes(c),
      add: c => { const a = set(); if (!a.includes(c)) { a.push(c); write(a); } },
      remove: c => write(set().filter(x => x !== c)),
      toggle: (c, force) => {
        const on = force === undefined ? !set().includes(c) : !!force;
        on ? self.classList.add(c) : self.classList.remove(c);
        return on;
      },
    };
  }

  get dataset(){
    const self = this;
    const keyOf = k => 'data-' + String(k).replace(/[A-Z]/g, m => '-' + m.toLowerCase());
    return new Proxy({}, {
      get: (_, k) => self.attrs[keyOf(k)],
      set: (_, k, v) => { self.attrs[keyOf(k)] = String(v); return true; },
      has: (_, k) => keyOf(k) in self.attrs,
    });
  }

  /* ---------- 表单态 ---------- */
  get type(){ return this.attrs.type || ''; }
  get min(){ return this.attrs.min; }
  set min(v){ this.attrs.min = String(v); }
  get max(){ return this.attrs.max; }
  set max(v){ this.attrs.max = String(v); }
  /** 迷你 DOM 没有布局引擎：返回一个默认矩形，测试可用 el._rect 覆盖 */
  getBoundingClientRect(){
    return this._rect || { left:0, top:0, width:200, height:22, right:200, bottom:22, x:0, y:0 };
  }
  get value(){
    if (this.tagName === 'SELECT'){                       // select 取「选中项」的值
      if (this._value !== null) return this._value;
      const opts = this.querySelectorAll('option');
      const sel = opts.find(o => o.hasAttribute('selected')) || opts[0];
      return sel ? (sel.getAttribute('value') ?? '') : '';
    }
    return this._value !== null ? this._value : (this.attrs.value ?? '');
  }
  set value(v){
    this._value = String(v);
    if (this.tagName === 'SELECT'){                       // 赋值时同步 selected
      for (const o of this.querySelectorAll('option')){
        if (o.getAttribute('value') === String(v)) o.attrs.selected = '';
        else delete o.attrs.selected;
      }
    }
  }
  get checked(){ return this._checked !== null ? this._checked : this.hasAttribute('checked'); }
  set checked(v){ this._checked = !!v; }
  get disabled(){ return this._disabled !== null ? this._disabled : this.hasAttribute('disabled'); }
  set disabled(v){ this._disabled = !!v; }
  get hidden(){ return this._hidden !== null ? this._hidden : this.hasAttribute('hidden'); }
  set hidden(v){ this._hidden = !!v; }

  /* ---------- 内容 ---------- */
  get innerHTML(){ return this.children.map(serialize).join(''); }
  set innerHTML(html){
    this.children = [];
    for (const node of parse(String(html), this)) this.appendChild(node);
  }
  get textContent(){
    return this.children.map(c => (c.tagName === '#TEXT' ? c._text : c.textContent)).join('');
  }
  set textContent(v){
    this.children = [];
    const t = new El('#TEXT');
    t._text = String(v);
    this.appendChild(t);
  }

  appendChild(c){ if (c){ c.parent = this; this.children.push(c); } return c; }
  removeChild(c){ this.children = this.children.filter(x => x !== c); return c; }

  /* ---------- 选择器 ---------- */
  matches(sel){ return matchAny(this, sel); }
  closest(sel){
    let n = this;
    while (n){ if (n.matches && n.matches(sel)) return n; n = n.parent; }
    return null;
  }
  querySelectorAll(sel){
    const out = [];
    const walk = node => {
      for (const c of node.children){
        if (c.tagName !== '#TEXT' && c.matches(sel)) out.push(c);
        walk(c);
      }
    };
    walk(this);
    return out;
  }
  querySelector(sel){ return this.querySelectorAll(sel)[0] || null; }

  /* ---------- 事件（带冒泡，工具里大量用事件委托） ---------- */
  addEventListener(type, fn){ (this._handlers[type] ||= []).push(fn); }
  removeEventListener(type, fn){ this._handlers[type] = (this._handlers[type] || []).filter(f => f !== fn); }
  fire(type, ev = {}){
    ev.target ||= this;
    ev.preventDefault ||= () => {};
    let node = this;
    while (node){
      const hs = node._handlers && node._handlers[type];
      if (hs) hs.forEach(f => f(ev));
      node = node.parent;
    }
    return ev;
  }
}

/* ============================================================
   解析
   ============================================================ */
function parse(html, parent){
  const nodes = [];
  const stack = [{ el: null, list: nodes }];
  let i = 0;

  const push = node => {
    const top = stack[stack.length - 1];
    if (top.el){ node.parent = top.el; top.el.children.push(node); }
    else top.list.push(node);
  };
  const addText = text => {
    if (!text) return;
    const t = new El('#TEXT');
    t._text = decodeEntities(text);
    push(t);
  };

  while (i < html.length){
    const lt = html.indexOf('<', i);
    if (lt < 0){ addText(html.slice(i)); break; }
    if (lt > i) addText(html.slice(i, lt));

    if (html.startsWith('<!--', lt)){ const e = html.indexOf('-->', lt); i = e < 0 ? html.length : e + 3; continue; }
    if (html.startsWith('<!', lt)){ const e = html.indexOf('>', lt); i = e < 0 ? html.length : e + 1; continue; }

    const gt = html.indexOf('>', lt);
    if (gt < 0) break;
    const raw = html.slice(lt + 1, gt);
    const selfClose = raw.endsWith('/');
    const body = selfClose ? raw.slice(0, -1) : raw;
    i = gt + 1;

    if (body.startsWith('/')){                                   // 闭合标签
      const name = body.slice(1).trim().toUpperCase();
      for (let k = stack.length - 1; k > 0; k--){
        if (stack[k].el && stack[k].el.tagName === name){ stack.length = k; break; }
      }
      continue;
    }

    const m = body.match(/^([A-Za-z][\w-]*)([\s\S]*)$/);
    if (!m) continue;
    const el = new El(m[1]);
    for (const [k, v] of parseAttrs(m[2])) el.attrs[k] = v;
    push(el);

    if (RAW.has(el.tagName)){                                    // script/style 内容原样吃进去
      const close = html.toLowerCase().indexOf('</' + m[1].toLowerCase(), i);
      addText(html.slice(i, close < 0 ? html.length : close));
      i = close < 0 ? html.length : close;
      continue;
    }
    if (!VOID.has(el.tagName.toLowerCase()) && !selfClose) stack.push({ el, list: null });
  }
  return nodes;
}

function parseAttrs(str){
  const out = [];
  const re = /([\w:.-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m;
  while ((m = re.exec(str))){
    const v = m[2] ?? m[3] ?? m[4];
    out.push([m[1], v === undefined ? '' : decodeEntities(v)]);
  }
  return out;
}

const ENT = { amp:'&', lt:'<', gt:'>', quot:'"', apos:"'", nbsp:'\u00a0' };
const decodeEntities = s => s.replace(/&(#x?[\da-f]+|[a-z]+);/gi, (all, e) => {
  if (e[0] === '#'){
    const hex = e[1] === 'x' || e[1] === 'X';
    return String.fromCodePoint(parseInt(hex ? e.slice(2) : e.slice(1), hex ? 16 : 10));
  }
  return ENT[e.toLowerCase()] ?? all;
});
const escapeText = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function serialize(node){
  if (node.tagName === '#TEXT') return escapeText(node._text);
  const tag = node.tagName.toLowerCase();
  const attrs = Object.entries(node.attrs)
    .map(([k, v]) => (v === '' ? ` ${k}` : ` ${k}="${String(v).replace(/"/g, '&quot;')}"`)).join('');
  const inner = node.children.map(serialize).join('');
  return VOID.has(tag) ? `<${tag}${attrs}>` : `<${tag}${attrs}>${inner}</${tag}>`;
}

/* ============================================================
   选择器匹配
   ============================================================ */
function matchAny(el, sel){
  return String(sel).split(',').some(one => matchChain(el, one.trim()));
}
function matchChain(el, sel){
  const parts = sel.split(/\s+/).filter(Boolean);
  if (!matchCompound(el, parts[parts.length - 1])) return false;
  let node = el.parent, k = parts.length - 2;
  while (k >= 0 && node){
    if (matchCompound(node, parts[k])) k--;
    node = node.parent;
  }
  return k < 0;
}
function matchCompound(el, part){
  if (!el || !el.tagName || el.tagName === '#TEXT') return false;
  const tokens = part.match(/([#.]?[\w-]+|\[[^\]]+\])/g) || [];
  return tokens.every(tk => {
    if (tk[0] === '#') return el.id === tk.slice(1);
    if (tk[0] === '.') return el.classList.contains(tk.slice(1));
    if (tk[0] === '['){
      const m = tk.slice(1, -1).match(/^([\w-]+)(?:=["']?([^"'\]]*)["']?)?$/);
      if (!m) return false;
      return m[2] === undefined ? el.hasAttribute(m[1]) : String(el.getAttribute(m[1])) === m[2];
    }
    return el.tagName === tk.toUpperCase();
  });
}

/* ============================================================
   安装全局 document / window 环境
   ============================================================ */
export function installDOM(html){
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const root = new El('html');
  const body = new El('body');
  root.appendChild(body);
  for (const node of parse(bodyMatch ? bodyMatch[1] : html, body)) body.appendChild(node);

  const islands = {};
  for (const m of html.matchAll(/<script type="application\/json" id="([^"]+)">([\s\S]*?)<\/script>/g)){
    islands[m[1]] = m[2];
  }

  const document = {
    body,
    documentElement: root,
    getElementById(id){
      if (id in islands) return { textContent: islands[id] };    // 数据岛直接给出原始文本
      return body.querySelector('#' + id);
    },
    querySelector: sel => body.querySelector(sel),
    querySelectorAll: sel => body.querySelectorAll(sel),
    createElement: tag => new El(tag),
    addEventListener(){},
  };

  const g = globalThis;
  g.document = document;
  g.location = { hash: '' };
  g.requestAnimationFrame = fn => { fn(); return 1; };   // 同步执行，便于断言
  g.setTimeout = fn => { fn(); return 1; };
  g.clearTimeout = () => {};

  return { document, body, El };
}

export { El, parse, serialize };
