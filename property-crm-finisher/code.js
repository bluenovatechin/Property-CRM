// =====================================================================
// Property CRM — Prototype finisher (Figma plugin)
// Run once inside the "Property CRM — Responsive Prototype" file.
// Builds every remaining desktop + mobile screen, overlays, interactive
// component sets and wires all prototype links. Safe to re-run: it removes
// what it generated before and rebuilds.
// =====================================================================
const FONT = 'Plus Jakarta Sans';
let V = {}, S = {}, CS = {};
let MOB = false;            // current build mode
let PAGE = null;            // current page
const LINKS = [];           // pending prototype links for the current page
const STATS = { frames: 0, links: 0, missing: [] };

function say(msg) { try { figma.notify(msg, { timeout: 1600 }); } catch (e) {} }

async function init() {
  await Promise.all(['Medium', 'SemiBold', 'Bold', 'ExtraBold'].map(s => figma.loadFontAsync({ family: FONT, style: s })));
  const vars = await figma.variables.getLocalVariablesAsync('COLOR');
  for (const v of vars) V[v.name.replace(/^color\//, '')] = v;
  const ts = await figma.getLocalTextStylesAsync();
  for (const s of ts) S[s.name] = s;
  const cp = figma.root.children[0];
  await cp.loadAsync();
  for (const n of cp.findAllWithCriteria({ types: ['COMPONENT', 'COMPONENT_SET'] })) {
    if (n.type === 'COMPONENT_SET' || !n.parent || n.parent.type !== 'COMPONENT_SET') CS[n.name] = n;
  }
  const need = ['Button', 'Chip', 'Avatar', 'Field', 'Checkbox', 'Icon/home'];
  for (const k of need) if (!CS[k]) throw new Error('Missing component "' + k + '" on the first page. Run this plugin in the Property CRM file.');
  if (!V.primary) throw new Error('Missing Theme colour variables. Run this plugin in the Property CRM file.');
}

// ---------- paint / text / layout ----------
function P(c, o) {
  if (!V[c]) throw new Error('Unknown colour token: ' + c);
  const p = figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }, 'color', V[c]);
  if (o != null) return Object.assign({}, p, { opacity: o });
  return p;
}
async function T(s, st, c, o) {
  st = st || 'Body/M'; c = c || 'ink'; o = o || {};
  const t = figma.createText();
  await t.setTextStyleIdAsync(S[st].id);
  t.characters = String(s);
  t.fills = [P(c)];
  if (o.align) t.textAlignHorizontal = o.align;
  t.name = o.name || String(s).slice(0, 40);
  return t;
}
function newAL(dir) {
  const f = figma.createFrame();
  f.layoutMode = dir;
  f.primaryAxisSizingMode = 'AUTO';
  f.counterAxisSizingMode = 'AUTO';
  f.fills = [];
  f.clipsContent = false;
  return f;
}
function AL(dir, o) {
  o = o || {};
  const f = newAL(dir === 'H' ? 'HORIZONTAL' : 'VERTICAL');
  if (o.name) f.name = o.name;
  if (o.gap != null) f.itemSpacing = o.gap;
  if (o.p != null) {
    const p = o.p;
    const a = Array.isArray(p) ? (p.length === 2 ? [p[0], p[1], p[0], p[1]] : p) : [p, p, p, p];
    f.paddingTop = a[0]; f.paddingRight = a[1]; f.paddingBottom = a[2]; f.paddingLeft = a[3];
  }
  if (o.bg) f.fills = [P(o.bg, o.bgo)];
  if (o.r != null) f.cornerRadius = o.r;
  if (o.stroke) { f.strokes = [P(o.stroke)]; f.strokeWeight = o.sw || 1; f.strokeAlign = 'INSIDE'; }
  if (o.ai) f.counterAxisAlignItems = o.ai;
  if (o.jc) f.primaryAxisAlignItems = o.jc;
  if (o.wrap && f.layoutMode === 'HORIZONTAL') { f.layoutWrap = 'WRAP'; f.counterAxisSpacing = o.rowGap != null ? o.rowGap : (o.gap || 0); }
  if (o.clip != null) f.clipsContent = o.clip;
  return f;
}
function apd(par, n) { par.appendChild(n); return n; }
function add(par, ch, w, h) { par.appendChild(ch); if (w) ch.layoutSizingHorizontal = w; if (h) ch.layoutSizingVertical = h; return ch; }
async function addT(par, s, st, c, o) {
  o = o || {};
  const t = await T(s, st, c, o);
  par.appendChild(t);
  if (o.fill) { t.layoutSizingHorizontal = 'FILL'; t.textAutoResize = 'HEIGHT'; }
  return t;
}
function fixSize(f, w, h) { f.resize(w, h); f.primaryAxisSizingMode = 'FIXED'; f.counterAxisSizingMode = 'FIXED'; return f; }
function topLine(n) { n.strokes = [P('line')]; n.strokeTopWeight = 1; n.strokeBottomWeight = 0; n.strokeLeftWeight = 0; n.strokeRightWeight = 0; n.strokeAlign = 'INSIDE'; }
function bottomLine(n, c, w) { n.strokes = [P(c || 'line')]; n.strokeTopWeight = 0; n.strokeBottomWeight = w || 1; n.strokeLeftWeight = 0; n.strokeRightWeight = 0; n.strokeAlign = 'INSIDE'; }
// responsive helpers ---------------------------------------------------
// flex(): side-by-side wrapping row on desktop, a plain stack on mobile
function flex(name, gap) { return MOB ? AL('V', { gap: gap == null ? 16 : gap, name }) : AL('H', { gap: gap == null ? 20 : gap, wrap: true, ai: 'MIN', name }); }
// grid(): always wraps; children set their own min widths via mw()
function grid(name, gap) { return AL('H', { gap: gap == null ? 16 : gap, wrap: true, name }); }
function mw(n, d, m) { const v = MOB ? m : d; if (v) n.minWidth = v; return n; }
function grow(n, g) { if (!MOB) n.layoutGrow = g; return n; }

// ---------- component instances ----------
const pk = (set, name) => Object.keys(set.componentPropertyDefinitions).find(k => k.split('#')[0] === name);
const variant = (set, q) => set.children.find(c => Object.entries(q).every(([k, v]) => c.name.split(', ').includes(k + '=' + v)));
function tint(inst, c) { for (const v of inst.findAllWithCriteria({ types: ['VECTOR', 'ELLIPSE', 'RECTANGLE', 'LINE', 'BOOLEAN_OPERATION'] })) if (v.strokes && v.strokes.length) v.strokes = [P(c)]; return inst; }
function ic(name, size, c) { const comp = CS['Icon/' + name]; if (!comp) throw new Error('Missing icon ' + name); const i = comp.createInstance(); i.resize(size || 18, size || 18); tint(i, c || 'ink'); i.name = 'icon/' + name; return i; }
function btn(label, kind, size, icon) {
  kind = kind || 'Secondary'; size = size || 'M';
  const set = CS['Button'];
  const i = variant(set, { Kind: kind, Size: size, State: 'Default' }).createInstance();
  const pr = {}; pr[pk(set, 'Label')] = label;
  if (icon) { pr[pk(set, 'Show icon')] = true; pr[pk(set, 'Icon')] = CS['Icon/' + icon].id; }
  i.setProperties(pr); i.name = 'Button · ' + label; return i;
}
function chip(label, tone, d) { const set = CS['Chip']; const i = variant(set, { Tone: tone || 'Neutral' }).createInstance(); const pr = {}; pr[pk(set, 'Label')] = label; pr[pk(set, 'Dot')] = !!d; i.setProperties(pr); i.name = 'Chip · ' + label; return i; }
function avatar(ini, tone, size) { const set = CS['Avatar']; const i = variant(set, { Tone: tone || 'Primary', Size: size || 'M' }).createInstance(); const pr = {}; pr[pk(set, 'Initials')] = ini; i.setProperties(pr); i.name = 'Avatar · ' + ini; return i; }
function field(label, value, type, hint, state) {
  const set = CS['Field']; const i = variant(set, { Type: type || 'Text', State: state || 'Default' }).createInstance();
  const pr = {}; pr[pk(set, 'Label')] = label || ''; pr[pk(set, 'Value')] = value;
  if (hint) { pr[pk(set, 'Show hint')] = true; pr[pk(set, 'Hint')] = hint; }
  if (label === null) pr[pk(set, 'Show label')] = false;
  i.setProperties(pr); i.name = 'Field · ' + (label || value); return i;
}
function checkbox(label, on) { const set = CS['Checkbox']; const i = variant(set, { Checked: on === false ? 'False' : 'True' }).createInstance(); const pr = {}; pr[pk(set, 'Label')] = label; i.setProperties(pr); i.name = 'Checkbox · ' + label; return i; }

// ---------- composites ----------
function card(o) { o = o || {}; return AL('V', Object.assign({ bg: 'surface', stroke: 'line', r: 16, p: [20, 22], gap: 12, name: 'Card' }, o)); }
async function head(par, title, right) {
  const r = AL('H', { gap: 12, ai: 'CENTER', jc: 'SPACE_BETWEEN', name: 'Card head' }); add(par, r, 'FILL');
  const t = await addT(r, title, 'H3', 'ink'); t.layoutSizingHorizontal = 'FILL'; t.textAutoResize = 'HEIGHT';
  if (right) { if (typeof right === 'string') await addT(r, right, 'Small/M', 'muted'); else r.appendChild(right); }
  return r;
}
function hr(par) { const l = figma.createRectangle(); l.name = 'Divider'; l.resize(10, 1); l.fills = [P('line')]; par.appendChild(l); l.layoutSizingHorizontal = 'FILL'; return l; }
function bar(parts, h) { h = h || 10; const b = AL('H', { r: h / 2, clip: true, name: 'Bar', bg: 'surface-3', gap: 2 }); b.resize(100, h); b.counterAxisSizingMode = 'FIXED'; b.primaryAxisSizingMode = 'FIXED'; for (const [w, c] of parts) { const s = figma.createRectangle(); s.fills = [P(c)]; s.resize(10, h); b.appendChild(s); s.layoutSizingHorizontal = 'FILL'; s.layoutGrow = Math.max(1, Math.round(w * 10)); s.name = c; } return b; }
function progress(pct, c, h) { h = h || 8; const b = AL('H', { r: h / 2, clip: true, name: 'Progress', bg: 'surface-3' }); b.resize(100, h); b.counterAxisSizingMode = 'FIXED'; b.primaryAxisSizingMode = 'FIXED'; const s = figma.createRectangle(); s.fills = [P(c || 'primary')]; s.resize(10, h); s.cornerRadius = h / 2; b.appendChild(s); s.layoutSizingHorizontal = 'FILL'; s.layoutGrow = Math.max(1, Math.round(pct)); if (pct < 100) { const r = figma.createRectangle(); r.fills = []; r.resize(10, h); b.appendChild(r); r.layoutSizingHorizontal = 'FILL'; r.layoutGrow = Math.max(1, Math.round(100 - pct)); } return b; }
function dot(c, s) { s = s || 8; const e = figma.createEllipse(); e.resize(s, s); e.fills = [P(c)]; e.name = 'dot'; return e; }
function bubble(icon, tone, s) { s = s || 40; const b = AL('H', { r: 10, ai: 'CENTER', jc: 'CENTER', bg: tone + '-soft', name: 'Icon bubble' }); fixSize(b, s, s); b.appendChild(ic(icon, Math.round(s * 0.45), tone === 'primary' ? 'primary' : tone)); return b; }
async function stat(par, label, value, o) {
  o = o || {};
  const s = AL('V', { gap: 4, name: 'Stat · ' + label }); add(par, s, 'FILL');
  if (o.min) mw(s, o.min, o.mmin || o.min);
  await addT(s, label, 'Caption', 'muted'); await addT(s, value, o.st || 'Body/B', o.c || 'ink');
  if (o.sub) await addT(s, o.sub, 'Caption', 'faint');
  return s;
}
async function statBox(par, label, value, o) {
  o = o || {};
  const s = AL('V', { gap: 4, p: [14, 16], r: 12, bg: 'surface-2', name: 'Tile · ' + label }); add(par, s, 'FILL'); mw(s, o.min || 150, o.mmin || 140);
  await addT(s, label, 'Caption', 'muted'); await addT(s, value, 'Stat/S', o.c || 'ink'); return s;
}
async function kvRow(par, l, v, o) {
  o = o || {};
  const r = AL('H', { jc: 'SPACE_BETWEEN', ai: 'CENTER', p: [11, 0], gap: 12, name: 'Row · ' + l }); add(par, r, 'FILL'); if (!o.noLine) topLine(r);
  await addT(r, l, 'Small/M', 'muted');
  if (typeof v === 'string') { const t = await addT(r, v, 'Small/B', o.c || 'ink', { align: 'RIGHT' }); } else r.appendChild(v);
  return r;
}
async function trow(par, cells, o) {
  o = o || {};
  const r = AL('H', { gap: 12, ai: 'CENTER', p: o.p || [12, 20], name: o.name || 'Row', bg: o.bg }); add(par, r, 'FILL');
  if (!o.last && !o.header) bottomLine(r);
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]; const w = o.w ? o.w[i] : 1;
    const box = AL('H', { ai: 'CENTER', name: 'cell' }); r.appendChild(box);
    if (typeof w === 'number' && w > 10) { box.resize(w, 20); box.layoutSizingHorizontal = 'FIXED'; } else { box.layoutSizingHorizontal = 'FILL'; box.layoutGrow = Math.max(1, Math.round(w * 10)); }
    box.layoutSizingVertical = 'HUG';
    if (o.align && o.align[i] === 'R') box.primaryAxisAlignItems = 'MAX';
    if (c && typeof c === 'object' && c.type) box.appendChild(c);
    else { const st = o.header ? 'Overline' : (o.bold && o.bold[i]) ? 'Body/B' : 'Body/M'; const col = o.header ? 'muted' : (o.mute && o.mute[i]) ? 'muted' : 'ink'; const t = await T(c, st, col); box.appendChild(t); }
  }
  return r;
}
// A table card. On mobile the rows sit in a horizontally scrollable strip.
async function table(par, title, right, cols, rows, o) {
  o = o || {};
  const c = card({ p: [20, 0, 6, 0], gap: 0, name: title }); add(par, c, 'FILL');
  if (title) {
    const h = AL('H', { p: [0, MOB ? 16 : 22, 12, MOB ? 16 : 22], jc: 'SPACE_BETWEEN', ai: 'CENTER', gap: 10, name: 'Card head' }); add(c, h, 'FILL');
    await addT(h, title, 'H3', 'ink');
    if (right) { if (typeof right === 'string') await addT(h, right, 'Small/M', 'muted'); else h.appendChild(right); }
  } else c.paddingTop = 0;
  let host = c;
  if (MOB) {
    const sc = AL('V', { name: 'Scroll · table', clip: true }); add(c, sc, 'FILL'); sc.overflowDirection = 'HORIZONTAL';
    const inner = AL('V', { name: 'Table' }); sc.appendChild(inner); inner.resize(o.mobileWidth || 640, 10); inner.counterAxisSizingMode = 'FIXED'; inner.primaryAxisSizingMode = 'AUTO';
    host = inner;
  }
  const pad = MOB ? 16 : 22;
  await trow(host, cols, { header: true, w: o.w, p: [10, pad], bg: 'surface-2', align: o.align });
  const made = [];
  for (let i = 0; i < rows.length; i++) made.push(await trow(host, rows[i], { w: o.w, p: [12, pad], bold: o.bold, mute: o.mute, align: o.align, last: i === rows.length - 1, name: (o.rowName || 'Row') + ' · ' + (i + 1) }));
  return { card: c, rows: made };
}
async function link(label, icon) { const a = AL('H', { gap: 6, ai: 'CENTER', name: 'Link · ' + label }); await addT(a, label, 'Small/B', 'primary'); if (icon !== false) a.appendChild(ic(icon || 'arrow-right', 16, 'primary')); return a; }
async function pageHead(main, over, title, actions, chips) {
  actions = actions || []; chips = chips || [];
  const h = AL('H', { gap: 16, ai: MOB ? 'MIN' : 'MAX', jc: 'SPACE_BETWEEN', wrap: true, rowGap: 14, name: 'Header' }); add(main, h, 'FILL');
  const l = AL('V', { gap: 4, name: 'Title' }); h.appendChild(l); if (MOB) l.layoutSizingHorizontal = 'FILL';
  if (over) await addT(l, over, 'Small/B', 'muted');
  const tl = AL('H', { gap: 10, ai: 'CENTER', wrap: true, rowGap: 8 }); add(l, tl, MOB ? 'FILL' : null);
  await addT(tl, title, MOB ? 'H2' : 'H1', 'ink');
  for (const c of chips) tl.appendChild(c);
  const r = AL('H', { gap: 10, ai: 'CENTER', wrap: true, rowGap: 10, name: 'Actions' }); h.appendChild(r);
  if (MOB && actions.length) r.layoutSizingHorizontal = 'FILL';
  for (const a of actions) { r.appendChild(a); if (MOB && actions.length <= 2 && a.type === 'INSTANCE') a.layoutSizingHorizontal = 'FILL'; }
  if (!actions.length) r.remove();
  return { h, l, r };
}
async function pillSel(label, value) {
  const b = AL('H', { gap: 6, ai: 'CENTER', p: [0, 14], r: 10, bg: 'surface', stroke: 'line-strong', name: 'Select · ' + (label || value) });
  b.resize(10, 40); b.counterAxisSizingMode = 'FIXED'; b.primaryAxisSizingMode = 'AUTO';
  if (label) await addT(b, label, 'Small/M', 'muted');
  await addT(b, value, 'Small/B', 'ink'); b.appendChild(ic('chevron-down', 16, 'muted')); return b;
}
function iconBtn(name, o) {
  o = o || {}; const s = o.s || 44;
  const b = AL('H', { r: o.r != null ? o.r : 10, ai: 'CENTER', jc: 'CENTER', bg: o.bg === undefined ? 'surface' : o.bg, stroke: o.stroke === false ? null : (o.stroke || 'line-strong'), name: o.name || 'IconButton · ' + name });
  fixSize(b, s, s); b.appendChild(ic(name, o.is || 18, o.c || 'ink')); return b;
}
async function crumbs(main, items) {
  const r = AL('H', { gap: 6, ai: 'CENTER', wrap: true, rowGap: 4, name: 'Breadcrumb' }); add(main, r, 'FILL');
  const out = [];
  for (let i = 0; i < items.length; i++) {
    const last = i === items.length - 1;
    const t = await addT(r, items[i], 'Small/B', last ? 'muted' : 'primary'); t.name = (last ? 'Crumb current · ' : 'Crumb · ') + items[i]; out.push(t);
    if (!last) r.appendChild(ic('chevron-right', 14, 'faint'));
  }
  return out;
}
function cols2(main, a, b, minA, minB) {
  const r = flex('Columns', 20); add(main, r, 'FILL');
  const l = AL('V', { gap: MOB ? 16 : 20, name: 'Col A' }); add(r, l, 'FILL'); grow(l, a || 3); mw(l, minA || 520, null);
  const rr = AL('V', { gap: MOB ? 16 : 20, name: 'Col B' }); add(r, rr, 'FILL'); grow(rr, b || 2); mw(rr, minB || 340, null);
  return [l, rr];
}
async function searchBox(ph, w) {
  const sf = AL('H', { gap: 8, ai: 'CENTER', p: [0, 14], r: 10, bg: 'surface', stroke: 'line-strong', name: 'Search' });
  sf.resize(w || 280, 44); sf.primaryAxisSizingMode = 'FIXED'; sf.counterAxisSizingMode = 'FIXED';
  sf.appendChild(ic('search', 18, 'muted')); const t = await addT(sf, ph, 'Small/M', 'faint'); return sf;
}
async function segmented(items, active, o) {
  o = o || {};
  const seg = AL('H', { gap: 4, p: 4, r: 12, bg: 'surface-2', name: o.name || 'Segmented' });
  if (o.fill) { seg.resize(300, (o.h || 36) + 8); seg.primaryAxisSizingMode = 'FIXED'; seg.counterAxisSizingMode = 'AUTO'; }
  const out = {};
  for (const it of items) {
    const label = typeof it === 'string' ? it : it[0]; const dc = typeof it === 'string' ? null : it[1]; const cnt = typeof it === 'string' ? null : it[2];
    const on = label === active;
    const b = AL('H', { gap: 8, ai: 'CENTER', jc: 'CENTER', p: [0, 12], r: 9, bg: on ? (o.onBg || 'ink') : null, name: 'Seg · ' + label });
    b.resize(10, o.h || 36); b.counterAxisSizingMode = 'FIXED'; b.primaryAxisSizingMode = 'AUTO'; seg.appendChild(b);
    if (o.fill) b.layoutSizingHorizontal = 'FILL';
    if (on && o.onBg === 'surface') b.effects = [{ type: 'DROP_SHADOW', color: { r: 0.06, g: 0.12, b: 0.11, a: 0.14 }, offset: { x: 0, y: 1 }, radius: 3, spread: 0, visible: true, blendMode: 'NORMAL' }];
    if (dc) b.appendChild(dot(dc, 8));
    const tc = on ? (o.onBg === 'surface' ? 'ink' : 'white') : 'ink-2';
    await addT(b, label, 'Small/B', tc);
    if (cnt != null) await addT(b, String(cnt), 'Small/B', on && o.onBg !== 'surface' ? 'primary-tint' : 'muted');
    out[label] = b;
  }
  return { seg, items: out };
}
// ---------- prototype link registry ----------
// Every interactive node registers what it should do; links are resolved to
// real frame ids once every frame on the page exists.
const LINKED = new Set();
function reg(L) { if (!L.node) return null; LINKS.push(L); LINKED.add(L.node.id); return L.node; }
function go(node, to) { return reg({ node, to, kind: 'NAVIGATE' }); }
function overlay(node, to, anim) { return reg({ node, to, kind: 'OVERLAY', anim }); }
function swap(node, to) { return reg({ node, to, kind: 'SWAP' }); }
function closeIt(node) { return reg({ node, kind: 'CLOSE' }); }
function backIt(node) { return reg({ node, kind: 'BACK' }); }
function changeTo(node, destNode) { return reg({ node, kind: 'CHANGE_TO', dest: destNode }); }
function toast(node, which) { return overlay(node, 'toast:' + (which || 'done'), 'toast'); }

