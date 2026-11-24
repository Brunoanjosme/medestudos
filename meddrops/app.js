/* MedDrops — Flashcards & Áudio. JS puro, sem build. Dados no IndexedDB (cards, progresso, áudios em cache). */
'use strict';

/* ---------- utilidades ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DAY = 864e5;
const startOfDay = (t = Date.now()) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const todayKey = () => new Date(startOfDay()).toLocaleDateString('sv-SE');
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ic = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><rect x="6" y="4.5" width="4.2" height="15" rx="1.2"/><rect x="13.8" y="4.5" width="4.2" height="15" rx="1.2"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M6 6.5v11a1 1 0 0 0 1.55.83l7.5-5.5a1 1 0 0 0 0-1.66l-7.5-5.5A1 1 0 0 0 6 6.5z"/><rect x="16.5" y="5.5" width="2.5" height="13" rx="1.2"/></svg>',
  prev: '<svg viewBox="0 0 24 24"><path d="M18 6.5v11a1 1 0 0 1-1.55.83l-7.5-5.5a1 1 0 0 1 0-1.66l7.5-5.5A1 1 0 0 1 18 6.5z"/><rect x="5" y="5.5" width="2.5" height="13" rx="1.2"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  spk: '<svg viewBox="0 0 24 24"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>'
};

/* ---------- IndexedDB ---------- */
const DB = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('meddrops', 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        ['cards', 'progress', 'audios'].forEach(n => d.createObjectStore(n, { keyPath: 'id' }));
        d.createObjectStore('meta', { keyPath: 'k' });
      };
      r.onsuccess = () => { this.db = r.result; res(); };
      r.onerror = () => rej(r.error);
    });
  },
  tx(store, mode, fn) {
    return new Promise((res, rej) => {
      const t = this.db.transaction(store, mode), s = t.objectStore(store);
      let out; const q = fn(s);
      if (q && 'onsuccess' in q) q.onsuccess = () => { out = q.result; };
      t.oncomplete = () => res(out);
      t.onerror = t.onabort = () => rej(t.error || new Error('IndexedDB'));
    });
  },
  all: s => DB.tx(s, 'readonly', o => o.getAll()),
  keys: s => DB.tx(s, 'readonly', o => o.getAllKeys()),
  get: (s, k) => DB.tx(s, 'readonly', o => o.get(k)),
  put: (s, v) => DB.tx(s, 'readwrite', o => o.put(v)),
  putMany: (s, a) => DB.tx(s, 'readwrite', o => { a.forEach(v => o.put(v)); }),
  del: (s, k) => DB.tx(s, 'readwrite', o => o.delete(k)),
  delMany: (s, a) => DB.tx(s, 'readwrite', o => { a.forEach(k => o.delete(k)); }),
  clear: s => DB.tx(s, 'readwrite', o => o.clear())
};

/* ---------- estado ---------- */
const DEF = { newPerDay: 20, rate: 1, auto: true, areas: [], subs: [], assuntos: [], manifestUrl: 'dados/manifesto.json' };
const S = {
  tab: 'hoje', cards: [], byId: new Map(), prog: new Map(), set: { ...DEF },
  stats: { d: '', n: 0, novos: 0 }, q: '', study: null, detail: null, syncing: false, lastSync: 0, dl: null, showScript: false
};
const loadSettings = () => { try { const o = JSON.parse(localStorage.getItem('md.set') || '{}'); if (o.area && !o.areas) o.areas = [o.area]; delete o.area; delete o.assunto; Object.assign(S.set, o); } catch (e) { /* sem storage */ } };
const saveSettings = () => { try { localStorage.setItem('md.set', JSON.stringify(S.set)); } catch (e) { /* ignora */ } };

function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), ms);
}

/* ---------- normalização / importação ---------- */
const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
function normCard(r, source) {
  if (!r || typeof r !== 'object') return null;
  const frente = String(r.frente ?? '').trim(), verso = String(r.verso ?? '').trim();
  if (!frente || !verso) return null;
  let tags = r.tags;
  if (typeof tags === 'string') tags = tags.split(/[;|,]/);
  if (!Array.isArray(tags)) tags = [];
  return {
    id: String(r.id || ('imp-' + hash(frente + verso))).trim(),
    grandeArea: String(r.grandeArea || 'Sem área').trim(), subarea: String(r.subarea || 'Geral').trim(),
    assunto: String(r.assunto || 'Geral').trim(), titulo: String(r.titulo || '').trim(),
    frente, verso, roteiroAudio: String(r.roteiroAudio || '').trim(), audioUrl: String(r.audioUrl || '').trim(),
    tags: tags.map(t => String(t).trim()).filter(Boolean), source
  };
}
function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/, 1)[0] || '';
  const d = first.split(';').length > first.split(',').length ? ';' : ',';
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === d) { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); f = ''; if (row.some(x => x.trim())) rows.push(row); row = []; }
    else f += c;
  }
  row.push(f); if (row.some(x => x.trim())) rows.push(row);
  if (rows.length < 2) return [];
  const map = { grandearea: 'grandeArea', area: 'grandeArea', subarea: 'subarea', assuntogeral: 'subarea', assunto: 'assunto', assuntoespecifico: 'assunto', titulo: 'titulo', frente: 'frente', pergunta: 'frente', verso: 'verso', resposta: 'verso', roteiroaudio: 'roteiroAudio', roteiro: 'roteiroAudio', audiourl: 'audioUrl', audio: 'audioUrl', tags: 'tags', id: 'id' };
  const keys = rows[0].map(h => map[norm(h).replace(/[^a-z]/g, '')] || null);
  return rows.slice(1).map(r => { const o = {}; keys.forEach((k, i) => { if (k) o[k] = r[i]; }); return o; });
}
const extractList = j => Array.isArray(j) ? j : (j && Array.isArray(j.cards) ? j.cards : (j && Array.isArray(j.itens) ? j.itens : []));

