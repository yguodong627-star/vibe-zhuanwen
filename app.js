/* 转文 · 纯前端文本与数据清洗。所有处理在本页内存完成，无网络请求。 */
(function () {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const FREE_LIMIT = 1e6, PRO_LIMIT = 2e7, FREE_CHAINS = 3;
const CJK = '\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff';
const RE_CJK = new RegExp('[' + CJK + ']');
const RE_CJKP = new RegExp('[' + CJK + '，。、；：？！（）“”‘’《》【】…]');
const lines = t => t.split(/\r\n|\r|\n/);
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const unesc = s => s.replace(/\\n/g, '\n').replace(/\\t/g, '\t');

/* ---------- 规则 ---------- */
const sel = (k, label, opts, def) => ({ k, type: 'select', label, opts, def: def === undefined ? opts[0][0] : def });
const chk = (k, label, def) => ({ k, type: 'check', label, def: !!def });
const txt = (k, label, def, ph) => ({ k, type: 'text', label, def: def || '', ph });
const num = (k, label, def) => ({ k, type: 'number', label, def });

const RULES = [
  { id: 'trim', name: '去首尾空格', desc: '每行开头和结尾的空白（含全角空格、不换行空格）', params: [],
    fn: t => lines(t).map(l => l.trim()).join('\n') },
  { id: 'collapse', name: '合并连续空格', desc: '行内连续的空格、制表符压成一个空格', params: [],
    fn: t => t.replace(/[ \t\u3000\u00a0]{2,}/g, ' ') },
  { id: 'blank', name: '去空行', desc: '删除空行或仅含空白的行',
    params: [sel('mode', '方式', [['all', '全部删除'], ['merge', '连续空行合并为一行']])],
    fn: (t, p) => {
      const ls = lines(t), out = [];
      let prev = false;
      for (const l of ls) {
        const empty = l.trim() === '';
        if (!empty) { out.push(l); prev = false; }
        else if (p.mode === 'merge' && !prev) { out.push(''); prev = true; }
      }
      return out.join('\n');
    } },
  { id: 'width', name: '全角 / 半角转换', desc: '字母数字或标点在全角与半角之间转换',
    params: [sel('mode', '方式', [['f2h-alnum', '全角 → 半角（仅字母数字）'], ['f2h-all', '全角 → 半角（含标点）'], ['h2f-alnum', '半角 → 全角（仅字母数字）'], ['h2f-all', '半角 → 全角（含标点）']])],
    fn: (t, p) => {
      const sh = (re, d) => t.replace(re, c => String.fromCharCode(c.charCodeAt(0) + d));
      switch (p.mode) {
        case 'f2h-alnum': return sh(/[\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A]/g, -0xFEE0);
        case 'f2h-all': return sh(/[\uFF01-\uFF5E]/g, -0xFEE0).replace(/\u3000/g, ' ');
        case 'h2f-alnum': return sh(/[0-9A-Za-z]/g, 0xFEE0);
        default: return sh(/[\x21-\x7E]/g, 0xFEE0);
      }
    } },
  { id: 'punct', name: '统一标点', desc: '中文语境下的英文标点改成中文标点，或反过来',
    params: [sel('mode', '方向', [['toCN', '中文语境 → 中文标点'], ['toEN', '全部 → 英文标点']])],
    fn: (t, p) => {
      if (p.mode === 'toEN') {
        const m = { '，': ',', '。': '.', '、': ',', '；': ';', '：': ':', '？': '?', '！': '!', '（': '(', '）': ')', '“': '"', '”': '"', '‘': "'", '’': "'", '【': '[', '】': ']', '…': '...', '……': '...' };
        return t.replace(/……|[，。、；：？！（）“”‘’【】…]/g, c => m[c]);
      }
      let s = t.replace(/\(([^()\n]*)\)/g, (a, b) => RE_CJK.test(b) ? '（' + b + '）' : a)
               .replace(/"([^"\n]*)"/g, (a, b) => RE_CJK.test(b) ? '“' + b + '”' : a)
               .replace(/\.{3,}|。{3,}/g, (a, off, str) => RE_CJKP.test(str[off - 1] || '') ? '……' : a);
      const fm = { ',': '，', ';': '；', ':': '：', '?': '？', '!': '！' };
      return s.replace(/[,;:?!.()]/g, (c, off, str) => {
        const prev = str[off - 1] || '', next = str[off + 1] || '';
        if (c === '.') return RE_CJKP.test(prev) && !/[A-Za-z0-9]/.test(next) ? '。' : c;
        if (c === '(') return RE_CJK.test(next) ? '（' : c;
        if (c === ')') return RE_CJK.test(prev) && /[（]/.test(str.slice(Math.max(0, off - 40), off)) ? '）' : c;
        return RE_CJKP.test(prev) ? fm[c] : c;
      });
    } },
  { id: 'cjkspace', name: '中英文间加空格', desc: '汉字与英文、数字相邻处补一个空格（排版惯例）',
    params: [sel('mode', '方式', [['add', '加空格'], ['remove', '去掉空格']])],
    fn: (t, p) => p.mode === 'remove'
      ? t.replace(new RegExp('([' + CJK + ']) +(?=[A-Za-z0-9])', 'g'), '$1').replace(new RegExp('([A-Za-z0-9]) +(?=[' + CJK + '])', 'g'), '$1')
      : t.replace(new RegExp('([' + CJK + '])([A-Za-z0-9])', 'g'), '$1 $2').replace(new RegExp('([A-Za-z0-9])([' + CJK + '])', 'g'), '$1 $2') },
  { id: 'replace', name: '批量查找替换', desc: '每行一组：查找 => 替换；可开正则（替换里可用 $1，\\n 换行）',
    params: [{ k: 'pairs', type: 'area', label: '规则', def: '', ph: '旧词 => 新词\n\\s+$ => ' }, chk('re', '正则', false), chk('ic', '忽略大小写', false)],
    fn: (t, p) => {
      const rows = (p.pairs || '').split('\n').filter(l => l.trim() !== '');
      let s = t;
      rows.forEach((l, i) => {
        const m = /^(.*?)\s*=>\s?(.*)$/.exec(l);
        if (!m) throw new Error('第 ' + (i + 1) + ' 行缺少 =>');
        let re;
        try { re = new RegExp(p.re ? m[1] : escRe(m[1]), 'g' + (p.ic ? 'i' : '') + (p.re ? 'm' : '')); }
        catch (e) { throw new Error('第 ' + (i + 1) + ' 行正则有误：' + e.message); }
        if (m[1] === '' ) throw new Error('第 ' + (i + 1) + ' 行查找内容为空');
        const rep = unesc(m[2]);
        s = p.re ? s.replace(re, rep) : s.replace(re, () => rep);
      });
      return s;
    } },
  { id: 'extract', name: '提取邮箱 / 链接 / 手机号', desc: '只保留匹配到的内容，每个一行',
    params: [sel('type', '提取', [['email', '邮箱'], ['url', '链接'], ['phone', '手机号（中国大陆）']]), chk('uniq', '去重', true)],
    fn: (t, p) => {
      let m;
      if (p.type === 'email') m = t.match(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}/g);
      else if (p.type === 'url') m = (t.match(/(?:https?:\/\/|www\.)[^\s<>"'，。、；）)\]】”’]+/g) || []).map(u => u.replace(/[.,;:!?]+$/, ''));
      else m = (t.match(/(?<!\d)(?:(?:\+|00)?86[\s-]?)?1[3-9]\d[\s-]?\d{4}[\s-]?\d{4}(?!\d)/g) || []).map(x => x.replace(/[\s-]/g, '').replace(/^(?:\+|00)?86(?=1\d{10}$)/, ''));
      m = m || [];
      if (p.uniq) m = [...new Set(m)];
      return m.join('\n');
    } },
  { id: 'split', name: '按分隔符拆列', desc: '把每行按分隔符拆开：拆成多列（Tab，可直接贴进表格）、只取某一列，或拆成多行',
    params: [txt('sep', '分隔符', ',', '如 , | \\t'), chk('re', '正则', false),
      sel('mode', '方式', [['cols', '拆成多列（Tab 分隔）'], ['pick', '只取第 N 列'], ['rows', '拆成多行']]), num('n', '第 N 列', 1), chk('tr', '去掉单元格首尾空格', true)],
    fn: (t, p) => {
      const raw = p.sep === undefined || p.sep === '' ? ',' : String(p.sep);
      let sep;
      if (p.re) { try { sep = new RegExp(raw); } catch (e) { throw new Error('分隔符正则有误：' + e.message); } }
      else sep = /^(tab|\\t)$/i.test(raw) ? '\t' : unesc(raw);
      const cut = l => l.split(sep).map(c => (p.tr ? c.trim() : c));
      if (p.mode === 'rows') return lines(t).flatMap(cut).filter(c => c !== '').join('\n');
      if (p.mode === 'pick') { const n = Math.max(1, parseInt(p.n, 10) || 1); return lines(t).map(l => cut(l)[n - 1] ?? '').join('\n'); }
      return lines(t).map(l => cut(l).join('\t')).join('\n');
    } },
  { id: 'dedupe', name: '去重行', desc: '相同的行只保留第一次出现的',
    params: [chk('ic', '忽略大小写', false), chk('tr', '比较时忽略首尾空格', true)],
    fn: (t, p) => {
      const seen = new Set();
      return lines(t).filter(l => { let k = p.tr ? l.trim() : l; if (p.ic) k = k.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).join('\n');
    } },
  { id: 'sort', name: '排序', desc: '按行排序；中文按拼音',
    params: [sel('mode', '方式', [['asc', '升序（中文按拼音）'], ['desc', '降序'], ['len', '按长度（短→长）'], ['num', '按行内首个数字'], ['rev', '整体倒序'], ['rand', '随机打乱']])],
    fn: (t, p) => {
      let ls = lines(t);
      const col = new Intl.Collator('zh-Hans-CN', { numeric: true });
      const cmp = (a, b) => { const x = RE_CJK.test(a[0] || '') ? 1 : 0, y = RE_CJK.test(b[0] || '') ? 1 : 0; return x !== y ? x - y : col.compare(a, b); };
      if (p.mode === 'asc') ls.sort(cmp);
      else if (p.mode === 'desc') ls.sort((a, b) => cmp(b, a));
      else if (p.mode === 'len') ls.sort((a, b) => [...a].length - [...b].length);
      else if (p.mode === 'num') {
        const k = l => { const m = l.replace(/(\d),(?=\d{3})/g, '$1').match(/-?\d+(?:\.\d+)?/); return m ? parseFloat(m[0]) : Infinity; };
        ls = ls.map((l, i) => [k(l), i, l]).sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] < b[0] ? -1 : 1)).map(x => x[2]);
      } else if (p.mode === 'rev') ls.reverse();
      else for (let i = ls.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ls[i], ls[j]] = [ls[j], ls[i]]; }
      return ls.join('\n');
    } },
];
const RULE_BY_ID = Object.fromEntries(RULES.map(r => [r.id, r]));
const defParams = id => Object.fromEntries(RULE_BY_ID[id].params.map(q => [q.k, q.def]));
const defaultSteps = () => RULES.map(r => ({ id: r.id, on: false, p: defParams(r.id) }));