const EASE = { type: 'EASE_OUT' };
function transitionFor(L) {
  if (L.kind === 'CHANGE_TO') return { type: 'SMART_ANIMATE', easing: EASE, duration: 0.2 };
  if (L.kind === 'OVERLAY' || L.kind === 'SWAP') {
    if (L.anim === 'drawer') return { type: 'MOVE_IN', direction: 'RIGHT', matchLayers: false, easing: EASE, duration: 0.25 };
    if (L.anim === 'sheet' || L.anim === 'toast') return { type: 'MOVE_IN', direction: 'TOP', matchLayers: false, easing: EASE, duration: 0.22 };
    return { type: 'DISSOLVE', easing: EASE, duration: 0.18 };
  }
  return { type: 'DISSOLVE', easing: EASE, duration: 0.2 };
}
function hoverReaction(node) {
  try {
    if (node.type !== 'INSTANCE' || !node.mainComponent) return null;
    const mc = node.mainComponent; const set = mc.parent;
    if (!set || set.type !== 'COMPONENT_SET' || set.name !== 'Button') return null;
    const hv = set.children.find(c => c.name === mc.name.replace('State=Default', 'State=Hover'));
    if (!hv || hv.id === mc.id) return null;
    return { trigger: { type: 'ON_HOVER' }, actions: [{ type: 'NODE', destinationId: hv.id, navigation: 'CHANGE_TO', transition: { type: 'DISSOLVE', easing: EASE, duration: 0.12 }, preserveScrollPosition: false }] };
  } catch (e) { return null; }
}
async function applyLinks(FR) {
  for (const L of LINKS) {
    let action;
    if (L.kind === 'CLOSE') action = { type: 'CLOSE' };
    else if (L.kind === 'BACK') action = { type: 'BACK' };
    else {
      const dest = L.kind === 'CHANGE_TO' ? (L.dest && L.dest.id) : FR[L.to];
      if (!dest) { STATS.missing.push(L.to || '(change-to)'); continue; }
      action = { type: 'NODE', destinationId: dest, navigation: L.kind, transition: transitionFor(L), preserveScrollPosition: L.kind === 'CHANGE_TO' };
    }
    const re = [{ trigger: { type: 'ON_CLICK' }, actions: [action] }];
    const hv = hoverReaction(L.node); if (hv) re.unshift(hv);
    try { await L.node.setReactionsAsync(re); STATS.links++; }
    catch (e) { STATS.missing.push('failed on ' + L.node.name + ': ' + e.message); }
  }
  LINKS.length = 0; LINKED.clear();
}
// Anything that looks clickable but was left without a click action gets a
// friendly "simulated" toast, so no control in the prototype is dead.
function isControl(n) {
  if (n.type === 'INSTANCE') { const mc = n.mainComponent; return !!(mc && mc.parent && mc.parent.type === 'COMPONENT_SET' && mc.parent.name === 'Button'); }
  return /^(IconButton|Link|Select|Search|Crumb|Tab|Seg) · |^Search$/.test(n.name);
}
function hasClick(n) { try { return (n.reactions || []).some(r => r.trigger && r.trigger.type === 'ON_CLICK'); } catch (e) { return false; } }
function sweepDead(frame) {
  const walk = (n) => {
    if (isControl(n)) { if (!LINKED.has(n.id) && !hasClick(n)) toast(n, 'done'); return; }
    if (n.type === 'INSTANCE') return;
    if ('children' in n) for (const c of n.children) walk(c);
  };
  for (const c of frame.children) walk(c);
}
function byName(root, name) { return root.findOne(n => n.name === name); }
function allByName(root, name) { return root.findAll(n => n.name === name); }
function startsWith(root, pre) { return root.findAll(n => n.name.indexOf(pre) === 0); }
// ---------- sample data (from the original prototype) ----------
const UNIT_PAT = ['oovooroooo', 'oovoooovor', 'ovoooorooo', 'ooovoooovo'];
const UNIT_RENTS = [20000, 18000, 19000, 22000, 19500, 21000, 18500, 20000, 21500, 19000];
const UNIT_LOOK = { Occupied: ['primary-soft', 'primary', 'primary-ink', 'Primary', 'Occ.'], Vacant: ['info-soft', 'info-solid', 'info', 'Info', 'Vacant'], Reserved: ['warn-soft', 'warn-solid', 'warn', 'Warn', 'Reserved'] };
const UNITS = []; UNIT_PAT.forEach((s, fi) => s.split('').forEach((c, ci) => UNITS.push({ no: String((fi + 1) * 100 + ci + 1), st: c === 'o' ? 'Occupied' : c === 'v' ? 'Vacant' : 'Reserved', floor: fi + 1, rent: UNIT_RENTS[ci] })));
const OVERDUE = { '102': 1, '309': 1 }, EXPIRING = { '104': 1, '402': 1 };
const inr = n => '₹' + n.toLocaleString('en-IN');

const RENT_ROWS = [
  ['101', 'Customer A', '₹20,000', 'Paid', '3 Oct', 'UPI · 4471'],
  ['102', 'Customer B', '₹18,000', 'Overdue', '—', '—'],
  ['104', 'Customer C', '₹22,000', 'Paid', '2 Oct', 'Bank · 9930'],
  ['105', 'Customer D', '₹19,500', 'Pending', '—', '—'],
  ['107', 'Customer 107', '₹18,500', 'Paid', '4 Oct', 'UPI · 5120'],
  ['108', 'Customer 108', '₹20,000', 'Pending', '—', '—'],
  ['109', 'Customer 109', '₹21,500', 'Paid', '5 Oct', 'Cheque · 0042'],
  ['110', 'Customer 110', '₹19,000', 'Paid', '1 Oct', 'UPI · 6618'],
  ['201', 'Customer 201', '₹20,000', 'Not entered', '—', '—']
];
const RENT_TONE = { Paid: 'Success', Pending: 'Warn', Overdue: 'Danger', 'Not entered': 'Accent' };

const PRIO = { Urgent: ['danger-solid', 'danger', 'Danger'], High: ['warn-solid', 'warn', 'Warn'], Medium: ['primary', 'primary-ink', 'Primary'], Low: ['success-solid', 'success', 'Success'] };
const TICKETS = [
  { id: '53', col: 'Open', where: 'Common area', title: 'Lift stuck at floor 3', cat: 'Lift', prio: 'Urgent', sla: 'SLA breached · 26 h open', late: true, who: 'Unassigned', ini: '—', by: 'Property Manager', when: '13 Oct 2026, 9:40', note: 'Residents report the lift stops between floors 2 and 3.', cost: '₹8,000 / —' },
  { id: '52', col: 'Open', where: 'Unit 102', title: 'Leaking kitchen tap', cat: 'Plumbing', prio: 'High', sla: '20 h left', who: 'Unassigned', ini: '—', by: 'Customer B (tenant portal)', when: '14 Oct 2026, 18:10', note: 'Tap leaks continuously, water collecting under the sink.', cost: '₹600 / —' },
  { id: '54', col: 'Open', where: 'Unit 203', title: 'Repaint before move-in', cat: 'Painting', prio: 'Low', sla: '9 days left', who: 'Unassigned', ini: '—', by: 'Property Manager', when: '15 Oct 2026, 10:05', note: 'Vacant unit; repaint walls before the next lease.', cost: '₹12,000 / —' },
  { id: '48', col: 'In progress', where: 'Unit 207', title: 'Power trip in bedroom', cat: 'Electrical', prio: 'Urgent', sla: '4 h left', who: 'Staff 1', ini: 'S1', by: 'Customer 207 (tenant portal)', when: '15 Oct 2026, 08:20', note: 'MCB trips whenever the AC is switched on.', cost: '₹1,500 / —' },
  { id: '50', col: 'In progress', where: 'Unit 109', title: 'Wardrobe door broken', cat: 'Carpentry', prio: 'Medium', sla: '3 days left', who: 'External vendor', ini: 'V', by: 'Property Manager', when: '12 Oct 2026, 16:00', note: 'Hinge broken on the left wardrobe door.', cost: '₹2,000 / —' },
  { id: '47', col: 'Resolved', where: 'Unit 104', title: 'Balcony paint peeling', cat: 'Painting', prio: 'Low', sla: 'Awaiting tenant confirmation', who: 'Staff 2', ini: 'S2', by: 'Customer C (tenant portal)', when: '8 Oct 2026, 11:30', note: 'Balcony wall repainted on 14 Oct.', cost: '₹3,000 / ₹2,600' },
  { id: '45', col: 'Closed', where: 'Unit 101', title: 'Bathroom pipe leak', cat: 'Plumbing', prio: 'High', sla: 'Closed 12 Sep · ₹1,200 → expense', who: 'Staff 2', ini: 'S2', by: 'Customer A (tenant portal)', when: '10 Sep 2026, 07:45', note: 'Pipe joint replaced. Cost added to expenses.', cost: '₹1,000 / ₹1,200' },
  { id: '31', col: 'Closed', where: 'Unit 101', title: 'Fan not working', cat: 'Electrical', prio: 'Medium', sla: 'Closed 18 Jun · ₹800 → expense', who: 'Staff 1', ini: 'S1', by: 'Property Manager', when: '16 Jun 2026, 12:15', note: 'Capacitor replaced.', cost: '₹800 / ₹800' }
];
const COLS = ['Open', 'In progress', 'Resolved', 'Closed'];

const REPORTS = [
  { name: 'Rent collection', q: 'How much rent was collected this month?', bar: 'Collected', tiles: [['Due', '₹44.0 L'], ['Paid', '₹38.4 L', 'success'], ['Pending', '₹4.5 L'], ['Overdue', '₹1.1 L', 'danger']], head: ['Property', 'Due', 'Paid', 'Pending', 'Overdue'], rows: [['Sunrise Residency', '₹16.4 L', '₹13.0 L', '₹2.8 L', '₹0.6 L', 79], ['Green Park', '₹14.3 L', '₹13.1 L', '₹1.1 L', '₹0.1 L', 92], ['City Mall', '₹13.3 L', '₹12.3 L', '₹0.6 L', '₹0.4 L', 92], ['Total', '₹44.0 L', '₹38.4 L', '₹4.5 L', '₹1.1 L', 87, true]], foot: 'Based on rent entered by owners. Partial payments will appear once the payment module is added.' },
  { name: 'Unit occupancy', q: 'How many units are occupied and vacant?', bar: 'Occupancy', tiles: [['Occupied', '196'], ['Vacant', '30', 'info'], ['Reserved', '10'], ['Maintenance', '4']], head: ['Property', 'Units', 'Occupied', 'Vacant', 'Reserved', 'Maint.'], rows: [['Sunrise Residency', '100', '82', '12', '6', '0', 82], ['Green Park', '80', '70', '6', '2', '2', 88], ['City Mall', '60', '44', '12', '2', '2', 73], ['Total', '240', '196', '30', '10', '4', 82, true]], foot: 'Unit status changes automatically when a lease is activated or ends.' },
  { name: 'Overdue tenants', q: 'Which tenants are overdue?', tiles: [['Tenants overdue', '12', 'danger'], ['Amount overdue', '₹1.1 L', 'danger'], ['Oldest', '12 days']], head: ['Tenant', 'Unit', 'Property', 'Amount', 'Days late'], rows: [['Customer B', '102', 'Sunrise', '₹18,000', '12'], ['Customer F', 'G-04', 'City Mall', '₹42,000', '6'], ['Customer 309', '309', 'Sunrise', '₹19,000', '4']], foot: 'Showing 3 of 12. Email reminders go out the day after the due date, then weekly.' },
  { name: 'Agreement expiry', q: 'Which agreements are about to expire?', tiles: [['Next 30 days', '9', 'warn'], ['Next 60 days', '17'], ['Renewed this month', '4', 'success']], head: ['Tenant', 'Unit', 'Property', 'Ends', 'Days left'], rows: [['Customer 402', '402', 'Sunrise', '2 Nov 2026', '18'], ['Customer C', '104', 'Sunrise', '14 Nov 2026', '30'], ['Customer 1207', 'B-207', 'Green Park', '14 Nov 2026', '30']], foot: 'Reminders are emailed at 60, 30 and 7 days before the end date.' },
  { name: 'Maintenance by property', q: 'Which property has the most requests?', tiles: [['Open + in progress', '14'], ['Past SLA', '1', 'danger'], ['Repair cost (Oct)', '₹38,400']], head: ['Property', 'Open', 'In progress', 'Closed (Oct)', 'Cost (Oct)'], rows: [['Green Park', '4', '2', '7', '₹16,900'], ['Sunrise Residency', '3', '2', '5', '₹12,300'], ['City Mall', '2', '1', '3', '₹9,200']], foot: 'Sorted by open requests. Ticket costs flow into the expense report when a ticket is closed.' },
  { name: 'Income vs expense', q: 'What is the income and expense per property?', tiles: [['Income', '₹38.4 L', 'success'], ['Expenses', '₹6.8 L'], ['Net income', '₹31.6 L']], head: ['Property', 'Income', 'Expenses', 'Net'], rows: [['Sunrise Residency', '₹13.0 L', '₹2.9 L', '₹10.1 L'], ['Green Park', '₹13.1 L', '₹2.2 L', '₹10.9 L'], ['City Mall', '₹12.3 L', '₹1.7 L', '₹10.6 L'], ['Total', '₹38.4 L', '₹6.8 L', '₹31.6 L', null, true]], foot: 'Income = rent marked Paid. Expenses include maintenance, utilities, salaries and vendor bills.' },
  { name: 'Long-vacant units', q: 'Which units have been vacant for long?', tiles: [['Vacant > 90 days', '5', 'warn'], ['Average vacancy', '48 days'], ['Rent lost (Oct)', '₹5.9 L']], head: ['Unit', 'Property', 'Vacant since', 'Days', 'Expected rent'], rows: [['G-11', 'City Mall', '2 May 2026', '166', '₹38,000'], ['C-12', 'Green Park', '20 Jun 2026', '117', '₹17,500'], ['103', 'Sunrise', '12 Aug 2026', '64', '₹19,000']], foot: 'Days counted from the end of the last lease.' },
  { name: 'Owner statement', q: 'How is each owner performing?', tiles: [['Owners', '2'], ['Paid to owners (net)', '₹31.6 L'], ['Properties', '3']], head: ['Owner', 'Properties', 'Income', 'Expenses', 'Net'], rows: [['Owner A', '2', '₹26.1 L', '₹5.1 L', '₹21.0 L'], ['Owner B', '1', '₹12.3 L', '₹1.7 L', '₹10.6 L'], ['Total', '3', '₹38.4 L', '₹6.8 L', '₹31.6 L', null, true]], foot: 'Owners can download their own statement from the owner portal (Phase 2).' }
];

const NAV = [['Dashboard', 'dashboard', 'dash'], ['Properties', 'building', 'props'], ['Units', 'units', 'prop'], ['Tenants', 'users', 'tenant'], ['Leases', 'file', 'lease'], ['Monthly rent', 'rupee', 'rent'], ['Maintenance', 'wrench', 'maint'], ['Reports', 'chart', 'reports']];
const TOASTS = {
  done: ['sparkle', 'Action simulated', 'This step is a placeholder in the prototype.'],
  saved: ['check', 'Saved', 'Your changes were saved.'],
  reminder: ['mail', 'Reminder emailed', 'Customer B will get the overdue rent reminder.'],
  export: ['download', 'Export started', 'The file will download in a moment.'],
  invite: ['mail', 'Invite sent', 'customer.a@example.com got a new portal link.'],
  email: ['mail', 'Email draft opened', 'A message to the tenant is ready to send.'],
  reset: ['lock', 'Reset link sent', 'Check your inbox for a password reset link.'],
  ticket: ['wrench', 'Ticket created', 'Ticket #55 was added to the Open column.'],
  property: ['building', 'Property created', 'Next: bulk-add its units from the property page.']
};
// ---------- interactive component sets ----------
let SET_CURSOR = { x: 0, y: 0 };
async function makeSet(name, list, width, wire, o) {
  o = o || {};
  const comps = [];
  for (const v of list) {
    const c = figma.createComponent(); c.name = v.name;
    c.layoutMode = o.dir || 'VERTICAL'; c.resize(width, o.h || 100);
    c.primaryAxisSizingMode = o.h ? 'FIXED' : 'AUTO'; c.counterAxisSizingMode = 'FIXED';
    if (o.dir === 'HORIZONTAL') { c.primaryAxisSizingMode = 'FIXED'; c.counterAxisSizingMode = o.h ? 'FIXED' : 'AUTO'; }
    c.fills = o.bg ? [P(o.bg)] : []; c.clipsContent = !!o.clip; c.itemSpacing = o.gap != null ? o.gap : 16;
    await v.build(c);
    comps.push(c);
  }
  const set = figma.combineAsVariants(comps, PAGE); set.name = name;
  const gap = 60; let x = 40, rowH = 0, y = 40; const perRow = o.perRow || 6;
  set.children.forEach((c, i) => { if (i && i % perRow === 0) { x = 40; y += rowH + gap; rowH = 0; } c.x = x; c.y = y; x += c.width + gap; rowH = Math.max(rowH, c.height); });
  let mx = 0, my = 0; for (const c of set.children) { mx = Math.max(mx, c.x + c.width); my = Math.max(my, c.y + c.height); }
  set.resizeWithoutConstraints(mx + 40, my + 40); set.fills = [P('surface-3')]; set.cornerRadius = 24;
  set.x = SET_CURSOR.x; set.y = SET_CURSOR.y; SET_CURSOR.y += set.height + 200;
  if (o.description) set.description = o.description;
  const V2 = {}; for (const c of set.children) V2[c.name] = c;
  if (wire) await wire(V2, set);
  return { set, v: V2 };
}

// ===== Priority picker (lives on Components page; internal only) =====
async function ensurePriority() {
  if (CS['Priority picker']) return CS['Priority picker'];
  const cp = figma.root.children[0];
  const prevPage = PAGE; PAGE = cp; await figma.setCurrentPageAsync(cp);
  const levels = ['Low', 'Medium', 'High', 'Urgent'];
  const r = await makeSet('Priority picker', levels.map(l => ({ name: 'Value=' + l, build: async (c) => {
    c.layoutMode = 'HORIZONTAL'; c.primaryAxisSizingMode = 'FIXED'; c.counterAxisSizingMode = 'AUTO'; c.itemSpacing = 4; c.paddingTop = c.paddingBottom = c.paddingLeft = c.paddingRight = 4; c.cornerRadius = 12; c.fills = [P('surface-2')];
    for (const x of levels) { const on = x === l; const b = AL('H', { ai: 'CENTER', jc: 'CENTER', gap: 6, r: 9, bg: on ? 'surface' : null, name: 'Seg · ' + x }); b.resize(10, 40); b.counterAxisSizingMode = 'FIXED'; c.appendChild(b); b.layoutSizingHorizontal = 'FILL';
      if (on) b.effects = [{ type: 'DROP_SHADOW', color: { r: 0.06, g: 0.12, b: 0.11, a: 0.16 }, offset: { x: 0, y: 1 }, radius: 3, spread: 0, visible: true, blendMode: 'NORMAL' }];
      b.appendChild(dot(PRIO[x][0], 7)); await addT(b, x, 'Small/B', on ? 'ink' : 'muted'); }
  } })), 350, null, { dir: 'HORIZONTAL' });
  // internal change-to wiring (these never leave the component, so they can be set right away)
  for (const c of r.set.children) for (const b of c.children) { const x = b.name.slice(6); const dest = r.v['Value=' + x]; if (dest.id !== c.id) await b.setReactionsAsync([{ trigger: { type: 'ON_CLICK' }, actions: [{ type: 'NODE', destinationId: dest.id, navigation: 'CHANGE_TO', transition: { type: 'SMART_ANIMATE', easing: EASE, duration: 0.18 }, preserveScrollPosition: true }] }]); }
  r.set.x = 2000; r.set.y = 0; r.set.description = 'Segmented priority picker; click a level to select it.';
  CS['Priority picker'] = r.set;
  PAGE = prevPage; if (prevPage) await figma.setCurrentPageAsync(prevPage);
  return r.set;
}
function priorityPicker(value) { const set = CS['Priority picker']; const i = variant(set, { Value: value || 'Medium' }).createInstance(); i.name = 'Priority picker'; return i; }

