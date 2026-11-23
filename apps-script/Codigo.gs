/* MedEstudos 5.2 (Drops + voz natural) — Codigo.gs — cole este arquivo inteiro. Gerado em 23/11/2026 12:28. */

/* ======================================================================== Base ======================================================================== */
/**
 * MedEstudos 5 (Drops) — Base.gs
 * Utilidades compartilhadas: abas, configurações, datas, números, leitura/gravação em lote.
 * Mantém só as 9 abas atuais + Flashcards.
 */

var TURBO = {
  VERSAO: '5.2-voz',
  PLANILHA_ID: '1DkxI51lciHJCKPrsg2CWpSDklEqcCanjxfFIKUO88Nw',
  ABAS: {
    CONFIG: 'Configurações', ASSUNTOS: 'Assuntos', SIMULADOS: 'Simulados', ERROS_SIM: 'Erros em simulados',
    DESEMP_SIM: 'Desempenho em simulados', REGISTRO: 'Registro de estudos', AGENDA: 'Agenda semanal',
    INTERNATO: 'Internato_Agenda', DROPS: 'Drops', FLASH: 'Flashcards'
  },
  // Única aba que o app pode criar sozinho. As outras 9 já existem; abas excluídas NUNCA são recriadas.
  CABECALHOS: {
    'Flashcards': ['ID', 'Assunto', 'Grande Área', 'Origem', 'Frente', 'Verso', 'Verso Áudio', 'Fontes', 'Status',
      'Intervalo (dias)', 'Facilidade', 'Última Revisão', 'Próxima Revisão', 'Acertos', 'Erros', 'Criado em']
  },
  COLS_DROPS: ['Leitura (cache)', 'Áudio (cache)', 'Doc lido em', 'Facilidade'],
  COLS_ASSUNTOS: ['Último contato', 'Contatos'],
  PILARES: ['Fisiopatologia/Anatomia', 'Clínica/Diferencial', 'Propedêutica/Exames', 'Farmacologia/Tratamento', 'Algoritmo/Conduta'],
  BANCAS_PADRAO: { 'ENAMED': 0.50, 'ENARE': 0.20, 'REVALIDA': 0.20, 'SUS-BA': 0.05, 'FUVEST': 0.05 },
  CONFIG_NOVAS: [
    ['Qtd Áreas Foco Drops', '2', 'Quantas grandes áreas (as piores nos simulados) recebem Drops na semana'],
    ['Drops por Área na Semana', '4', 'Drops por área foco; a pior área recebe +1'],
    ['Pausa de raciocínio (s)', '8', 'Pausa do modo áudio entre a pergunta e a resposta (5 a 15)'],
    ['Agenda de estudos', 'primary', 'Agenda Google lida pelo app (e-mail, nome ou ID)']
  ],
  // linhas da aba Configurações do app antigo, marcadas como obsoletas pelo setup()
  CONFIG_MORTAS: ['Carreira (estado)', 'Meta de capítulos por semana', 'Meta de pacientes por semana', 'Pacientes dia bom', 'Pacientes dia medio',
    'Pacientes dia ruim', 'Estoque mínimo de pacientes', 'Bônus gargalo zerado', 'Multa cota ignorada', 'Minutos do bloco rápido',
    'Minutos por card de erro', 'Limite de retornos por dia', 'Capacidade dia bom', 'Capacidade dia medio', 'Capacidade dia ruim',
    'Limite de cards por dia', 'Fase do ciclo', 'Itens por dia (base)', 'Teto de revisão diária', 'Cooldown domínio baixo (dias)',
    'Cooldown domínio médio (dias)', 'Cooldown domínio alto (dias)', 'Horizonte de provas (dias)', 'Temas de prova por dia', 'Multiplicador apresentação']
};

/* ---------------- Planilha ---------------- */

function T_ss_() {
  if (T_ss_._c) return T_ss_._c;
  var ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { }
  return (T_ss_._c = ss || SpreadsheetApp.openById(TURBO.PLANILHA_ID));
}

/** Abre a aba; se não existir e houver cabeçalho conhecido, cria. */
function T_tab_(nome, criar) {
  var ss = T_ss_();
  var sh = ss.getSheetByName(nome);
  if (!sh && criar !== false) {
    var cab = TURBO.CABECALHOS[nome];
    if (!cab) return null;
    sh = ss.insertSheet(nome);
    sh.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

/** Acrescenta colunas que faltam ao final do cabeçalho (nunca reordena). */
function T_garantirColunas_(nome, colunas) {
  var sh = T_tab_(nome, false);
  if (!sh) return;
  var lastC = Math.max(sh.getLastColumn(), 1);
  var cab = sh.getRange(1, 1, 1, lastC).getValues()[0].map(String);
  var existentes = {};
  cab.forEach(function (h) { existentes[T_norm_(h)] = true; });
  var faltam = colunas.filter(function (c) { return !existentes[T_norm_(c)]; });
  if (!faltam.length) return;
  var ultimo = 0;
  cab.forEach(function (h, i) { if (h !== '') ultimo = i + 1; });
  var inicio = ultimo + 1;
  sh.getRange(1, inicio, 1, faltam.length).setValues([faltam]).setFontWeight('bold');
}

/**
 * Carrega a aba inteira em memória (1 chamada) e devolve uma "tabela"
 * com get/set/add. Gravação só em T_gravar_ (lote).
 */
function T_abrir_(nome, criar) {
  var sh = T_tab_(nome, criar);
  if (!sh) return null;
  var lastR = sh.getLastRow();
  var lastC = Math.max(sh.getLastColumn(), 1);
  var vals = lastR > 0 ? sh.getRange(1, 1, lastR, lastC).getValues() : [new Array(lastC).fill('')];
  var header = vals[0].map(String);
  var idx = {};
  header.forEach(function (h, i) { if (h !== '' && idx[T_norm_(h)] === undefined) idx[T_norm_(h)] = i; });
  var t = {
    nome: nome, sh: sh, header: header, idx: idx,
    rows: vals.slice(1), sujas: {}, novas: [], larg: lastC
  };
  t.c = function (nm) { var i = idx[T_norm_(nm)]; return i === undefined ? -1 : i; };
  t.get = function (r, nm) { var i = t.c(nm); return i < 0 ? '' : r[i]; };
  t.set = function (rowIndex, nm, v) {
    var i = t.c(nm); if (i < 0) return;
    var r = t.rows[rowIndex];
    if (r[i] === v) return;
    r[i] = v; t.sujas[rowIndex] = true;
  };
  t.add = function (obj) {
    var linha = new Array(t.larg).fill('');
    Object.keys(obj).forEach(function (k) { var i = t.c(k); if (i >= 0) linha[i] = obj[k]; });
    t.rows.push(linha); t.novas.push(t.rows.length - 1);
    return t.rows.length - 1;
  };
  t.achar = function (nm, valor) {
    var i = t.c(nm); if (i < 0) return -1;
    var alvo = T_norm_(valor);
    for (var k = 0; k < t.rows.length; k++) if (T_norm_(t.rows[k][i]) === alvo) return k;
    return -1;
  };
  return t;
}

/** Grava linhas alteradas e novas com o menor número de chamadas. */
function T_gravar_(t) {
  if (!t) return;
  var novasSet = {};
  t.novas.forEach(function (i) { novasSet[i] = true; });
  var sujas = Object.keys(t.sujas).map(Number).filter(function (i) { return !novasSet[i]; }).sort(function (a, b) { return a - b; });
  if (sujas.length > 15) {
    var ini = sujas[0], fim = sujas[sujas.length - 1];
    t.sh.getRange(ini + 2, 1, fim - ini + 1, t.larg).setValues(t.rows.slice(ini, fim + 1));
  } else {
    sujas.forEach(function (i) { t.sh.getRange(i + 2, 1, 1, t.larg).setValues([t.rows[i]]); });
  }
  if (t.novas.length) {
    var primeira = t.novas[0];
    var bloco = t.rows.slice(primeira);
    t.sh.getRange(primeira + 2, 1, bloco.length, t.larg).setValues(bloco);
  }
  t.sujas = {}; t.novas = [];
}

/* ---------------- Configurações ---------------- */

var T__cfgCache = null;

function T_cfg_() {
  if (T__cfgCache) return T__cfgCache;
  var sh = T_tab_(TURBO.ABAS.CONFIG, false);
  var map = {};
  if (sh && sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function (r) {
      if (r[0] !== '') map[T_norm_(r[0])] = r[1];
    });
  }
  T__cfgCache = map;
  return map;
}

function T_cfgNum_(nome, padrao) {
  var v = T_num_(T_cfg_()[T_norm_(nome)]);
  return (v === null || isNaN(v)) ? padrao : v;
}

function T_cfgTxt_(nome, padrao) {
  var v = T_cfg_()[T_norm_(nome)];
  return (v === undefined || v === null || String(v).trim() === '') ? padrao : String(v).trim();
}

function T_cfgSet_(nome, valor, descricao) {
  var sh = T_tab_(TURBO.ABAS.CONFIG, false);
  var n = sh.getLastRow();
  var col = n > 1 ? sh.getRange(2, 1, n - 1, 1).getValues() : [];
  for (var i = 0; i < col.length; i++) {
    if (T_norm_(col[i][0]) === T_norm_(nome)) {
      sh.getRange(i + 2, 2).setValue(valor);
      T__cfgCache = null;
      return;
    }
  }
  sh.appendRow([nome, valor, descricao || '']);
  T__cfgCache = null;
}

function T_pesosBancas_() {
  var j = T_json_(T_cfgTxt_('Pesos das bancas', ''), null);
  return j || TURBO.BANCAS_PADRAO;
}

/* ---------------- Datas e números ---------------- */

function T_tz_() { return Session.getScriptTimeZone() || 'America/Bahia'; }

function T_hoje_() { return Utilities.formatDate(new Date(), T_tz_(), 'yyyy-MM-dd'); }

function T_iso_(d) { return d ? Utilities.formatDate(d, T_tz_(), 'yyyy-MM-dd') : ''; }

function T_br_(d, comHora) {
  if (!d) return '';
  return Utilities.formatDate(d, T_tz_(), comHora ? 'dd/MM/yyyy HH:mm:ss' : 'dd/MM/yyyy');
}

/** Aceita Date, 'dd/MM/yyyy[ HH:mm[:ss]]', 'yyyy-MM-dd' e ISO. Devolve Date ou null. */
function T_data_(v) {
  if (v === null || v === undefined || v === '') return null;
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v.getTime()) ? null : v;
  var s = String(v).trim();
  var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0);
  var d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** Data → 'yyyy-MM-dd' (ou '' se vazio). */