function runChain(text, steps) {
  let s = text; const info = [];
  for (const st of steps) {
    if (!st.on) continue;
    const r = RULE_BY_ID[st.id]; if (!r) continue;
    const before = lines(s).length;
    try { s = r.fn(s, Object.assign(defParams(st.id), st.p)); info.push({ id: st.id, before, after: lines(s).length }); }
    catch (e) { info.push({ id: st.id, before, after: before, err: e.message }); }
  }
  return { out: s, info };
}

const PRESETS = [
  { name: '通用整理', steps: [['trim'], ['collapse'], ['blank', { mode: 'all' }], ['dedupe']] },
  { name: '中文排版', steps: [['trim'], ['width', { mode: 'f2h-alnum' }], ['punct', { mode: 'toCN' }], ['cjkspace', { mode: 'add' }]] },
  { name: '提取邮箱', steps: [['extract', { type: 'email', uniq: true }], ['sort', { mode: 'asc' }]] },
  { name: '提取手机号', steps: [['extract', { type: 'phone', uniq: true }]] },
];
function stepsFromPreset(arr) {
  const used = new Set(), out = [];
  for (const [id, p] of arr) { used.add(id); out.push({ id, on: true, p: Object.assign(defParams(id), p || {}) }); }
  for (const r of RULES) if (!used.has(r.id)) out.push({ id: r.id, on: false, p: defParams(r.id) });
  return out;
}
function sanitizeSteps(raw) {
  const out = [], used = new Set();
  (Array.isArray(raw) ? raw : []).forEach(s => {
    if (!s || !RULE_BY_ID[s.id] || used.has(s.id)) return; used.add(s.id);
    out.push({ id: s.id, on: !!s.on, p: Object.assign(defParams(s.id), s.p && typeof s.p === 'object' ? s.p : {}) });
  });
  RULES.forEach(r => { if (!used.has(r.id)) out.push({ id: r.id, on: false, p: defParams(r.id) }); });
  return out;
}