async function upsertCards(list, source, replaceRepo) {
  const items = list.map(r => normCard(r, source)).filter(Boolean);
  const seen = new Set(), uniq = [];
  items.forEach(c => { if (!seen.has(c.id)) { seen.add(c.id); uniq.push(c); } });
  await DB.putMany('cards', uniq);
  if (replaceRepo) {
    const gone = S.cards.filter(c => c.source === 'repo' && !seen.has(c.id)).map(c => c.id);
    if (gone.length) await DB.delMany('cards', gone);
  }
  await reloadCards();
  return uniq.length;
}
function canon() {
  const seen = {}, pick = (lv, v) => { const k = lv + '|' + norm(v).replace(/\s+/g, ' '); return seen[k] ||= v; };
  S.cards.forEach(c => { c.grandeArea = pick(1, c.grandeArea); c.subarea = pick(2, subOf(c)); c.assunto = pick(3, c.assunto); });
}
async function reloadCards() {
  S.cards = (await DB.all('cards')).sort((a, b) => a.grandeArea.localeCompare(b.grandeArea) || subOf(a).localeCompare(subOf(b)) || a.assunto.localeCompare(b.assunto) || a.id.localeCompare(b.id));
  canon(); // grafias que só diferem em maiúsculas/acentos viram a mesma categoria
  S.byId = new Map(S.cards.map(c => [c.id, c]));
  pruneSel();
  buildQueue();
}

async function syncRepo(silent) {
  if (S.syncing) return;
  S.syncing = true; if (S.tab === 'ajustes') render();
  try {
    const base = new URL(S.set.manifestUrl || 'dados/manifesto.json', location.href);
    const mr = await fetch(base, { cache: 'no-cache' });
    if (!mr.ok) throw new Error('manifesto ' + mr.status);
    const m = await mr.json();
    S.audioBase = m.audioBase ? new URL(m.audioBase, base).href : '';
    const files = (Array.isArray(m) ? m : (m.arquivos || [])).map(a => typeof a === 'string' ? a : a.arquivo).filter(Boolean);
    let all = [], fail = 0;
    for (const f of files) {
      try {
        const r = await fetch(new URL(f, base), { cache: 'no-cache' });
        if (!r.ok) throw 0;
        const j = await r.json();
        all = all.concat(extractList(j));
      } catch (e) { fail++; }
    }
    if (fail === files.length && files.length) throw new Error('arquivos indisponíveis');
    const n = await upsertCards(all, 'repo', fail === 0);
    S.lastSync = Date.now(); try { localStorage.setItem('md.sync', String(S.lastSync)); localStorage.setItem('md.audioBase', S.audioBase || ''); } catch (e) { /* */ }
    if (!silent) toast(`${n} cards sincronizados${fail ? ` (${fail} arquivo(s) falharam)` : ''}`);
  } catch (e) {
    if (!silent) toast(navigator.onLine ? 'Não foi possível sincronizar: ' + e.message : 'Sem internet — usando o conteúdo salvo');
  } finally { S.syncing = false; render(); }
}

async function importFiles(files) {
  let total = 0;
  for (const f of files) {
    try {
      const t = await f.text();
      const isCsv = /\.csv$/i.test(f.name) || (!/^\s*[\[{]/.test(t));
      total += await upsertCards(isCsv ? parseCSV(t) : extractList(JSON.parse(t)), 'local', false);
    } catch (e) { toast('Erro ao ler ' + f.name); }
  }
  toast(total ? `${total} cards importados` : 'Nenhum card válido encontrado (precisa de "frente" e "verso")');
  render();
}

/* ---------- repetição espaçada ---------- */
const getProg = id => S.prog.get(id) || null;
function preview(p, r) {
  const q = p ? { ...p } : { ease: 2.5, interval: 0, reps: 0, lapses: 0 };
  if (r === 0) { q.lapses++; q.reps = 0; q.interval = 0; q.ease = Math.max(1.3, q.ease - .2); q.due = Date.now() + 10 * 60e3; return q; }
  if (q.reps === 0 || !q.interval) q.interval = [0, 1, 2, 4][r];
  else if (q.reps === 1) q.interval = [0, 2, 4, 7][r];
  else q.interval = Math.max(q.interval + 1, Math.round(q.interval * q.ease * [0, .8, 1, 1.35][r]));
  q.ease = Math.min(3, Math.max(1.3, q.ease + [0, -.15, 0, .1][r]));
  q.reps++; q.due = startOfDay() + q.interval * DAY;
  return q;
}
const fmtInt = (p, r) => { const q = preview(p, r); if (r === 0) return '10 min'; const d = q.interval; return d < 30 ? d + ' d' : d < 365 ? Math.round(d / 30) + ' m' : (d / 365).toFixed(1) + ' a'; };
function status(c) {
  const p = getProg(c.id);
  if (!p) return ['Novo', ''];
  if (p.due <= Date.now()) return ['Revisar', 'warn'];
  if (p.interval >= 21) return ['Dominado', 'ok'];
  return ['Aprendendo', ''];
}
async function loadStats() {
  const m = await DB.get('meta', 'stats'); const k = todayKey();
  S.stats = m && m.v && m.v.d === k ? m.v : { d: k, n: 0, novos: 0 };
}
const filtered = () => {
  const q = norm(S.q);
  return S.cards.filter(c => matchSel(c) &&
    (!q || norm([c.titulo, c.frente, c.verso, c.assunto, c.subarea, c.tags.join(' ')].join(' ')).includes(q)));
};
function counts() {
  const f = filtered(), now = Date.now();
  const due = f.filter(c => { const p = getProg(c.id); return p && p.due <= now; });
  const fresh = f.filter(c => !getProg(c.id));
  const allowed = Math.max(0, S.set.newPerDay - S.stats.novos);
  return { f, due, fresh, newAvail: Math.min(fresh.length, allowed), allowed };
}
function todayCount() { // topo: pendentes de hoje, sem filtro
  const now = Date.now(); let due = 0, fresh = 0;
  S.cards.forEach(c => { const p = getProg(c.id); if (p) { if (p.due <= now) due++; } else fresh++; });
  return due + Math.min(fresh, Math.max(0, S.set.newPerDay - S.stats.novos));
}

/* ---------- navegação / render ---------- */
function setTab(t) { S.tab = t; render(); window.scrollTo(0, 0); }
function render() {
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === S.tab));
  $('#topCount').textContent = todayCount();
  const v = $('#view'), keep = document.activeElement && document.activeElement.id === 'qIn' ? [document.activeElement.selectionStart] : null;
  v.innerHTML = ({ hoje: vHoje, biblioteca: vBiblioteca, audio: vAudio, ajustes: vAjustes }[S.tab])();
  if (keep) { const i = $('#qIn'); if (i) { i.focus(); i.setSelectionRange(keep[0], keep[0]); } }
  updateAudioUI();
  if (S.tab === 'ajustes') audioStats();
}
const subOf = c => c.subarea || 'Geral';
const matchSel = (c, lv = 3) => (!S.set.areas.length || S.set.areas.includes(c.grandeArea)) &&
  (lv < 2 || !S.set.subs.length || S.set.subs.includes(subOf(c))) && (lv < 3 || !S.set.assuntos.length || S.set.assuntos.includes(c.assunto));