// ===== Desktop unit board (80 variants, built earlier via MCP) =====
async function unitBoardDesktop() {
  let set = PAGE.findOne(n => n.type === 'COMPONENT_SET' && n.name === 'Unit board / Desktop');
  if (!set) {
    const holder = PAGE.findOne(n => n.name === 'UnitBoard build');
    if (!holder) throw new Error('Unit board components not found on the Desktop page.');
    const kids = holder.children.slice();
    for (const c of kids) { const p = c.findOne(n => n.name === 'Selected unit'); if (p) p.layoutSizingVertical = 'FILL'; const g = c.findOne(n => n.name === 'Unit grid'); if (g) g.layoutSizingVertical = 'FILL'; }
    set = figma.combineAsVariants(kids, PAGE); set.name = 'Unit board / Desktop'; holder.remove();
    set.children.forEach((c, i) => { c.x = 40 + (i % 4) * 1160; c.y = 40 + Math.floor(i / 4) * 600; });
    let mx = 0, my = 0; for (const c of set.children) { mx = Math.max(mx, c.x + c.width); my = Math.max(my, c.y + c.height); }
    set.resizeWithoutConstraints(mx + 40, my + 40); set.fills = [P('surface-3')]; set.cornerRadius = 24;
    const def = set.children.find(c => c.name === 'Filter=All, Unit=102'); if (def) set.insertChild(0, def);
    set.description = 'Interactive unit grid: click a filter or any tile and the board changes to that variant.';
  }
  set.x = -6000; set.y = -1300;
  const by = {}; for (const c of set.children) by[c.name] = c;
  const stOf = {}; for (const u of UNITS) stOf[u.no] = u.st;
  const firstOf = st => UNITS.find(u => u.st === st).no;
  for (const c of set.children) {
    const m = c.name.match(/Filter=(\w+), Unit=(\d+)/); if (!m) continue; const f = m[1], u = m[2];
    for (const t of c.findAll(x => x.name.indexOf('Tile ') === 0)) { const tu = t.name.slice(5); if (tu === u) continue; const st = stOf[tu]; const dest = f === 'All' ? by['Filter=All, Unit=' + tu] : (st === f ? by['Filter=' + f + ', Unit=' + tu] : by['Filter=All, Unit=' + tu]); changeTo(t, dest); }
    for (const b of c.findAll(x => x.name.indexOf('Filter · ') === 0)) { const l = b.name.slice(9); if (l === f) continue; const dest = l === 'All' ? by['Filter=All, Unit=' + u] : by['Filter=' + l + ', Unit=' + (stOf[u] === l ? u : firstOf(l))]; changeTo(b, dest); }
    go(byName(c, 'Button · Open unit page'), 'unit');
    overlay(byName(c, 'Button · Enter rent'), 'ov:rent');
    overlay(byName(c, 'Button · Raise ticket'), 'ov:ticket');
    go(byName(c, 'Button · Create lease for this unit'), 'lease');
    go(byName(c, 'Button · Convert to lease'), 'lease');
    toast(byName(c, 'Link · Show more floors'), 'done');
    toast(byName(c, 'Find unit'), 'done');
  }
  return set;
}

// ===== Mobile unit board (filter variants; tiles open the unit page) =====
async function unitBoardMobile() {
  const filters = ['All', 'Occupied', 'Vacant', 'Reserved'];
  const count = st => UNITS.filter(u => u.st === st).length;
  return makeSet('Unit board / Mobile', filters.map(f => ({ name: 'Filter=' + f, build: async (c) => {
    c.itemSpacing = 14;
    const sc = AL('H', { name: 'Scroll · filters', clip: true }); add(c, sc, 'FILL'); sc.overflowDirection = 'HORIZONTAL';
    const s = await segmented([['All', null, UNITS.length], ['Occupied', 'primary', count('Occupied')], ['Vacant', 'info-solid', count('Vacant')], ['Reserved', 'warn-solid', count('Reserved')]], f, { name: 'Filter' });
    sc.appendChild(s.seg);
    const lg = AL('H', { gap: 14, wrap: true, rowGap: 6 }); add(c, lg, 'FILL');
    for (const [l, cc] of [['Rent overdue', 'danger-solid'], ['Expiring ≤ 30 days', 'warn-solid']]) { const x = AL('H', { gap: 6, ai: 'CENTER' }); lg.appendChild(x); x.appendChild(dot(cc, 8)); await addT(x, l, 'Caption', 'muted'); }
    for (let fi = 1; fi <= 4; fi++) {
      const blk = AL('V', { gap: 8, name: 'Floor ' + fi }); add(c, blk, 'FILL');
      await addT(blk, 'Floor ' + fi, 'Overline', 'muted');
      const row = AL('H', { gap: 8, wrap: true, rowGap: 8 }); add(blk, row, 'FILL');
      for (const u of UNITS.filter(u => u.floor === fi)) {
        const L = UNIT_LOOK[u.st]; const dim = f !== 'All' && f !== u.st;
        const t = AL('V', { ai: 'CENTER', jc: 'CENTER', r: 10, bg: L[0], stroke: L[1], sw: 1.25, name: 'Tile ' + u.no }); fixSize(t, 63, 56); row.appendChild(t);
        if (dim) t.opacity = 0.28;
        await addT(t, u.no, 'Body/B', L[2]); await addT(t, L[4], 'Caption', L[2]);
        if (OVERDUE[u.no] || EXPIRING[u.no]) { const d = dot(OVERDUE[u.no] ? 'danger-solid' : 'warn-solid', 8); t.appendChild(d); d.layoutPositioning = 'ABSOLUTE'; d.x = 49; d.y = 6; }
      }
    }
    const more = await link('Show floors 5–10', 'chevron-down'); c.appendChild(more);
  } })), 358, async (v) => {
    for (const c of Object.values(v)) {
      const f = c.name.slice(7);
      for (const b of c.findAll(x => x.name.indexOf('Seg · ') === 0)) { const l = b.name.slice(6); if (l !== f) changeTo(b, v['Filter=' + l]); }
      for (const t of c.findAll(x => x.name.indexOf('Tile ') === 0)) go(t, 'unit');
      toast(byName(c, 'Link · Show floors 5–10'), 'done');
    }
  }, { description: 'Mobile unit grid: filters change variant, tiles open the unit page.' });
}

// ===== New-lease wizard =====
async function leaseWizard() {
  const labels = ['Unit and tenant', 'Terms', 'File and access', 'Review'];
  const W = MOB ? 358 : 680;
  const pair = async (par, a, b) => { const r = flex('Field row', 16); add(par, r, 'FILL'); for (const f of [a, b]) { if (!f) continue; add(r, f, 'FILL'); mw(f, 220, null); } return r; };
  return makeSet('Lease wizard / ' + (MOB ? 'Mobile' : 'Desktop'), [1, 2, 3, 4, 5].map(step => ({ name: 'Step=' + (step === 5 ? 'Done' : step), build: async (c) => {
    c.itemSpacing = 16;
    if (step < 5) {
      const nav = card({ p: MOB ? 12 : [12, 16], gap: 8, name: 'Steps' }); add(c, nav, 'FILL'); nav.layoutMode = 'HORIZONTAL'; nav.layoutWrap = 'WRAP'; nav.counterAxisSpacing = 8;
      for (let i = 0; i < 4; i++) {
        const n = i + 1, done = n < step, cur = n === step;
        const b = AL('H', { gap: 10, ai: 'CENTER', p: [8, 10], r: 10, bg: cur ? 'primary-soft' : null, name: 'Step · ' + n }); add(nav, b, 'FILL'); mw(b, 120, 150);
        const m = AL('H', { r: 14, ai: 'CENTER', jc: 'CENTER', bg: cur ? 'primary' : done ? 'success-soft' : 'surface-2' }); fixSize(m, 28, 28); b.appendChild(m);
        if (done) m.appendChild(ic('check', 15, 'success')); else await addT(m, String(n), 'Small/B', cur ? 'white' : 'muted');
        await addT(b, labels[i], 'Small/B', cur ? 'primary-ink' : done ? 'ink' : 'muted');
      }
    }
    const body = card({ p: MOB ? 18 : [24, 26], gap: 20, name: 'Step body' }); add(c, body, 'FILL');
    const title = async (t, s) => { const h = AL('V', { gap: 6 }); add(body, h, 'FILL'); await addT(h, t, 'H2', 'ink', { fill: true }); await addT(h, s, 'Small/M', 'muted', { fill: true }); };
    if (step === 1) {
      await title('Choose the unit and tenant', 'Only vacant or reserved units can get a new lease.');
      await pair(body, field('Property', 'Sunrise Residency', 'Select'), field('Unit', '103 · 2BHK · Vacant · ₹19,000', 'Select', 'Rent and deposit are pre-filled from the unit.'));
      const tg = AL('V', { gap: 8 }); add(body, tg, 'FILL'); await addT(tg, 'Tenant', 'Small/B', 'ink');
      const tc = AL('H', { gap: 12, ai: 'CENTER', p: 14, r: 12, stroke: 'line-strong', name: 'Tenant pick' }); add(tg, tc, 'FILL');
      tc.appendChild(avatar('CG', 'Info', 'M')); const tt = AL('V', { gap: 2 }); add(tc, tt, 'FILL'); await addT(tt, 'Customer G', 'Body/B', 'ink'); await addT(tt, '98XXX XX552 · customer.g@example.com · new tenant', 'Caption', 'muted', { fill: true });
      tc.appendChild(await link('Change', false));
      tg.appendChild(await link('Add a new tenant', 'plus'));
    } else if (step === 2) {
      await title('Agreement terms', 'Unit 103 · Customer G');
      await pair(body, field('Start date', '01-11-2026'), field('End date', '31-10-2027', 'Text', '12 months'));
      await pair(body, field('Monthly rent (₹)', '19,000'), field('Security deposit (₹)', '57,000', 'Text', '3 months of rent'));
      await pair(body, field('Rent due day', '5th of every month', 'Select'), field('Notice period', '30 days', 'Select'));
      add(body, field('Increase on renewal', '5%'), 'FILL');
      add(body, field('Renewal terms', 'Renewal for 11–12 months by mutual consent; rent increases by the agreed percentage.', 'Area'), 'FILL');
    } else if (step === 3) {
      await title('Agreement file and tenant access', 'Upload the signed agreement and invite the tenant to their portal.');
      const up = AL('V', { gap: 8, ai: 'CENTER', p: [28, 20], r: 14, stroke: 'primary-tint', sw: 1.5, bg: 'primary-soft', bgo: 0.35, name: 'Upload zone' }); up.dashPattern = [6, 4]; add(body, up, 'FILL');
      const ub = AL('H', { r: 22, ai: 'CENTER', jc: 'CENTER', bg: 'surface' }); fixSize(ub, 44, 44); ub.appendChild(ic('upload', 20, 'primary')); up.appendChild(ub);
      await addT(up, 'Upload signed agreement', 'Body/B', 'ink'); await addT(up, 'PDF up to 10 MB · drag and drop or click', 'Caption', 'muted');
      const cb = AL('H', { gap: 4, ai: 'MIN', p: [4, 14], r: 12, bg: 'surface-2' }); add(body, cb, 'FILL');
      cb.appendChild(checkbox('Email a tenant portal invite', true));
      await addT(body, 'customer.g@example.com gets a link to set a password. The link expires in 48 hours.', 'Caption', 'muted', { fill: true });
    } else if (step === 4) {
      await title('Review and activate', 'Activating changes these records automatically:');
      const list = AL('V', { gap: 0 }); add(body, list, 'FILL');
      for (const [k, t, tone] of [['Unit', 'Unit 103 changes from Vacant to Occupied', 'Primary'], ['Tenant', 'Customer G becomes an Active tenant', 'Success'], ['Reminders', 'Expiry emails at 60, 30 and 7 days before 31 Oct 2027', 'Warn'], ['Email', 'Portal invite sent to customer.g@example.com', 'Info']]) {
        const r = AL('H', { gap: 12, ai: 'CENTER', p: [12, 0] }); add(list, r, 'FILL'); topLine(r); r.appendChild(chip(k, tone)); await addT(r, t, 'Small/M', 'ink', { fill: true });
      }
      const sum = AL('H', { gap: 16, p: 16, r: 12, bg: 'surface-2', wrap: true, rowGap: 12 }); add(body, sum, 'FILL');
      for (const [l, v] of [['Rent', '₹19,000 / month'], ['Deposit', '₹57,000'], ['Period', '1 Nov 2026 – 31 Oct 2027']]) await stat(sum, l, v, { min: 140 });
    } else {
      const ok = AL('V', { gap: 14, ai: 'CENTER', p: [24, 8] }); add(body, ok, 'FILL');
      const bb = AL('H', { r: 36, ai: 'CENTER', jc: 'CENTER', bg: 'success-soft' }); fixSize(bb, 72, 72); bb.appendChild(ic('check', 34, 'success')); ok.appendChild(bb);
      await addT(ok, 'Lease activated', 'H1', 'ink', { align: 'CENTER' });
      const t = await addT(ok, 'Unit 103 is now Occupied and Customer G is an active tenant. A portal invite was emailed to customer.g@example.com.', 'Body/M', 'muted', { align: 'CENTER', fill: true }); t.maxWidth = 460;
      const a = AL('H', { gap: 10, wrap: true, rowGap: 10, jc: 'CENTER' }); add(ok, a, 'FILL');
      a.appendChild(btn('View unit 103', 'Primary', 'M', 'arrow-right')); a.appendChild(btn('Back to property', 'Secondary', 'M', 'building')); a.appendChild(btn('Create another lease', 'Ghost', 'M', 'plus'));
      if (MOB) for (const x of a.children) x.layoutSizingHorizontal = 'FILL';
    }
    if (step < 5) {
      const ft = AL('H', { jc: 'SPACE_BETWEEN', ai: 'CENTER', gap: 10, p: [16, 0, 0, 0], name: 'Footer' }); add(body, ft, 'FILL'); topLine(ft);
      ft.appendChild(btn(step === 1 ? 'Cancel' : 'Back', 'Secondary', 'M', step === 1 ? null : 'arrow-left'));
      const r = AL('H', { gap: 10 }); ft.appendChild(r);
      if (!MOB) r.appendChild(btn('Save as draft', 'Ghost', 'M'));
      r.appendChild(step < 4 ? btn('Continue', 'Primary', 'M', 'arrow-right') : btn('Activate lease', 'Primary', 'M', 'check'));
    }
  } })), W, async (v) => {
    const key = s => v['Step=' + s];
    for (let s = 1; s <= 5; s++) {
      const c = key(s === 5 ? 'Done' : s);
      for (const b of c.findAll(x => x.name.indexOf('Step · ') === 0)) { const n = +b.name.slice(7); if (n !== s) changeTo(b, key(n)); }
      if (s < 5) {
        if (s === 1) go(byName(c, 'Button · Cancel'), 'prop'); else changeTo(byName(c, 'Button · Back'), key(s - 1));
        changeTo(byName(c, 'Button · Continue'), key(s + 1));
        changeTo(byName(c, 'Button · Activate lease'), key('Done'));
        toast(byName(c, 'Button · Save as draft'), 'saved');
        toast(byName(c, 'Link · Change'), 'done'); toast(byName(c, 'Link · Add a new tenant'), 'done');
        toast(byName(c, 'Upload zone'), 'done');
      } else {
        go(byName(c, 'Button · View unit 103'), 'unit'); go(byName(c, 'Button · Back to property'), 'prop'); changeTo(byName(c, 'Button · Create another lease'), key(1));
      }
    }
  }, { description: 'Four-step lease wizard plus a success state. Continue / Back / step pills change variants.' });
}

// ===== Rent table with status tabs =====
async function rentTable() {
  const tabs = ['All', 'Paid', 'Pending', 'Overdue', 'Not entered'];
  const W = MOB ? 358 : 1096;
  return makeSet('Rent table / ' + (MOB ? 'Mobile' : 'Desktop'), tabs.map(tab => ({ name: 'Tab=' + tab, build: async (c) => {
    c.itemSpacing = 0; c.fills = [P('surface')]; c.strokes = [P('line')]; c.strokeWeight = 1; c.strokeAlign = 'INSIDE'; c.cornerRadius = 16; c.clipsContent = true;
    const ts = AL('H', { name: 'Scroll · tabs', clip: true }); add(c, ts, 'FILL'); ts.overflowDirection = 'HORIZONTAL'; bottomLine(ts);
    const tr = AL('H', { gap: 4, p: [6, 14, 0, 14], name: 'Tabs' }); ts.appendChild(tr);
    for (const t of tabs) {
      const on = t === tab; const n = t === 'All' ? RENT_ROWS.length : RENT_ROWS.filter(r => r[3] === t).length;
      const b = AL('H', { gap: 8, ai: 'CENTER', p: [12, 12, 12, 12], name: 'Tab · ' + t }); tr.appendChild(b); if (on) bottomLine(b, 'primary', 2.5);
      await addT(b, t, 'Small/B', on ? 'ink' : 'muted'); b.appendChild(chip(String(n), on ? 'Primary' : 'Neutral'));
    }
    const rows = RENT_ROWS.filter(r => tab === 'All' || r[3] === tab);
    const host0 = AL('V', { name: 'Table host' }); add(c, host0, 'FILL');
    let host = host0;
    if (MOB) { const sc = AL('V', { name: 'Scroll · table', clip: true }); add(host0, sc, 'FILL'); sc.overflowDirection = 'HORIZONTAL'; const inner = AL('V', { name: 'Table' }); sc.appendChild(inner); inner.resize(760, 10); inner.counterAxisSizingMode = 'FIXED'; inner.primaryAxisSizingMode = 'AUTO'; host = inner; }
    const w = [0.6, 1.3, 0.9, 0.6, 1.1, 0.8, 1.2, 1];
    await trow(host, ['Unit', 'Tenant', 'Rent', 'Due', 'Status', 'Paid on', 'Mode · ref', ''], { header: true, w, p: [10, 18], bg: 'surface-2', align: ['', '', 'R', '', '', '', '', 'R'] });
    for (let i = 0; i < rows.length; i++) {
      const [u, t, a, st, pd, ref] = rows[i];
      const action = st === 'Not entered' ? 'Enter' : st === 'Paid' ? 'Edit' : 'Mark paid';
      await trow(host, [u, t, a, '5 Oct', chip(st, RENT_TONE[st], true), pd, ref, btn(action, st === 'Paid' ? 'Ghost' : 'Secondary', 'S')], { w, p: [10, 18], bold: [1, 0, 1, 0, 0, 0, 0, 0], mute: [0, 0, 0, 1, 0, 0, 1, 0], align: ['', '', 'R', '', '', '', '', 'R'], last: i === rows.length - 1, name: 'Rent row · ' + u });
    }
    const ft = AL('H', { p: [14, 18], jc: 'SPACE_BETWEEN', ai: 'CENTER', name: 'Footer' }); add(c, ft, 'FILL'); topLine(ft);
    await addT(ft, 'Showing ' + rows.length + ' of 82 occupied units', 'Caption', 'muted'); ft.appendChild(await link('Load more', 'chevron-down'));
  } })), W, async (v) => {
    for (const c of Object.values(v)) {
      const cur = c.name.slice(4);
      for (const b of c.findAll(x => x.name.indexOf('Tab · ') === 0)) { const t = b.name.slice(6); if (t !== cur) changeTo(b, v['Tab=' + t]); }
      for (const b of c.findAll(x => /^Button · (Enter|Edit|Mark paid)$/.test(x.name))) overlay(b, 'ov:rent', MOB ? 'sheet' : null);
      toast(byName(c, 'Link · Load more'), 'done');
    }
  }, { description: 'Rent entries with status tabs; row actions open the rent entry dialog.' });
}