/* ---------- 差异 ---------- */
function diffLines(a, b) {
  let s = 0; const n0 = a.length, m0 = b.length;
  while (s < n0 && s < m0 && a[s] === b[s]) s++;
  let e = 0;
  while (e < n0 - s && e < m0 - s && a[n0 - 1 - e] === b[m0 - 1 - e]) e++;
  const A = a.slice(s, n0 - e), B = b.slice(s, m0 - e), n = A.length, m = B.length;
  const ops = [];
  for (let i = 0; i < s; i++) ops.push(['eq', a[i]]);
  let approx = false;
  if (n * m <= 4e6) {
    const w = m + 1, dp = new Uint16Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
      dp[i * w + j] = A[i] === B[j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (A[i] === B[j]) { ops.push(['eq', A[i]]); i++; j++; }
      else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) ops.push(['del', A[i++]]);
      else ops.push(['add', B[j++]]);
    }
    while (i < n) ops.push(['del', A[i++]]);
    while (j < m) ops.push(['add', B[j++]]);
  } else {
    approx = true;
    const cnt = new Map(); B.forEach(x => cnt.set(x, (cnt.get(x) || 0) + 1));
    const keep = new Map(); const dels = [];
    A.forEach(x => { if (cnt.get(x) > 0) { cnt.set(x, cnt.get(x) - 1); keep.set(x, (keep.get(x) || 0) + 1); } else dels.push(x); });
    dels.forEach(x => ops.push(['del', x]));
    B.forEach(x => { if (keep.get(x) > 0) { keep.set(x, keep.get(x) - 1); ops.push(['eq', x]); } else ops.push(['add', x]); });
  }
  for (let i = n0 - e; i < n0; i++) ops.push(['eq', a[i]]);
  return { ops, approx };
}
function inlineMark(x, y) {
  let p = 0; while (p < x.length && p < y.length && x[p] === y[p]) p++;
  let q = 0; while (q < x.length - p && q < y.length - p && x[x.length - 1 - q] === y[y.length - 1 - q]) q++;
  const f = (z) => esc(z.slice(0, p)) + (z.length - p - q > 0 ? '<mark>' + esc(z.slice(p, z.length - q)) + '</mark>' : '') + esc(z.slice(z.length - q));
  return [f(x), f(y)];
}
function renderDiff(a, b) {
  const { ops, approx } = diffLines(lines(a), lines(b));
  let nd = 0, na = 0, ne = 0; ops.forEach(o => o[0] === 'del' ? nd++ : o[0] === 'add' ? na++ : ne++);
  if (!nd && !na) return { html: '<div class="empty">输入与输出完全一致</div>', nd, na, ne };
  // 配对相邻的删/增做行内高亮
  const rows = []; let i = 0;
  while (i < ops.length) {
    if (ops[i][0] === 'eq') { rows.push({ t: 'eq', h: esc(ops[i][1]) }); i++; continue; }
    const dels = [], adds = [];
    while (i < ops.length && ops[i][0] === 'del') dels.push(ops[i++][1]);
    while (i < ops.length && ops[i][0] === 'add') adds.push(ops[i++][1]);
    const k = Math.min(dels.length, adds.length);
    const dh = dels.map(x => esc(x)), ah = adds.map(x => esc(x));
    for (let j = 0; j < k; j++) if (dels.length * adds.length < 400 || dels.length === adds.length) { [dh[j], ah[j]] = inlineMark(dels[j], adds[j]); }
    dh.forEach(h => rows.push({ t: 'del', h })); ah.forEach(h => rows.push({ t: 'add', h }));
  }
  // 折叠长段相同行
  const out = []; let r = 0, shown = 0; const CAP = 3000;
  while (r < rows.length) {
    if (rows[r].t !== 'eq') { if (shown++ < CAP) out.push(rows[r]); r++; continue; }
    let q = r; while (q < rows.length && rows[q].t === 'eq') q++;
    const len = q - r, head = r === 0 ? 0 : 2, tail = q === rows.length ? 0 : 2;
    if (len > head + tail + 3) {
      for (let x = r; x < r + head; x++) out.push(rows[x]);
      out.push({ t: 'fold', h: '… 省略 ' + (len - head - tail) + ' 行相同内容 …' });
      for (let x = q - tail; x < q; x++) out.push(rows[x]);
    } else for (let x = r; x < q; x++) out.push(rows[x]);
    r = q;
  }
  const html = (approx ? '<div class="fold">文本较大，按行集合近似比较，顺序变化可能显示为增删</div>' : '') +
    out.map(o => o.t === 'fold' ? '<div class="fold">' + o.h + '</div>'
      : '<div class="dl ' + o.t + '"><span class="g">' + (o.t === 'del' ? '−' : o.t === 'add' ? '+' : '') + '</span><span class="t">' + (o.h === '' ? '<i>空行</i>' : o.h) + '</span></div>').join('') +
    (shown > CAP ? '<div class="fold">变化过多，仅显示前 ' + CAP + ' 处</div>' : '');
  return { html, nd, na, ne };
}