function T_dia_(v) { var d = T_data_(v); return d ? T_iso_(d) : ''; }

function T_somaDias_(isoDia, n) {
  var d = T_data_(isoDia); d.setDate(d.getDate() + n);
  return T_iso_(d);
}

function T_diffDias_(isoA, isoB) {
  return Math.round((T_data_(isoA).getTime() - T_data_(isoB).getTime()) / 86400000);
}

/** Data de revisão no padrão da aba Revisões (06:00). */
function T_dataRevisao_(isoDia) {
  var d = T_data_(isoDia); d.setHours(6, 0, 0, 0); return d;
}

function T_num_(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  var s = String(v).replace('%', '').trim();
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  var n = parseFloat(s);
  return isNaN(n) ? null : n;
}

/* ---------------- Texto, IDs, JSON ---------------- */

function T_norm_(s) {
  return String(s === null || s === undefined ? '' : s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

function T_slug_(s) {
  return T_norm_(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function T_id_(prefixo) {
  var agora = Utilities.formatDate(new Date(), T_tz_(), 'yyyyMMdd-HHmmss');
  var rnd = Math.random().toString(16).slice(2, 8);
  return prefixo + '-' + agora + '-' + rnd;
}

function T_json_(s, padrao) {
  if (s === null || s === undefined || s === '') return padrao;
  if (typeof s === 'object') return s;
  try { return JSON.parse(String(s)); } catch (e) { return padrao; }
}

/** Similaridade por palavras (0–1), ignorando palavras curtas. */
function T_sim_(a, b) {
  var pa = T_norm_(a).split(/[^a-z0-9]+/).filter(function (w) { return w.length > 2; });
  var pb = T_norm_(b).split(/[^a-z0-9]+/).filter(function (w) { return w.length > 2; });
  if (!pa.length || !pb.length) return 0;
  var sb = {}; pb.forEach(function (w) { sb[w] = true; });
  var inter = pa.filter(function (w) { return sb[w]; }).length;
  return inter / Math.min(pa.length, pb.length);
}

/** Encontra o nome do catálogo mais parecido (exato → contém → palavras ≥ 0,6). */
function T_casarAssunto_(nome, catalogoNomes) {
  var n = T_norm_(nome);
  if (!n) return null;
  var i;
  for (i = 0; i < catalogoNomes.length; i++) if (T_norm_(catalogoNomes[i]) === n) return catalogoNomes[i];
  for (i = 0; i < catalogoNomes.length; i++) {
    var c = T_norm_(catalogoNomes[i]);
    if (c.indexOf(n) >= 0 || n.indexOf(c) >= 0) return catalogoNomes[i];
  }
  var melhor = null, nota = 0.6;
  catalogoNomes.forEach(function (c) { var s = T_sim_(nome, c); if (s > nota) { nota = s; melhor = c; } });
  return melhor;
}

function T_pilar_(p) {
  var n = T_norm_(p);
  if (!n) return '';
  for (var i = 0; i < TURBO.PILARES.length; i++) {
    var partes = T_norm_(TURBO.PILARES[i]).split('/');
    if (T_norm_(TURBO.PILARES[i]) === n || partes.some(function (x) { return n.indexOf(x) >= 0; })) return TURBO.PILARES[i];
  }
  return p;
}

/* ---------------- Setup único ---------------- */

/** Rode UMA vez pelo editor: cria abas novas, colunas extras e linhas de configuração. */

/* ======================================================================== Api ======================================================================== */
/**
 * MedEstudos 5 (Drops) — Api.gs
 * Duas portas de entrada para o mesmo roteador:
 *   1) PWA hospedado (GitHub Pages): fetch GET/POST em /exec com ?action=… e token.
 *   2) App aberto pela própria URL /exec (HtmlService): google.script.run.apiRun(json).
 */

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (!p.action) {
    return HtmlService.createHtmlOutputFromFile('index')
      .setTitle('MedEstudos')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  return T_saida_(T_rotear_(p.action, p, true));
}

function doPost(e) {
  var corpo = {};
  try { corpo = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) {
    return T_saida_({ ok: false, erro: 'JSON inválido' });
  }
  var params = (e && e.parameter) || {};
  if (!corpo.action) corpo.action = params.action;
  if (!corpo.token) corpo.token = params.token;
  return T_saida_(T_rotear_(corpo.action, corpo, true));
}

/** Chamado pelo index.html quando aberto dentro do Apps Script (sem token: já roda como você). */
function apiRun(json) {
  var d = typeof json === 'string' ? JSON.parse(json) : json;
  return JSON.stringify(T_rotear_(d.action, d, false));
}

function T_rotear_(acao, dados, exigeToken) {
  var t0 = Date.now();
  try {
    if (exigeToken && !T_tokenOk_(dados.token)) return { ok: false, erro: 'token inválido' };
    var r;
    switch (acao) {
      case 'ping': r = { ok: true, versao: TURBO.VERSAO, hoje: T_hoje_() }; break;
      case 'bootstrap': r = T_bootstrap_(String(dados.fresh || '') === '1'); break;
      case 'syncOutbox': r = T_syncOutbox_(dados); break;
      case 'imagem': r = T_imagem_(dados.id); break;
      case 'audio': r = T_audio_(dados.id); break;
      case 'parseMapeamento': r = T_parseMapeamento_(dados.texto || ''); break;
      default: r = { ok: false, erro: 'ação desconhecida: ' + acao };
    }
    r.ms = Date.now() - t0;
    return r;
  } catch (err) {
    return { ok: false, erro: String(err && err.message || err), pilha: String(err && err.stack || '').slice(0, 600) };
  }
}

function T_tokenOk_(tok) {
  var esperado = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
  return !esperado || String(tok || '') === esperado;
}

function T_saida_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------------- Cache do bootstrap (pedaços de 90 KB) ---------------- */

function T_cachePut_(chave, texto, seg) {
  var c = CacheService.getScriptCache(), pedacos = {}, n = 0, TAM = 90000;
  for (var i = 0; i < texto.length; i += TAM) pedacos[chave + '_' + (n++)] = texto.slice(i, i + TAM);
  if (n > 90) return;
  pedacos[chave + '_n'] = String(n);
  c.putAll(pedacos, seg || 600);
}
function T_cacheGet_(chave) {
  var c = CacheService.getScriptCache(), n = +(c.get(chave + '_n') || 0);
  if (!n) return null;
  var nomes = []; for (var i = 0; i < n; i++) nomes.push(chave + '_' + i);
  var got = c.getAll(nomes), s = '';
  for (var j = 0; j < n; j++) { if (got[nomes[j]] == null) return null; s += got[nomes[j]]; }
  return s;
}
function T_cacheLimpar_() { CacheService.getScriptCache().remove('T_boot_' + T_hoje_() + '_n'); }

/* ---------------- Bootstrap: tudo que o app precisa offline ---------------- */

function T_bootstrap_(fresco) {
  var chave = 'T_boot_' + T_hoje_();
  if (!fresco) {
    var emCache = T_cacheGet_(chave);
    if (emCache) { var o = JSON.parse(emCache); o.cache = true; return o; }
  }
  var catalogo = T_catalogo_();
  var out = {
    ok: true, versao: TURBO.VERSAO, geradoEm: new Date().toISOString(), hoje: T_hoje_(),
    config: T_configPublica_(),
    pilares: TURBO.PILARES,
    prompts: { mapeamentoSimulado: T_promptMapeamentoSimulado_() },
    catalogo: catalogo,
    semana: T_semana_(catalogo),
    revisao: T_filaRevisao_(),
    cidade: T_cidade_(catalogo),
    simulados: T_simuladosDados_()
  };
  T_cachePut_(chave, JSON.stringify(out), 600);
  return out;
}

function T_configPublica_() {
  var sh = T_tab_(TURBO.ABAS.CONFIG, false), out = {};
  if (!sh || sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function (r) {
    var k = String(r[0]), n = T_norm_(k);
    if (!k || n.indexOf('chave') >= 0 || n.indexOf('api') >= 0 || n.indexOf('token') >= 0 || n.indexOf('(estado)') >= 0 || n.indexOf('obsoleto') >= 0) return;
    out[k] = r[1];
  });
  return out;
}

function T_catalogo_() {
  var t = T_abrir_(TURBO.ABAS.ASSUNTOS, false), out = [];
  t.rows.forEach(function (r) {
    var nome = String(t.get(r, 'Nome do assunto') || '').trim();
    if (!nome) return;
    out.push({
      area: String(t.get(r, 'Grande área') || '').trim(), subarea: t.get(r, 'Subárea'), nome: nome,
      status: t.get(r, 'Status'), recorrencia: T_num_(t.get(r, 'Recorrência')),
      feitas: T_num_(t.get(r, 'Questões feitas')) || 0, certas: T_num_(t.get(r, 'Questões certas')) || 0,
      contato: T_dia_(t.get(r, 'Último contato')), contatos: T_num_(t.get(r, 'Contatos')) || 0
    });
  });
  return out;
}

/* ---------------- Outbox: eventos gravados offline ---------------- */

function T_ctx_() {
  var ctx = { tabs: {}, hoje: T_hoje_() };
  ctx.tab = function (nome) {
    if (!ctx.tabs[nome]) ctx.tabs[nome] = T_abrir_(nome, nome === TURBO.ABAS.FLASH);
    if (!ctx.tabs[nome]) throw new Error('aba "' + nome + '" não existe');
    return ctx.tabs[nome];
  };
  return ctx;
}

function T_handlers_() {
  return {
    checkin: T_evCheckin_,
    avaliar: T_evAvaliar_,
    ouvido: T_evOuvido_,
    lancarSimulado: T_evLancarSimulado_,
    agendarSimulado: T_evAgendarSimulado_,
    definirConfig: T_evDefinirConfig_
  };
}

function T_syncOutbox_(dados) {
  var eventos = (dados.eventos || []).slice().sort(function (a, b) { return String(a.ts || '').localeCompare(String(b.ts || '')); });
  var resultados = [], cache = CacheService.getScriptCache();
  var lock = LockService.getScriptLock(); lock.waitLock(25000);
  try {
    var ctx = T_ctx_(), H = T_handlers_();
    eventos.forEach(function (ev) {
      var id = ev.event_id;
      if (!id) { resultados.push({ event_id: null, status: 'erro', detalhe: 'sem event_id' }); return; }
      if (cache.get('ev_' + id)) { resultados.push({ event_id: id, status: 'duplicado' }); return; }
      var h = H[ev.tipo], status = 'ok', detalhe = '';
      if (!h) { status = 'erro'; detalhe = 'tipo desconhecido: ' + ev.tipo; }
      else { try { detalhe = h(ctx, ev) || ''; } catch (err) { status = 'erro'; detalhe = String(err && err.message || err); } }
      if (status === 'ok') cache.put('ev_' + id, '1', 21600);
      resultados.push({ event_id: id, status: status, detalhe: detalhe });
    });
    Object.keys(ctx.tabs).forEach(function (n) { T_gravar_(ctx.tabs[n]); });
  } finally { lock.releaseLock(); }
  T_cacheLimpar_();
  return { ok: true, processados: resultados.length, resultados: resultados };
}

function T_evDefinirConfig_(ctx, ev) {
  if (!ev.nome) throw new Error('sem nome');
  T_cfgSet_(ev.nome, ev.valor, ev.descricao || '');
  return 'ok';
}

/** Marca "contato" com um assunto (acende a luz na Cidade). */
function T_contato_(ctx, assunto, quando) {
  var a = ctx.tab(TURBO.ABAS.ASSUNTOS);
  var nomes = a.rows.map(function (r) { return String(a.get(r, 'Nome do assunto') || ''); });
  var casado = T_casarAssunto_(assunto, nomes.filter(String));
  if (!casado) return false;
  var i = a.achar('Nome do assunto', casado);
  if (i < 0) return false;
  a.set(i, 'Último contato', T_br_(T_data_(quando) || new Date()));
  a.set(i, 'Contatos', (T_num_(a.get(a.rows[i], 'Contatos')) || 0) + 1);
  return i;
}

/* ======================================================================== Agenda ======================================================================== */
/**
 * MedEstudos 5 — Agenda.gs
 * Lê a semana no Google Calendar.
 *  • Evento com "Extensivo" no título (ex.: "Extensivo Semana 3"): cada linha da descrição é um assunto.
 *    Se o título ou a descrição tiver "revis", a semana é SEMANA DE REVISÃO do Extensivo.
 *  • Demais eventos: dão o "peso" do dia (internato, plantão, provas) pela duração e pela cor.
 *  • Internato_Agenda: temas obrigatórios com Data_Alvo entram no dia mais leve antes do prazo.
 */

var T_CORES = { '11': 'vermelho', '4': 'vermelho', '3': 'roxo', '1': 'roxo', '6': 'laranja', '5': 'amarelo', '10': 'verde', '2': 'verde', '7': 'azul', '9': 'azul' };

function T_calendario_() {
  var ref = T_cfgTxt_('Agenda de estudos', 'primary'), cal = null;
  if (ref === 'primary') return CalendarApp.getDefaultCalendar();
  try { if (ref.indexOf('@') >= 0) cal = CalendarApp.getCalendarById(ref); } catch (e) { }
  if (!cal) { var l = CalendarApp.getCalendarsByName(ref); cal = l && l.length ? l[0] : null; }
  return cal || CalendarApp.getDefaultCalendar();
}

/** Segunda-feira (ISO) da semana que contém isoDia. */
function T_segunda_(isoDia) {
  var d = T_data_(isoDia), dow = d.getDay();
  return T_somaDias_(isoDia, dow === 0 ? -6 : 1 - dow);
}

function T_textoPlano_(html) {
  return String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n').replace(/<li[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

/** Assuntos listados na descrição de um evento do Extensivo. */
function T_assuntosDaDescricao_(desc) {
  return T_textoPlano_(desc).split(/\n|;/).map(function (l) {
    return l.replace(/^\s*([-•*▪◦·]|\d+[.)-])\s*/, '').replace(/\s+/g, ' ').trim();
  }).filter(function (l) {
    return l.length > 2 && !/^(semana|extensivo|assuntos?|temas?|aulas?)\b.*:?\s*$/i.test(l) && !/^https?:/i.test(l);
  });
}

/** Lê os eventos de [iniIso, fimIso] (inclusive) e devolve dias com peso, extensivo e eventos. */
function T_lerSemana_(iniIso, fimIso) {
  var cal = T_calendario_();
  var ini = T_data_(iniIso); ini.setHours(0, 0, 0, 0);
  var fim = T_data_(fimIso); fim.setHours(23, 59, 59, 0);
  var dias = {}, revisao = false, semanaN = '';
  for (var k = 0; k <= T_diffDias_(fimIso, iniIso); k++) {
    var iso = T_somaDias_(iniIso, k);
    dias[iso] = { iso: iso, peso: 0, folga: false, eventos: [], extensivo: [] };
  }
  cal.getEvents(ini, fim).forEach(function (e) {
    var titulo = e.getTitle() || '', iso = T_iso_(e.getStartTime());
    if (!dias[iso]) return;
    var cor = T_CORES[String(e.getColor() || '')] || '';
    var desc = e.getDescription() || '';
    if (/extensivo/i.test(titulo)) {
      var m = titulo.match(/semana\s*(\d+)/i); if (m) semanaN = m[1];
      if (/revis/i.test(titulo) || /revis[aã]o\s+do\s+extensivo|semana\s+de\s+revis/i.test(desc)) revisao = true;
      T_assuntosDaDescricao_(desc).forEach(function (a) {
        dias[iso].extensivo.push({ assunto: a, evento: titulo, hora: e.isAllDayEvent() ? '' : Utilities.formatDate(e.getStartTime(), T_tz_(), 'HH:mm') });
      });
      dias[iso].peso += 1;
      return;
    }
    var horas = e.isAllDayEvent() ? 4 : Math.max(0.5, (e.getEndTime() - e.getStartTime()) / 3600000);
    if (cor === 'verde') dias[iso].folga = true;
    var peso = horas * (cor === 'vermelho' ? 1.5 : cor === 'amarelo' ? 0.5 : 1) + (cor === 'vermelho' ? 2 : 0);
    dias[iso].peso += peso;
    dias[iso].eventos.push({ titulo: titulo, cor: cor, hora: e.isAllDayEvent() ? 'dia todo' : Utilities.formatDate(e.getStartTime(), T_tz_(), 'HH:mm') });
  });
  return { dias: Object.keys(dias).sort().map(function (k) { return dias[k]; }), revisao: revisao, semanaN: semanaN };
}

/** Semana atual para a tela Agenda (+ check-ins já feitos + obrigatórios do internato). */
function T_semana_(catalogo) {
  var hoje = T_hoje_(), seg = T_segunda_(hoje);
  if (T_data_(hoje).getDay() === 0) seg = T_somaDias_(seg, 7); // domingo: mostra a semana que começa amanhã
  var dom = T_somaDias_(seg, 6), sem;
  try { sem = T_lerSemana_(seg, dom); } catch (e) { return { erro: 'Agenda: ' + e.message, dias: [] }; }
  var nomes = catalogo.map(function (c) { return c.nome; });
  var areaDe = {}; catalogo.forEach(function (c) { areaDe[c.nome] = c.area; });

  // check-ins já feitos nesta semana
  var feitos = {};
  var reg = T_abrir_(TURBO.ABAS.REGISTRO, false);
  reg.rows.forEach(function (r) {
    if (T_norm_(reg.get(r, 'Tipo')) !== 'check-in') return;
    var d = T_dia_(reg.get(r, 'Data'));
    if (d < seg || d > dom) return;
    feitos[T_norm_(reg.get(r, 'Assunto'))] = { estudou: T_norm_(reg.get(r, 'Status final')) !== 'nao estudado', feitas: T_num_(reg.get(r, 'Questões feitas')) || 0, certas: T_num_(reg.get(r, 'Questões certas')) || 0, data: d };
  });
  sem.dias.forEach(function (d) {
    d.extensivo.forEach(function (x) {
      x.catalogo = T_casarAssunto_(x.assunto, nomes) || '';
      x.area = areaDe[x.catalogo] || '';
      x.checkin = feitos[T_norm_(x.catalogo || x.assunto)] || feitos[T_norm_(x.assunto)] || null;
    });
    d.internato = [];
  });

  // obrigatórios do internato com prazo: vão para o dia mais leve antes do prazo
  var ia = T_abrir_(TURBO.ABAS.INTERNATO, false), temas = {};
  if (ia) ia.rows.forEach(function (r) {
    var cat = T_norm_(ia.get(r, 'Categoria')), st = T_norm_(ia.get(r, 'Status'));
    var alvo = T_dia_(ia.get(r, 'Data_Alvo')), tema = String(ia.get(r, 'Tema') || '').trim();
    if (!tema || !alvo || cat === 'ja_cobrado' || (st && st !== 'ativo') || alvo < hoje) return;
    var cands = sem.dias.filter(function (d) { return d.iso >= seg && d.iso >= hoje && d.iso <= alvo && !d.folga; });
    if (!cands.length) return;
    cands.sort(function (a, b) { return (a.peso + a.internato.length) - (b.peso + b.internato.length); });
    var tc = T_casarAssunto_(tema, nomes) || tema;
    if (temas[T_norm_(tc)]) { temas[T_norm_(tc)].topicos++; return; } // um item por tema (provas trazem vários subtópicos)
    temas[T_norm_(tc)] = { topicos: 1 };
    cands[0].internato.push({ assunto: tc, prazo: alvo, origem: ia.get(r, 'Evento_Origem'), checkin: feitos[T_norm_(tc)] || null, info: temas[T_norm_(tc)] });
  });
  return { segunda: seg, revisao: sem.revisao, semanaN: sem.semanaN, dias: sem.dias };
}

/* ---------------- Check-in rápido (Estudei / Questões / Acertos) ---------------- */

function T_evCheckin_(ctx, ev) {
  if (!ev.assunto) throw new Error('sem assunto');
  var feitas = Math.max(0, +ev.feitas || 0), certas = Math.max(0, Math.min(feitas, +ev.certas || 0));
  var estudou = ev.estudou !== false && ev.estudou !== 'nao';
  ctx.tab(TURBO.ABAS.REGISTRO).add({
    'ID do registro': T_id_('CHK'), 'Data': T_data_(ev.data) || new Date(), 'Assunto': ev.assunto,
    'Tipo de atividade': ev.origem || 'Extensivo', 'Questões feitas': feitas, 'Questões certas': certas,
    'Status final': estudou ? 'Concluído' : 'Não estudado', 'Tipo': 'Check-in'
  });
  if (!estudou && !feitas) return 'registrado (não estudado)';
  var i = T_contato_(ctx, ev.assunto, ev.data);
  if (i === false) return 'registrado (assunto fora do catálogo)';
  var a = ctx.tab(TURBO.ABAS.ASSUNTOS), r = a.rows[i];
  var f = (T_num_(a.get(r, 'Questões feitas')) || 0) + feitas, c = (T_num_(a.get(r, 'Questões certas')) || 0) + certas;
  a.set(i, 'Questões feitas', f); a.set(i, 'Questões certas', c);
  a.set(i, '% de acertos', f ? Math.round(10000 * c / f) / 10000 : '');
  if (estudou && !String(a.get(r, 'Status') || '').trim()) a.set(i, 'Status', 'Estudado');
  return 'ok';
}

/* ======================================================================== Revisao ======================================================================== */
/**
 * MedEstudos 5 — Revisao.gs
 * Drops (Docs + infográfico) e Flashcards (na própria aba) com repetição espaçada.
 *   Errei  → volta amanhã (1 dia), facilidade −0,20
 *   Difícil→ 3 dias (ou intervalo × 1,2), facilidade −0,15
 *   Fácil  → 7 dias na 1ª vez; depois intervalo × facilidade (padrão 2,1: 7 → 15 → 31 → 65…)
 * Ouvir no carro conta como "contato" (acende a luz na Cidade) mas não mexe no intervalo:
 * quem move a revisão é a avaliação ativa na tela.
 */

var T_FACIL_PADRAO = 2.1;

function T_proximo_(nota, intervalo, facilidade) {
  var i = +intervalo || 0, f = +facilidade || T_FACIL_PADRAO;
  if (nota === 'errei') { i = 1; f = Math.max(1.3, f - 0.2); }
  else if (nota === 'dificil') { i = i < 3 ? 3 : Math.round(i * 1.2); f = Math.max(1.3, f - 0.15); }
  else { i = i < 7 ? 7 : Math.round(i * f); }
  return { intervalo: Math.min(i, 180), facilidade: Math.round(f * 100) / 100 };
}

function T_idDoLink_(link) {
  var m = String(link || '').match(/\/d\/([\w-]{20,})/) || String(link || '').match(/[?&]id=([\w-]{20,})/);
  return m ? m[1] : '';
}

/* ---------------- Fila do bootstrap ---------------- */

function T_filaRevisao_() {
  var hoje = T_hoje_(), horizonte = T_somaDias_(hoje, 7);
  T_garantirColunas_(TURBO.ABAS.DROPS, TURBO.COLS_DROPS);
  var d = T_abrir_(TURBO.ABAS.DROPS, false), drops = [], lidos = 0;
  d.rows.forEach(function (r, k) {
    if (!r[0] || T_norm_(d.get(r, 'Status')) !== 'ativo') return;
    var prox = T_dia_(d.get(r, 'Próxima Revisão')) || hoje;
    if (!String(d.get(r, 'Leitura (cache)') || '') && T_idDoLink_(d.get(r, 'Link do Doc')) && lidos < 6) {
      try { T_cacheDoc_(d, k); lidos++; } catch (e) { }
    }
    drops.push({
      kind: 'drop', id: String(r[0]), area: d.get(r, 'Grande Área'), esp: d.get(r, 'Especialidade'), assunto: d.get(r, 'Assunto'),
      serie: T_num_(d.get(r, 'Série (#)')) || 1, prox: prox, intervalo: T_num_(d.get(r, 'Intervalo (dias)')) || 0,
      facilidade: T_num_(d.get(r, 'Facilidade')) || T_FACIL_PADRAO, acertos: T_num_(d.get(r, 'Acertos')) || 0, erros: T_num_(d.get(r, 'Erros')) || 0,
      img: T_idDoLink_(d.get(r, 'Link da Imagem')), doc: d.get(r, 'Link do Doc'), aud: T_idDoLink_(d.get(r, 'Link do Áudio')),
      leitura: prox <= horizonte ? String(d.get(r, 'Leitura (cache)') || '') : '',
      audio: prox <= horizonte ? String(d.get(r, 'Áudio (cache)') || '') : ''
    });
  });
  if (lidos) T_gravar_(d);
  var f = T_abrir_(TURBO.ABAS.FLASH, true), flash = [];
  f.rows.forEach(function (r) {
    if (!r[0] || T_norm_(f.get(r, 'Status')) !== 'ativo') return;
    var prox = T_dia_(f.get(r, 'Próxima Revisão')) || hoje;
    flash.push({
      kind: 'flash', id: String(r[0]), assunto: f.get(r, 'Assunto'), area: f.get(r, 'Grande Área'), prox: prox,
      intervalo: T_num_(f.get(r, 'Intervalo (dias)')) || 0, facilidade: T_num_(f.get(r, 'Facilidade')) || T_FACIL_PADRAO,
      acertos: T_num_(f.get(r, 'Acertos')) || 0, erros: T_num_(f.get(r, 'Erros')) || 0, aud: T_idDoLink_(f.get(r, 'Link do Áudio')),
      frente: prox <= horizonte ? String(f.get(r, 'Frente') || '') : '', verso: prox <= horizonte ? String(f.get(r, 'Verso') || '') : '',
      audio: prox <= horizonte ? String(f.get(r, 'Verso Áudio') || '') : ''
    });
  });
  var pend = d.rows.filter(function (r) { return r[0] && /pendente/.test(T_norm_(d.get(r, 'Status'))); }).length;
  return { drops: drops, flash: flash, pendentesGeracao: pend };
}

/* ---------------- Avaliação e escuta ---------------- */

function T_evAvaliar_(ctx, ev) {
  var t = ctx.tab(ev.kind === 'flash' ? TURBO.ABAS.FLASH : TURBO.ABAS.DROPS);
  var i = t.achar('ID', ev.id);
  if (i < 0) throw new Error('item ' + ev.id + ' não encontrado');
  var r = t.rows[i], dia = T_dia_(ev.data) || ctx.hoje;
  var p = T_proximo_(ev.nota, T_num_(t.get(r, 'Intervalo (dias)')), T_num_(t.get(r, 'Facilidade')));
  t.set(i, 'Intervalo (dias)', p.intervalo);
  t.set(i, 'Facilidade', p.facilidade);
  t.set(i, 'Última Revisão', T_br_(T_data_(dia)));
  t.set(i, 'Próxima Revisão', T_br_(T_data_(T_somaDias_(dia, p.intervalo))));
  if (ev.nota === 'errei') t.set(i, 'Erros', (T_num_(t.get(r, 'Erros')) || 0) + 1);
  else t.set(i, 'Acertos', (T_num_(t.get(r, 'Acertos')) || 0) + 1);
  T_contato_(ctx, t.get(r, 'Assunto'), dia);
  return 'próxima em ' + p.intervalo + ' d';
}

function T_evOuvido_(ctx, ev) {
  var vistos = {};
  (ev.assuntos || []).forEach(function (a) { if (a && !vistos[T_norm_(a)]) { vistos[T_norm_(a)] = 1; T_contato_(ctx, a, ev.data); } });
  return Object.keys(vistos).length + ' assunto(s) com contato';
}

/** Infográfico em base64 (o app guarda no aparelho para o modo offline). */
function T_imagem_(id) {
  if (!id) return { ok: false, erro: 'sem id' };
  var blob = DriveApp.getFileById(id).getBlob();
  return { ok: true, mime: blob.getContentType(), b64: Utilities.base64Encode(blob.getBytes()) };
}

/* ---------------- Leitura do Google Doc (## MODO LEITURA / ## MODO ÁUDIO) ---------------- */

/** Parágrafo → linha em markdown leve, preservando **negrito**. */
function T_mdDoTexto_(el) {
  var txt = el.editAsText(), s = txt.getText();
  if (!s) return '';
  var idx = txt.getTextAttributeIndices(), out = '';
  for (var k = 0; k < idx.length; k++) {
    var a = idx[k], b = k + 1 < idx.length ? idx[k + 1] : s.length, pedaco = s.slice(a, b);
    out += (txt.isBold(a) && pedaco.trim()) ? pedaco.replace(/^(\s*)(.*?)(\s*)$/, '$1**$2**$3') : pedaco;
  }
  return out.replace(/\*\*\*\*/g, '');
}

function T_lerDoc_(docId) {
  var body = DocumentApp.openById(docId).getBody(), modo = '', achou = false, L = [], A = [], todo = [];
  for (var i = 0; i < body.getNumChildren(); i++) {
    var c = body.getChild(i), tipo = c.getType(), linha = '', plano = '';
    if (tipo === DocumentApp.ElementType.PARAGRAPH) {
      var p = c.asParagraph(); plano = p.getText().trim(); if (!plano) continue;
      var n = T_norm_(plano).replace(/#/g, '').trim();
      if (/^modo leitura/.test(n)) { modo = 'L'; achou = true; continue; }
      if (/^modo audio/.test(n)) { modo = 'A'; achou = true; continue; }
      var h = p.getHeading();
      linha = (h === DocumentApp.ParagraphHeading.NORMAL ? '' : '### ') + (h === DocumentApp.ParagraphHeading.NORMAL ? T_mdDoTexto_(p) : plano);
    } else if (tipo === DocumentApp.ElementType.LIST_ITEM) {
      var li = c.asListItem(); plano = li.getText().trim(); if (!plano) continue;
      linha = new Array(li.getNestingLevel() + 1).join('  ') + '- ' + T_mdDoTexto_(li);
    } else if (tipo === DocumentApp.ElementType.TABLE) {
      plano = c.asTable().getText().trim(); linha = plano;
    } else continue;
    todo.push(linha);
    if (modo === 'L') L.push(linha); else if (modo === 'A') A.push(plano);
  }
  if (!achou) L = todo;
  var junta = function (arr) { // linhas de lista ficam coladas; o resto separado por linha em branco
    var s = ''; arr.forEach(function (x, k) { var lista = /^\s*- /.test(x), ant = k && /^\s*- /.test(arr[k - 1]); s += (k ? (lista && ant ? '\n' : '\n\n') : '') + x; }); return s;
  };
  return { leitura: junta(L), audio: A.join('\n\n'), marcado: achou };
}

function T_cacheDoc_(t, k) {
  var id = T_idDoLink_(t.get(t.rows[k], 'Link do Doc'));
  if (!id) return;
  var r = T_lerDoc_(id);
  t.set(k, 'Leitura (cache)', r.leitura.slice(0, 45000));
  t.set(k, 'Áudio (cache)', r.audio.slice(0, 45000));
  t.set(k, 'Doc lido em', T_br_(new Date(), true));
}

/* ---------------- Sincronização com a pasta Drops do Drive ---------------- */

/** Varre Drops > Grande Área > Especialidade, liga Docs e .jpg às linhas e atualiza o texto em cache. */
function sincronizarDrops() {
  T_garantirColunas_(TURBO.ABAS.DROPS, TURBO.COLS_DROPS);
  var raizId = T_cfgTxt_('Pasta Drops (ID)', '');
  if (!raizId) throw new Error('Configure "Pasta Drops (ID)" na aba Configurações');
  var t = T_abrir_(TURBO.ABAS.DROPS, false), achados = [];
  var area = DriveApp.getFolderById(raizId).getFolders();
  while (area.hasNext()) {
    var fa = area.next(), esps = fa.getFolders();
    T_arquivosDrop_(fa, fa.getName(), '', achados);
    while (esps.hasNext()) { var fe = esps.next(); T_arquivosDrop_(fe, fa.getName(), fe.getName(), achados); var sub = fe.getFolders(); while (sub.hasNext()) { var fs = sub.next(); T_arquivosDrop_(fs, fa.getName(), fe.getName(), achados); } }
  }
  var porDoc = {}; t.rows.forEach(function (r, k) { var id = T_idDoLink_(t.get(r, 'Link do Doc')); if (id) porDoc[id] = k; });
  var docs = achados.filter(function (x) { return x.doc; }), imgs = achados.filter(function (x) { return !x.doc; });
  var novos = 0, ligados = 0, relidos = 0;
  docs.forEach(function (x) {
    var k = porDoc[x.id];
    if (k === undefined) { // Doc ainda não ligado: procura linha pendente com o mesmo assunto/série
      for (var j = 0; j < t.rows.length; j++) {
        var r = t.rows[j];
        if (r[0] && !T_idDoLink_(t.get(r, 'Link do Doc')) && T_sim_(t.get(r, 'Assunto'), x.base) >= 0.6 && (T_num_(t.get(r, 'Série (#)')) || 1) === x.serie) { k = j; break; }
      }
      if (k === undefined) { k = t.add({ 'ID': T_proxIdDrop_(t), 'Grande Área': x.area, 'Especialidade': x.esp, 'Assunto': x.base, 'Série (#)': x.serie, 'Gatilho': 'Encontrado no Drive', 'Status': 'Ativo', 'Intervalo (dias)': 0, 'Próxima Revisão': T_br_(new Date()), 'Acertos': 0, 'Erros': 0 }); novos++; }
      t.set(k, 'Link do Doc', x.url); ligados++;
    }
    if (/pendente/.test(T_norm_(t.get(t.rows[k], 'Status')))) t.set(k, 'Status', 'Ativo');
    var lido = T_data_(t.get(t.rows[k], 'Doc lido em'));
    if (!lido || lido < x.atualizado) { try { T_cacheDoc_(t, k); relidos++; } catch (e) { } }
    var img = imgs.filter(function (m) { return m.pasta === x.pasta && T_sim_(m.base, x.base) >= 0.6 && m.serie === x.serie; })[0];
    if (img && T_idDoLink_(t.get(t.rows[k], 'Link da Imagem')) !== img.id) t.set(k, 'Link da Imagem', img.url);
  });
  T_gravar_(t); T_cacheLimpar_();
  var msg = 'Drops: ' + docs.length + ' docs no Drive · ' + ligados + ' ligados · ' + novos + ' novos · ' + relidos + ' relidos';
  Logger.log(msg); return msg;
}

function T_arquivosDrop_(pasta, area, esp, out) {
  var it = pasta.getFiles();
  while (it.hasNext()) {
    var f = it.next(), mt = f.getMimeType(), nome = f.getName();
    var ehDoc = mt === MimeType.GOOGLE_DOCS, ehImg = /^image\//.test(mt);
    if (!ehDoc && !ehImg) continue;
    var m = nome.match(/#\s*(\d+)/), serie = m ? +m[1] : 1;
    var base = nome.replace(/\.(jpe?g|png)$/i, '').replace(/^\s*drop\s*[-–—:]\s*/i, '').replace(/\(.*?\)/g, '').replace(/#\s*\d+/, '').trim();
    out.push({ id: f.getId(), url: f.getUrl(), doc: ehDoc, base: base, serie: serie, area: area, esp: esp || area, pasta: pasta.getId(), atualizado: f.getLastUpdated() });
  }
}

function T_proxIdDrop_(t) {
  var max = 0;
  t.rows.forEach(function (r) { var m = String(r[0] || '').match(/^DRP-(\d+)/); if (m) max = Math.max(max, +m[1]); });
  return 'DRP-' + ('00' + (max + 1)).slice(-3);
}

/* ======================================================================== Voz ======================================================================== */
/**
 * MedEstudos 5 — Voz.gs
 * Áudio natural e GRATUITO dos Drops (e flashcards) com o Gemini TTS (plano grátis da API do Google AI Studio).
 * Chave: Projeto → Configurações do projeto → Propriedades do script → GEMINI_API_KEY.
 * Gera um .wav (16 kHz, mono) por item, salva no Drive e grava "Link do Áudio" na planilha.
 * O app baixa o arquivo, guarda no aparelho e toca offline (inclusive pelos comandos do carro).
 */
var T_VOZ = { MODELO: 'gemini-2.5-flash-preview-tts', VOZ: 'Kore', MAX_POR_RODADA: 6,
  ESTILO: 'Leia em português do Brasil como um professor de medicina explicando com calma, clareza e entusiasmo, em ritmo natural de conversa, com pausas curtas entre os painéis. Leia todas as siglas e números por extenso. Texto:\n\n' };

function T_chaveGemini_() {
  var k = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!k) throw new Error('Falta a chave: Configurações do projeto → Propriedades do script → GEMINI_API_KEY');
  return k;
}

/** Texto limpo para narrar: tira marcações do modo leitura se não houver MODO ÁUDIO. */
function T_textoNarrar_(t) {
  return String(t || '').replace(/^#+\s*/gm, '').replace(/^\s*[-•]\s*/gm, '').replace(/\*\*/g, '').replace(/\$[^$]*\$/g, ' ')
    .replace(/→/g, ', então, ').replace(/≥/g, ' maior ou igual a ').replace(/≤/g, ' menor ou igual a ').replace(/\n{3,}/g, '\n\n').trim();
}

/** Chama o Gemini TTS e devolve um WAV 16 kHz mono 16 bits. */
function T_tts_(texto) {
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + T_VOZ.MODELO + ':generateContent?key=' + encodeURIComponent(T_chaveGemini_());
  var corpo = { contents: [{ parts: [{ text: T_VOZ.ESTILO + texto }] }],
    generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: T_VOZ.VOZ } } } } };
  var r = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', payload: JSON.stringify(corpo), muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('Gemini TTS ' + r.getResponseCode() + ': ' + r.getContentText().slice(0, 300));
  var j = JSON.parse(r.getContentText()), parte = (((j.candidates || [])[0] || {}).content || {}).parts || [];
  var dado = parte.filter(function (p) { return p.inlineData; })[0];
  if (!dado) throw new Error('Gemini TTS sem áudio');
  var m = String(dado.inlineData.mimeType || '').match(/rate=(\d+)/), taxa = m ? +m[1] : 24000;
  return T_wav16k_(Utilities.base64Decode(dado.inlineData.data), taxa);
}

/** PCM s16le (taxa original) → WAV 16 kHz (interpolação linear: arquivo 1/3 menor, fala continua nítida). */
function T_wav16k_(bytes, taxa) {
  var n = Math.floor(bytes.length / 2), amostra = function (i) { var v = (bytes[2 * i] & 255) | (bytes[2 * i + 1] << 8); return v > 32767 ? v - 65536 : v; };
  var alvo = 16000, passo = taxa / alvo, m = Math.floor(n / passo), out = new Array(44 + m * 2);
  for (var i = 0; i < m; i++) {
    var p = i * passo, a = Math.floor(p), f = p - a, s = Math.round(amostra(a) * (1 - f) + (a + 1 < n ? amostra(a + 1) : 0) * f);
    s = Math.max(-32768, Math.min(32767, s)); var u = s < 0 ? s + 65536 : s;
    out[44 + 2 * i] = (u & 255) > 127 ? (u & 255) - 256 : (u & 255); var h = (u >> 8) & 255; out[45 + 2 * i] = h > 127 ? h - 256 : h;
  }
  var w = function (o, txt) { for (var k = 0; k < 4; k++) out[o + k] = txt.charCodeAt(k); };
  var u32 = function (o, v) { for (var k = 0; k < 4; k++) { var b = (v >>> (8 * k)) & 255; out[o + k] = b > 127 ? b - 256 : b; } };
  var u16 = function (o, v) { out[o] = v & 255; out[o + 1] = (v >> 8) & 255; };
  w(0, 'RIFF'); u32(4, 36 + m * 2); w(8, 'WAVE'); w(12, 'fmt '); u32(16, 16); u16(20, 1); u16(22, 1); u32(24, alvo); u32(28, alvo * 2); u16(32, 2); u16(34, 16); w(36, 'data'); u32(40, m * 2);
  return out;
}

/** Gera áudios que faltam (Drops primeiro, depois flashcards). Roda nos gatilhos e pode ser executada à mão. */
function gerarAudiosDrops() {
  try { sincronizarDrops(); } catch (e) { Logger.log('sync: ' + e.message); }
  T_garantirColunas_(TURBO.ABAS.DROPS, ['Link do Áudio']);
  T_garantirColunas_(TURBO.ABAS.FLASH, ['Link do Áudio']);
  var feitos = 0, erros = [], inicio = Date.now(), hoje = T_hoje_();
  var raiz = DriveApp.getFolderById(T_cfgTxt_('Pasta Drops (ID)', ''));
  var pastaFc = (function () { var it = raiz.getFoldersByName('Áudios dos flashcards'); return it.hasNext() ? it.next() : raiz.createFolder('Áudios dos flashcards'); })();
  [[TURBO.ABAS.DROPS, 'drop'], [TURBO.ABAS.FLASH, 'flash']].forEach(function (par) {
    var t = T_abrir_(par[0], false);
    var fila = t.rows.map(function (r, k) { return k; }).filter(function (k) {
      var r = t.rows[k]; return r[0] && T_norm_(t.get(r, 'Status')) === 'ativo' && !String(t.get(r, 'Link do Áudio') || '');
    }).sort(function (a, b) { return String(T_dia_(t.get(t.rows[a], 'Próxima Revisão')) || hoje).localeCompare(String(T_dia_(t.get(t.rows[b], 'Próxima Revisão')) || hoje)); });
    fila.forEach(function (k) {
      if (feitos >= T_VOZ.MAX_POR_RODADA || Date.now() - inicio > 270000) return;
      var r = t.rows[k], texto = par[1] === 'drop' ? (t.get(r, 'Áudio (cache)') || t.get(r, 'Leitura (cache)')) : (t.get(r, 'Verso Áudio') || t.get(r, 'Verso'));
      texto = T_textoNarrar_(texto); if (texto.length < 40) return;
      try {
        var wav = T_tts_(texto), pasta = pastaFc;
        if (par[1] === 'drop') { var doc = T_idDoLink_(t.get(r, 'Link do Doc')); if (doc) { var ps = DriveApp.getFileById(doc).getParents(); if (ps.hasNext()) pasta = ps.next(); } }
        var nome = (par[1] === 'drop' ? 'DROP - ' + t.get(r, 'Assunto') + ' #' + (T_num_(t.get(r, 'Série (#)')) || 1) : 'FC - ' + r[0]) + ' (Áudio).wav';
        var f = pasta.createFile(Utilities.newBlob(wav, 'audio/wav', nome));
        t.set(k, 'Link do Áudio', f.getUrl()); feitos++;
      } catch (e) { erros.push(r[0] + ': ' + e.message); if (/429|quota|RESOURCE_EXHAUSTED/i.test(e.message)) feitos = 999; }
    });
    T_gravar_(t);
  });
  T_cacheLimpar_();
  var msg = 'Áudios gerados: ' + Math.min(feitos, T_VOZ.MAX_POR_RODADA) + (erros.length ? ' · erros: ' + erros.join(' | ') : '');
  Logger.log(msg); return msg;
}

/** Áudio em base64 para o app guardar no aparelho. */
function T_audio_(id) {
  if (!id) return { ok: false, erro: 'sem id' };
  var b = DriveApp.getFileById(id).getBlob();
  return { ok: true, mime: 'audio/wav', b64: Utilities.base64Encode(b.getBytes()) };
}

/* ======================================================================== Cidade ======================================================================== */
/**
 * MedEstudos 5 — Cidade.gs
 * Panorama de todos os assuntos da aba Assuntos, por grande área.
 * Luz de cada assunto:
 *   apagada  → nunca teve contato
 *   contato  → já teve contato (Drop/flashcard revisado ou ouvido, check-in, simulado), sem questões feitas
 *   verde ≥ 75% · amarela 50–74% · vermelha < 50%  → % de acerto (questões do check-in; sem elas, simulados)
 */
function T_cidade_(catalogo) {
  var sim = {};
  var d = T_abrir_(TURBO.ABAS.DESEMP_SIM, false);
  if (d) d.rows.forEach(function (r) {
    if (!/^SIM/.test(String(d.get(r, 'ID do simulado')))) return;
    var k = T_norm_(d.get(r, 'Assunto')), x = sim[k] = sim[k] || { q: 0, e: 0 };
    x.q += T_num_(d.get(r, 'Questões')) || 0; x.e += T_num_(d.get(r, 'Erros')) || 0;
  });
  var comDrop = {};
  var dr = T_abrir_(TURBO.ABAS.DROPS, false);
  if (dr) dr.rows.forEach(function (r) { if (r[0]) comDrop[T_norm_(dr.get(r, 'Assunto'))] = (comDrop[T_norm_(dr.get(r, 'Assunto'))] || 0) + 1; });
  var areas = {};
  catalogo.forEach(function (c) {
    var A = c.area || 'Outros', a = areas[T_norm_(A)] = areas[T_norm_(A)] || { area: A, total: 0, contato: 0, feitas: 0, certas: 0, simQ: 0, simE: 0, assuntos: [] };
    var s = sim[T_norm_(c.nome)] || { q: 0, e: 0 };
    var pct = c.feitas ? c.certas / c.feitas : (s.q ? (s.q - s.e) / s.q : null);
    var teve = !!(c.feitas || c.contato || s.q || String(c.status || '').trim());
    var luz = !teve ? 'apagada' : pct === null ? 'contato' : pct >= 0.75 ? 'verde' : pct >= 0.5 ? 'amarela' : 'vermelha';
    a.total++; if (teve) a.contato++;
    a.feitas += c.feitas; a.certas += c.certas; a.simQ += s.q; a.simE += s.e;
    a.assuntos.push({ nome: c.nome, sub: c.subarea, rec: c.recorrencia, feitas: c.feitas, certas: c.certas, simQ: s.q, simE: s.e,
      pct: pct === null ? null : Math.round(pct * 100), luz: luz, contato: c.contato, drops: comDrop[T_norm_(c.nome)] || 0 });
  });
  return Object.keys(areas).map(function (k) { return areas[k]; }).sort(function (x, y) { return y.total - x.total; });
}

/* ======================================================================== Simulados ======================================================================== */
/**
 * MedEstudos 5 — Simulados.gs
 * Mesma gravação de antes nas abas Simulados, Erros em simulados, Desempenho em simulados e Registro de estudos.
 * Saíram só os efeitos colaterais do app antigo (gargalos e XP), cujas abas não existem mais.
 */
function T_simuladosDados_() {
  var s = T_abrir_(TURBO.ABAS.SIMULADOS, false);
  var lista = s ? s.rows.filter(function (r) { return r[0] !== ''; }).map(function (r) {
    return { id: s.get(r, 'ID do simulado'), nome: s.get(r, 'Nome'), inicio: T_dia_(s.get(r, 'Data e hora de início')),
      total: T_num_(s.get(r, 'Total de questões')), acertos: T_num_(s.get(r, 'Total de acertos')), pct: T_num_(s.get(r, '% de acertos')) };
  }) : [];
  var e = T_abrir_(TURBO.ABAS.ERROS_SIM, false);
  var erros = e ? e.rows.filter(function (r) { return r[0] !== ''; }).map(function (r) {
    return { id: e.get(r, 'ID do erro'), simulado: e.get(r, 'ID do simulado'), assunto: e.get(r, 'Assunto'),
      qtd: T_num_(e.get(r, 'Quantidade de erros')), motivo: e.get(r, 'Motivo'), subassunto: e.get(r, 'Subassunto'), pilar: e.get(r, 'Pilar'), classe: e.get(r, 'Classe') };
  }) : [];
  return { lista: lista, erros: erros.slice(-300) };
}

function T_nomesCatalogo_(ctx) {
  var a = ctx.tab(TURBO.ABAS.ASSUNTOS);
  return a.rows.map(function (r) { return String(a.get(r, 'Nome do assunto') || ''); }).filter(String);
}

function T_evLancarSimulado_(ctx, ev) {
  var id = ev.id || T_id_('SIM');
  var sims = ctx.tab(TURBO.ABAS.SIMULADOS);
  if (sims.achar('ID do simulado', id) >= 0) return 'simulado já existia';
  var ini = T_data_(ev.inicio), fim = T_data_(ev.fim);
  var dur = (ini && fim) ? Math.round((fim - ini) / 60000) : '';
  var durTxt = dur !== '' ? ('0' + Math.floor(dur / 60)).slice(-2) + ':' + ('0' + (dur % 60)).slice(-2) : '';
  var total = +ev.total || 0, acertos = +ev.acertos || 0;
  sims.add({ 'ID do simulado': id, 'Nome': ev.nome || ('Simulado ' + T_br_(ini || new Date())),
    'Data e hora de início': ini ? T_br_(ini, true) : '', 'Data e hora de fim': fim ? T_br_(fim, true) : '',
    'Duração': durTxt, 'Total de questões': total, 'Total de acertos': acertos,
    '% de acertos': total ? Math.round(1000 * acertos / total) / 10 + '%' : '' });

  var catalogo = T_nomesCatalogo_(ctx);
  var errosTab = ctx.tab(TURBO.ABAS.ERROS_SIM), desemp = ctx.tab(TURBO.ABAS.DESEMP_SIM), assuntosTab = ctx.tab(TURBO.ABAS.ASSUNTOS);
  var penFalta = T_cfgNum_('Penalidade por falta de conteúdo', 1.05), penDes = T_cfgNum_('Penalidade por desatenção', 1.02);
  var agreg = {};
  (ev.erros || []).forEach(function (e) {
    var assunto = T_casarAssunto_(e.assunto, catalogo) || e.assunto, qtd = +e.qtd || 1;
    var falta = T_norm_(e.motivo).indexOf('falta') >= 0;
    errosTab.add({ 'ID do erro': T_id_('ERR'), 'ID do simulado': id, 'Assunto': assunto, 'Quantidade de erros': qtd,
      'Motivo': falta ? 'Falta de conteúdo' : 'Desatenção', 'Subassunto': e.subassunto || '', 'Pilar': falta ? T_pilar_(e.pilar || '') : '', 'Classe': falta ? 'gap' : 'inseguro' });
    var g = agreg[assunto] = agreg[assunto] || { q: 0, f: 0, d: 0 };
    g.q += qtd; if (falta) g.f += qtd; else g.d += qtd;
    var ia = assuntosTab.achar('Nome do assunto', assunto);
    if (ia >= 0) {
      var dif = T_num_(assuntosTab.get(assuntosTab.rows[ia], 'Dificuldade')) || 1;
      assuntosTab.set(ia, 'Dificuldade', Math.round(dif * Math.pow(falta ? penFalta : penDes, qtd) * 100) / 100);
      T_contato_(ctx, assunto, ini || new Date());
    }
  });
  Object.keys(agreg).forEach(function (a) {
    desemp.add({ 'ID': T_id_('DES'), 'ID do simulado': id, 'Data do simulado': ini ? T_br_(ini, true) : '', 'Assunto': a,
      'Questões': agreg[a].q, 'Erros': agreg[a].q, 'Erros por falta de conteúdo': agreg[a].f, 'Erros por desatenção': agreg[a].d });
  });
  ctx.tab(TURBO.ABAS.REGISTRO).add({ 'ID do registro': T_id_('REG'), 'Data': new Date(), 'Assunto': ev.nome || 'Simulado', 'Tipo de atividade': 'Simulado',
    'Questões feitas': total, 'Questões certas': acertos, 'Status final': 'Concluído', 'Tipo': 'App', 'ID do simulado': id });
  return 'ok';
}

function T_evAgendarSimulado_(ctx, ev) {
  var cal = T_calendario_();
  var p = String(ev.hora || '14:00').split(':');
  var ini = T_data_(ev.data); ini.setHours(+p[0] || 14, +p[1] || 0, 0, 0);
  var fim = new Date(ini.getTime() + (+ev.duracaoMin || 120) * 60000);
  cal.createEvent(ev.nome || 'Simulado', ini, fim, { description: 'Agendado pelo MedEstudos' }).setColor(CalendarApp.EventColor.PEACOCK);
  return 'agendado ' + T_br_(ini, true);
}

function T_parseMapeamento_(texto) {
  var catalogo = T_catalogo_().map(function (c) { return c.nome; });
  var s = String(texto).replace(/```json|```/g, '').trim();
  var itens = [];
  var j = T_json_(s, null);
  if (j) itens = Array.isArray(j) ? j : (j.erros || []);
  else {
    s.split(/\r?\n/).forEach(function (l) {
      var p = l.split('|').map(function (x) { return x.trim(); });
      if (p.length < 4 || /^assunto$/i.test(p[0])) return;
      itens.push({ assunto: p[0], subassunto: p[1], pilar: p[2], motivo: p[3], qtd: +p[4] || 1 });
    });
  }
  var naoCasados = [];
  var erros = itens.map(function (e) {
    var casado = T_casarAssunto_(e.assunto, catalogo);
    if (!casado) naoCasados.push(e.assunto);
    var falta = T_norm_(e.motivo).indexOf('falta') >= 0;
    return { assunto: casado || e.assunto, assuntoOriginal: e.assunto, subassunto: e.subassunto || '', pilar: falta ? T_pilar_(e.pilar) : '', motivo: falta ? 'Falta de conteúdo' : 'Desatenção', qtd: +e.qtd || 1 };
  });
  return { ok: true, erros: erros, naoCasados: naoCasados };
}

function T_promptMapeamentoSimulado_() {
  var pesos = T_pesosBancas_();
  return [
    'Vou enviar o PDF de um simulado e a lista das questões que errei, com o motivo de cada erro.',
    'Para cada questão errada, devolva SOMENTE um JSON no formato:',
    '{"erros":[{"assunto":"<nome EXATO do Banco de assuntos>","subassunto":"<tópico específico cobrado>","pilar":"<um dos 5 pilares>","motivo":"Falta de conteúdo|Desatenção","qtd":1}]}',
    'Pilares permitidos: ' + TURBO.PILARES.join('; ') + '.',
    'Regras: o subassunto é o ponto exato que a questão cobrou (ex.: "Critérios de Light", não "Derrame pleural").',
    'Se o motivo for Desatenção, ainda informe o subassunto, mas o pilar pode ficar vazio: o erro é tratado como "inseguro", não como lacuna clínica.',
    'Peso das bancas-alvo para julgar relevância: ' + Object.keys(pesos).map(function (k) { return k + ' ' + Math.round(pesos[k] * 100) + '%'; }).join(', ') + '.'
  ].join('\n');
}

/* ======================================================================== Plano ======================================================================== */
/**
 * MedEstudos 5 — Plano.gs
 * gerarPlanoSemanalDrops(): roda todo domingo às 07:00 e monta a pauta da semana seguinte.
 *   MACRO: % de acerto por grande área nos simulados → as N piores áreas abaixo da meta.
 *          Dentro delas: nota = recorrência² × (1 + erros) → o que cai muito E você erra vem primeiro;
 *          exclui 100% de acerto e temas de recorrência < 1,2 sem erros repetidos.
 *          A pior área recebe +1 Drop.
 *   MICRO: qualquer assunto com ≥ 2 erros acumulados.
 *   CONTINUIDADE: assunto que já tem Drop só volta se errou de novo depois da última série → série #n+1,
 *          e a geração lê os "Pontos Cobertos" das séries anteriores para focar em lacunas novas.
 *   SEMANA DE REVISÃO DO EXTENSIVO: não entram Drops novos (a fila vira maratona de revisão).
 *   DISTRIBUIÇÃO: Próxima Revisão nos dias mais leves do Calendar (internato/provas pesam mais).
 *   FLASHCARDS: assuntos com check-in do Extensivo nos últimos 7 dias viram pauta "Pendente geração".
 * As linhas "Pendente geração" são preenchidas pela tarefa agendada do Claude (domingo ~08:40).
 */

var T_PASTA_AREA = { 'clinica medica': 'Clínica Médica', 'cirurgia': 'Cirurgia', 'ginecologia': 'Ginecologia e Obstetrícia', 'obstetricia': 'Ginecologia e Obstetrícia', 'pediatria': 'Pediatria', 'preventiva': 'Preventiva' };

function gerarPlanoSemanalDrops() {
  T__cfgCache = null;
  T_garantirColunas_(TURBO.ABAS.DROPS, TURBO.COLS_DROPS);
  var hoje = T_hoje_(), seg = T_somaDias_(T_segunda_(hoje), 7), dom = T_somaDias_(seg, 6);
  var nAreas = Math.max(1, Math.round(T_cfgNum_('Qtd Áreas Foco Drops', 2)));
  var porArea = Math.max(1, Math.round(T_cfgNum_('Drops por Área na Semana', 4)));
  var meta = T_cfgNum_('Meta de acertos', 0.75); if (meta > 1) meta /= 100;

  // 1) catálogo + desempenho nos simulados
  var A = T_abrir_(TURBO.ABAS.ASSUNTOS, false), cat = {}, nomes = [];
  A.rows.forEach(function (r) {
    var nome = String(A.get(r, 'Nome do assunto') || '').trim(); if (!nome) return;
    cat[T_norm_(nome)] = { nome: nome, area: String(A.get(r, 'Grande área') || '').trim(), sub: String(A.get(r, 'Subárea') || '').trim(), rec: T_num_(A.get(r, 'Recorrência')) || 1, q: 0, e: 0 };
    nomes.push(nome);
  });
  var D = T_abrir_(TURBO.ABAS.DESEMP_SIM, false);
  D.rows.forEach(function (r) {
    if (!/^SIM/.test(String(D.get(r, 'ID do simulado')))) return;
    var c = cat[T_norm_(D.get(r, 'Assunto'))] || cat[T_norm_(T_casarAssunto_(D.get(r, 'Assunto'), nomes) || '')];
    if (!c) return;
    c.q += T_num_(D.get(r, 'Questões')) || 0; c.e += T_num_(D.get(r, 'Erros')) || 0;
  });
  var areas = {};
  Object.keys(cat).forEach(function (k) { var c = cat[k], a = T_norm_(c.area); var x = areas[a] = areas[a] || { area: c.area, q: 0, e: 0 }; x.q += c.q; x.e += c.e; });
  var ranking = Object.keys(areas).map(function (k) { var x = areas[k]; x.pct = x.q ? 1 - x.e / x.q : 1; return x; })
    .filter(function (x) { return x.q >= 5; }).sort(function (a, b) { return a.pct - b.pct; });
  var foco = ranking.filter(function (x) { return x.pct < meta; }).slice(0, nAreas);
  if (!foco.length) foco = ranking.slice(0, nAreas);

  // 2) Drops existentes (séries e pendências)
  var T = T_abrir_(TURBO.ABAS.DROPS, false), ex = {};
  T.rows.forEach(function (r) {
    if (!r[0]) return;
    var k = T_norm_(T.get(r, 'Assunto')), x = ex[k] = ex[k] || { serie: 0, pendente: false, pontos: [] };
    x.serie = Math.max(x.serie, T_num_(T.get(r, 'Série (#)')) || 1);
    if (/pendente/.test(T_norm_(T.get(r, 'Status')))) x.pendente = true;
  });
  /** Entra se nunca teve Drop, ou se os erros acumulados superam as séries já feitas (errou de novo). */
  var elegivel = function (c) {
    var x = ex[T_norm_(c.nome)];
    if (!x) return { serie: 1 };
    if (x.pendente) return null;
    return c.e > x.serie ? { serie: x.serie + 1 } : null;
  };

  // 3) semana seguinte no Calendar
  var sem = T_lerSemana_(seg, dom);
  var log = ['Plano de ' + T_br_(T_data_(seg)) + ' a ' + T_br_(T_data_(dom))];
  var escolhidos = [];
  if (sem.revisao) log.push('Semana de REVISÃO do Extensivo: sem Drops novos.');
  else {
    foco.forEach(function (ar, i) {
      var cota = porArea + (i === 0 ? 1 : 0);
      var cands = Object.keys(cat).map(function (k) { return cat[k]; }).filter(function (c) {
        return T_norm_(c.area) === T_norm_(ar.area) && !(c.q > 0 && c.e === 0) && (c.rec >= 1.2 || c.e >= 2);
      }).map(function (c) { var el = elegivel(c); return el ? { c: c, serie: el.serie, nota: c.rec * c.rec * (1 + c.e) } : null; })
        .filter(Boolean).sort(function (a, b) { return b.nota - a.nota; }).slice(0, cota);
      cands.forEach(function (x) { escolhidos.push({ c: x.c, serie: x.serie, gatilho: 'Macro: ' + ar.area + ' ' + Math.round(ar.pct * 100) + '% nos simulados · recorrência ' + x.c.rec + (x.c.e ? ' · ' + x.c.e + ' erro(s)' : '') }); });
      log.push(ar.area + ' (' + Math.round(ar.pct * 100) + '%): ' + cands.length + ' Drop(s)');
    });
    Object.keys(cat).forEach(function (k) {
      var c = cat[k];
      if (c.e < 2 || escolhidos.some(function (x) { return x.c === c; })) return;
      var el = elegivel(c); if (!el) return;
      escolhidos.push({ c: c, serie: el.serie, gatilho: 'Micro: ' + c.e + ' erros acumulados nos simulados' });
      log.push('Micro: ' + c.nome);
    });
  }

  // 4) distribuição equitativa: cada Drop vai para o dia com menor (peso do Calendar + Drops já marcados)
  var carga = {};
  sem.dias.forEach(function (d) { carga[d.iso] = d.peso; });
  T.rows.forEach(function (r) { var p = T_dia_(T.get(r, 'Próxima Revisão')); if (r[0] && carga[p] !== undefined) carga[p] += 1.5; });
  escolhidos.forEach(function (x) {
    var dia = Object.keys(carga).sort(function (a, b) { return carga[a] - carga[b] || a.localeCompare(b); })[0];
    carga[dia] += 1.5;
    var areaN = T_norm_(x.c.area);
    var esp = /gineco|obst/.test(areaN) ? (areaN.indexOf('obst') >= 0 ? 'Obstetrícia' : 'Ginecologia') : (x.c.sub || x.c.area);
    T.add({ 'ID': T_proxIdDrop_(T), 'Grande Área': T_PASTA_AREA[areaN] || x.c.area, 'Especialidade': esp, 'Assunto': x.c.nome, 'Série (#)': x.serie,
      'Gatilho': x.gatilho, 'Pontos Cobertos': '', 'Status': 'Pendente geração', 'Intervalo (dias)': 0,
      'Próxima Revisão': T_br_(T_data_(dia)), 'Acertos': 0, 'Erros': 0, 'Facilidade': T_FACIL_PADRAO });
  });
  T_gravar_(T);

  // 5) pauta de flashcards: assuntos com check-in nos últimos 7 dias que ainda não têm cards
  var R = T_abrir_(TURBO.ABAS.REGISTRO, false), F = T_abrir_(TURBO.ABAS.FLASH, true), jaTem = {}, novosFc = 0;
  F.rows.forEach(function (r) { if (r[0]) jaTem[T_norm_(F.get(r, 'Assunto'))] = true; });
  var desde = T_somaDias_(hoje, -7);
  R.rows.forEach(function (r) {
    if (T_norm_(R.get(r, 'Tipo')) !== 'check-in' || T_norm_(R.get(r, 'Status final')) === 'nao estudado') return;
    var d = T_dia_(R.get(r, 'Data')); if (d < desde) return;
    var nome = T_casarAssunto_(R.get(r, 'Assunto'), nomes) || String(R.get(r, 'Assunto')), k = T_norm_(nome);
    if (jaTem[k]) return; jaTem[k] = true;
    var c = cat[k] || {};
    F.add({ 'ID': 'FCP-' + T_slug_(nome).slice(0, 30) + '-' + d.replace(/-/g, ''), 'Assunto': nome, 'Grande Área': c.area || '',
      'Origem': 'Extensivo · check-in ' + T_br_(T_data_(d)) + ' · ' + (T_num_(R.get(r, 'Questões feitas')) || 0) + ' q / ' + (T_num_(R.get(r, 'Questões certas')) || 0) + ' certas',
      'Status': 'Pendente geração', 'Criado em': T_br_(new Date(), true) });
    novosFc++;
  });
  T_gravar_(F);
  log.push(escolhidos.length + ' Drop(s) e ' + novosFc + ' assunto(s) de flashcards na pauta.');

  try { log.push(sincronizarDrops()); } catch (e) { log.push('Sync Drive: ' + e.message); }
  T_cfgSet_('Último plano de Drops', log.join(' | '), 'Resumo da última execução do motor de domingo');
  T_cacheLimpar_();
  Logger.log(log.join('\n'));
  return log.join('\n');
}

/** Gatilhos: domingo 07:00 (plano) e todo dia 06:00 (sincroniza a pasta Drops). Remove os antigos. */
function instalarGatilhoDomingo() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('gerarPlanoSemanalDrops').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(7).nearMinute(0).inTimezone('America/Bahia').create();
  ScriptApp.newTrigger('gerarAudiosDrops').timeBased().everyDays(1).atHour(6).inTimezone('America/Bahia').create();
  ScriptApp.newTrigger('gerarAudiosDrops').timeBased().everyDays(1).atHour(13).inTimezone('America/Bahia').create();
  Logger.log('Gatilhos: domingo 07:00 (plano) · todo dia 06:00 e 13:00 (sincroniza Drive + gera áudios).');
}

/** Rode UMA vez depois de colar o código. Prepara colunas, configurações, token e gatilhos. */
function setup() {
  T_tab_(TURBO.ABAS.FLASH, true);
  T_garantirColunas_(TURBO.ABAS.DROPS, TURBO.COLS_DROPS.concat(['Link do Áudio']));
  T_garantirColunas_(TURBO.ABAS.FLASH, ['Link do Áudio']);
  T_garantirColunas_(TURBO.ABAS.ASSUNTOS, TURBO.COLS_ASSUNTOS);
  T_garantirColunas_(TURBO.ABAS.ERROS_SIM, ['Subassunto', 'Pilar', 'Classe']);
  var sh = T_tab_(TURBO.ABAS.CONFIG, false), n = sh.getLastRow();
  var nomes = sh.getRange(2, 1, n - 1, 1).getValues().map(function (r) { return String(r[0]); });
  nomes.forEach(function (nome, i) {
    if (TURBO.CONFIG_MORTAS.some(function (m) { return T_norm_(m) === T_norm_(nome); })) sh.getRange(i + 2, 1).setValue('(obsoleto) ' + nome);
  });
  T__cfgCache = null;
  var cfg = T_cfg_();
  TURBO.CONFIG_NOVAS.forEach(function (c) { if (cfg[T_norm_(c[0])] === undefined) T_cfgSet_(c[0], c[1], c[2]); });
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('API_TOKEN')) props.setProperty('API_TOKEN', Utilities.getUuid().replace(/-/g, ''));
  instalarGatilhoDomingo();
  Logger.log(sincronizarDrops());
  Logger.log('PRONTO. Token da API: ' + props.getProperty('API_TOKEN'));
}