// ===== Rent entry form (inside the rent overlay) =====
async function rentForm() {
  const W = MOB ? 390 : 560;
  return makeSet('Rent entry form / ' + (MOB ? 'Mobile' : 'Desktop'), ['Pending', 'Paid'].map(st => ({ name: 'Status=' + st, build: async (c) => {
    c.itemSpacing = 18; c.paddingTop = c.paddingBottom = MOB ? 20 : 26; c.paddingLeft = c.paddingRight = MOB ? 18 : 28;
    c.fills = [P('surface')]; c.cornerRadius = MOB ? 24 : 20;
    if (MOB) { c.bottomLeftRadius = 0; c.bottomRightRadius = 0; const g = figma.createRectangle(); g.resize(40, 4); g.cornerRadius = 2; g.fills = [P('line-strong')]; c.appendChild(g); g.layoutAlign = 'CENTER'; c.counterAxisAlignItems = 'MIN'; }
    const h = AL('H', { jc: 'SPACE_BETWEEN', ai: 'CENTER', gap: 10 }); add(c, h, 'FILL');
    const ht = AL('V', { gap: 2 }); add(h, ht, 'FILL'); await addT(ht, 'Enter rent', 'H2', 'ink'); await addT(ht, 'Sunrise Residency · October 2026', 'Small/M', 'muted');
    h.appendChild(iconBtn('x', { name: 'IconButton · Close', bg: 'surface-2', stroke: false, s: 40 }));
    const r1 = flex('Row', 14); add(c, r1, 'FILL'); for (const f of [field('Unit', '102 · Customer B', 'Select'), field('Month', 'October 2026', 'Select')]) { add(r1, f, 'FILL'); mw(f, 200, null); }
    const r2 = flex('Row', 14); add(c, r2, 'FILL'); for (const f of [field('Amount (₹)', '18,000', 'Text', 'From the lease · you can change it'), field('Due date', '05-10-2026')]) { add(r2, f, 'FILL'); mw(f, 200, null); }
    const sg = AL('V', { gap: 8 }); add(c, sg, 'FILL'); await addT(sg, 'Status', 'Small/B', 'ink');
    const s = await segmented(['Pending', 'Paid'], st, { onBg: 'surface', fill: true, h: 40, name: 'Status' }); add(sg, s.seg, 'FILL');
    if (st === 'Paid') {
      const r3 = flex('Row', 14); add(c, r3, 'FILL');
      for (const f of [field('Paid on', '15-10-2026'), field('Mode', 'UPI', 'Select'), field('Reference', 'UTR / cheque no.')]) { add(r3, f, 'FILL'); mw(f, 150, null); }
    }
    const note = AL('H', { gap: 10, ai: 'MIN', p: [10, 12], r: 10, bg: 'warn-soft' }); add(c, note, 'FILL'); note.appendChild(ic('alert', 16, 'warn'));
    await addT(note, 'Only one entry per unit per month. A second entry for 102 · October is blocked.', 'Caption', 'warn', { fill: true });
    const ft = AL('H', { gap: 10, jc: 'MAX' }); add(c, ft, 'FILL');
    const cancel = btn('Cancel', 'Secondary', 'M'); const save = btn('Save entry', 'Primary', 'M', 'check');
    ft.appendChild(cancel); ft.appendChild(save); if (MOB) { cancel.layoutSizingHorizontal = 'FILL'; save.layoutSizingHorizontal = 'FILL'; }
  } })), W, async (v) => {
    for (const c of Object.values(v)) {
      const cur = c.name.slice(7);
      for (const b of c.findAll(x => x.name.indexOf('Seg · ') === 0)) { const t = b.name.slice(6); if (t !== cur) changeTo(b, v['Status=' + t]); }
      closeIt(byName(c, 'IconButton · Close')); closeIt(byName(c, 'Button · Cancel')); swap(byName(c, 'Button · Save entry'), 'toast:saved');
    }
  }, { description: 'Rent entry dialog body; Pending/Paid toggle reveals payment fields.' });
}
// ===== Maintenance =====
async function ticketCard(t, sel) {
  const P0 = PRIO[t.prio];
  const b = AL('V', { gap: 8, p: 12, r: 12, bg: 'surface', stroke: sel ? 'ink' : 'line', sw: sel ? 2 : 1, name: 'Ticket · ' + t.id });
  if (sel) b.effects = [{ type: 'DROP_SHADOW', color: { r: 0.06, g: 0.12, b: 0.11, a: 0.16 }, offset: { x: 0, y: 4 }, radius: 12, spread: 0, visible: true, blendMode: 'NORMAL' }];
  const top = AL('H', { gap: 6, ai: 'CENTER' }); add(b, top, 'FILL');
  top.appendChild(dot(P0[0], 8)); const a = await addT(top, '#' + t.id + ' · ' + t.where, 'Caption', 'muted'); a.layoutSizingHorizontal = 'FILL'; a.textAutoResize = 'HEIGHT';
  await addT(top, t.prio, 'Caption', P0[1]);
  await addT(b, t.title, 'Small/B', 'ink', { fill: true });
  const sl = AL('H', { gap: 6, ai: 'CENTER' }); add(b, sl, 'FILL'); sl.appendChild(ic('clock', 14, t.late ? 'danger' : 'faint')); await addT(sl, t.sla, 'Caption', t.late ? 'danger' : 'muted', { fill: true });
  const w = AL('H', { gap: 6, ai: 'CENTER' }); add(b, w, 'FILL'); w.appendChild(avatar(t.ini, t.ini === '—' ? 'Neutral' : 'Primary', 'S')); await addT(w, t.who, 'Caption', 'ink-2');
  return b;
}
async function ticketDetail(par, t, o) {
  o = o || {};
  const P0 = PRIO[t.prio];
  const p = AL('V', { gap: 14, name: 'Ticket detail' }); add(par, p, 'FILL');
  const h = AL('H', { jc: 'SPACE_BETWEEN', ai: 'MIN', gap: 10 }); add(p, h, 'FILL');
  const ht = AL('V', { gap: 4 }); add(h, ht, 'FILL'); await addT(ht, 'Ticket #' + t.id, 'Caption', 'muted'); await addT(ht, t.title, 'H2', 'ink', { fill: true });
  if (o.close) h.appendChild(iconBtn('x', { name: 'IconButton · Close', bg: 'surface-2', stroke: false, s: 40 }));
  const cs = AL('H', { gap: 8, wrap: true, rowGap: 8 }); add(p, cs, 'FILL'); cs.appendChild(chip(t.prio, P0[2], true)); cs.appendChild(chip(t.col, t.col === 'Open' ? 'Danger' : t.col === 'In progress' ? 'Info' : t.col === 'Resolved' ? 'Success' : 'Neutral')); cs.appendChild(chip(t.cat, 'Neutral'));
  const rows = AL('V', { gap: 0 }); add(p, rows, 'FILL');
  for (const [l, v, c] of [['Location', t.where], ['Raised by', t.by], ['Raised on', t.when], ['SLA', t.sla, t.late ? 'danger' : null], ['Assigned to', t.who], ['Estimate / actual', t.cost]]) await kvRow(rows, l, v, { c });
  const nt = AL('V', { gap: 6, p: [12, 14], r: 12, bg: 'surface-2' }); add(p, nt, 'FILL'); await addT(nt, 'Description', 'Caption', 'muted'); await addT(nt, t.note, 'Small/M', 'ink', { fill: true });
  const acts = AL('V', { gap: 10, name: 'Actions' }); add(p, acts, 'FILL');
  const primary = t.col === 'Open' ? (t.who === 'Unassigned' ? 'Assign staff' : 'Mark in progress') : t.col === 'In progress' ? 'Mark resolved' : t.col === 'Resolved' ? 'Close ticket' : 'Reopen ticket';
  add(acts, btn(primary, t.col === 'Closed' ? 'Secondary' : 'Primary', 'M', t.col === 'Closed' ? 'arrow-left' : 'check'), 'FILL');
  const two = AL('H', { gap: 10 }); add(acts, two, 'FILL');
  add(two, btn(t.where.indexOf('Unit') === 0 ? 'Open ' + t.where.toLowerCase().replace('unit', 'unit') : 'Open property', 'Secondary', 'M', 'arrow-right'), 'FILL');
  add(two, btn('Comment', 'Secondary', 'M', 'edit'), 'FILL');
  return p;
}
function wireTicketDetail(root) {
  for (const b of root.findAll(x => /^Button · (Assign staff|Mark in progress|Mark resolved|Close ticket|Reopen ticket|Comment)$/.test(x.name))) toast(b, 'saved');
  for (const b of root.findAll(x => /^Button · Open unit/.test(x.name))) go(b, 'unit');
  for (const b of root.findAll(x => x.name === 'Button · Open property')) go(b, 'prop');
}
async function maintBoardDesktop() {
  return makeSet('Maintenance board / Desktop', TICKETS.map(sel => ({ name: 'Ticket=' + sel.id, build: async (c) => {
    c.layoutMode = 'HORIZONTAL'; c.layoutWrap = 'WRAP'; c.counterAxisSpacing = 20; c.itemSpacing = 20; c.primaryAxisSizingMode = 'FIXED'; c.counterAxisSizingMode = 'AUTO';
    const board = AL('H', { gap: 12, name: 'Board' }); add(c, board, 'FILL'); board.layoutGrow = 7; board.minWidth = 700;
    for (const col of COLS) {
      const items = TICKETS.filter(t => t.col === col);
      const cl = AL('V', { gap: 10, p: 12, r: 14, bg: 'surface-2', name: 'Column · ' + col }); add(board, cl, 'FILL', 'FILL');
      const ch = AL('H', { jc: 'SPACE_BETWEEN', ai: 'CENTER' }); add(cl, ch, 'FILL'); await addT(ch, col, 'Small/B', 'ink'); ch.appendChild(chip(String(items.length), 'Neutral'));
      for (const t of items) add(cl, await ticketCard(t, t.id === sel.id), 'FILL');
    }
    const panel = card({ p: [20, 22], gap: 14, name: 'Selected ticket' }); add(c, panel, 'FILL'); panel.layoutGrow = 3; panel.minWidth = 320;
    await ticketDetail(panel, sel);
  } })), 1096, async (v) => {
    for (const c of Object.values(v)) {
      const cur = c.name.slice(7);
      for (const b of c.findAll(x => x.name.indexOf('Ticket · ') === 0)) { const id = b.name.slice(9); if (id !== cur) changeTo(b, v['Ticket=' + id]); }
      wireTicketDetail(c);
    }
  }, { perRow: 2, description: 'Kanban board; click a ticket card to show it in the side panel.' });
}

// ===== Reports =====
async function reportBody(par, r) {
  const sec = card({ p: MOB ? 18 : [22, 24], gap: 18, name: 'Report' }); add(par, sec, 'FILL');
  const h = AL('H', { gap: 12, jc: 'SPACE_BETWEEN', ai: 'MIN', wrap: true, rowGap: 12 }); add(sec, h, 'FILL');
  const ht = AL('V', { gap: 4 }); h.appendChild(ht); ht.layoutSizingHorizontal = MOB ? 'FILL' : 'HUG'; await addT(ht, r.name, 'H2', 'ink'); await addT(ht, r.q + ' · October 2026 · all properties', 'Small/M', 'muted', { fill: MOB });
  const ex = AL('H', { gap: 8 }); h.appendChild(ex); ex.appendChild(btn('Export CSV', 'Secondary', 'S', 'download')); ex.appendChild(btn('Export PDF', 'Secondary', 'S', 'file'));
  const tg = grid('Tiles', 12); add(sec, tg, 'FILL');
  for (const [l, val, c] of r.tiles) await statBox(tg, l, val, { c, min: 150, mmin: 140 });
  const hasBar = !!r.bar;
  const cols = r.head.slice(); if (hasBar) cols.push(r.bar);
  let host = sec;
  const tw = AL('V', { r: 12, stroke: 'line', clip: true, name: 'Table' }); add(sec, tw, 'FILL');
  host = tw;
  if (MOB) { tw.overflowDirection = 'HORIZONTAL'; const inner = AL('V', { name: 'Rows' }); tw.appendChild(inner); inner.resize(cols.length * 120, 10); inner.counterAxisSizingMode = 'FIXED'; inner.primaryAxisSizingMode = 'AUTO'; host = inner; }
  const w = cols.map((_, i) => i === 0 ? 1.6 : (hasBar && i === cols.length - 1 ? 1.6 : 1));
  const align = cols.map((_, i) => i === 0 || (hasBar && i === cols.length - 1) ? '' : 'R');
  await trow(host, cols, { header: true, w, p: [10, 16], bg: 'surface-2', align });
  for (let i = 0; i < r.rows.length; i++) {
    const row = r.rows[i]; const total = row[row.length - 1] === true;
    const n = r.head.length; const cells = row.slice(0, n);
    if (hasBar) { const pct = row[n]; const g = AL('H', { gap: 10, ai: 'CENTER' }); const pb = progress(pct, 'primary', 8); g.appendChild(pb); pb.resize(90, 8); await addT(g, pct + '%', 'Small/B', 'ink'); cells.push(g); }
    const tr0 = await trow(host, cells, { w, p: [12, 16], bold: cols.map((_, k) => k === 0 || total), align, last: i === r.rows.length - 1, bg: total ? 'surface-2' : null, name: 'Report row · ' + (i + 1) });
  }
  const ft = AL('H', { gap: 8, ai: 'MIN' }); add(sec, ft, 'FILL'); ft.appendChild(ic('alert', 16, 'faint')); await addT(ft, r.foot, 'Caption', 'muted', { fill: true });
  return sec;
}
async function reportsSet() {
  const W = MOB ? 358 : 1096;
  return makeSet('Reports / ' + (MOB ? 'Mobile' : 'Desktop'), REPORTS.map((r, idx) => ({ name: 'Report=' + r.name, build: async (c) => {
    if (MOB) {
      c.itemSpacing = 14;
      const sc = AL('H', { name: 'Scroll · reports', clip: true }); add(c, sc, 'FILL'); sc.overflowDirection = 'HORIZONTAL';
      const row = AL('H', { gap: 8, name: 'Report list' }); sc.appendChild(row);
      for (const x of REPORTS) { const on = x.name === r.name; const b = AL('H', { p: [0, 14], r: 999, ai: 'CENTER', bg: on ? 'ink' : 'surface', stroke: on ? null : 'line-strong', name: 'Rep · ' + x.name }); b.resize(10, 38); b.counterAxisSizingMode = 'FIXED'; b.primaryAxisSizingMode = 'AUTO'; row.appendChild(b); await addT(b, x.name, 'Small/B', on ? 'white' : 'ink-2'); }
      await reportBody(c, r);
    } else {
      c.layoutMode = 'HORIZONTAL'; c.layoutWrap = 'WRAP'; c.counterAxisSpacing = 20; c.itemSpacing = 20; c.primaryAxisSizingMode = 'FIXED'; c.counterAxisSizingMode = 'AUTO'; c.counterAxisAlignItems = 'MIN';
      const nav = card({ p: 8, gap: 2, name: 'Report list' }); add(c, nav, 'FILL'); nav.layoutGrow = 1; nav.minWidth = 260; nav.maxWidth = 300;
      for (const x of REPORTS) { const on = x.name === r.name; const b = AL('V', { gap: 2, p: [10, 12], r: 10, bg: on ? 'primary-soft' : null, name: 'Rep · ' + x.name }); add(nav, b, 'FILL'); await addT(b, x.name, 'Small/B', on ? 'primary-ink' : 'ink'); await addT(b, x.q, 'Caption', 'muted', { fill: true }); }
      const main = AL('V', { gap: 0, name: 'Report host' }); add(c, main, 'FILL'); main.layoutGrow = 3; main.minWidth = 520;
      await reportBody(main, r);
    }
  } })), W, async (v) => {
    for (const c of Object.values(v)) {
      const cur = c.name.slice(7);
      for (const b of c.findAll(x => x.name.indexOf('Rep · ') === 0)) { const n = b.name.slice(6); if (n !== cur) changeTo(b, v['Report=' + n]); }
      for (const b of c.findAll(x => /^Button · Export (CSV|PDF)$/.test(x.name))) toast(b, 'export');
    }
  }, { perRow: MOB ? 8 : 2, description: 'Eight reports; pick one from the list to switch variants.' });
}