/* ---------- 表格互转 ---------- */
function parseDelimited(text, d) {
  const rows = []; let row = [], cell = '', q = false, i = 0; const n = text.length;
  if (text.charCodeAt(0) === 0xFEFF) i = 1;
  for (; i < n; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"' && cell === '') q = true;
    else if (c === d) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (q) throw new Error('引号没有闭合');
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => !(r.length === 1 && r[0].trim() === ''));
}
function detectDelim(text) {
  const first = text.split(/\r?\n/).find(l => l.trim()) || '';
  const noq = first.replace(/"[^"]*"/g, '');
  let best = ',', bc = 0;
  for (const d of [',', '\t', ';', '|']) { const c = noq.split(d).length - 1; if (c > bc) { bc = c; best = d; } }
  return best;
}
function splitMdRow(l) {
  let s = l.trim(); if (s.startsWith('|')) s = s.slice(1); if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells = []; let c = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') { c += '|'; i++; } else if (s[i] === '|') { cells.push(c.trim()); c = ''; } else c += s[i];
  }
  cells.push(c.trim());
  return cells.map(x => x.replace(/<br\s*\/?>/gi, '\n'));
}
function parseMd(text) {
  const ls = lines(text).filter(l => l.trim().startsWith('|') || /\|/.test(l)).filter(l => l.trim());
  const sepRe = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;
  const rows = ls.filter(l => !sepRe.test(l)).map(splitMdRow);
  if (!rows.length) throw new Error('没有找到 Markdown 表格');
  return rows;
}
function flatten(o, pre, out) {
  if (o && typeof o === 'object' && !Array.isArray(o)) {
    const ks = Object.keys(o); if (!ks.length && pre) out[pre] = '';
    ks.forEach(k => flatten(o[k], pre ? pre + '.' + k : k, out));
  } else out[pre] = o === null || o === undefined ? '' : Array.isArray(o) ? JSON.stringify(o) : typeof o === 'object' ? JSON.stringify(o) : String(o);
  return out;
}
function parseTable(text, fmt, o) {
  if (fmt === 'auto') {
    const t = text.trim();
    if (/^[\[{]/.test(t)) fmt = 'json';
    else if (/^\|/.test(t) || /\n\s*\|?\s*:?-{2,}:?\s*\|/.test(t)) fmt = 'md';
    else fmt = detectDelim(text) === '\t' ? 'tsv' : 'csv';
  }
  let head = null, rows;
  if (fmt === 'json') {
    let v; try { v = JSON.parse(text); } catch (e) { throw new Error('JSON 解析失败：' + e.message); }
    if (!Array.isArray(v)) v = (v && typeof v === 'object') ? [v] : (() => { throw new Error('JSON 需要是数组或对象'); })();
    if (v.length && v.every(x => x && typeof x === 'object' && !Array.isArray(x))) {
      const fl = v.map(x => flatten(x, '', {})); head = [];
      fl.forEach(x => Object.keys(x).forEach(k => { if (!head.includes(k)) head.push(k); }));
      rows = fl.map(x => head.map(k => (k in x ? x[k] : '')));
      return { head, rows, fmt };
    }
    rows = v.map(x => Array.isArray(x) ? x.map(c => c === null || c === undefined ? '' : typeof c === 'object' ? JSON.stringify(c) : String(c)) : [x === null ? '' : String(x)]);
  } else if (fmt === 'md') { rows = parseMd(text); head = rows.shift(); return fin({ head, rows, fmt }); }
  else rows = parseDelimited(text, fmt === 'tsv' ? '\t' : (o.delim === 'auto' ? detectDelim(text) : o.delim));
  if (o.head && rows.length) head = rows.shift();
  return fin({ head, rows, fmt });
}
function fin(t) {
  const w = Math.max(t.head ? t.head.length : 0, ...t.rows.map(r => r.length), 0);
  const pad = r => { r = r.slice(); while (r.length < w) r.push(''); return r; };
  return { head: t.head ? pad(t.head) : null, rows: t.rows.map(pad), fmt: t.fmt, width: w };
}
const infer = s => /^-?(0|[1-9]\d*)(\.\d+)?$/.test(s) && Math.abs(Number(s)) < 1e15 ? Number(s) : s === 'true' ? true : s === 'false' ? false : s;
function uniqueKeys(h) { const seen = {}; return h.map(k => { k = k === '' ? '列' : k; if (seen[k]) { seen[k]++; return k + '_' + seen[k]; } seen[k] = 1; return k; }); }
function cw(s) { let w = 0; for (const c of s) w += /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe6f\uff00-\uff60\uffe0-\uffe6]/.test(c) ? 2 : 1; return w; }
function stringify(t, out, o) {
  const w = t.width || (t.head ? t.head.length : 0), gen = Array.from({ length: w }, (_, i) => '列' + (i + 1));
  const head = t.head || gen;
  if (out === 'json') {
    const keys = uniqueKeys(head);
    return JSON.stringify(t.rows.map(r => Object.fromEntries(keys.map((k, i) => [k, o.infer ? infer(r[i]) : r[i]]))), null, 2);
  }
  if (out === 'jsonarr') return JSON.stringify((t.head ? [t.head] : []).concat(t.rows).map(r => r.map(c => o.infer ? infer(c) : c)), null, 2);
  if (out === 'csv' || out === 'tsv') {
    const d = out === 'csv' ? ',' : '\t';
    const q = c => (c.includes(d) || /["\r\n]/.test(c) || (out === 'csv' && c !== c.trim())) ? '"' + c.replace(/"/g, '""') + '"' : c;
    if (out === 'tsv') return (t.head ? [t.head] : []).concat(t.rows).map(r => r.map(c => c.replace(/\t/g, ' ').replace(/\r?\n/g, ' ')).join('\t')).join('\n');
    return (t.head ? [t.head] : []).concat(t.rows).map(r => r.map(q).join(d)).join('\n');
  }
  const cell = c => c.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
  const all = [head].concat(t.rows).map(r => r.map(cell));
  const ws = head.map((_, i) => Math.max(3, ...all.map(r => cw(r[i]))));
  const fmt = r => '| ' + r.map((c, i) => c + ' '.repeat(ws[i] - cw(c))).join(' | ') + ' |';
  return [fmt(all[0]), '| ' + ws.map(x => '-'.repeat(x)).join(' | ') + ' |'].concat(all.slice(1).map(fmt)).join('\n');
}
function convert(text, inFmt, outFmt, o) {
  const t = parseTable(text, inFmt, o);
  return { text: stringify(t, outFmt, o), table: t };
}

/* ---------- 授权（占位，不接收款，不含任何真实密钥） ---------- */
function lhash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
function sig(body) { return lhash('zw-placeholder:' + body).toString(36).toUpperCase().padStart(4, '0').slice(-4); }
function validKey(k) {
  const m = /^ZW-([A-Z0-9]{4})-([A-Z0-9]{4})-([A-Z0-9]{4})-([A-Z0-9]{4})$/.exec(String(k || '').trim().toUpperCase());
  return !!m && sig(m[1] + '-' + m[2] + '-' + m[3]) === m[4];
}
/* 正式版应替换为“服务端私钥签名 + 前端公钥验签”，此处仅为占位演示 */
const devKey = (a, b, c) => { const body = [a, b, c].join('-'); return 'ZW-' + body + '-' + sig(body); };

/* ---------- 存储 ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem('zw.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('zw.' + k, JSON.stringify(v)); } catch (e) { /* 隐私模式 */ } },
  del(k) { try { localStorage.removeItem('zw.' + k); } catch (e) {} },
};
const isPro = () => validKey(store.get('license', ''));
const textLimit = () => (isPro() ? PRO_LIMIT : FREE_LIMIT);