const uniq = a => [...new Set(a)];
function options() {
  const A = uniq(S.cards.map(c => c.grandeArea));
  const B = uniq(S.cards.filter(c => matchSel(c, 1)).map(subOf));
  const C = uniq(S.cards.filter(c => matchSel(c, 2)).map(c => c.assunto));
  return [A, B, C];
}
function pruneSel() { // remove seleções que deixaram de existir (cascata: área → assunto geral → assunto específico)
  const [A] = options(); S.set.areas = S.set.areas.filter(x => A.includes(x));
  const B = options()[1]; S.set.subs = S.set.subs.filter(x => B.includes(x));
  const C = options()[2]; S.set.assuntos = S.set.assuntos.filter(x => C.includes(x));
}
function filterBlock() {
  const [A, B, C] = options(), sel = S.set;
  const lv = (n, title, list, chosen) => `<div class="fl"><div class="fl-h"><label class="f">${title}</label><span class="mute small">${chosen.length ? chosen.length + ' selecionado' + (chosen.length > 1 ? 's' : '') : 'todos'}</span></div>
    <div class="chips-f">${list.map(v => `<button class="fc ${chosen.includes(v) ? 'on' : ''}" data-act="fchip" data-lv="${n}" data-v="${esc(v)}" aria-pressed="${chosen.includes(v)}">${esc(v)}</button>`).join('') || '<span class="mute small">—</span>'}</div></div>`;
  const any = sel.areas.length || sel.subs.length || sel.assuntos.length;
  return `${lv(1, 'Grande área', A, sel.areas)}${lv(2, 'Assunto geral', B, sel.subs)}${lv(3, 'Assunto específico', C, sel.assuntos)}
  ${any ? '<button class="btn alt sm" style="margin-top:12px" data-act="fclear">Limpar filtros</button>' : ''}`;
}
function emptyLib() {
  return `<div class="card empty"><b>Nenhum card ainda</b>${S.syncing ? 'Carregando conteúdo…' : 'Sincronize com o repositório ou importe um arquivo .json / .csv em Ajustes.'}
  <div style="margin-top:16px"><button class="btn" data-act="sync">Sincronizar agora</button></div></div>`;
}

function vHoje() {
  if (!S.cards.length) return emptyLib();
  const k = counts(), est = S.stats.n;
  const total = k.due.length + k.newAvail;
  const areas = {};
  S.cards.forEach(c => { const a = areas[c.grandeArea] ||= { t: 0, d: 0 }; a.t++; const p = getProg(c.id); if (p && p.interval >= 21) a.d++; });
  return `<section class="card hero">
    <div class="eyebrow">A revisar agora</div>
    <div class="big">${k.due.length}</div>
    <div class="mute small">${k.newAvail ? `+ ${k.newAvail} novo${k.newAvail > 1 ? 's' : ''} liberado${k.newAvail > 1 ? 's' : ''} hoje` : (k.fresh.length ? 'Limite de novos de hoje atingido' : 'Sem cards novos neste filtro')}</div>
    <div class="stats"><div><b>${est}</b><span>Estudados hoje</span></div><div><b>${k.fresh.length}</b><span>Novos</span></div><div><b>${k.f.length}</b><span>No filtro</span></div></div>
  </section>
  <section class="card">${filterBlock()}</section>
  <div class="stack">
    <button class="btn" data-act="study" ${total ? '' : 'disabled'}>${total ? `Estudar agora · ${total}` : 'Tudo em dia ✓'}</button>
    <div class="grid2"><button class="btn alt" data-act="listen" ${k.f.length ? '' : 'disabled'}>${ic.spk} Ouvir fila</button>
    <button class="btn alt" data-act="practice" ${k.f.length ? '' : 'disabled'}>Treino livre</button></div>
  </div>
  <div class="sec">Domínio por grande área</div>
  <section class="card">${Object.entries(areas).map(([a, v]) => `<div style="margin:6px 0 14px"><div class="row" style="justify-content:space-between;margin-bottom:6px"><b style="overflow-wrap:anywhere">${esc(a)}</b><span class="mute small" style="white-space:nowrap">${v.d}/${v.t}</span></div><div class="bar"><i style="width:${v.t ? Math.round(v.d / v.t * 100) : 0}%"></i></div></div>`).join('')}</section>`;
}