// ===== Tenant portal (mobile-first app, 390 × 844) =====
async function portalSet() {
  const views = ['Home', 'Rent', 'Requests', 'Sent', 'New', 'Profile'];
  const headings = { Home: 'Hello, Customer A', Rent: 'Rent', Requests: 'My requests', Sent: 'My requests', New: 'New request', Profile: 'Profile' };
  return makeSet('Tenant portal / ' + (MOB ? 'Mobile' : 'Desktop'), views.map(view => ({ name: 'View=' + view, build: async (c) => {
    c.itemSpacing = 0; c.fills = [P('bg')]; c.clipsContent = true; c.counterAxisSizingMode = 'FIXED'; c.resize(390, 844); c.primaryAxisSizingMode = 'FIXED';
    const hd = AL('H', { jc: 'SPACE_BETWEEN', ai: 'CENTER', p: [22, 20, 14, 20], gap: 12, name: 'Header' }); add(c, hd, 'FILL');
    const ht = AL('V', { gap: 2 }); add(hd, ht, 'FILL'); await addT(ht, 'Unit 101 · Sunrise Residency', 'Caption', 'muted'); await addT(ht, headings[view], 'H2', 'ink');
    hd.appendChild(avatar('CA', 'Primary', 'M'));
    const body = AL('V', { gap: 14, p: [4, 20, 24, 20], name: 'Content', clip: true }); add(c, body, 'FILL', 'FILL'); body.overflowDirection = 'VERTICAL';
    if (view === 'Home') {
      const hero = AL('V', { gap: 10, p: 20, r: 20, bg: 'side', name: 'Rent hero' }); add(body, hero, 'FILL');
      const r1 = AL('H', { jc: 'SPACE_BETWEEN', ai: 'CENTER' }); add(hero, r1, 'FILL'); await addT(r1, 'October rent', 'Small/B', 'side-ink'); r1.appendChild(chip('Paid', 'Success', true));
      await addT(hero, '₹20,000', 'Stat/L', 'white'); await addT(hero, 'Paid on 3 Oct 2026 · UPI', 'Small/M', 'side-muted');
      const r2 = AL('H', { jc: 'SPACE_BETWEEN', ai: 'CENTER', p: [12, 0, 0, 0] }); add(hero, r2, 'FILL'); r2.strokes = [P('side-active')]; r2.strokeTopWeight = 1; r2.strokeBottomWeight = 0; r2.strokeLeftWeight = 0; r2.strokeRightWeight = 0;
      await addT(r2, 'Next rent due', 'Small/M', 'side-ink'); await addT(r2, '5 Nov 2026', 'Small/B', 'accent');
      const ls = card({ p: 16, gap: 10, name: 'My lease' }); add(body, ls, 'FILL');
      const l1 = AL('H', { jc: 'SPACE_BETWEEN' }); add(ls, l1, 'FILL'); await addT(l1, 'My lease', 'Body/B', 'ink'); await addT(l1, '167 days left', 'Small/M', 'muted');
      add(ls, progress(54, 'primary', 8), 'FILL'); const l2 = AL('H', { jc: 'SPACE_BETWEEN' }); add(ls, l2, 'FILL'); await addT(l2, '1 Apr 2026', 'Caption', 'muted'); await addT(l2, '31 Mar 2027', 'Caption', 'muted');
      const qa = AL('H', { gap: 10, wrap: true, rowGap: 10, name: 'Quick actions' }); add(body, qa, 'FILL');
      for (const [l, i, k] of [['Raise a request', 'wrench', 'New'], ['Rent history', 'rupee', 'Rent'], ['Lease details', 'file', 'Profile'], ['Email manager', 'mail', 'mail']]) {
        const b = AL('V', { gap: 10, p: 14, r: 14, bg: 'surface', stroke: 'line', name: 'QA · ' + k }); add(qa, b, 'FILL'); b.minWidth = 150;
        b.appendChild(bubble(i, 'primary', 36)); await addT(b, l, 'Small/B', 'ink');
      }
      const lr = card({ p: 16, gap: 10, name: 'Latest request' }); add(body, lr, 'FILL');
      const lh = AL('H', { jc: 'SPACE_BETWEEN', ai: 'CENTER' }); add(lr, lh, 'FILL'); await addT(lh, 'Latest request', 'Body/B', 'ink'); lh.appendChild(await link('See all', false));
      const li = AL('H', { jc: 'SPACE_BETWEEN', ai: 'CENTER', gap: 10 }); add(lr, li, 'FILL'); const lt = AL('V', { gap: 2 }); add(li, lt, 'FILL'); await addT(lt, 'Bathroom pipe leak', 'Small/B', 'ink'); await addT(lt, '#45 · fixed 12 Sep 2026', 'Caption', 'muted'); li.appendChild(chip('Closed', 'Neutral'));
    } else if (view === 'Rent') {
      const pd = card({ p: 16, gap: 6, name: 'Dues' }); add(body, pd, 'FILL'); pd.layoutMode = 'HORIZONTAL'; pd.counterAxisAlignItems = 'CENTER'; pd.primaryAxisAlignItems = 'SPACE_BETWEEN';
      const pt = AL('V', { gap: 2 }); pd.appendChild(pt); await addT(pt, 'Pending dues', 'Caption', 'muted'); await addT(pt, '₹0', 'Stat/M', 'ink'); pd.appendChild(chip('All paid', 'Success', true));
      const ml = card({ p: [4, 16], gap: 0, name: 'Months' }); add(body, ml, 'FILL');
      const months = [['October 2026', '3 Oct'], ['September 2026', '4 Sep'], ['August 2026', '5 Aug'], ['July 2026', '2 Jul'], ['June 2026', '5 Jun'], ['May 2026', '3 May']];
      for (let i = 0; i < months.length; i++) { const r = AL('H', { jc: 'SPACE_BETWEEN', ai: 'CENTER', p: [12, 0], gap: 10 }); add(ml, r, 'FILL'); if (i) topLine(r); const a = AL('V', { gap: 2 }); add(r, a, 'FILL'); await addT(a, months[i][0], 'Small/B', 'ink'); await addT(a, 'Paid ' + months[i][1], 'Caption', 'muted'); const b = AL('H', { gap: 8, ai: 'CENTER' }); r.appendChild(b); await addT(b, '₹20,000', 'Small/B', 'ink'); b.appendChild(chip('Paid', 'Success')); }
      await addT(body, 'Your owner records each payment. Online rent payment is coming in a later update.', 'Caption', 'muted', { fill: true });
    } else if (view === 'Requests' || view === 'Sent') {
      if (view === 'Sent') { const ok = AL('H', { gap: 10, ai: 'MIN', p: [12, 14], r: 12, bg: 'success-soft', name: 'Success' }); add(body, ok, 'FILL'); ok.appendChild(ic('check', 18, 'success')); await addT(ok, 'Request #55 sent. The manager has been notified — you will get an email when its status changes.', 'Small/M', 'success', { fill: true }); }
      add(body, btn('New request', 'Primary', 'L', 'plus'), 'FILL');
      const lst = card({ p: [4, 16], gap: 0, name: 'Requests' }); add(body, lst, 'FILL');
      const reqs = [['Bathroom pipe leak', '#45 · raised 10 Sep 2026', 'Closed', 'Neutral'], ['Fan not working', '#31 · raised 16 Jun 2026', 'Closed', 'Neutral']];
      if (view === 'Sent') reqs.unshift(['Kitchen tap leaking', '#55 · raised today', 'Open', 'Warn']);
      for (let i = 0; i < reqs.length; i++) { const r = AL('H', { jc: 'SPACE_BETWEEN', ai: 'CENTER', p: [12, 0], gap: 10 }); add(lst, r, 'FILL'); if (i) topLine(r); const a = AL('V', { gap: 2 }); add(r, a, 'FILL'); await addT(a, reqs[i][0], 'Small/B', 'ink'); await addT(a, reqs[i][1], 'Caption', 'muted'); r.appendChild(chip(reqs[i][2], reqs[i][3], reqs[i][2] === 'Open')); }
    } else if (view === 'New') {
      body.appendChild(await link('Back to requests', 'arrow-left'));
      add(body, field('What is the problem about?', 'Plumbing', 'Select'), 'FILL');
      add(body, field('Describe the problem', 'For example: the kitchen tap is leaking and water collects under the sink.', 'Area'), 'FILL');
      const pg = AL('V', { gap: 8 }); add(body, pg, 'FILL'); await addT(pg, 'How urgent is it?', 'Small/B', 'ink'); add(pg, priorityPicker('Medium'), 'FILL');
      const ph = AL('H', { gap: 10, ai: 'CENTER', p: [14, 14], r: 12, stroke: 'line-strong', name: 'Photos' }); ph.dashPattern = [5, 4]; add(body, ph, 'FILL'); ph.appendChild(ic('camera', 18, 'muted')); await addT(ph, 'Add photos · coming soon', 'Small/M', 'muted');
      add(body, btn('Send request', 'Primary', 'L', 'check'), 'FILL');
    } else if (view === 'Profile') {
      const pc = card({ p: [4, 16], gap: 0, name: 'Details' }); add(body, pc, 'FILL');
      let first = true; for (const [l, v] of [['Name', 'Customer A'], ['Mobile', '98XXX XX310'], ['Email', 'customer.a@example.com'], ['Lease', '1 Apr 2026 – 31 Mar 2027'], ['Monthly rent', '₹20,000 · due 5th'], ['Deposit held', '₹60,000']]) { await kvRow(pc, l, v, { noLine: first }); first = false; }
      add(body, field('Alternate mobile', 'Add a second number'), 'FILL');
      add(body, field('Emergency contact', 'Name and phone'), 'FILL');
      add(body, btn('Save changes', 'Secondary', 'L', 'check'), 'FILL');
      add(body, btn('Sign out', 'Danger', 'L', 'logout'), 'FILL');
    }
    const tb = AL('H', { p: [8, 10, 18, 10], gap: 4, bg: 'surface', name: 'Tab bar' }); add(c, tb, 'FILL'); topLine(tb);
    const active = view === 'Sent' || view === 'New' ? 'Requests' : view;
    for (const [k, i] of [['Home', 'home'], ['Rent', 'rupee'], ['Requests', 'wrench'], ['Profile', 'user']]) {
      const on = k === active;
      const b = AL('V', { gap: 4, ai: 'CENTER', p: [4, 0], name: 'PTab · ' + k }); add(tb, b, 'FILL');
      const pill = AL('H', { r: 999, ai: 'CENTER', jc: 'CENTER', bg: on ? 'primary-soft' : null }); fixSize(pill, 56, 30); b.appendChild(pill); pill.appendChild(ic(i, 20, on ? 'primary' : 'muted'));
      await addT(b, k, 'Caption', on ? 'primary-ink' : 'muted');
    }
  } })), 390, async (v) => {
    for (const c of Object.values(v)) {
      const cur = c.name.slice(5);
      for (const b of c.findAll(x => x.name.indexOf('PTab · ') === 0)) { const k = b.name.slice(7); if (k !== cur) changeTo(b, v['View=' + k]); }
      for (const b of c.findAll(x => x.name.indexOf('QA · ') === 0)) { const k = b.name.slice(5); if (k === 'mail') toast(b, 'email'); else changeTo(b, v['View=' + k]); }
      changeTo(byName(c, 'Link · See all'), v['View=Requests']);
      changeTo(byName(c, 'Button · New request'), v['View=New']);
      changeTo(byName(c, 'Link · Back to requests'), v['View=Requests']);
      changeTo(byName(c, 'Button · Send request'), v['View=Sent']);
      toast(byName(c, 'Button · Save changes'), 'saved');
      go(byName(c, 'Button · Sign out'), 'login');
      toast(byName(c, 'Photos'), 'done');
    }
  }, { h: 844, perRow: 6, description: 'Tenant portal app. Bottom tabs, quick actions and the request flow switch variants.' });
}
// ---------- screen shells ----------
const DW = 1440, DH = 900, MW = 390, MH = 844;
let SIDEBAR_SET = null;
async function shell(name, active, x, y, o) {
  o = o || {};
  const root = figma.createFrame(); root.name = name; root.x = x; root.y = y; root.fills = [P('bg')]; root.clipsContent = true;
  PAGE.appendChild(root); STATS.frames++;
  if (!MOB) {
    root.resize(DW, DH);
    const sb = figma.createRectangle(); sb.name = 'Sidebar backdrop'; sb.resize(264, DH); sb.fills = [P('side')]; root.appendChild(sb); sb.constraints = { horizontal: 'MIN', vertical: 'STRETCH' };
    const main = AL('V', { gap: 24, p: [28, 40, 56, 40], name: 'Main' }); root.appendChild(main); main.x = 264; main.y = 0; main.resize(DW - 264, 100); main.primaryAxisSizingMode = 'AUTO'; main.counterAxisSizingMode = 'FIXED'; main.constraints = { horizontal: 'STRETCH', vertical: 'MIN' };
    const sbi = variant(SIDEBAR_SET, { Active: active }).createInstance(); root.appendChild(sbi); sbi.x = 0; sbi.y = 0; sbi.name = 'Sidebar';
    return { root, main };
  }
  root.resize(MW, MH);
  const main = AL('V', { gap: 16, p: [16, 16, 40, 16], name: 'Main' }); root.appendChild(main); main.x = 0; main.y = 64; main.resize(MW, 100); main.primaryAxisSizingMode = 'AUTO'; main.counterAxisSizingMode = 'FIXED'; main.constraints = { horizontal: 'STRETCH', vertical: 'MIN' };
  const bar = AL('H', { gap: 4, ai: 'CENTER', p: [0, 8], bg: 'surface', name: 'App bar' }); root.appendChild(bar); fixSize(bar, MW, 64); bottomLine(bar); bar.x = 0; bar.y = 0; bar.constraints = { horizontal: 'STRETCH', vertical: 'MIN' };
  if (o.back) backIt(apd(bar, iconBtn('arrow-left', { name: 'IconButton · Back', bg: null, stroke: false })));
  else overlay(apd(bar, iconBtn('menu', { name: 'IconButton · Menu', bg: null, stroke: false })), 'ov:drawer', 'drawer');
  const t = await addT(bar, o.title || active, 'H3', 'ink'); t.layoutSizingHorizontal = 'FILL'; t.textAutoResize = 'HEIGHT';
  const bell = iconBtn('bell', { name: 'IconButton · Notifications', bg: null, stroke: false }); const bd = dot('danger-solid', 9); bell.appendChild(bd); bd.layoutPositioning = 'ABSOLUTE'; bd.x = 25; bd.y = 10; bar.appendChild(bell); overlay(bell, 'ov:notif');
  if (o.back) overlay(apd(bar, iconBtn('menu', { name: 'IconButton · Menu', bg: null, stroke: false })), 'ov:drawer', 'drawer');
  return { root, main };
}
function finish(s) {
  if (!MOB) { s.root.resize(DW, Math.max(DH, Math.ceil(s.main.height))); }
  else { s.root.resize(MW, Math.max(MH, Math.ceil(64 + s.main.height))); }
  s.root.numberOfFixedChildren = 1;
  return s.root;
}
// full-viewport overlay frame with a scrim that closes it
function ovFrame(name, x, y, scrimOpacity) {
  const W = MOB ? MW : DW, H = MOB ? MH : DH;
  const f = figma.createFrame(); f.name = name; f.resize(W, H); f.x = x; f.y = y; f.fills = []; f.clipsContent = true; PAGE.appendChild(f); STATS.frames++;
  const s = figma.createRectangle(); s.name = 'Scrim'; s.resize(W, H); s.fills = [P('scrim', scrimOpacity == null ? 0.45 : scrimOpacity)]; f.appendChild(s); s.constraints = { horizontal: 'STRETCH', vertical: 'STRETCH' };
  closeIt(s);
  return f;
}
function placeCenter(f, n) { n.x = Math.round((f.width - n.width) / 2); n.y = Math.round((f.height - n.height) / 2); n.constraints = { horizontal: 'CENTER', vertical: 'CENTER' }; }
function placeBottom(f, n) { n.x = 0; n.y = f.height - n.height; n.constraints = { horizontal: 'STRETCH', vertical: 'MAX' }; }
function dialog(w) {
  const d = AL('V', { gap: 18, p: MOB ? [12, 18, 24, 18] : [24, 28], bg: 'surface', r: MOB ? 24 : 20, name: 'Dialog' });
  d.resize(MOB ? MW : w, 100); d.counterAxisSizingMode = 'FIXED'; d.primaryAxisSizingMode = 'AUTO';
  if (MOB) { d.bottomLeftRadius = 0; d.bottomRightRadius = 0; const g = figma.createRectangle(); g.resize(40, 4); g.cornerRadius = 2; g.fills = [P('line-strong')]; d.appendChild(g); g.layoutAlign = 'CENTER'; }
  d.effects = [{ type: 'DROP_SHADOW', color: { r: 0.04, g: 0.09, b: 0.08, a: 0.25 }, offset: { x: 0, y: 16 }, radius: 40, spread: 0, visible: true, blendMode: 'NORMAL' }];
  return d;
}
async function dialogHead(d, title, sub) {
  const h = AL('H', { jc: 'SPACE_BETWEEN', ai: 'CENTER', gap: 10 }); add(d, h, 'FILL');
  const t = AL('V', { gap: 2 }); add(h, t, 'FILL'); await addT(t, title, 'H2', 'ink'); if (sub) await addT(t, sub, 'Small/M', 'muted', { fill: true });
  closeIt(apd(h, iconBtn('x', { name: 'IconButton · Close', bg: 'surface-2', stroke: false, s: 40 })));
  return h;
}
async function dialogFoot(d, okLabel, okIcon, okTo) {
  const ft = AL('H', { gap: 10, jc: 'MAX', p: [4, 0, 0, 0] }); add(d, ft, 'FILL');
  const c = btn('Cancel', 'Secondary', 'M'); const ok = btn(okLabel, 'Primary', 'M', okIcon); ft.appendChild(c); ft.appendChild(ok);
  if (MOB) { c.layoutSizingHorizontal = 'FILL'; ok.layoutSizingHorizontal = 'FILL'; }
  closeIt(c); swap(ok, okTo);
}
function pairRow(par, a, b, c) { const r = flex('Field row', 14); add(par, r, 'FILL'); for (const f of [a, b, c]) { if (!f) continue; add(r, f, 'FILL'); mw(f, c ? 150 : 200, null); } return r; }
// ================= SCREENS =================
const PFX = () => (MOB ? 'M' : 'D');

// ---------- 01 Sign in ----------
async function scrLogin(x, y) {
  const root = AL(MOB ? 'V' : 'H', { name: PFX() + '01 · Sign in', wrap: !MOB });
  PAGE.appendChild(root); STATS.frames++; root.x = x; root.y = y; root.fills = [P('surface')];
  if (!MOB) { fixSize(root, DW, DH); } else { root.resize(MW, MH); root.counterAxisSizingMode = 'FIXED'; root.primaryAxisSizingMode = 'AUTO'; root.minHeight = MH; }
  const left = AL('V', { bg: 'side', p: MOB ? [28, 20, 28, 20] : [56, 64], gap: MOB ? 18 : 40, jc: 'SPACE_BETWEEN', name: 'Brand panel' }); add(root, left, 'FILL', MOB ? null : 'FILL'); if (!MOB) left.minWidth = 520;
  const lg = AL('H', { gap: 12, ai: 'CENTER' }); left.appendChild(lg);
  const mk = AL('H', { r: 12, bg: 'primary', ai: 'CENTER', jc: 'CENTER' }); fixSize(mk, 44, 44); mk.appendChild(ic('home', 22, 'white')); lg.appendChild(mk);
  await addT(lg, 'Property CRM', 'H2', 'white');
  const hero = AL('V', { gap: MOB ? 12 : 20, name: 'Hero' }); add(left, hero, 'FILL');
  hero.appendChild(chip('Built for owners & managers', 'Accent', true));
  const h1 = await addT(hero, 'Every property, unit and tenant in one place.', MOB ? 'H1' : 'Display', 'white', { fill: true }); h1.maxWidth = 560;
  if (!MOB) await addT(hero, 'Properties, units, tenants, agreements, rent, maintenance and reports — managed from a single dashboard instead of spreadsheets and chat threads.', 'Body/L', 'side-ink', { fill: true });
  if (!MOB) {
    const ill = AL('V', { bg: 'side-2', r: 18, p: 20, gap: 14, name: 'Live grid preview' }); add(left, ill, 'FILL');
    const ih = AL('H', { jc: 'SPACE_BETWEEN', ai: 'CENTER' }); add(ill, ih, 'FILL'); await addT(ih, 'Sunrise Residency · Floor 1–2', 'Small/B', 'white'); ih.appendChild(chip('Live', 'Success', true));
    const col = { o: 'primary', v: 'info-solid', r: 'warn-solid' };
    for (const row of ['oovooroooo', 'oovoooovor']) { const rr = AL('H', { gap: 6 }); add(ill, rr, 'FILL'); for (const ch of row) { const t = figma.createRectangle(); t.resize(30, 26); t.cornerRadius = 6; t.fills = [P(col[ch], 0.9)]; rr.appendChild(t); t.layoutSizingHorizontal = 'FILL'; } }
    const lgd = AL('H', { gap: 16 }); ill.appendChild(lgd); for (const [l, c] of [['Occupied', 'primary'], ['Vacant', 'info-solid'], ['Reserved', 'warn-solid']]) { const g = AL('H', { gap: 6, ai: 'CENTER' }); lgd.appendChild(g); g.appendChild(dot(c)); await addT(g, l, 'Caption', 'side-ink'); }
  }
  const feats = AL('H', { gap: MOB ? 8 : 12, wrap: true, rowGap: 8, name: 'Features' }); add(left, feats, 'FILL');
  for (const [a, b, i] of [['Unit status', 'Live, per unit', 'units'], ['Rent dues', 'Pending + overdue', 'rupee'], ['Lease expiry', 'Alerts at 30 days', 'calendar']]) {
    const f = AL(MOB ? 'H' : 'V', { bg: 'side-2', r: 14, p: MOB ? [10, 12] : [14, 16], gap: 8, ai: MOB ? 'CENTER' : null }); add(feats, f, MOB ? null : 'FILL'); if (!MOB) f.minWidth = 150;
    f.appendChild(ic(i, MOB ? 16 : 18, 'accent')); if (!MOB) await addT(f, a, 'Caption', 'side-muted'); await addT(f, MOB ? a : b, MOB ? 'Caption' : 'Small/B', 'white');
  }
  const right = AL('V', { ai: 'CENTER', jc: 'CENTER', p: MOB ? [28, 20, 40, 20] : [48, 24], name: 'Form panel' }); add(root, right, 'FILL', MOB ? null : 'FILL'); if (!MOB) right.minWidth = 440;
  const form = AL('V', { gap: 20, name: 'Sign in form' }); right.appendChild(form); form.resize(MOB ? 350 : 400, 10); form.primaryAxisSizingMode = 'AUTO'; form.counterAxisSizingMode = 'FIXED'; if (MOB) form.layoutSizingHorizontal = 'FILL';
  const fh = AL('V', { gap: 6 }); add(form, fh, 'FILL'); await addT(fh, 'Welcome back', MOB ? 'H2' : 'H1', 'ink'); await addT(fh, 'Sign in as an admin, manager, finance, staff or owner.', 'Body/M', 'muted', { fill: true });
  add(form, field('Email', 'you@company.com'), 'FILL');
  add(form, field('Password', '••••••••••'), 'FILL');
  const fr = AL('H', { jc: 'SPACE_BETWEEN', ai: 'CENTER' }); add(form, fr, 'FILL'); fr.appendChild(checkbox('Keep me signed in', true));
  const fp = await link('Forgot password?', false); fr.appendChild(fp); toast(fp, 'reset');
  const si = btn('Sign in', 'Primary', 'L'); add(form, si, 'FILL'); go(si, 'dash');
  const lk = AL('H', { gap: 8, ai: 'CENTER', p: [10, 12], r: 10, bg: 'surface-2' }); add(form, lk, 'FILL'); lk.appendChild(ic('shield', 16, 'muted')); await addT(lk, 'After 5 wrong attempts the account locks for 15 minutes.', 'Caption', 'muted', { fill: true });
  const orr = AL('H', { gap: 12, ai: 'CENTER' }); add(form, orr, 'FILL'); hr(orr); await addT(orr, 'Are you a tenant?', 'Caption', 'muted'); hr(orr);
  const tp = btn('Open the tenant portal', 'Secondary', 'L', 'phone'); add(form, tp, 'FILL'); go(tp, 'portal');
  return root;
}