const ZW = { RULES, runChain, defaultSteps, stepsFromPreset, PRESETS, diffLines, parseTable, convert, parseDelimited, validKey, devKey, FREE_LIMIT, FREE_CHAINS, sanitizeSteps };
window.ZW = ZW;
if (typeof document === 'undefined' || !document.getElementById('ruleList')) return;

/* ---------- UI ---------- */
let steps = sanitizeSteps(store.get('steps', null));
if (!store.get('steps', null)) steps = stepsFromPreset(PRESETS[0].steps);
let chains = store.get('chains', []);
let view = 'out', lastOut = '', lastRun = null, batch = [];
const fmtN = n => n.toLocaleString('zh-CN');
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 1800); }
function dl(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type || 'text/plain;charset=utf-8' })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
async function copy(text) {
  try { await navigator.clipboard.writeText(text); }
  catch (e) { const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (x) { toast('复制失败，请手动选择'); ta.remove(); return false; } ta.remove(); }
  toast('已复制'); return true;
}
function paramHTML(r, st) {
  return r.params.map(q => {
    const v = st.p[q.k];
    const id = 'p-' + r.id + '-' + q.k;
    if (q.type === 'select') return '<label class="pf"><span>' + q.label + '</span><select data-k="' + q.k + '">' + q.opts.map(o => '<option value="' + o[0] + '"' + (o[0] === v ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select></label>';
    if (q.type === 'check') return '<label class="pf ck"><input type="checkbox" data-k="' + q.k + '"' + (v ? ' checked' : '') + '>' + q.label + '</label>';
    if (q.type === 'area') return '<label class="pf"><span>' + q.label + '</span><textarea data-k="' + q.k + '" rows="3" spellcheck="false" placeholder="' + esc(q.ph || '') + '">' + esc(v || '') + '</textarea></label>';
    return '<label class="pf"><span>' + q.label + '</span><input data-k="' + q.k + '" type="' + (q.type === 'number' ? 'number' : 'text') + '" value="' + esc(String(v ?? '')) + '" placeholder="' + esc(q.ph || '') + '" ' + (q.type === 'number' ? 'min="1" ' : '') + 'spellcheck="false"></label>';
  }).join('');
}
function renderRules() {
  $('#ruleList').innerHTML = steps.map((st, i) => {
    const r = RULE_BY_ID[st.id];
    return '<div class="rule' + (st.on ? ' on' : '') + '" data-id="' + st.id + '"><div class="rh">' +
      '<label class="rn"><input type="checkbox" class="en"' + (st.on ? ' checked' : '') + '><span>' + r.name + '</span></label>' +
      '<span class="delta"></span><span class="mv"><button type="button" class="up" aria-label="上移"' + (i === 0 ? ' disabled' : '') + '>↑</button><button type="button" class="dn" aria-label="下移"' + (i === steps.length - 1 ? ' disabled' : '') + '>↓</button></span></div>' +
      '<div class="rd">' + r.desc + '</div>' + (st.on && r.params.length ? '<div class="rp">' + paramHTML(r, st) + '</div>' : '') + '<div class="rerr"></div></div>';
  }).join('');
  paintInfo();
}
function paintInfo() {
  $$('#ruleList .rule').forEach(el => { el.querySelector('.delta').textContent = ''; el.querySelector('.rerr').textContent = ''; el.classList.remove('bad'); });
  if (!lastRun) return;
  lastRun.info.forEach(x => {
    const el = $('#ruleList .rule[data-id="' + x.id + '"]'); if (!el) return;
    const d = x.after - x.before;
    el.querySelector('.delta').textContent = d === 0 ? '' : (d > 0 ? '+' : '−') + Math.abs(d) + ' 行';
    if (x.err) { el.querySelector('.rerr').textContent = x.err; el.classList.add('bad'); }
  });
}
function saveSteps() { store.set('steps', steps); }
let timer;
function schedule() { clearTimeout(timer); timer = setTimeout(run, 120); }
function run() {
  const text = $('#in').value, lim = textLimit();
  $('#inStat').textContent = fmtN(text.length) + ' 字符 · ' + fmtN(lines(text).length) + ' 行' + (text.length > lim * 0.9 ? '（上限 ' + fmtN(lim) + '）' : '');
  if (text.length > lim) {
    lastOut = ''; lastRun = null; $('#out').value = '';
    $('#errStat').textContent = '超出' + (isPro() ? '' : '免费版') + '上限 ' + fmtN(lim) + ' 字符';
    $('#outStat').textContent = ''; $('#diff').innerHTML = ''; paintInfo(); return;
  }
  lastRun = runChain(text, steps); lastOut = lastRun.out;
  $('#out').value = lastOut;
  const on = steps.filter(s => s.on).length;
  $('#outStat').textContent = fmtN(lastOut.length) + ' 字符 · ' + (lastOut === '' ? 0 : fmtN(lines(lastOut).length)) + ' 行' + (on ? '' : ' · 未启用规则');
  const errs = lastRun.info.filter(x => x.err).length;
  $('#errStat').textContent = errs ? errs + ' 条规则出错，已跳过' : '';
  $('#mStat').textContent = $('#outStat').textContent;
  if (view === 'diff') paintDiff();
  paintInfo();
}
function paintDiff() {
  const d = renderDiff($('#in').value, lastOut);
  $('#diff').innerHTML = d.html;
  $('#outStat').textContent = '删 ' + fmtN(d.nd) + ' 行 · 增 ' + fmtN(d.na) + ' 行 · 不变 ' + fmtN(d.ne) + ' 行';
}
function setView(v) {
  view = v;
  $$('.seg [data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  $('#out').hidden = v !== 'out'; $('#diff').hidden = v !== 'diff';
  if (v === 'diff') paintDiff(); else run();
}
function renderChains() {
  const pro = isPro();
  $('#slotInfo').textContent = pro ? '已保存 ' + chains.length + ' 条 · Pro 不限' : '已保存 ' + chains.length + ' / ' + FREE_CHAINS + ' 条';
  $('#saved').innerHTML = chains.length ? chains.map((c, i) => '<div class="sv" data-i="' + i + '"><button class="ap" type="button" title="应用这条规则链">' + esc(c.name) + '<small>' + c.steps.filter(s => s.on).length + ' 步</small></button><button class="rm" type="button" aria-label="删除 ' + esc(c.name) + '">×</button></div>').join('') : '<div class="none">还没有保存的规则链</div>';
  $$('#expChain,#impChain').forEach(b => b.classList.toggle('locked', !pro));
}
function renderPresets() {
  $('#presets').innerHTML = PRESETS.map((p, i) => '<button type="button" class="chip" data-i="' + i + '">' + p.name + '</button>').join('') + '<button type="button" class="chip ghost" id="resetRules">全部关闭</button>';
}
function openPro() { refreshLic(); $('#proDlg').showModal(); }
function refreshLic() {
  const pro = isPro();
  $('#licState').textContent = pro ? '已激活 Pro（本机校验通过）' : '当前为免费版';
  $('#licState').classList.toggle('ok', pro);
  $('#proBtn').textContent = pro ? 'Pro ✓' : 'Pro 解锁';
  $('#proBtn').classList.toggle('active', pro);
  $('#batchLock').hidden = pro; $('#batchBody').hidden = !pro;
  renderChains(); run();
}

/* 事件 */
$('#in').addEventListener('input', schedule);
$('#ruleList').addEventListener('click', e => {
  const el = e.target.closest('.rule'); if (!el) return;
  const i = steps.findIndex(s => s.id === el.dataset.id);
  if (e.target.classList.contains('up') && i > 0) { [steps[i - 1], steps[i]] = [steps[i], steps[i - 1]]; }
  else if (e.target.classList.contains('dn') && i < steps.length - 1) { [steps[i + 1], steps[i]] = [steps[i], steps[i + 1]]; }
  else return;
  saveSteps(); renderRules(); run();
});
$('#ruleList').addEventListener('change', e => {
  const el = e.target.closest('.rule'); if (!el) return;
  const st = steps.find(s => s.id === el.dataset.id);
  if (e.target.classList.contains('en')) { st.on = e.target.checked; saveSteps(); renderRules(); run(); }
});
$('#ruleList').addEventListener('input', e => {
  const k = e.target.dataset.k; if (!k) return;
  const st = steps.find(s => s.id === e.target.closest('.rule').dataset.id);
  st.p[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'number' ? Number(e.target.value) : e.target.value;
  saveSteps(); schedule();
});
$('#presets').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.id === 'resetRules') steps = steps.map(s => Object.assign({}, s, { on: false }));
  else steps = stepsFromPreset(PRESETS[+b.dataset.i].steps);
  saveSteps(); renderRules(); run();
});
$('#saveChain').addEventListener('click', () => {
  const name = $('#chainName').value.trim();
  if (!name) { toast('先给规则链起个名字'); $('#chainName').focus(); return; }
  if (!steps.some(s => s.on)) { toast('至少启用一条规则再保存'); return; }
  const i = chains.findIndex(c => c.name === name), snap = JSON.parse(JSON.stringify(steps));
  if (i >= 0) { chains[i].steps = snap; toast('已更新「' + name + '」'); }
  else {
    if (!isPro() && chains.length >= FREE_CHAINS) { toast('免费版最多保存 ' + FREE_CHAINS + ' 条'); openPro(); return; }
    chains.push({ name, steps: snap }); toast('已保存「' + name + '」');
  }
  store.set('chains', chains); renderChains();
});
$('#saved').addEventListener('click', e => {
  const sv = e.target.closest('.sv'); if (!sv) return;
  const i = +sv.dataset.i;
  if (e.target.closest('.rm')) { const n = chains[i].name; chains.splice(i, 1); store.set('chains', chains); renderChains(); toast('已删除「' + n + '」'); }
  else if (e.target.closest('.ap')) { steps = sanitizeSteps(JSON.parse(JSON.stringify(chains[i].steps))); $('#chainName').value = chains[i].name; saveSteps(); renderRules(); run(); }
});
$('#expChain').addEventListener('click', () => {
  if (!isPro()) return openPro();
  if (!chains.length) return toast('还没有可导出的规则链');
  dl('zhuanwen-chains.json', JSON.stringify({ app: 'zhuanwen', v: 1, chains }, null, 2), 'application/json');
});
$('#impChain').addEventListener('click', () => { if (!isPro()) return openPro(); $('#impFile').click(); });
$('#impFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const j = JSON.parse(await f.text()); if (j.app !== 'zhuanwen' || !Array.isArray(j.chains)) throw 0;
    let n = 0;
    j.chains.forEach(c => { if (!c || typeof c.name !== 'string') return; const item = { name: c.name.slice(0, 20), steps: sanitizeSteps(c.steps) }; const i = chains.findIndex(x => x.name === item.name); if (i >= 0) chains[i] = item; else chains.push(item); n++; });
    store.set('chains', chains); renderChains(); toast('已导入 ' + n + ' 条');
  } catch (x) { toast('不是有效的规则链文件'); }
});
$('#btnSample').addEventListener('click', () => {
  $('#in').value = '  张三,电话 138-1234-5678 ，邮箱 zhangsan@example.com  \n\n李四 ，手机：１３９００００１１１１,Email: Li.Si@Example.org\n\n   张三,电话 138-1234-5678 ，邮箱 zhangsan@example.com\n官网 https://example.com/pro?a=1。备用 www.demo.cn.\n订单共有3笔,总价100元,请于2026年10月18日前确认(逾期作废)...\n';
  run();
});
$('#btnPaste').addEventListener('click', async () => { try { $('#in').value = await navigator.clipboard.readText(); run(); } catch (e) { toast('浏览器不允许读取剪贴板，请长按输入框粘贴'); $('#in').focus(); } });
$('#btnClear').addEventListener('click', () => { $('#in').value = ''; run(); });
$('#btnOpen').addEventListener('click', () => $('#openFile').click());
$('#openFile').addEventListener('change', async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; $('#in').value = await f.text(); run(); });
$('#btnCopy').addEventListener('click', () => copy(lastOut));
$('#mCopy').addEventListener('click', () => copy(isConvert() ? $('#cvOutText').value : lastOut));
$('#btnReuse').addEventListener('click', () => { $('#in').value = lastOut; run(); toast('已把结果放回输入'); });
$('#btnDl').addEventListener('click', () => dl('转文结果.txt', lastOut));
$$('.seg [data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));

/* 标签页 */
const isConvert = () => $('#pane-convert').classList.contains('on');
$$('.tab').forEach(t => t.addEventListener('click', () => {
  $$('.tab').forEach(x => { x.classList.toggle('on', x === t); x.setAttribute('aria-selected', x === t); });
  $$('.pane').forEach(p => p.classList.toggle('on', p.id === 'pane-' + t.dataset.tab));
  document.body.dataset.tab = t.dataset.tab;
  if (t.dataset.tab === 'convert') cvRun();
}));
document.body.dataset.tab = 'clean';

/* 互转 */
let cvView = 'out';
const cvOpts = () => ({ head: $('#cvHead').checked, infer: $('#cvInfer').checked, delim: $('#cvDelim').value });
function cvRun() {
  const text = $('#cvText').value, lim = textLimit();
  $('#cvInStat').textContent = fmtN(text.length) + ' 字符';
  $('#cvErr').textContent = ''; $('#cvOutStat').textContent = '';
  if (!text.trim()) { $('#cvOutText').value = ''; $('#cvTable').innerHTML = ''; return; }
  if (text.length > lim) { $('#cvErr').textContent = '超出上限 ' + fmtN(lim) + ' 字符'; return; }
  try {
    const r = convert(text, $('#cvIn').value, $('#cvOut').value, cvOpts());
    $('#cvOutText').value = r.text;
    const t = r.table;
    $('#cvOutStat').textContent = '识别为 ' + ({ csv: 'CSV', tsv: 'TSV', json: 'JSON', md: 'Markdown' }[t.fmt]) + ' · ' + fmtN(t.rows.length) + ' 行 × ' + t.width + ' 列';
    const hd = t.head || Array.from({ length: t.width }, (_, i) => '列' + (i + 1));
    $('#cvTable').innerHTML = '<table><thead><tr>' + hd.map(h => '<th>' + esc(h) + '</th>').join('') + '</tr></thead><tbody>' + t.rows.slice(0, 200).map(r => '<tr>' + r.map(c => '<td>' + esc(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table>' + (t.rows.length > 200 ? '<div class="fold">仅预览前 200 行，复制/下载为完整结果</div>' : '');
  } catch (e) { $('#cvOutText').value = ''; $('#cvTable').innerHTML = ''; $('#cvErr').textContent = e.message; }
  $('#mStat').textContent = $('#cvOutStat').textContent;
}
let cvTimer; const cvSched = () => { clearTimeout(cvTimer); cvTimer = setTimeout(cvRun, 120); };
['#cvText'].forEach(s => $(s).addEventListener('input', cvSched));
['#cvIn', '#cvOut', '#cvHead', '#cvInfer', '#cvDelim'].forEach(s => $(s).addEventListener('change', cvRun));
$$('[data-cv]').forEach(b => b.addEventListener('click', () => { cvView = b.dataset.cv; $$('[data-cv]').forEach(x => x.classList.toggle('on', x === b)); $('#cvOutText').hidden = cvView !== 'out'; $('#cvTable').hidden = cvView !== 'table'; }));
$('#cvCopy').addEventListener('click', () => copy($('#cvOutText').value));
$('#cvDl').addEventListener('click', () => { const o = $('#cvOut').value; dl('转文结果.' + ({ json: 'json', jsonarr: 'json', csv: 'csv', tsv: 'tsv', md: 'md' }[o]), $('#cvOutText').value); });
$('#cvClear').addEventListener('click', () => { $('#cvText').value = ''; cvRun(); });
$('#cvPaste').addEventListener('click', async () => { try { $('#cvText').value = await navigator.clipboard.readText(); cvRun(); } catch (e) { toast('浏览器不允许读取剪贴板，请长按输入框粘贴'); } });
$('#cvSample').addEventListener('click', () => { $('#cvText').value = '姓名,城市,年龄,备注\n张三,上海,28,"喜欢咖啡, 也喜欢茶"\n李四,北京,35,\n王五,"成都",41,"说过""你好"""\n'; $('#cvIn').value = 'auto'; cvRun(); });
$('#cvSwap').addEventListener('click', () => {
  const o = $('#cvOut').value, map = { jsonarr: 'json' };
  const cur = $('#cvIn').value === 'auto' ? (lastCv() || 'csv') : $('#cvIn').value;
  $('#cvText').value = $('#cvOutText').value; $('#cvIn').value = map[o] || o;
  $('#cvOut').value = cur === 'json' ? 'json' : cur; cvRun();
});
function lastCv() { try { return parseTable($('#cvText').value, 'auto', cvOpts()).fmt; } catch (e) { return null; } }

/* 批量 */
function bname(n) { const i = n.lastIndexOf('.'); return i > 0 ? n.slice(0, i) + '.cleaned' + n.slice(i) : n + '.cleaned.txt'; }
async function addFiles(fl) {
  if (!isPro()) return openPro();
  for (const f of fl) {
    const text = await f.text();
    if (text.length > PRO_LIMIT) { batch.push({ name: f.name, err: '文件过大' }); continue; }
    const r = runChain(text, steps);
    batch.push({ name: f.name, out: r.out, a: lines(text).length, b: r.out === '' ? 0 : lines(r.out).length, size: text.length, err: r.info.find(x => x.err)?.err });
  }
  renderBatch();
}
function renderBatch() {
  $('#batchList').innerHTML = batch.length ? batch.map((b, i) => '<div class="bi"><div class="bn"><b>' + esc(b.name) + '</b><small>' + (b.out === undefined ? esc(b.err) : fmtN(b.size) + ' 字符 · ' + fmtN(b.a) + ' → ' + fmtN(b.b) + ' 行' + (b.err ? ' · 有规则出错：' + esc(b.err) : '')) + '</small></div>' + (b.out === undefined ? '' : '<button class="btn sm" data-i="' + i + '" type="button">下载</button>') + '</div>').join('') : '<div class="none">还没有文件</div>';
}
$('#batchFiles').addEventListener('change', e => { addFiles([...e.target.files]); e.target.value = ''; });
$('#batchList').addEventListener('click', e => { const b = e.target.closest('button[data-i]'); if (b) { const x = batch[+b.dataset.i]; dl(bname(x.name), x.out); } });
$('#batchAll').addEventListener('click', async () => { for (const x of batch) { if (x.out !== undefined) { dl(bname(x.name), x.out); await new Promise(r => setTimeout(r, 250)); } } });
$('#batchClear').addEventListener('click', () => { batch = []; renderBatch(); });
const drop = $('#drop');
['dragover', 'dragenter'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => addFiles([...e.dataTransfer.files]));
$$('[data-open-pro]').forEach(b => b.addEventListener('click', openPro));

/* Pro 弹窗 */
$('#proBtn').addEventListener('click', openPro);
$('#licOk').addEventListener('click', () => {
  const k = $('#licKey').value.trim().toUpperCase();
  if (validKey(k)) { store.set('license', k); $('#licMsg').textContent = '已激活。'; $('#licMsg').className = 'lic-msg ok'; }
  else { $('#licMsg').textContent = '授权码无效，请检查格式：ZW-XXXX-XXXX-XXXX-XXXX'; $('#licMsg').className = 'lic-msg bad'; }
  refreshLic();
});
$('#licOff').addEventListener('click', () => { store.del('license'); $('#licKey').value = ''; $('#licMsg').textContent = '已移除授权。'; $('#licMsg').className = 'lic-msg'; refreshLic(); });
$('#proDlg').addEventListener('click', e => { if (e.target === $('#proDlg')) $('#proDlg').close(); });

renderPresets(); renderRules(); renderChains(); renderBatch(); refreshLic();
})();