function vBiblioteca() {
  if (!S.cards.length) return emptyLib();
  const f = filtered(), g = {};
  f.forEach(c => { (((g[c.grandeArea] ||= {})[subOf(c)] ||= {})[c.assunto] ||= []).push(c); });
  const open = !!(S.q || S.set.areas.length || S.set.subs.length || S.set.assuntos.length) || Object.keys(g).length === 1;
  const item = c => { const [t, cl] = status(c); return `<button class="item" data-act="detail" data-id="${esc(c.id)}"><span class="t">${esc(c.titulo || c.frente)}</span><span class="pill ${cl}">${t}</span></button>`; };
  const n = o => Object.values(o).reduce((x, y) => x + (Array.isArray(y) ? y.length : n(y)), 0);
  return `<section class="card">${filterBlock()}<div style="margin-top:14px"><label class="f" for="qIn">Buscar</label><input type="search" id="qIn" data-input="q" placeholder="Título, pergunta, tag…" value="${esc(S.q)}" autocomplete="off" autocapitalize="off"></div></section>
  <div class="sec">${f.length} card${f.length === 1 ? '' : 's'}</div>
  ${f.length ? Object.entries(g).map(([a, subs]) => `<details class="grp" ${open ? 'open' : ''}><summary><span style="min-width:0;overflow-wrap:anywhere">${esc(a)}</span><small>${n(subs)}</small></summary>
    ${Object.entries(subs).map(([sb, as]) => `<div class="subh">${esc(sb)}</div>${Object.entries(as).map(([as1, cs]) => `<details class="grp in" ${open ? 'open' : ''}><summary><span style="min-width:0;overflow-wrap:anywhere">${esc(as1)}</span><small>${cs.length}</small></summary>${cs.map(item).join('')}</details>`).join('')}`).join('')}</details>`).join('') : '<div class="card empty"><b>Nada encontrado</b>Ajuste a busca ou os filtros.</div>'}`;
}

function vAjustes() {
  const loc = S.cards.filter(c => c.source === 'local').length, rep = S.cards.length - loc;
  const ls = S.lastSync || +(safeLS('md.sync') || 0);
  const d = S.dl;
  return `<div class="sec" style="margin-top:8px">Conteúdo</div>
  <section class="card"><div class="kv"><span>Do repositório</span><span>${rep} cards</span></div><div class="kv"><span>Importados</span><span>${loc} cards</span></div>
  <div class="kv"><span>Última sincronização</span><span>${ls ? new Date(ls).toLocaleString('pt-BR') : '—'}</span></div>
  <div class="stack" style="margin-top:12px"><button class="btn" data-act="sync" ${S.syncing ? 'disabled' : ''}>${S.syncing ? 'Sincronizando…' : 'Sincronizar com o repositório'}</button>
  <button class="btn alt" data-act="import">Importar .json ou .csv</button></div></section>
  <div class="sec">Áudio offline</div>
  <section class="card"><div class="kv"><span>Áudios salvos no aparelho</span><span id="audCount">…</span></div>
  ${d ? `<div class="bar" style="margin:12px 0"><i style="width:${d.total ? Math.round(d.done / d.total * 100) : 0}%"></i></div><p class="mute small">Baixando ${d.done}/${d.total}…</p>` : ''}
  <p class="mute small" style="margin:8px 0 12px">Cards sem arquivo de áudio usam a voz do aparelho (roteiro lido em português) — também offline.</p>
  <div class="stack"><button class="btn alt" data-act="dlaudio" ${d ? 'disabled' : ''}>Baixar todos os áudios</button><button class="btn danger" data-act="clraudio">Limpar áudios salvos</button></div></section>
  <div class="sec">Estudo</div>
  <section class="card"><label class="f" for="npd">Cards novos por dia</label><input type="number" id="npd" inputmode="numeric" min="0" max="500" value="${S.set.newPerDay}" data-change="npd">
  <div style="margin-top:14px"><label class="f" for="mu">URL do manifesto (avançado)</label><input type="url" id="mu" value="${esc(S.set.manifestUrl)}" data-change="mu" autocapitalize="off" autocorrect="off"></div></section>
  <div class="sec">Dados</div>
  <section class="card stack"><button class="btn alt" data-act="backup">Exportar progresso (backup)</button><button class="btn alt" data-act="restore">Restaurar backup</button>
  <button class="btn danger" data-act="resetprog">Zerar todo o progresso</button><button class="btn danger" data-act="wipe">Apagar tudo</button></section>
  <p class="mute small" style="text-align:center;margin-top:16px">MedDrops v1 · conteúdo apenas para estudo</p>`;
}
const safeLS = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
async function audioStats() {
  try { const k = await DB.keys('audios'); const el = $('#audCount'); if (el) el.textContent = `${k.length} de ${S.cards.filter(c => c.audioUrl).length}`; } catch (e) { /* */ }
}