// ---------- 02 Dashboard ----------
async function scrDash(x, y) {
  const s = await shell(PFX() + '02 · Dashboard', 'Dashboard', x, y, { title: 'Dashboard' }); const m = s.main;
  const acts = [];
  if (!MOB) { const sf = await searchBox('Search tenant, mobile, unit…', 280); toast(sf, 'done'); const bell = iconBtn('bell', { name: 'IconButton · Notifications' }); const bd = dot('danger-solid', 10); bell.appendChild(bd); bd.layoutPositioning = 'ABSOLUTE'; bd.x = 25; bd.y = 9; overlay(bell, 'ov:notif'); acts.push(sf, bell); }
  await pageHead(m, 'Thursday, 15 October 2026', 'Good morning, Manager', acts);
  const fbar = AL('H', { gap: 10, ai: 'CENTER', jc: 'SPACE_BETWEEN', wrap: true, rowGap: 10, name: 'Toolbar' }); add(m, fbar, 'FILL');
  const fl = AL('H', { gap: 8, ai: 'CENTER', wrap: true, rowGap: 8 }); fbar.appendChild(fl); if (MOB) fl.layoutSizingHorizontal = 'FILL';
  go(apd(fl, await pillSel('Property', 'All properties')), 'props'); toast(apd(fl, await pillSel('Month', 'October 2026')), 'done'); fl.appendChild(chip('Sample data', 'Accent', true));
  const fa = AL('H', { gap: 10, ai: 'CENTER' }); fbar.appendChild(fa); if (MOB) fa.layoutSizingHorizontal = 'FILL';
  const nl = btn('New lease', 'Secondary', 'M', 'file'), er = btn(MOB ? 'Enter rent' : 'Enter October rent', 'Primary', 'M', 'plus'); fa.appendChild(nl); fa.appendChild(er); go(nl, 'lease'); go(er, 'rent');
  if (MOB) { nl.layoutSizingHorizontal = 'FILL'; er.layoutSizingHorizontal = 'FILL'; }
  const ov = flex('Overview', 20); add(m, ov, 'FILL');
  const overview = async (title, sub, big, bigsub, parts, legend, to) => {
    const c = card({ p: MOB ? 18 : [22, 24], gap: 16, name: 'Overview · ' + title }); add(ov, c, 'FILL', MOB ? null : 'FILL'); mw(c, 420, null);
    await head(c, title, sub); const bn = AL('H', { gap: 10, ai: 'BASELINE', wrap: true, rowGap: 4 }); add(c, bn, 'FILL'); await addT(bn, big, MOB ? 'Stat/M' : 'Stat/L', 'ink'); await addT(bn, bigsub, 'Small/M', 'muted');
    add(c, bar(parts, 12), 'FILL'); const lg = AL('H', { gap: 8, wrap: true, rowGap: 8, name: 'Legend' }); add(c, lg, 'FILL');
    for (const [l, v, cc] of legend) { const it = AL('H', { gap: 8, ai: 'CENTER', p: [8, 12], r: 10, bg: 'surface-2', name: 'Legend · ' + l }); lg.appendChild(it); it.appendChild(dot(cc, 9)); await addT(it, l, 'Small/M', 'ink-2'); await addT(it, v, 'Small/B', 'ink'); go(it, to); }
  };
  await overview('Occupancy', '240 units', '81.7%', '196 of 240 occupied', [[196, 'primary'], [30, 'info-solid'], [10, 'warn-solid'], [4, 'faint']], [['Occupied', '196', 'primary'], ['Vacant', '30', 'info-solid'], ['Reserved', '10', 'warn-solid'], ['Maintenance', '4', 'faint']], 'prop');
  await overview('October rent', '₹44.0 L due', '₹38.4 L', 'collected · 87%', [[38.4, 'success-solid'], [4.5, 'warn-solid'], [1.1, 'danger-solid']], [['Paid', '₹38.4 L', 'success-solid'], ['Pending', '₹4.5 L', 'warn-solid'], ['Overdue', '₹1.1 L', 'danger-solid']], 'rent');
  const kg = grid('Key figures', MOB ? 12 : 16); add(m, kg, 'FILL');
  const K = [['Properties', '3', 'Residential + commercial', 'building', 'primary', 'props'], ['Total units', '240', 'Across 3 properties', 'units', 'primary', 'prop'], ['Active tenants', '196', 'One per occupied unit', 'users', 'primary', 'tenant'], ['Open maintenance', '14', '1 past its SLA', 'wrench', 'warn', 'maint'], ['Pending rent', '₹4.5 L', '38 tenants · not yet due', 'clock', 'warn', 'rent'], ['Overdue rent', '₹1.1 L', '12 tenants past due', 'alert', 'danger', 'rent'], ['Leases expiring', '9', 'In the next 30 days', 'calendar', 'warn', 'lease'], ['Net income (Oct)', '₹31.6 L', 'After ₹6.8 L expenses', 'trend', 'success', 'reports']];
  for (const [l, v, sub, i, t, to] of K) {
    const c = card({ p: MOB ? 14 : 18, gap: MOB ? 8 : 12, name: 'KPI · ' + l }); add(kg, c, 'FILL'); mw(c, 230, 150);
    const top = AL('H', { jc: 'SPACE_BETWEEN', ai: 'CENTER', gap: 8 }); add(c, top, 'FILL'); const lt = await addT(top, l, MOB ? 'Caption' : 'Small/B', 'muted'); lt.layoutSizingHorizontal = 'FILL'; lt.textAutoResize = 'HEIGHT'; top.appendChild(bubble(i, t, MOB ? 30 : 34));
    await addT(c, v, MOB ? 'Stat/S' : 'Stat/M', t === 'danger' ? 'danger' : 'ink');
    const bt = AL('H', { jc: 'SPACE_BETWEEN', ai: 'CENTER', gap: 8 }); add(c, bt, 'FILL'); await addT(bt, sub, 'Caption', 'muted', { fill: true }); if (!MOB) bt.appendChild(ic('arrow-right', 16, 'faint'));
    go(c, to);
  }
  const r2 = flex('Row · attention', 20); add(m, r2, 'FILL');
  const at = card({ p: MOB ? [16, 16] : [20, 22], gap: 4, name: 'Needs your attention' }); add(r2, at, 'FILL'); grow(at, 2); mw(at, 520, null);
  await head(at, 'Needs your attention', chip('4 items', 'Danger'));
  const A = [['Overdue', 'Danger', 'Customer B · Unit 102, Sunrise', '₹18,000 · 12 days past due', 'Email reminder', 'mail', ['toast', 'reminder']], ['Overdue', 'Danger', 'Customer F · Shop G-04, City Mall', '₹42,000 · 6 days past due', 'Email reminder', 'mail', ['toast', 'reminder']], ['Expiring', 'Warn', 'Customer C · Unit 104, Sunrise', 'Lease ends 14 Nov 2026 · 30 days left', 'Start renewal', 'file', ['go', 'lease']], ['Urgent', 'Danger', 'Lift stuck at floor 3 · common area', 'Ticket #53 · SLA breached · unassigned', 'Assign staff', 'wrench', ['go', 'maint']]];
  for (let i = 0; i < A.length; i++) {
    const [k, tone, ti, me, ac, icn, act] = A[i];
    const row = AL(MOB ? 'V' : 'H', { gap: MOB ? 10 : 14, ai: MOB ? null : 'CENTER', p: [14, 0], name: 'Attention · ' + (i + 1) }); add(at, row, 'FILL'); if (i > 0) topLine(row);
    const main0 = AL('H', { gap: 12, ai: 'CENTER' }); add(row, main0, 'FILL');
    main0.appendChild(bubble(k === 'Expiring' ? 'calendar' : k === 'Urgent' ? 'alert' : 'rupee', tone.toLowerCase(), 40));
    const tx = AL('V', { gap: 4 }); add(main0, tx, 'FILL'); const tr = AL('H', { gap: 8, ai: 'CENTER', wrap: true, rowGap: 4 }); add(tx, tr, 'FILL'); tr.appendChild(chip(k, tone)); await addT(tr, ti, 'Small/B', 'ink'); await addT(tx, me, 'Caption', 'muted', { fill: true });
    const b = btn(ac, 'Secondary', 'S', icn); row.appendChild(b); if (MOB) b.layoutSizingHorizontal = 'FILL';
    if (act[0] === 'toast') toast(b, act[1]); else go(b, act[1]);
  }
  const bp = card({ p: MOB ? 16 : [20, 22], gap: 16, name: 'Occupancy by property' }); add(r2, bp, 'FILL'); grow(bp, 1); mw(bp, 320, null);
  await head(bp, 'Occupancy by property');
  for (const [n, c, p] of [['Sunrise Residency', '82 / 100', 82], ['Green Park', '70 / 80', 88], ['City Mall', '44 / 60', 73]]) {
    const it = AL('V', { gap: 8, name: 'Property · ' + n }); add(bp, it, 'FILL'); const tr = AL('H', { jc: 'SPACE_BETWEEN' }); add(it, tr, 'FILL'); await addT(tr, n, 'Small/B', 'ink'); const rr = AL('H', { gap: 6 }); tr.appendChild(rr); await addT(rr, c, 'Small/M', 'muted'); await addT(rr, p + '%', 'Small/B', 'ink'); add(it, progress(p), 'FILL'); go(it, 'prop');
  }
  go(apd(bp, await link('View all properties')), 'props');
  const r3 = flex('Row · recent', 20); add(m, r3, 'FILL');
  const al = await link('All rent'); go(al, 'rent');
  const RR = [['101', 'Customer A', '₹20,000', 'Paid', 'Success'], ['102', 'Customer B', '₹18,000', 'Overdue', 'Danger'], ['104', 'Customer C', '₹22,000', 'Paid', 'Success'], ['105', 'Customer D', '₹19,500', 'Pending', 'Warn'], ['G-04', 'Customer F', '₹42,000', 'Overdue', 'Danger']];
  const tb = await table(r3, 'Recent rent entries', al, ['Unit', 'Tenant', 'Month', 'Amount', 'Status'], RR.map(r => [r[0], r[1], 'Oct 2026', r[2], chip(r[3], r[4], true)]), { w: [0.6, 1.4, 1, 1, 1.1], bold: [1, 0, 0, 1, 0], mute: [0, 0, 1, 0, 0], align: ['', '', '', 'R', ''], rowName: 'Rent', mobileWidth: 560 });
  grow(tb.card, 3); mw(tb.card, 520, null); for (const r of tb.rows) go(r, 'unit');
  const rm = card({ p: MOB ? 16 : [20, 22], gap: 4, name: 'Recent maintenance' }); add(r3, rm, 'FILL'); grow(rm, 2); mw(rm, 360, null);
  const bl = await link('Board'); go(bl, 'maint'); await head(rm, 'Recent maintenance', bl);
  const TK = [['Lift stuck at floor 3', 'Sunrise · common area · Urgent', 'Open', 'danger-solid'], ['Leaking kitchen tap', 'Unit 102 · Plumbing · High', 'Open', 'warn-solid'], ['Power trip in bedroom', 'Unit 207 · Electrical · Urgent', 'In progress', 'danger-solid'], ['Balcony paint peeling', 'Unit 104 · Painting · Low', 'Resolved', 'success-solid']];
  for (const [t, me, st, bc] of TK) { const row = AL('H', { gap: 12, ai: 'CENTER', p: [12, 0], name: 'Ticket row · ' + t }); add(rm, row, 'FILL'); const b = figma.createRectangle(); b.resize(4, 36); b.cornerRadius = 2; b.fills = [P(bc)]; row.appendChild(b); const tx = AL('V', { gap: 2 }); add(row, tx, 'FILL'); await addT(tx, t, 'Small/B', 'ink'); await addT(tx, me, 'Caption', 'muted', { fill: true }); row.appendChild(chip(st, st === 'Open' ? 'Danger' : st === 'In progress' ? 'Info' : 'Success')); go(row, 'maint'); }
  return finish(s);
}

// ---------- 03 Properties ----------
async function scrProps(x, y) {
  const s = await shell(PFX() + '03 · Properties', 'Properties', x, y, { title: 'Properties' }); const m = s.main;
  const ap = btn('Add property', 'Primary', 'M', 'plus'); overlay(ap, 'ov:addprop', MOB ? 'sheet' : null);
  await pageHead(m, 'Portfolio', 'Properties', [ap]);
  const tb = AL('H', { gap: 8, ai: 'CENTER', wrap: true, rowGap: 8, name: 'Toolbar' }); add(m, tb, 'FILL');
  const sf = await searchBox('Search by name, code or city', 320); tb.appendChild(sf); if (MOB) sf.layoutSizingHorizontal = 'FILL';
  for (const [a, b] of [['Type', 'All'], ['Owner', 'All'], ['Status', 'Active']]) tb.appendChild(await pillSel(a, b));
  const gridF = grid('Property list', 20); add(m, gridF, 'FILL');
  const PR = [['Sunrise Residency', 'SR', 'SUN-RES', 'Satellite, Ahmedabad', 'Residential', 'Owner A', 82, '82 of 100 units', '12', '₹3.4 L', '5', 'primary'], ['Green Park', 'GP', 'GRN-PRK', 'Vesu, Surat', 'Residential', 'Owner A', 88, '70 of 80 units', '6', '₹1.2 L', '6', 'success'], ['City Mall', 'CM', 'CTY-MAL', 'Alkapuri, Vadodara', 'Commercial', 'Owner B', 73, '44 of 60 shops', '12', '₹1.0 L', '3', 'warn']];
  for (const [n, ini, code, city, type, own, occ, units, vac, due, tk, tone] of PR) {
    const c = card({ p: MOB ? 18 : 22, gap: 16, name: 'Property card · ' + n }); add(gridF, c, 'FILL'); mw(c, 300, 300); if (!MOB) c.layoutSizingVertical = 'FILL';
    const top = AL('H', { gap: 14, ai: 'CENTER' }); add(c, top, 'FILL'); const tile = AL('H', { r: 14, ai: 'CENTER', jc: 'CENTER', bg: tone + '-soft' }); fixSize(tile, 52, 52); top.appendChild(tile); await addT(tile, ini, 'Stat/S', tone === 'primary' ? 'primary-ink' : tone);
    const tt = AL('V', { gap: 2 }); add(top, tt, 'FILL'); await addT(tt, n, 'H2', 'ink', { fill: true }); await addT(tt, code + ' · ' + city, 'Small/M', 'muted', { fill: true });
    const ch = AL('H', { gap: 8, wrap: true, rowGap: 8 }); add(c, ch, 'FILL'); ch.appendChild(chip(type, 'Primary')); ch.appendChild(chip('Active', 'Success', true)); ch.appendChild(chip(own, 'Neutral'));
    const oc = AL('V', { gap: 8 }); add(c, oc, 'FILL'); const or = AL('H', { jc: 'SPACE_BETWEEN' }); add(oc, or, 'FILL'); await addT(or, 'Occupancy', 'Small/M', 'muted'); const orr = AL('H', { gap: 6 }); or.appendChild(orr); await addT(orr, occ + '%', 'Small/B', 'ink'); await addT(orr, '· ' + units, 'Small/M', 'muted'); add(oc, progress(occ), 'FILL');
    const st = AL('H', { gap: 12, p: [14, 0, 0, 0] }); add(c, st, 'FILL'); topLine(st);
    await stat(st, 'Vacant', vac, { st: 'Stat/S' }); await stat(st, 'Rent due', due, { st: 'Stat/S' }); await stat(st, 'Open tickets', tk, { st: 'Stat/S' });
    const ft = AL('H', { jc: 'SPACE_BETWEEN', ai: 'CENTER', p: [12, 14], r: 10, bg: 'surface-2', name: 'Link · Open property' }); add(c, ft, 'FILL'); await addT(ft, 'Open property', 'Small/B', 'primary'); ft.appendChild(ic('arrow-right', 16, 'primary'));
    go(ft, 'prop'); go(tile, 'prop');
  }
  const addc = AL('V', { gap: 10, ai: 'CENTER', jc: 'CENTER', p: 24, r: 16, stroke: 'primary-tint', sw: 1.5, name: 'Add a property' }); addc.dashPattern = [6, 4]; add(gridF, addc, 'FILL'); mw(addc, 300, 300);
  const pl = AL('H', { r: 24, ai: 'CENTER', jc: 'CENTER', bg: 'primary-soft' }); fixSize(pl, 48, 48); pl.appendChild(ic('plus', 22, 'primary')); addc.appendChild(pl);
  await addT(addc, 'Add a property', 'H3', 'primary'); const ad = await addT(addc, 'Name, code, type, address and owner — then bulk-add its units.', 'Small/M', 'muted', { align: 'CENTER' }); ad.resize(240, 20); ad.textAutoResize = 'HEIGHT';
  overlay(addc, 'ov:addprop', MOB ? 'sheet' : null);
  const ow = card({ p: MOB ? 16 : [20, 22], gap: 4, name: 'Owners' }); add(m, ow, 'FILL'); await head(ow, 'Owners', MOB ? null : 'Each property has exactly one owner; an owner can hold many properties.');
  for (const [ini, n, pp, inc] of [['OA', 'Owner A', 'Sunrise Residency, Green Park · 2 properties', '₹26.1 L'], ['OB', 'Owner B', 'City Mall · 1 property', '₹12.3 L']]) {
    const r = AL('H', { gap: 14, ai: 'CENTER', p: [14, 0], wrap: true, rowGap: 10, name: 'Owner · ' + n }); add(ow, r, 'FILL'); topLine(r);
    r.appendChild(avatar(ini, 'Neutral', 'M')); const t = AL('V', { gap: 2 }); add(r, t, 'FILL'); t.minWidth = MOB ? 220 : 200; await addT(t, n, 'Body/B', 'ink'); await addT(t, pp, 'Small/M', 'muted', { fill: true });
    const inc0 = AL('V', { gap: 2 }); r.appendChild(inc0); await addT(inc0, 'Collected (Oct)', 'Caption', 'muted'); await addT(inc0, inc, 'Stat/S', 'ink');
    go(apd(r, btn('Owner statement', 'Secondary', 'S', 'receipt')), 'reports');
  }
  return finish(s);
}

// ---------- 04 Property (units) ----------
async function scrProp(x, y, boardSet) {
  const s = await shell(PFX() + '04 · Property · Units', 'Units', x, y, { title: 'Sunrise Residency', back: MOB }); const m = s.main;
  const cr = await crumbs(m, ['Properties', 'Sunrise Residency']); go(cr[0], 'props');
  const hd = AL('H', { gap: 16, ai: 'CENTER', jc: 'SPACE_BETWEEN', wrap: true, rowGap: 14, name: 'Header' }); add(m, hd, 'FILL');
  const hl = AL('H', { gap: 14, ai: 'CENTER' }); hd.appendChild(hl); if (MOB) hl.layoutSizingHorizontal = 'FILL';
  const tile = AL('H', { r: 16, ai: 'CENTER', jc: 'CENTER', bg: 'primary-soft' }); fixSize(tile, MOB ? 52 : 60, MOB ? 52 : 60); hl.appendChild(tile); await addT(tile, 'SR', 'Stat/S', 'primary-ink');
  const ht = AL('V', { gap: 4 }); add(hl, ht, MOB ? 'FILL' : null); const htr = AL('H', { gap: 10, ai: 'CENTER', wrap: true, rowGap: 6 }); add(ht, htr, MOB ? 'FILL' : null); await addT(htr, 'Sunrise Residency', MOB ? 'H2' : 'H1', 'ink'); htr.appendChild(chip('Active', 'Success', true));
  await addT(ht, 'SUN-RES · Residential · Satellite, Ahmedabad · Owner A', 'Small/M', 'muted', { fill: MOB });
  const ha = AL('H', { gap: 10 }); hd.appendChild(ha); if (MOB) ha.layoutSizingHorizontal = 'FILL';
  const e1 = btn('Edit property', 'Secondary', 'M', 'edit'), e2 = btn('Bulk add units', 'Primary', 'M', 'plus'); ha.appendChild(e1); ha.appendChild(e2); toast(e1, 'saved'); toast(e2, 'done');
  if (MOB) { e1.layoutSizingHorizontal = 'FILL'; e2.layoutSizingHorizontal = 'FILL'; }
  const st = card({ p: MOB ? 16 : [18, 22], gap: 16, name: 'Summary' }); add(m, st, 'FILL'); st.layoutMode = 'HORIZONTAL'; st.layoutWrap = 'WRAP'; st.counterAxisSpacing = 16;
  for (const [l, v, c] of [['Units', '100'], ['Occupied', '82', 'primary'], ['Vacant', '12', 'info'], ['Reserved', '6', 'warn'], ['Rent due (Oct)', '₹3.4 L'], ['Open tickets', '5']]) await stat(st, l, v, { min: 120, mmin: 90, st: 'Stat/S', c });
  const ts = AL('H', { name: 'Scroll · tabs', clip: MOB }); add(m, ts, 'FILL'); if (MOB) ts.overflowDirection = 'HORIZONTAL'; bottomLine(ts);
  const tabs = AL('H', { gap: 4, name: 'Tabs' }); ts.appendChild(tabs);
  const TT = { Overview: 'props', Units: null, Tenants: 'tenant', Rent: 'rent', Maintenance: 'maint', Expenses: 'reports', Documents: 'unit', Activity: 'unit' };
  for (const t of Object.keys(TT)) { const on = t === 'Units'; const b = AL('V', { p: [10, 12, 12, 12], name: on ? 'Tab current · Units' : 'Tab · ' + t }); tabs.appendChild(b); if (on) bottomLine(b, 'primary', 2.5); await addT(b, t, 'Small/B', on ? 'ink' : 'muted'); if (TT[t]) go(b, TT[t]); }
  const def = MOB ? boardSet.v['Filter=All'] : boardSet.children.find(c => c.name === 'Filter=All, Unit=102');
  const inst = def.createInstance(); add(m, inst, 'FILL'); inst.name = 'Unit board';
  return finish(s);
}

// ---------- 05 Unit ----------
async function scrUnit(x, y) {
  const s = await shell(PFX() + '05 · Unit detail', 'Units', x, y, { title: 'Unit 101', back: MOB }); const m = s.main;
  const cr = await crumbs(m, ['Properties', 'Sunrise Residency', 'Unit 101']); go(cr[0], 'props'); go(cr[1], 'prop');
  const b1 = btn('Edit unit', 'Secondary', 'M', 'edit'), b2 = btn('Raise ticket', 'Secondary', 'M', 'wrench'), b3 = btn('Enter rent', 'Primary', 'M', 'plus');
  toast(b1, 'saved'); overlay(b2, 'ov:ticket', MOB ? 'sheet' : null); overlay(b3, 'ov:rent', MOB ? 'sheet' : null);
  await pageHead(m, null, 'Unit 101', MOB ? [b2, b3] : [b1, b2, b3], [chip('Occupied', 'Primary', true), chip('October rent paid', 'Success', true)]);
  const [A, B] = cols2(m);
  const ui = card({ p: MOB ? 16 : [20, 22], gap: 16, name: 'Unit information' }); add(A, ui, 'FILL'); await head(ui, 'Unit information', MOB ? b1 : null);
  const ug = grid('Facts', 16); add(ui, ug, 'FILL'); ug.counterAxisSpacing = 18;
  for (const [l, v, c] of [['Type', '2BHK flat'], ['Floor / block', '1 · Block A'], ['Area', '1,050 sq ft'], ['Status', 'Occupied'], ['Monthly rent', '₹20,000'], ['Security deposit', '₹60,000 held'], ['Pending amount', '₹0', 'success'], ['Rent due day', '5th of month']]) await stat(ug, l, v, { min: 110, mmin: 140, c });
  const ct = card({ p: MOB ? 16 : [20, 22], gap: 16, name: 'Current tenant' }); add(A, ct, 'FILL'); const ctr = AL('H', { gap: 16, ai: 'CENTER', wrap: true, rowGap: 14 }); add(ct, ctr, 'FILL');
  ctr.appendChild(avatar('CA', 'Primary', 'L')); const cti = AL('V', { gap: 2 }); add(ctr, cti, 'FILL'); cti.minWidth = 200; await addT(cti, 'Current tenant', 'Caption', 'muted'); const tn = await link('Customer A', 'arrow-right'); cti.appendChild(tn); go(tn, 'tenant'); await addT(cti, '98XXX XX310 · customer.a@example.com', 'Small/M', 'muted', { fill: true });
  const ag = AL('V', { gap: 8, p: [14, 16], r: 12, bg: 'surface-2', name: 'Agreement' }); add(ctr, ag, 'FILL'); ag.minWidth = 240; await addT(ag, 'Agreement', 'Caption', 'muted'); await addT(ag, '01 Apr 2026 → 31 Mar 2027', 'Body/B', 'ink'); add(ag, progress(54, 'primary', 6), 'FILL'); await addT(ag, 'Month 7 of 12 · 167 days left', 'Caption', 'muted');
  go(apd(ctr, btn('View lease', 'Secondary', 'M', 'file')), 'lease');
  await table(A, 'Rent history', 'Total this lease ₹1,40,000', ['Month', 'Amount', 'Due', 'Paid on', 'Mode', 'Status'], [['Oct 2026', '3 Oct', 'UPI'], ['Sep 2026', '4 Sep', 'UPI'], ['Aug 2026', '5 Aug', 'Bank transfer'], ['Jul 2026', '2 Jul', 'UPI'], ['Jun 2026', '5 Jun', 'Cheque'], ['May 2026', '3 May', 'UPI']].map(([mo, p, md]) => [mo, '₹20,000', '5 ' + mo.slice(0, 3), p, md, chip('Paid', 'Success', true)]), { w: [1, 1, 0.8, 0.8, 1.1, 0.9], bold: [1, 1, 0, 0, 0, 0], mute: [0, 0, 1, 0, 1, 0], align: ['', 'R', '', '', '', ''], rowName: 'Rent' });
  const mh = card({ p: MOB ? 16 : [20, 22], gap: 4, name: 'Maintenance history' }); add(B, mh, 'FILL'); await head(mh, 'Maintenance history', chip('No open requests', 'Success'));
  for (const [t, me, c] of [['#45 Bathroom pipe leak', 'Plumbing · closed 12 Sep 2026 · ₹1,200', 'warn-solid'], ['#31 Fan not working', 'Electrical · closed 18 Jun 2026 · ₹800', 'info-solid']]) { const r = AL('H', { gap: 12, ai: 'CENTER', p: [12, 0], name: 'History · ' + t }); add(mh, r, 'FILL'); const b = figma.createRectangle(); b.resize(4, 36); b.cornerRadius = 2; b.fills = [P(c)]; r.appendChild(b); const tx = AL('V', { gap: 2 }); add(r, tx, 'FILL'); await addT(tx, t, 'Small/B', 'ink'); await addT(tx, me, 'Caption', 'muted', { fill: true }); go(r, 'maint'); }
  const dc = card({ p: MOB ? 16 : [20, 22], gap: 4, name: 'Documents' }); add(B, dc, 'FILL'); await head(dc, 'Documents', btn('Upload', 'Secondary', 'S', 'upload'));
  for (const [n, me, lock] of [['Lease_101_2026.pdf', 'Lease · uploaded 1 Apr 2026', false], ['ID proof (KYC)', 'Restricted · Admin and Manager only', true]]) {
    const r = AL('H', { gap: 12, ai: 'CENTER', p: [12, 0], name: 'Doc · ' + n }); add(dc, r, 'FILL');
    const b = AL('H', { r: 8, ai: 'CENTER', jc: 'CENTER', bg: lock ? 'neutral-soft' : 'danger-soft' }); fixSize(b, 36, 36); r.appendChild(b); if (lock) b.appendChild(ic('lock', 16, 'neutral')); else await addT(b, 'PDF', 'Caption', 'danger');
    const tx = AL('V', { gap: 2 }); add(r, tx, 'FILL'); await addT(tx, n, 'Small/B', 'ink'); await addT(tx, me, 'Caption', 'muted', { fill: true });
    toast(apd(r, iconBtn(lock ? 'eye' : 'download', { name: 'IconButton · ' + (lock ? 'View' : 'Download'), bg: null, stroke: false, s: 36 })), lock ? 'done' : 'export');
  }
  const nt = card({ p: MOB ? 16 : [20, 22], gap: 12, name: 'Notes' }); add(B, nt, 'FILL'); add(nt, field('Notes', 'Parking slot P-14. Pets allowed with deposit.', 'Area'), 'FILL');
  const tl = card({ p: MOB ? 16 : [20, 22], gap: 0, name: 'Activity timeline' }); add(B, tl, 'FILL'); const tlh = await head(tl, 'Activity timeline'); tlh.paddingBottom = 14;
  const ACT = [['October rent marked Paid · ₹20,000 (UPI)', '3 Oct 2026 · by Owner A', 'success-solid'], ['October rent entered · ₹20,000', '1 Oct 2026 · by Owner A', 'primary'], ['Ticket #45 closed · ₹1,200 added to expenses', '12 Sep 2026 · by Staff 1', 'warn-solid'], ['Lease activated · unit set to Occupied', '1 Apr 2026 · by Property Manager', 'primary'], ['Unit created in bulk (001–100)', '20 Mar 2026 · by Property Manager', 'faint']];
  for (let i = 0; i < ACT.length; i++) {
    const [w, wh, c] = ACT[i]; const r = AL('H', { gap: 14, ai: 'MIN' }); add(tl, r, 'FILL');
    const rail = AL('V', { ai: 'CENTER', gap: 4, p: [4, 0, 0, 0], name: 'Rail' }); r.appendChild(rail); rail.appendChild(dot(c, 10));
    const tx = AL('V', { gap: 2, p: [0, 0, 18, 0] }); add(r, tx, 'FILL'); await addT(tx, w, 'Small/B', 'ink', { fill: true }); await addT(tx, wh, 'Caption', 'muted');
    if (i < ACT.length - 1) { const ln = figma.createRectangle(); ln.resize(2, Math.max(20, Math.round(tx.height - 18))); ln.fills = [P('line')]; rail.appendChild(ln); }
  }
  return finish(s);
}

// ---------- 06 Tenant ----------
async function scrTenant(x, y) {
  const s = await shell(PFX() + '06 · Tenant profile', 'Tenants', x, y, { title: 'Customer A', back: MOB }); const m = s.main;
  const cr = await crumbs(m, ['Units', 'Customer A']); go(cr[0], 'prop');
  const hc = card({ p: MOB ? 18 : 24, gap: MOB ? 14 : 20, name: 'Tenant header' }); add(m, hc, 'FILL'); if (!MOB) { hc.layoutMode = 'HORIZONTAL'; hc.counterAxisAlignItems = 'CENTER'; hc.layoutWrap = 'WRAP'; hc.counterAxisSpacing = 16; }
  hc.appendChild(avatar('CA', 'Primary', MOB ? 'L' : 'XL')); const hi = AL('V', { gap: 6 }); add(hc, hi, 'FILL'); if (!MOB) hi.minWidth = 320;
  const hn = AL('H', { gap: 10, ai: 'CENTER', wrap: true, rowGap: 6 }); add(hi, hn, 'FILL'); await addT(hn, 'Customer A', MOB ? 'H2' : 'H1', 'ink'); hn.appendChild(chip('Active tenant', 'Success', true)); hn.appendChild(chip('Individual', 'Neutral'));
  await addT(hi, 'Unit 101, Sunrise Residency · tenant since 1 Apr 2025', 'Body/M', 'muted', { fill: true });
  const cn = AL('H', { gap: 16, wrap: true, rowGap: 6 }); add(hi, cn, 'FILL'); for (const [i, t] of [['phone', '98XXX XX310'], ['mail', 'customer.a@example.com']]) { const g = AL('H', { gap: 6, ai: 'CENTER' }); cn.appendChild(g); g.appendChild(ic(i, 16, 'muted')); await addT(g, t, 'Small/B', 'ink-2'); }
  const ha = AL('H', { gap: 10 }); add(hc, ha, MOB ? 'FILL' : null); const e1 = btn('Edit profile', 'Secondary', 'M', 'edit'), e2 = btn('Email tenant', 'Primary', 'M', 'mail'); ha.appendChild(e1); ha.appendChild(e2); toast(e1, 'saved'); toast(e2, 'email'); if (MOB) { e1.layoutSizingHorizontal = 'FILL'; e2.layoutSizingHorizontal = 'FILL'; }
  const ss = card({ p: MOB ? 16 : [18, 22], gap: 16, name: 'Summary' }); add(m, ss, 'FILL'); ss.layoutMode = 'HORIZONTAL'; ss.layoutWrap = 'WRAP'; ss.counterAxisSpacing = 16;
  const su = await stat(ss, 'Unit', '101 · Sunrise ›', { min: 150, mmin: 140, c: 'primary', st: 'Stat/S' }); go(su, 'unit');
  await stat(ss, 'Monthly rent', '₹20,000', { min: 150, mmin: 140, st: 'Stat/S' }); await stat(ss, 'Pending dues', '₹0', { min: 150, mmin: 140, st: 'Stat/S', c: 'success' }); await stat(ss, 'Deposit held', '₹60,000', { min: 150, mmin: 140, st: 'Stat/S' }); await stat(ss, 'Lease ends', '31 Mar 2027', { min: 150, mmin: 140, st: 'Stat/S' });
  const [A, B] = cols2(m);
  const nl = await link('New lease'); go(nl, 'lease');
  await table(A, 'Agreements', nl, ['Period', 'Unit', 'Rent', 'Deposit', 'Status'], [['01 Apr 2026 – 31 Mar 2027', '101', '₹20,000', '₹60,000', chip('Active', 'Success', true)], ['01 Apr 2025 – 31 Mar 2026', '101', '₹19,000', '₹60,000', chip('Renewed +5.3%', 'Neutral')]], { w: [2, 0.6, 0.9, 0.9, 1.2], bold: [1, 0, 1, 0, 0], align: ['', '', 'R', 'R', ''], mobileWidth: 620 });
  await table(A, 'Rent ledger', 'Last 4 months', ['Month', 'Amount', 'Paid on', 'Reference', 'Status'], [['Oct 2026', '3 Oct 2026', 'UPI · 4471'], ['Sep 2026', '4 Sep 2026', 'UPI · 3920'], ['Aug 2026', '5 Aug 2026', 'NEFT · 8812'], ['Jul 2026', '2 Jul 2026', 'UPI · 2075']].map(([a, b, c]) => [a, '₹20,000', b, c, chip('Paid', 'Success', true)]), { w: [1, 1, 1.1, 1.1, 0.9], bold: [1, 1, 0, 0, 0], mute: [0, 0, 0, 1, 0], align: ['', 'R', '', '', ''], mobileWidth: 560 });
  const bl = await link('Board'); go(bl, 'maint');
  const mr = card({ p: MOB ? 16 : [20, 22], gap: 4, name: 'Maintenance requests' }); add(A, mr, 'FILL'); await head(mr, 'Maintenance requests', bl);
  for (const [t, me] of [['#45 Bathroom pipe leak', 'raised from tenant portal'], ['#31 Fan not working', 'raised by manager']]) { const r = AL('H', { gap: 12, ai: 'CENTER', jc: 'SPACE_BETWEEN', p: [12, 0] }); add(mr, r, 'FILL'); topLine(r); const tx = AL('V', { gap: 2 }); add(r, tx, 'FILL'); await addT(tx, t, 'Small/B', 'ink'); await addT(tx, me, 'Caption', 'muted'); r.appendChild(chip('Closed', 'Neutral')); }
  const pa = card({ p: MOB ? 16 : [20, 22], gap: 12, name: 'Tenant portal access' }); add(B, pa, 'FILL'); await head(pa, 'Tenant portal access', chip('Active', 'Success', true));
  await addT(pa, 'Invite accepted 2 Apr 2026. Last signed in 3 Oct 2026. The tenant can see their lease, monthly rent and raise requests.', 'Small/M', 'muted', { fill: true });
  const pab = AL('H', { gap: 10, wrap: true, rowGap: 10 }); add(pa, pab, 'FILL'); go(apd(pab, btn('Preview as tenant', 'Soft', 'S', 'eye')), 'portal'); toast(apd(pab, btn('Resend invite', 'Secondary', 'S', 'mail')), 'invite');
  const kyc = card({ p: MOB ? 16 : [20, 22], gap: 0, name: 'Contact and KYC' }); add(B, kyc, 'FILL'); const kh = await head(kyc, 'Contact and KYC', ic('shield', 18, 'muted')); kh.paddingBottom = 6;
  for (const [l, v] of [['Alternate mobile', '97XXX XX845'], ['Emergency contact', 'Relative · 99XXX XX120'], ['ID type', 'Aadhaar'], ['ID number', 'XXXX XXXX 4821'], ['Permanent address', '[Address on file]']]) await kvRow(kyc, l, v);
  const dd = card({ p: MOB ? 16 : [20, 22], gap: 4, name: 'Documents' }); add(B, dd, 'FILL'); await head(dd, 'Documents', btn('Upload', 'Secondary', 'S', 'upload'));
  for (const [n, me, x0] of [['Lease_101_2026.pdf', 'Lease', null], ['Lease_101_2025.pdf', 'Lease · previous', null], ['ID proof', '', chip('Restricted', 'Warn')]]) { const r = AL('H', { gap: 12, ai: 'CENTER', jc: 'SPACE_BETWEEN', p: [11, 0], name: 'Doc · ' + n }); add(dd, r, 'FILL'); topLine(r); const g = AL('H', { gap: 10, ai: 'CENTER' }); r.appendChild(g); g.appendChild(ic(x0 ? 'lock' : 'file', 18, 'muted')); await addT(g, n, 'Small/B', 'ink'); if (x0) r.appendChild(x0); else await addT(r, me, 'Caption', 'muted'); toast(r, x0 ? 'done' : 'export'); }
  return finish(s);
}
// ---------- 07 New lease ----------
async function scrLease(x, y, wizard) {
  const s = await shell(PFX() + '07 · New lease', 'Leases', x, y, { title: 'New lease', back: MOB }); const m = s.main;
  const acts = [];
  if (!MOB) { const cancel = btn('Cancel', 'Secondary', 'M', 'x'); go(cancel, 'prop'); acts.push(cancel); }
  await pageHead(m, 'Leases', 'New lease', acts);
  const r = flex('Columns', 20); add(m, r, 'FILL');
  const wi = wizard.v['Step=1'].createInstance(); add(r, wi, 'FILL'); grow(wi, 3); mw(wi, 560, null); wi.name = 'Lease wizard';
  const sm = card({ p: MOB ? 16 : [20, 22], gap: 12, name: 'Lease summary' }); add(r, sm, 'FILL'); grow(sm, 2); mw(sm, 300, null);
  await head(sm, 'Lease summary', chip('Draft', 'Neutral'));
  const u = AL('H', { gap: 12, ai: 'CENTER', p: 12, r: 12, bg: 'surface-2' }); add(sm, u, 'FILL'); const ut = AL('H', { r: 10, ai: 'CENTER', jc: 'CENTER', bg: 'info-soft' }); fixSize(ut, 40, 40); ut.appendChild(ic('units', 18, 'info')); u.appendChild(ut);
  const uu = AL('V', { gap: 2 }); add(u, uu, 'FILL'); await addT(uu, 'Unit 103 · 2BHK', 'Small/B', 'ink'); await addT(uu, 'Sunrise Residency · Floor 1 · Vacant', 'Caption', 'muted');
  for (const [l, v] of [['Tenant', 'Customer G'], ['Monthly rent', '₹19,000'], ['Security deposit', '₹57,000'], ['Period', '1 Nov 2026 – 31 Oct 2027'], ['Rent due', '5th of every month']]) await kvRow(sm, l, v);
  const tip = AL('H', { gap: 10, ai: 'MIN', p: [12, 14], r: 12, bg: 'primary-soft' }); add(sm, tip, 'FILL'); tip.appendChild(ic('sparkle', 16, 'primary')); await addT(tip, 'Activating the lease marks the unit Occupied and schedules expiry reminders automatically.', 'Caption', 'primary-ink', { fill: true });
  return finish(s);
}

// ---------- 08 Monthly rent ----------
async function scrRent(x, y, rt) {
  const s = await shell(PFX() + '08 · Monthly rent', 'Monthly rent', x, y, { title: 'Monthly rent' }); const m = s.main;
  const b1 = btn(MOB ? 'Pre-fill' : 'Pre-fill October from leases', 'Secondary', 'M', 'sparkle'), b2 = btn('Export CSV', 'Secondary', 'M', 'download'), b3 = btn('Enter rent', 'Primary', 'M', 'plus');
  toast(b1, 'saved'); toast(b2, 'export'); overlay(b3, 'ov:rent', MOB ? 'sheet' : null);
  const ph = await pageHead(m, 'Sunrise Residency · October 2026', 'Monthly rent', [b1, b2, b3]);
  if (MOB) { for (const b of [b1, b2, b3]) b.layoutSizingHorizontal = 'HUG'; b3.layoutSizingHorizontal = 'FILL'; }
  const bn = AL('H', { gap: 12, ai: 'MIN', p: [14, 16], r: 12, bg: 'info-soft', name: 'Info banner' }); add(m, bn, 'FILL'); bn.appendChild(ic('alert', 18, 'info'));
  await addT(bn, 'Rent is entered manually each month by the property owner. Mark an entry Paid with its date and reference. Partial payments, receipts and online payments come in a later phase.', 'Small/M', 'info', { fill: true });
  const sc = card({ p: MOB ? 16 : [18, 22], gap: 16, name: 'Summary' }); add(m, sc, 'FILL'); sc.layoutMode = 'HORIZONTAL'; sc.layoutWrap = 'WRAP'; sc.counterAxisSpacing = 16;
  for (const [l, v, c, sub] of [['Entered', '78', null, 'of 82 occupied'], ['Total due', '₹16.4 L'], ['Paid', '₹13.0 L', 'success'], ['Pending', '₹2.8 L', 'warn'], ['Overdue', '₹0.6 L', 'danger']]) await stat(sc, l, v, { min: 120, mmin: 140, st: 'Stat/S', c, sub });
  const ti = rt.v['Tab=All'].createInstance(); add(m, ti, 'FILL'); ti.name = 'Rent table';
  return finish(s);
}