/* ---------- estudo ---------- */
function startStudy(practice) {
  const k = counts(); let q;
  if (practice) { q = k.f.slice().sort(() => Math.random() - .5).slice(0, 20); }
  else {
    q = k.due.slice().sort((a, b) => getProg(a.id).due - getProg(b.id).due).concat(k.fresh.slice(0, k.newAvail));
  }
  if (!q.length) return toast('Nada para estudar neste filtro');
  S.study = { q, i: 0, show: false, practice, done: 0, again: new Set(), hits: 0 };
  openSheet(); renderStudy();
}
function openSheet() { $('#sheet').hidden = false; document.body.classList.add('lock'); }
function closeSheet() { $('#sheet').hidden = true; document.body.classList.remove('lock'); S.study = null; S.detail = null; stopAudio(); render(); }
function renderStudy() {
  const st = S.study, sh = $('#sheet'), c = st.q[st.i];
  if (!c) {
    sh.innerHTML = `<div class="sh-top"><button class="x" data-act="close" aria-label="Fechar">${ic.x}</button></div><div class="sh-body"><div class="card empty" style="padding:40px 20px"><b style="font-size:24px">Sessão concluída</b>${st.done} cards revisados${st.practice ? ' (treino livre — sem alterar agenda)' : ''}.</div></div><div class="sh-foot"><button class="btn" data-act="close">Voltar</button></div>`;
    return;
  }
  const p = getProg(c.id), rt = [0, 1, 2, 3];
  sh.innerHTML = `<div class="sh-top"><button class="x" data-act="close" aria-label="Fechar">${ic.x}</button><div class="bar"><i style="width:${Math.round(st.i / st.q.length * 100)}%"></i></div><div class="cnt">${st.i + 1}<span class="mute" style="font-size:14px">/${st.q.length}</span></div></div>
  <div class="sh-body"><article class="card"><div class="eyebrow">${esc(c.grandeArea)} › ${esc(subOf(c))} › ${esc(c.assunto)}</div>
    ${c.titulo ? `<div class="ttl">${esc(c.titulo)}</div>` : ''}<div class="front">${esc(c.frente)}</div>
    ${st.show ? `<div class="ans">${esc(c.verso)}</div>${c.tags.length ? `<div class="tags">${c.tags.map(t => `<span class="pill">#${esc(t)}</span>`).join('')}</div>` : ''}` : ''}
  </article>${st.show ? `<button class="btn alt" data-act="speak" data-id="${esc(c.id)}">${ic.spk} Ouvir explicação</button>` : ''}</div>
  <div class="sh-foot">${st.show ? `<div class="rate">${['Errei', 'Difícil', 'Bom', 'Fácil'].map((l, r) => `<button class="r${r}" data-act="rate" data-r="${r}">${l}<small>${fmtInt(p, r)}</small></button>`).join('')}</div>` : '<button class="btn" data-act="reveal">Mostrar resposta</button>'}</div>`;
  const b = $('.sh-body'); if (b) b.scrollTop = 0;
}
async function rate(r) {
  const st = S.study, c = st.q[st.i]; if (!c) return;
  if (!st.practice) {
    const was = getProg(c.id), p = preview(was, r); p.id = c.id; p.last = Date.now();
    S.prog.set(c.id, p); await DB.put('progress', p);
    if (!was) S.stats.novos++;
    S.stats.n++; await DB.put('meta', { k: 'stats', v: S.stats });
  }
  if (r === 0 && !st.again.has(c.id)) { st.again.add(c.id); st.q.push(c); }
  st.done++; st.i++; st.show = false; stopAudio();
  renderStudy(); $('#topCount').textContent = todayCount();
}

function openDetail(id) {
  const c = S.byId.get(id); if (!c) return;
  S.detail = id; const [t, cl] = status(c), p = getProg(id);
  $('#sheet').innerHTML = `<div class="sh-top"><button class="x" data-act="close" aria-label="Fechar">${ic.x}</button><div class="eyebrow" style="flex:1">${esc(c.id)}</div><span class="pill ${cl}">${t}</span></div>
  <div class="sh-body"><article class="card"><div class="eyebrow">${esc(c.grandeArea)} › ${esc(subOf(c))} › ${esc(c.assunto)}</div>
  ${c.titulo ? `<h2 style="font-size:20px;margin-top:8px;letter-spacing:-.02em">${esc(c.titulo)}</h2>` : ''}
  <div class="front" style="font-size:19px">${esc(c.frente)}</div><div class="ans">${esc(c.verso)}</div>
  ${c.roteiroAudio ? `<div class="eyebrow" style="margin-top:18px">Roteiro de áudio</div><div class="script" style="border:0;margin-top:6px;padding-top:0">${esc(c.roteiroAudio)}</div>` : ''}
  ${c.tags.length ? `<div class="tags">${c.tags.map(x => `<span class="pill">#${esc(x)}</span>`).join('')}</div>` : ''}
  ${p ? `<p class="mute small" style="margin-top:14px">Intervalo ${p.interval} d · facilidade ${p.ease.toFixed(2)} · erros ${p.lapses} · próxima ${new Date(p.due).toLocaleDateString('pt-BR')}</p>` : ''}</article></div>
  <div class="sh-foot stack"><button class="btn" data-act="speak" data-id="${esc(id)}">${ic.spk} Ouvir</button>
  <div class="grid2"><button class="btn alt" data-act="resetcard" data-id="${esc(id)}">Zerar progresso</button>${c.source === 'local' ? `<button class="btn danger" data-act="delcard" data-id="${esc(id)}">Excluir</button>` : '<button class="btn alt" data-act="close">Fechar</button>'}</div></div>`;
  openSheet();
}

/* ---------- áudio ---------- */
const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
const A = { q: [], i: 0, cur: null, playing: false, single: false, mode: '', audio: new Audio(), tok: 0, pct: 0, url: null, missing: new Set(), unlocked: false, voice: null, utter: null };
A.audio.preload = 'auto'; A.audio.setAttribute('playsinline', '');
const RATES = [0.8, 1, 1.25, 1.5, 1.75, 2];

function buildQueue() {
  const id = A.cur && !A.single ? A.cur.id : null;
  A.q = filtered();
  if (id) { const i = A.q.findIndex(c => c.id === id); if (i >= 0) A.i = i; else if (A.i >= A.q.length) A.i = 0; }
  else if (A.i >= A.q.length) A.i = 0;
  if (!A.cur && A.q.length) A.cur = A.q[A.i];
}
function pickVoice() {
  if (!('speechSynthesis' in window)) return;
  const vs = speechSynthesis.getVoices().filter(v => /^pt/i.test(v.lang));
  A.voice = vs.find(v => /pt[-_]BR/i.test(v.lang) && /(enhanced|premium|aprimorad|luciana|felipe|francisca)/i.test(v.name)) || vs.find(v => /pt[-_]BR/i.test(v.lang)) || vs[0] || null;
}
function unlockAudio() {
  if (A.unlocked) return; A.unlocked = true;
  try { A.audio.src = SILENT; const p = A.audio.play(); if (p) p.catch(() => {}); } catch (e) { /* */ }
  try { if ('speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } } catch (e) { /* */ }
}
const resolveAudio = u => { try { const b = S.audioBase || safeLS('md.audioBase') || ''; return new URL(u, b || location.href).href; } catch (e) { return u; } };
async function audioSrc(c) {
  if (!c.audioUrl || A.missing.has(c.id)) return null;
  try {
    let rec = await DB.get('audios', c.id);
    if (!rec) {
      if (!navigator.onLine) return null;
      const r = await fetch(resolveAudio(c.audioUrl));
      const ct = r.headers.get('content-type') || '';
      if (!r.ok || /text\/html|json/i.test(ct)) { A.missing.add(c.id); return null; }
      const blob = await r.blob();
      if (!blob.size) { A.missing.add(c.id); return null; }
      rec = { id: c.id, blob, at: Date.now() }; DB.put('audios', rec).catch(() => {});
    }
    if (A.url) URL.revokeObjectURL(A.url);
    A.url = URL.createObjectURL(rec.blob.type ? rec.blob : new Blob([rec.blob], { type: 'audio/mpeg' }));
    return A.url;
  } catch (e) { return null; }
}
function stopAudio() {
  A.tok++; A.playing = false; A.pct = 0;
  try { A.audio.pause(); } catch (e) { /* */ }
  try { if ('speechSynthesis' in window) speechSynthesis.cancel(); } catch (e) { /* */ }
  updateAudioUI();
}
async function startPlayback() {
  const c = A.cur; if (!c) return;
  stopAudio(); const tok = A.tok; A.playing = true; A.pct = 0; updateAudioUI(); mediaMeta(c);
  const src = await audioSrc(c);
  if (tok !== A.tok) return;
  if (src) {
    A.mode = 'file'; A.audio.src = src; A.audio.playbackRate = S.set.rate;
    try { await A.audio.play(); return; } catch (e) { if (tok !== A.tok) return; }
  }
  speakTTS(c, tok);
}
function speakTTS(c, tok) {
  if (!('speechSynthesis' in window)) { A.playing = false; updateAudioUI(); return toast('Este navegador não suporta voz sintetizada'); }
  A.mode = 'tts'; if (!A.voice) pickVoice();
  const text = c.roteiroAudio || `${c.titulo ? c.titulo + '. ' : ''}${c.frente} ${c.verso}`;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = A.voice ? A.voice.lang : 'pt-BR'; if (A.voice) u.voice = A.voice; u.rate = S.set.rate;
  u.onboundary = e => { A.pct = Math.min(1, e.charIndex / text.length); setBar(); };
  u.onend = () => { if (tok === A.tok) onEnded(); };
  u.onerror = e => { if (tok === A.tok && e.error !== 'interrupted' && e.error !== 'canceled') { A.playing = false; updateAudioUI(); } };
  A.utter = u; speechSynthesis.cancel(); speechSynthesis.speak(u);
}
function onEnded() {
  A.pct = 1; setBar();
  if (!A.single && S.set.auto && A.i < A.q.length - 1) { const t = A.tok; setTimeout(() => { if (t === A.tok) goTo(A.i + 1); }, 700); }
  else { A.playing = false; updateAudioUI(); }
}
function goTo(i) {
  if (!A.q.length) return;
  A.i = (i + A.q.length) % A.q.length; A.cur = A.q[A.i]; A.single = false; startPlayback();
}
function togglePlay() {
  unlockAudio();
  if (!A.cur) { buildQueue(); if (!A.cur) return toast('Sem cards no filtro atual'); }
  if (A.playing) {
    A.playing = false;
    if (A.mode === 'tts') { try { speechSynthesis.pause(); } catch (e) { /* */ } } else A.audio.pause();
    updateAudioUI(); return;
  }
  if (A.mode === 'file' && A.audio.src && A.audio.currentTime > 0 && !A.audio.ended) { A.playing = true; A.audio.play().catch(() => startPlayback()); updateAudioUI(); return; }
  if (A.mode === 'tts' && speechSynthesis.paused) { A.playing = true; speechSynthesis.resume(); updateAudioUI(); return; }
  startPlayback();
}
function speakOne(id) {
  const c = S.byId.get(id); if (!c) return;
  unlockAudio(); A.cur = c; A.single = true; startPlayback();
}
function setBar() { const b = $('#aBar'); if (b) b.style.width = Math.round(A.pct * 100) + '%'; }
function updateAudioUI() {
  const pb = $('#aPlay'); if (pb) { pb.innerHTML = A.playing ? ic.pause : ic.play; pb.setAttribute('aria-label', A.playing ? 'Pausar' : 'Tocar'); }
  const c = A.cur, t = $('#aTitle'); if (t && c) { t.textContent = c.titulo || c.frente; const q = $('#aFront'); if (q) q.textContent = c.frente; const e = $('#aEye'); if (e) e.textContent = `${c.grandeArea} › ${subOf(c)} › ${c.assunto}`; const s = $('#aScript'); if (s) s.textContent = c.roteiroAudio || c.verso; }
  const n = $('#aPos'); if (n) n.textContent = A.single ? 'Faixa avulsa' : `${A.i + 1} de ${A.q.length}`;
  document.querySelectorAll('[data-qi]').forEach(b => b.classList.toggle('cur', +b.dataset.qi === A.i && !A.single));
  setBar();
  const mp = $('#miniPlayer'), show = !!A.cur && (A.playing || A.pct > 0) && S.tab !== 'audio' && $('#sheet').hidden;
  mp.hidden = !show; document.body.classList.toggle('hasmini', show);
  if (show) mp.innerHTML = `<button class="mt" data-act="tab" data-tab="audio">${esc(A.cur.titulo || A.cur.frente)}</button><button class="pp" data-act="play" aria-label="${A.playing ? 'Pausar' : 'Tocar'}">${A.playing ? ic.pause : ic.play}</button>`;
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = A.playing ? 'playing' : 'paused';
}
function mediaMeta(c) {
  if (!('mediaSession' in navigator) || !window.MediaMetadata) return;
  try { navigator.mediaSession.metadata = new MediaMetadata({ title: c.titulo || c.frente, artist: c.assunto, album: 'MedDrops', artwork: [{ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }] }); } catch (e) { /* */ }
}
function setupMediaSession() {
  if (!('mediaSession' in navigator)) return;
  const h = (a, f) => { try { navigator.mediaSession.setActionHandler(a, f); } catch (e) { /* */ } };
  h('play', () => { if (!A.playing) togglePlay(); }); h('pause', () => { if (A.playing) togglePlay(); });
  h('nexttrack', () => goTo(A.i + 1)); h('previoustrack', () => goTo(A.i - 1));
}
A.audio.addEventListener('ended', () => { if (A.mode === 'file') onEnded(); });
A.audio.addEventListener('timeupdate', () => { if (A.mode === 'file' && A.audio.duration) { A.pct = A.audio.currentTime / A.audio.duration; setBar(); } });
A.audio.addEventListener('error', () => { if (A.mode === 'file' && A.playing && A.cur && !A.audio.src.startsWith('data:')) { const c = A.cur, tok = A.tok; A.missing.add(c.id); speakTTS(c, tok); } });

function vAudio() {
  if (!S.cards.length) return emptyLib();
  if (!A.q.length) buildQueue();
  const q = A.q;
  return `<section class="card">${filterBlock()}</section>
  ${q.length ? `<section class="card player"><div class="eyebrow" id="aEye"></div><h2 id="aTitle"></h2><p class="q" id="aFront"></p>
    <div class="bar" style="margin-top:18px"><i id="aBar"></i></div>
    <div class="ctl"><button data-act="prev" aria-label="Anterior">${ic.prev}</button><button class="main" id="aPlay" data-act="play" aria-label="Tocar">${ic.play}</button><button data-act="next" aria-label="Próximo">${ic.next}</button></div>
    <p class="mute small" style="text-align:center;margin-bottom:12px" id="aPos"></p>
    <div class="chips"><button class="chip" data-act="speed">${S.set.rate}×</button><button class="chip ${S.set.auto ? 'on' : ''}" data-act="auto">Auto-avançar</button><button class="chip ${S.showScript ? 'on' : ''}" data-act="script">Roteiro</button></div>
    ${S.showScript ? '<div class="script" id="aScript"></div>' : ''}</section>
    <div class="sec">Fila · ${q.length}</div>
    <section class="card" style="padding:0;overflow:hidden">${q.slice(0, 300).map((c, i) => `<button class="item" style="${i === 0 ? 'border-top:0' : ''}" data-act="qplay" data-qi="${i}"><span class="t">${esc(c.titulo || c.frente)}<small>${esc(c.assunto)}</small></span><span class="pill">${c.audioUrl ? 'mp3' : 'voz'}</span></button>`).join('')}${q.length > 300 ? `<p class="mute small" style="padding:12px 16px">+${q.length - 300} no filtro (use os filtros para refinar)</p>` : ''}</section>
    <p class="mute small" style="margin:12px 4px">No iPhone, o áudio em mp3 continua com a tela bloqueada. A voz sintetizada (cards sem mp3) pode pausar ao bloquear a tela.</p>`
    : '<div class="card empty"><b>Fila vazia</b>Nenhum card neste filtro.</div>'}`;
}

/* ---------- download de áudios ---------- */
async function downloadAudios() {
  const list = S.cards.filter(c => c.audioUrl), have = new Set(await DB.keys('audios')), todo = list.filter(c => !have.has(c.id));
  if (!navigator.onLine) return toast('Sem internet');
  if (!todo.length) return toast(list.length ? 'Todos os áudios já estão salvos' : 'Nenhum card tem audioUrl');
  S.dl = { done: 0, total: todo.length }; let fail = 0; render();
  for (const c of todo) {
    try {
      const r = await fetch(resolveAudio(c.audioUrl)); const ct = r.headers.get('content-type') || '';
      if (!r.ok || /text\/html|json/i.test(ct)) throw 0;
      const blob = await r.blob(); if (!blob.size) throw 0;
      await DB.put('audios', { id: c.id, blob, at: Date.now() });
    } catch (e) { fail++; A.missing.add(c.id); }
    S.dl.done++; if (S.tab === 'ajustes') render();
  }
  S.dl = null; render(); toast(fail ? `${todo.length - fail} baixados, ${fail} indisponíveis (usarão voz do aparelho)` : 'Áudios salvos para uso offline');
}

/* ---------- backup ---------- */
function download(name, text) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
async function restoreBackup(file) {
  try {
    const j = JSON.parse(await file.text());
    if (Array.isArray(j.progress)) { await DB.putMany('progress', j.progress); }
    if (Array.isArray(j.cards)) await upsertCards(j.cards, 'local', false);
    S.prog = new Map((await DB.all('progress')).map(p => [p.id, p]));
    toast('Backup restaurado'); render();
  } catch (e) { toast('Arquivo de backup inválido'); }
}

/* ---------- eventos ---------- */
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const a = el.dataset.act, id = el.dataset.id;
  switch (a) {
    case 'tab': setTab(el.dataset.tab); break;
    case 'fchip': { const key = ['', 'areas', 'subs', 'assuntos'][+el.dataset.lv], v = el.dataset.v, a = S.set[key], i = a.indexOf(v); if (i >= 0) a.splice(i, 1); else a.push(v); pruneSel(); saveSettings(); buildQueue(); render(); break; }
    case 'fclear': S.set.areas = []; S.set.subs = []; S.set.assuntos = []; saveSettings(); buildQueue(); render(); break;
    case 'sync': syncRepo(false); break;
    case 'import': $('#fileIn').click(); break;
    case 'restore': $('#bkIn').click(); break;
    case 'study': startStudy(false); break;
    case 'practice': startStudy(true); break;
    case 'listen': buildQueue(); A.i = 0; A.cur = A.q[0] || null; A.single = false; setTab('audio'); unlockAudio(); startPlayback(); break;
    case 'close': closeSheet(); break;
    case 'reveal': S.study.show = true; renderStudy(); break;
    case 'rate': rate(+el.dataset.r); break;
    case 'speak': speakOne(id); break;
    case 'detail': openDetail(id); break;
    case 'resetcard': S.prog.delete(id); await DB.del('progress', id); toast('Progresso do card zerado'); openDetail(id); break;
    case 'delcard': if (confirm('Excluir este card importado?')) { await DB.del('cards', id); await DB.del('progress', id); S.prog.delete(id); await reloadCards(); closeSheet(); } break;
    case 'play': togglePlay(); break;
    case 'next': unlockAudio(); goTo(A.i + 1); break;
    case 'prev': unlockAudio(); goTo(A.i - 1); break;
    case 'qplay': unlockAudio(); goTo(+el.dataset.qi); break;
    case 'speed': { const i = RATES.indexOf(S.set.rate); S.set.rate = RATES[(i + 1) % RATES.length]; saveSettings(); A.audio.playbackRate = S.set.rate; el.textContent = S.set.rate + '×'; if (A.playing && A.mode === 'tts') startPlayback(); break; }
    case 'auto': S.set.auto = !S.set.auto; saveSettings(); el.classList.toggle('on', S.set.auto); break;
    case 'script': S.showScript = !S.showScript; render(); break;
    case 'dlaudio': downloadAudios(); break;
    case 'clraudio': if (confirm('Apagar todos os áudios salvos?')) { await DB.clear('audios'); A.missing.clear(); toast('Áudios apagados'); audioStats(); } break;
    case 'backup': download(`meddrops-backup-${todayKey()}.json`, JSON.stringify({ versao: 1, progress: await DB.all('progress'), cards: S.cards.filter(c => c.source === 'local') })); break;
    case 'resetprog': if (confirm('Zerar o progresso de todos os cards?')) { await DB.clear('progress'); S.prog.clear(); S.stats = { d: todayKey(), n: 0, novos: 0 }; await DB.put('meta', { k: 'stats', v: S.stats }); toast('Progresso zerado'); render(); } break;
    case 'wipe': if (confirm('Apagar TODOS os cards, progresso e áudios deste aparelho?')) { for (const s of ['cards', 'progress', 'audios', 'meta']) await DB.clear(s); S.prog.clear(); S.stats = { d: todayKey(), n: 0, novos: 0 }; stopAudio(); A.cur = null; A.q = []; await reloadCards(); toast('Tudo apagado'); render(); } break;
  }
});
document.addEventListener('change', e => {
  const k = e.target.dataset.change; if (!k) return;
  if (k === 'npd') { S.set.newPerDay = Math.max(0, Math.min(500, parseInt(e.target.value, 10) || 0)); }
  else if (k === 'mu') { S.set.manifestUrl = e.target.value.trim() || DEF.manifestUrl; }
  saveSettings();
  render();
});
document.addEventListener('input', e => { if (e.target.dataset.input === 'q') { S.q = e.target.value; render(); } });
$('#fileIn').addEventListener('change', async e => { const f = [...e.target.files]; e.target.value = ''; if (f.length) await importFiles(f); });
$('#bkIn').addEventListener('change', async e => { const f = e.target.files[0]; e.target.value = ''; if (f) await restoreBackup(f); });
const netUI = () => { $('#net').classList.toggle('off', !navigator.onLine); $('#net').title = navigator.onLine ? 'online' : 'offline'; };
window.addEventListener('online', () => { netUI(); syncRepo(true); });
window.addEventListener('offline', netUI);
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }

/* ---------- inicialização ---------- */
(async function init() {
  loadSettings(); netUI(); setupMediaSession();
  try {
    await DB.open();
    S.prog = new Map((await DB.all('progress')).map(p => [p.id, p]));
    await loadStats(); await reloadCards();
  } catch (e) {
    $('#view').innerHTML = '<div class="card empty"><b>Armazenamento indisponível</b>Este navegador bloqueou o IndexedDB (modo privado?). Abra o app em uma aba normal do Safari.</div>'; return;
  }
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
  if (navigator.onLine) syncRepo(!!S.cards.length);
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
})();