// ---------- 09 Maintenance ----------
async function scrMaint(x, y, board) {
  const s = await shell(PFX() + '09 · Maintenance board', 'Maintenance', x, y, { title: 'Maintenance' }); const m = s.main;
  const nt = btn('New ticket', 'Primary', 'M', 'plus'); overlay(nt, 'ov:ticket', MOB ? 'sheet' : null);
  await pageHead(m, 'Sunrise Residency', 'Maintenance', [nt]);
  const fr = AL('H', { name: 'Scroll · filters', clip: MOB }); add(m, fr, 'FILL'); if (MOB) fr.overflowDirection = 'HORIZONTAL';
  const fi = AL('H', { gap: 8, ai: 'CENTER', wrap: !MOB, rowGap: 8, name: 'Filters' }); fr.appendChild(fi); if (!MOB) fi.layoutSizingHorizontal = 'FILL';
  for (const [a, b] of [['Priority', 'All'], ['Assignee', 'Anyone'], ['Category', 'All']]) fi.appendChild(await pillSel(a, b));
  const lg = AL('H', { gap: 14, ai: 'CENTER', wrap: true, rowGap: 6, name: 'Legend' }); add(m, lg, 'FILL');
  for (const p of ['Urgent', 'High', 'Medium', 'Low']) { const g = AL('H', { gap: 6, ai: 'CENTER' }); lg.appendChild(g); g.appendChild(dot(PRIO[p][0], 8)); await addT(g, p, 'Caption', 'muted'); }
  if (!MOB) { const inst = board.v['Ticket=53'].createInstance(); add(m, inst, 'FILL'); inst.name = 'Maintenance board'; return finish(s); }
  for (const col of COLS) {
    const items = TICKETS.filter(t => t.col === col);
    const sec = AL('V', { gap: 10, p: 12, r: 14, bg: 'surface-2', name: 'Column · ' + col }); add(m, sec, 'FILL');
    const ch = AL('H', { jc: 'SPACE_BETWEEN', ai: 'CENTER' }); add(sec, ch, 'FILL'); await addT(ch, col, 'Small/B', 'ink'); ch.appendChild(chip(String(items.length), 'Neutral'));
    for (const t of items) overlay(add(sec, await ticketCard(t, false), 'FILL'), 'ov:t:' + t.id, 'sheet');
  }
  return finish(s);
}

// ---------- 10 Reports ----------
async function scrReports(x, y, rs) {
  const s = await shell(PFX() + '10 · Reports', 'Reports', x, y, { title: 'Reports' }); const m = s.main;
  const p1 = await pillSel('Property', 'All properties'), p2 = await pillSel('Period', 'October 2026');
  await pageHead(m, 'Insights', 'Reports', [p1, p2]);
  const ri = rs.v['Report=Rent collection'].createInstance(); add(m, ri, 'FILL'); ri.name = 'Reports';
  return finish(s);
}

// ---------- 11 Tenant portal ----------
async function scrPortal(x, y, ps) {
  if (MOB) {
    const f = figma.createFrame(); f.name = 'M11 · Tenant portal'; f.resize(MW, MH); f.x = x; f.y = y; f.fills = [P('bg')]; f.clipsContent = true; PAGE.appendChild(f); STATS.frames++;
    const i = ps.v['View=Home'].createInstance(); f.appendChild(i); i.x = 0; i.y = 0; i.constraints = { horizontal: 'STRETCH', vertical: 'STRETCH' }; i.name = 'Tenant portal';
    return f;
  }
  const f = AL('V', { gap: 20, ai: 'CENTER', p: [20, 40, 40, 40], bg: 'surface-3', name: 'D11 · Tenant portal' }); PAGE.appendChild(f); STATS.frames++; f.x = x; f.y = y;
  f.resize(DW, DH); f.counterAxisSizingMode = 'FIXED'; f.primaryAxisSizingMode = 'AUTO'; f.minHeight = DH;
  const top = AL('H', { jc: 'SPACE_BETWEEN', ai: 'CENTER', gap: 12, name: 'Preview bar' }); add(f, top, 'FILL');
  const bk = await link('Back to admin', 'arrow-left'); top.appendChild(bk); go(bk, 'dash');
  const cap = AL('H', { gap: 8, ai: 'CENTER', p: [8, 14], r: 999, bg: 'surface' }); top.appendChild(cap); cap.appendChild(ic('phone', 16, 'muted')); await addT(cap, 'Tenant portal · mobile-first web app, centred on large screens', 'Caption', 'muted');
  const i = ps.v['View=Home'].createInstance(); f.appendChild(i); i.name = 'Tenant portal'; i.cornerRadius = 28; i.clipsContent = true;
  i.effects = [{ type: 'DROP_SHADOW', color: { r: 0.04, g: 0.09, b: 0.08, a: 0.18 }, offset: { x: 0, y: 20 }, radius: 50, spread: 0, visible: true, blendMode: 'NORMAL' }];
  return f;
}

// ================= OVERLAYS =================
async function ovNotif(x, y) {
  const f = ovFrame('O · Notifications', x, y, MOB ? 0.35 : 0.06);
  const p = card({ p: [18, 18, 10, 18], gap: 4, name: 'Notifications panel' }); f.appendChild(p); p.resize(MOB ? MW - 24 : 400, 100); p.counterAxisSizingMode = 'FIXED'; p.primaryAxisSizingMode = 'AUTO';
  p.effects = [{ type: 'DROP_SHADOW', color: { r: 0.04, g: 0.09, b: 0.08, a: 0.18 }, offset: { x: 0, y: 12 }, radius: 32, spread: 0, visible: true, blendMode: 'NORMAL' }];
  const mark = await link('Mark all read', false); toast(mark, 'saved');
  const h = await head(p, 'Notifications', mark); h.paddingBottom = 8;
  const N = [['rupee', 'danger', 'Customer B is 12 days overdue', '₹18,000 · Unit 102', '2 h ago', 'rent'], ['calendar', 'warn', 'Lease for Unit 104 ends in 30 days', 'Customer C · start renewal', '5 h ago', 'lease'], ['wrench', 'danger', 'Ticket #53 breached its SLA', 'Lift stuck at floor 3', 'Yesterday', 'maint'], ['check', 'success', 'Customer A paid October rent', '₹20,000 · UPI', '12 Oct', 'tenant']];
  for (const [i, t, a, b, w, to] of N) { const r = AL('H', { gap: 12, ai: 'MIN', p: [12, 0], name: 'Notification · ' + a }); add(p, r, 'FILL'); topLine(r); r.appendChild(bubble(i, t, 36)); const tx = AL('V', { gap: 2 }); add(r, tx, 'FILL'); await addT(tx, a, 'Small/B', 'ink', { fill: true }); await addT(tx, b, 'Caption', 'muted'); await addT(r, w, 'Caption', 'faint'); go(r, to); }
  p.x = MOB ? 12 : DW - 40 - 400; p.y = MOB ? 72 : 84; p.constraints = { horizontal: MOB ? 'STRETCH' : 'MAX', vertical: 'MIN' };
  return f;
}
async function ovAddProp(x, y) {
  const f = ovFrame('O · Add property', x, y);
  const d = dialog(580); f.appendChild(d);
  await dialogHead(d, 'Add a property', 'You can bulk-add its units right after.');
  pairRow(d, field('Property name', 'e.g. Lakeview Towers'), field('Code', 'LKV-TWR', 'Text', 'Short code used on invoices'));
  pairRow(d, field('Type', 'Residential', 'Select'), field('Owner', 'Owner A', 'Select'));
  add(d, field('Address', 'Street, area, city, PIN', 'Area'), 'FILL');
  await dialogFoot(d, 'Create property', 'check', 'toast:property');
  if (MOB) placeBottom(f, d); else placeCenter(f, d);
  return f;
}
async function ovRent(x, y, form) {
  const f = ovFrame('O · Enter rent', x, y);
  const i = form.v['Status=Pending'].createInstance(); f.appendChild(i); i.name = 'Rent entry form';
  i.effects = [{ type: 'DROP_SHADOW', color: { r: 0.04, g: 0.09, b: 0.08, a: 0.25 }, offset: { x: 0, y: 16 }, radius: 40, spread: 0, visible: true, blendMode: 'NORMAL' }];
  if (MOB) placeBottom(f, i); else placeCenter(f, i);
  return f;
}
async function ovTicket(x, y) {
  const f = ovFrame('O · New ticket', x, y);
  const d = dialog(580); f.appendChild(d);
  await dialogHead(d, 'New maintenance ticket', 'Sunrise Residency');
  pairRow(d, field('Unit or area', 'Unit 102', 'Select'), field('Category', 'Plumbing', 'Select'));
  const pg = AL('V', { gap: 8 }); add(d, pg, 'FILL'); await addT(pg, 'Priority', 'Small/B', 'ink'); add(pg, priorityPicker('High'), 'FILL');
  add(d, field('Describe the problem', 'Kitchen tap leaking; water collects under the sink.', 'Area'), 'FILL');
  pairRow(d, field('Assign to', 'Staff 1', 'Select'), field('Estimate (₹)', '600'));
  await dialogFoot(d, 'Create ticket', 'check', 'toast:ticket');
  if (MOB) placeBottom(f, d); else placeCenter(f, d);
  return f;
}
async function ovTicketDetail(x, y, t) {
  const f = ovFrame('O · Ticket #' + t.id, x, y);
  const d = dialog(MW); f.appendChild(d);
  await ticketDetail(d, t, { close: true });
  closeIt(byName(d, 'IconButton · Close')); wireTicketDetail(d);
  placeBottom(f, d);
  return f;
}
async function ovDrawer(x, y) {
  const f = ovFrame('O · Menu', x, y, 0.45);
  const p = AL('V', { gap: 16, p: [20, 14, 20, 14], bg: 'side', name: 'Drawer' }); f.appendChild(p); fixSize(p, 300, MH); p.x = 0; p.y = 0; p.constraints = { horizontal: 'MIN', vertical: 'STRETCH' };
  const lg = AL('H', { gap: 10, ai: 'CENTER', p: [0, 6] }); add(p, lg, 'FILL');
  const mk = AL('H', { r: 10, bg: 'primary', ai: 'CENTER', jc: 'CENTER' }); fixSize(mk, 36, 36); mk.appendChild(ic('home', 20, 'white')); lg.appendChild(mk);
  const lt = AL('V', { gap: 0 }); add(lg, lt, 'FILL'); await addT(lt, 'Property CRM', 'H3', 'white'); await addT(lt, 'Sunrise Group', 'Caption', 'side-muted');
  closeIt(apd(lg, iconBtn('x', { name: 'IconButton · Close', bg: 'side-2', stroke: false, s: 36, c: 'side-ink' })));
  const nav = AL('V', { gap: 2, name: 'Nav' }); add(p, nav, 'FILL');
  const item = async (label, icon, to, badge) => {
    const it = AL('H', { gap: 12, ai: 'CENTER', p: [0, 12], r: 10, name: 'Nav · ' + label }); add(nav, it, 'FILL'); it.resize(it.width, 44); it.counterAxisSizingMode = 'FIXED';
    it.appendChild(ic(icon, 18, 'side-muted')); const t = await addT(it, label, 'Small/B', 'side-ink'); t.layoutSizingHorizontal = 'FILL';
    if (badge) { const b = AL('H', { p: [2, 8], r: 999, bg: badge[1], ai: 'CENTER' }); it.appendChild(b); await addT(b, badge[0], 'Caption', badge[1] === 'accent' ? 'ink' : 'white'); }
    go(it, to);
  };
  for (const [l, i, k] of NAV) await item(l, i, k, l === 'Monthly rent' ? ['12', 'danger-solid'] : l === 'Maintenance' ? ['14', 'accent'] : null);
  await item('Tenant portal', 'phone', 'portal');
  const sp = figma.createFrame(); sp.fills = []; sp.resize(10, 10); add(p, sp, 'FILL', 'FILL');
  const user = AL('H', { gap: 10, ai: 'CENTER', p: [10, 8], r: 12, bg: 'side-2', name: 'User' }); add(p, user, 'FILL');
  user.appendChild(avatar('PM', 'Solid', 'M')); const ut = AL('V', { gap: 0 }); add(user, ut, 'FILL'); await addT(ut, 'Property Manager', 'Small/B', 'white'); await addT(ut, 'manager@sunrise.in', 'Caption', 'side-muted');
  go(apd(user, iconBtn('logout', { name: 'IconButton · Sign out', bg: null, stroke: false, s: 36, c: 'side-muted' })), 'login');
  return f;
}
async function ovToast(key, x, y) {
  const [icon, title, text] = TOASTS[key];
  const W = MOB ? MW : DW, H = MOB ? MH : DH;
  const f = figma.createFrame(); f.name = 'Toast · ' + title; f.resize(W, H); f.x = x; f.y = y; f.fills = []; f.clipsContent = false; PAGE.appendChild(f); STATS.frames++;
  const t = AL('H', { gap: 12, ai: 'CENTER', p: [12, 14, 12, 12], r: 14, bg: 'ink', name: 'Toast' }); f.appendChild(t);
  t.effects = [{ type: 'DROP_SHADOW', color: { r: 0.04, g: 0.09, b: 0.08, a: 0.28 }, offset: { x: 0, y: 10 }, radius: 28, spread: 0, visible: true, blendMode: 'NORMAL' }];
  const b = AL('H', { r: 10, ai: 'CENTER', jc: 'CENTER', bg: 'side-active' }); fixSize(b, 36, 36); b.appendChild(ic(icon, 18, 'accent')); t.appendChild(b);
  const tx = AL('V', { gap: 2 }); t.appendChild(tx); await addT(tx, title, 'Small/B', 'white'); await addT(tx, text, 'Caption', 'side-ink');
  const dm = AL('H', { p: [6, 10], r: 8, bg: 'side-active', name: 'Dismiss' }); t.appendChild(dm); await addT(dm, 'OK', 'Caption', 'white');
  if (MOB) { t.resize(W - 24, 60); t.primaryAxisSizingMode = 'FIXED'; t.counterAxisSizingMode = 'AUTO'; tx.layoutSizingHorizontal = 'FILL'; for (const c of tx.children) { c.layoutSizingHorizontal = 'FILL'; c.textAutoResize = 'HEIGHT'; } }
  t.x = Math.round((W - t.width) / 2); t.y = H - t.height - (MOB ? 24 : 40); t.constraints = { horizontal: 'CENTER', vertical: 'MAX' };
  closeIt(f);
  return f;
}
// ================= PAGE ASSEMBLY =================
const GENERATED_SETS = ['Lease wizard / ', 'Rent table / ', 'Rent entry form / ', 'Maintenance board / ', 'Reports / ', 'Tenant portal / ', 'Unit board / Mobile'];
function cleanup(page) {
  for (const n of page.children.slice()) {
    const nm = n.name;
    if (/^(D|M)\d\d · /.test(nm) || nm.indexOf('O · ') === 0 || nm.indexOf('Toast · ') === 0 || nm === 'Prototype guide') { n.remove(); continue; }
    if (n.type === 'COMPONENT_SET' && GENERATED_SETS.some(p => nm.indexOf(p) === 0)) n.remove();
  }
}
async function label(text, sub, x, y) {
  const g = AL('V', { gap: 6, name: 'Prototype guide' }); PAGE.appendChild(g); g.x = x; g.y = y;
  await addT(g, text, 'Display', 'ink'); await addT(g, sub, 'Body/L', 'muted');
}
async function wireSidebar() {
  SIDEBAR_SET = PAGE.findOne(n => n.type === 'COMPONENT_SET' && n.name === 'Sidebar / Desktop');
  if (!SIDEBAR_SET) throw new Error('Desktop sidebar component set not found on the Desktop page.');
  for (const c of SIDEBAR_SET.children) {
    for (const [l, , k] of NAV) go(byName(c, 'Nav · ' + l), k);
    go(byName(c, 'Nav · Tenant portal'), 'portal');
    go(byName(c, 'Sign out'), 'login');
    go(byName(c, 'Tip'), 'rent');
    toast(byName(c, 'Search'), 'done');
  }
}
async function buildDesktop() {
  MOB = false; PAGE = figma.root.children[1]; await figma.setCurrentPageAsync(PAGE);
  say('Building desktop prototype…');
  cleanup(PAGE);
  await wireSidebar();
  const ub = await unitBoardDesktop();
  SET_CURSOR = { x: 0, y: 9200 };
  const wz = await leaseWizard(); const rt = await rentTable(); const rf = await rentForm(); const mb = await maintBoardDesktop(); const rs = await reportsSet(); const ps = await portalSet();
  const FR = {};
  const C = 1560, R1 = 0, R2 = 2400, R3 = 4700, R4 = 6600, R5 = 7700;
  await label('Desktop prototype', 'Press ▶ Present and start at “1 · Admin app”. Frames reflow with auto layout — drag a frame narrower to see the tablet layout.', 0, -420);
  FR.login = (await scrLogin(0, R1)).id;
  FR.dash = (await scrDash(C, R1)).id;
  FR.props = (await scrProps(C * 2, R1)).id;
  FR.prop = (await scrProp(C * 3, R1, ub)).id;
  FR.unit = (await scrUnit(0, R2)).id;
  FR.tenant = (await scrTenant(C, R2)).id;
  FR.lease = (await scrLease(C * 2, R2, wz)).id;
  FR.rent = (await scrRent(C * 3, R2, rt)).id;
  FR.maint = (await scrMaint(0, R3, mb)).id;
  FR.reports = (await scrReports(C, R3, rs)).id;
  FR.portal = (await scrPortal(C * 2, R3, ps)).id;
  say('Desktop overlays…');
  FR['ov:notif'] = (await ovNotif(0, R4)).id;
  FR['ov:addprop'] = (await ovAddProp(C, R4)).id;
  FR['ov:rent'] = (await ovRent(C * 2, R4, rf)).id;
  FR['ov:ticket'] = (await ovTicket(C * 3, R4)).id;
  let i = 0; for (const k of Object.keys(TOASTS)) { FR['toast:' + k] = (await ovToast(k, (i % 4) * C, R5 + Math.floor(i / 4) * 1000)).id; i++; }
  for (const id of ['login', 'dash', 'props', 'prop', 'unit', 'tenant', 'lease', 'rent', 'maint', 'reports', 'portal', 'ov:notif', 'ov:addprop', 'ov:rent', 'ov:ticket']) sweepDead(await figma.getNodeByIdAsync(FR[id]));
  say('Wiring desktop links…');
  await applyLinks(FR);
  PAGE.flowStartingPoints = [{ nodeId: FR.login, name: '1 · Admin app' }, { nodeId: FR.portal, name: '2 · Tenant portal' }];
  return FR;
}
async function buildMobile() {
  MOB = true; PAGE = figma.root.children[2]; await figma.setCurrentPageAsync(PAGE);
  say('Building mobile prototype…');
  cleanup(PAGE);
  SET_CURSOR = { x: 0, y: 9000 };
  const ub = await unitBoardMobile(); const wz = await leaseWizard(); const rt = await rentTable(); const rf = await rentForm(); const rs = await reportsSet(); const ps = await portalSet();
  const FR = {}; const C = 470;
  await label('Mobile prototype', 'Press ▶ Present (device: iPhone 14/15, 390 × 844). Menu ☰ opens the navigation drawer.', 0, -420);
  const order = [['login', scrLogin], ['dash', scrDash], ['props', scrProps], ['prop', scrProp, ub], ['unit', scrUnit], ['tenant', scrTenant], ['lease', scrLease, wz], ['rent', scrRent, rt], ['maint', scrMaint, null], ['reports', scrReports, rs], ['portal', scrPortal, ps]];
  let x = 0; for (const [k, fn, arg] of order) { FR[k] = (await fn(x, 0, arg)).id; x += C; }
  say('Mobile overlays…');
  const R = 6000; let ox = 0;
  FR['ov:drawer'] = (await ovDrawer(ox, R)).id; ox += C;
  FR['ov:notif'] = (await ovNotif(ox, R)).id; ox += C;
  FR['ov:addprop'] = (await ovAddProp(ox, R)).id; ox += C;
  FR['ov:rent'] = (await ovRent(ox, R, rf)).id; ox += C;
  FR['ov:ticket'] = (await ovTicket(ox, R)).id; ox += C;
  for (const t of TICKETS) { FR['ov:t:' + t.id] = (await ovTicketDetail(ox, R, t)).id; ox += C; }
  let i = 0; for (const k of Object.keys(TOASTS)) { FR['toast:' + k] = (await ovToast(k, i * C, R + 1000)).id; i++; }
  for (const k of Object.keys(FR)) if (k.indexOf('toast:') !== 0) sweepDead(await figma.getNodeByIdAsync(FR[k]));
  say('Wiring mobile links…');
  await applyLinks(FR);
  PAGE.flowStartingPoints = [{ nodeId: FR.login, name: '1 · Admin app (mobile)' }, { nodeId: FR.portal, name: '2 · Tenant portal' }];
  return FR;
}
async function main() {
  await init();
  await ensurePriority();
  const d = await buildDesktop();
  const m = await buildMobile();
  await figma.setCurrentPageAsync(figma.root.children[1]);
  const login = await figma.getNodeByIdAsync(d.login);
  figma.viewport.scrollAndZoomIntoView([login]);
  const miss = STATS.missing.length ? ' · ' + STATS.missing.length + ' links skipped (' + [...new Set(STATS.missing)].slice(0, 3).join(', ') + ')' : '';
  return 'Done: ' + STATS.frames + ' frames, ' + STATS.links + ' prototype links' + miss;
}
main().then(msg => figma.closePlugin(msg)).catch(e => { console.error(e); figma.closePlugin('Error: ' + (e && e.message ? e.message : e)); });
