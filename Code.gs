/*************************************************************************
 * FONO HUC — Sistema de Fonoaudiologia Hospitalar
 * Google Apps Script (servidor)
 *
 * Como usar:
 *  1. Abra sua planilha no Google Sheets.
 *  2. Extensões > Apps Script.
 *  3. Cole este arquivo como "Code.gs" e crie um arquivo HTML "index".
 *  4. Execute a função setup() uma vez (autorize os acessos).
 *  5. Implantar > Nova implantação > Tipo "App da Web".
 *     - Executar como: Eu
 *     - Quem tem acesso: conforme sua política (ex.: qualquer pessoa da sua org)
 *
 * Primeiro login (criado pelo setup):
 *     usuário: admin
 *     senha:   huc@2026     (o app obriga a trocar no primeiro acesso)
 *************************************************************************/

/* ============================ CONFIG ============================ */

const APP = {
  nome: 'FONO HUC',
  sessaoHoras: 8,
  adminLogin: 'admin',
  adminSenhaInicial: 'huc@2026'
};

const SHEETS = {
  Usuarios: ['id','nome','login','senhaHash','salt','perfil','ativo','primeiroAcesso','criadoEm'],
  Pacientes: ['id','nome','prontuario','sexo','dataNascimento','criadoEm','criadoPor'],
  Internacoes: ['id','pacienteId','contexto','unidade','setor','leito','dataAdmissao','dataAlta','status','criadoEm','criadoPor'],
  Episodios: ['id','internacaoId','pacienteId','prioridade','solicitacao','hipoteseDiagnostica',
              'foisAdmissao','dietaAdmissao','vaaInicio','vaaConclusao','vaaJustificativa',
              'decanulacao','decanulacaoAvaliacao','decanulacaoData',
              'foisAlta','dietaAlta','status','criadoEm','criadoPor'],
  Atendimentos: ['id','episodioId','pacienteId','data','profissional','condutas','turno','obs','criadoEm','criadoPor'],
  TriagemNeonatal: ['id','pacienteId','nomeRN','prontuario','tipo','dataExame','resultado',
                    'encaminhamentoReteste','fatoresRisco','profissional','statusFollowUp','criadoEm','criadoPor'],
  Reunioes: ['id','data','quantidade','participantes','pauta','criadoEm','criadoPor']
};

const DOMINIOS = {
  perfil: ['ADMIN','COORDENACAO','FONO'],
  contexto: ['ADULTO','AMBULATÓRIO','CARDIO PEDIÁTRICA','NEONATOLOGIA'],
  sexo: ['F','M'],
  turno: ['MANHÃ','TARDE','NOITE'],
  unidades: ['5º ANDAR TORRE A','6º ANDAR TORRE A','5º ANDAR TORRE B','6º ANDAR TORRE B',
             '7º ANDAR TORRE A','7º ANDAR TORRE C','6º ANDAR TORRE C','UIB','UCP',
             'UTI 2','UTI 3','UTI 4','UTI 5','AMBULATÓRIO',
             'CARDIO PED ENFERMARIA','SEMI INTENSIVA CARDIO PED',
             'UCINCO 1','UCINCO 2','UCINCO 3','UTIN 1','UTIN 2','UTIN 3','UTIN 4','UCINCA'],
  prioridadeAdulto: [
    'P1 - PÓS-EXTUBAÇÃO','P2 - TRAQUEOSTOMIZADO','P3 - IDOSO (>60)','P4 - DISFÁGICO',
    'P5 - PÓS-CIRURGIA CABEÇA E PESCOÇO','P6 - OBESO','P7 - REBAIXAMENTO DO SENSÓRIO',
    'P8 - RESTRITO AO LEITO','P9 - REFLUXO/VÔMITOS'],
  prioridadePed: [
    'P1 - AVALIAÇÃO ORAL','P2 - TRANSIÇÃO ORAL','P3 - ALEITAMENTO MATERNO','P4 - GERENCIAMENTO'],
  solicitacao: ['BUSCA ATIVA FONO','PRESCRIÇÃO MÉDICA','INTERCONSULTA','EQUIPE MULTI'],
  fois: [
    'NÍVEL 1 - NADA POR VIA ORAL',
    'NÍVEL 2 - DEPENDENTE DE VAA, MÍNIMA VO',
    'NÍVEL 3 - DEPENDENTE DE VAA, VO CONSISTENTE',
    'NÍVEL 4 - VO TOTAL, ÚNICA CONSISTÊNCIA',
    'NÍVEL 5 - VO TOTAL, MÚLTIPLAS C/ PREPARO ESPECIAL',
    'NÍVEL 6 - VO TOTAL, MÚLTIPLAS SEM PREPARO ESPECIAL',
    'NÍVEL 7 - VO TOTAL SEM RESTRIÇÃO'],
  dietaAdmissao: ['LÍQUIDA ESPESSADA (NÉCTAR)','LÍQUIDA ESPESSADA (MEL)','LÍQUIDA ESPESSADA (PUDIM)',
    'PASTOSA','LÍQUIDA','BRANDA','GERAL','DIETA ZERO','VAA - SNE','VAA - SNG','VAA - GTT','VAA - NPT',
    'DIETA DE TRANSIÇÃO (VAA + VO)','ZERO PÓS-CIRÚRGICA','MISTA','LÍQUIDA RESTRITA',
    'SEIO MATERNO','FÓRMULA/LEITE MATERNO','SOG','MAMADEIRA/CHUCA'],
  dietaAlta: ['ALTA COM SNE','ALTA COM SNG','ALTA COM GTT','ALTA VO COM ESPESSANTE','ALTA VO PASTOSA',
    'ALTA VO LÍQUIDA','ALTA VO BRANDA','ALTA GERAL - SEM RESTRIÇÃO','PERMANÊNCIA COM SNE',
    'PERMANÊNCIA COM SNG','PERMANÊNCIA COM GTT','PERMANÊNCIA VO COM ESPESSANTE','PERMANÊNCIA VO PASTOSA',
    'PERMANÊNCIA VO BRANDA','PERMANÊNCIA VO LÍQUIDA','PERMANÊNCIA VO GERAL','PERMANECE EM DIETA ZERO','ÓBITO'],
  justificativa: ['DESMAME EM ANDAMENTO','DESMAME CONCLUÍDO','SEM CONDIÇÃO DE DESMAME NO MOMENTO',
    'PIORA CLÍNICA','MUDANÇA DE SETOR','TRANSFERÊNCIA EXTERNA','ÓBITO','DIETA MISTA','PUXOU SONDA',
    'INDICAÇÃO DE VIA ALTERNATIVA/GTT','N/A'],
  conduta: ['AVALIAÇÃO INDIRETA','AVALIAÇÃO INDIRETA - SUGERIDO SNE','TERAPIA DIRETA','TERAPIA INDIRETA',
    'TRANSIÇÃO DE VAA PARA VIA ORAL','AVALIAÇÃO DE OFAs','ESTIMULAÇÃO TÁTIL-TÉRMICA-GUSTATIVA',
    'GERENCIAR VIA','PROGREDIR CONSISTÊNCIA','ORIENTAÇÕES','APLICAÇÃO DE BANDAGEM',
    'AGUARDO LIBERAÇÃO MÉDICA','ALTA FONOAUDIOLÓGICA','ALTA HOSPITALAR','TRANSFERÊNCIA INTERNA',
    'TRANSFERÊNCIA EXTERNA','ÓBITO'],
  decanulacao: ['NÃO','SIM','TQT METAL'],
  triagemTipo: ['TESTE DA ORELHINHA','TESTE DA LINGUINHA'],
  resultadoOrelhinha: ['PASSOU','FALHOU','INCONSISTENTE','ENCAMINHADO PARA RETESTE'],
  resultadoLinguinha: ['NORMAL','DUVIDOSO','ALTERADO'],
  statusFollowUp: ['CONCLUÍDO','AGUARDANDO RETESTE','EM ACOMPANHAMENTO']
};

/* ============================ WEB ENTRY ============================ */

function doGet() {
  ensureSetup_();
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle(APP.nome)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ============================ SETUP ============================ */

function setup() {
  const info = ensureSetup_(true);
  Logger.log(JSON.stringify(info));
  return info;
}

function ensureSetup_(force) {
  const ss = getSS_();
  Object.keys(SHEETS).forEach(function(name) {
    let sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      sh.getRange(1, 1, 1, SHEETS[name].length).setValues([SHEETS[name]]).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
  });
  // remove a "Página1"/"Sheet1" vazia padrão se existir
  ['Página1','Sheet1','Planilha1'].forEach(function(n){
    const s = ss.getSheetByName(n);
    if (s && s.getLastRow() === 0 && ss.getSheets().length > 1) { try { ss.deleteSheet(s); } catch(e){} }
  });

  const usuarios = sheetToObjects_('Usuarios');
  let seededAdmin = false;
  if (usuarios.length === 0) {
    const salt = Utilities.getUuid();
    appendRow_('Usuarios', {
      id: 1, nome: 'Administrador', login: APP.adminLogin,
      senhaHash: hash_(APP.adminSenhaInicial, salt), salt: salt,
      perfil: 'ADMIN', ativo: true, primeiroAcesso: true, criadoEm: new Date()
    });
    seededAdmin = true;
  }
  return { ok: true, seededAdmin: seededAdmin,
    login: seededAdmin ? APP.adminLogin : null,
    senhaInicial: seededAdmin ? APP.adminSenhaInicial : null };
}

/* ============================ SHEET HELPERS ============================ */

function getSS_() {
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  const id = PropertiesService.getScriptProperties().getProperty('SS_ID');
  if (id) return SpreadsheetApp.openById(id);
  throw new Error('Nenhuma planilha vinculada. Rode este script a partir da planilha (Extensões > Apps Script).');
}

function getSheet_(name) {
  const sh = getSS_().getSheetByName(name);
  if (!sh) throw new Error('Aba não encontrada: ' + name);
  return sh;
}

function sheetToObjects_(name) {
  const sh = getSheet_(name);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const head = values[0];
  const out = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    if (row.join('') === '') continue;
    const o = {};
    head.forEach(function(h, i){ o[h] = row[i]; });
    o._row = r + 1;
    out.push(o);
  }
  return out;
}

function nextId_(name) {
  const objs = sheetToObjects_(name);
  let max = 0;
  objs.forEach(function(o){ const n = Number(o.id) || 0; if (n > max) max = n; });
  return max + 1;
}

function appendRow_(name, obj) {
  const sh = getSheet_(name);
  const head = SHEETS[name];
  const row = head.map(function(h){ return obj[h] === undefined ? '' : obj[h]; });
  sh.appendRow(row);
  return obj;
}

function updateRow_(name, rowNumber, obj) {
  const sh = getSheet_(name);
  const head = SHEETS[name];
  const cur = sh.getRange(rowNumber, 1, 1, head.length).getValues()[0];
  const row = head.map(function(h, i){ return obj[h] === undefined ? cur[i] : obj[h]; });
  sh.getRange(rowNumber, 1, 1, head.length).setValues([row]);
  return obj;
}

/* ============================ AUTH ============================ */

function hash_(senha, salt) {
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(senha) + '::' + salt);
  return raw.map(function(b){ return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
}

function login(loginStr, senha) {
  ensureSetup_();
  const u = sheetToObjects_('Usuarios').filter(function(x){
    return String(x.login).toLowerCase() === String(loginStr || '').toLowerCase();
  })[0];
  if (!u || !u.ativo) return { ok: false, erro: 'Usuário ou senha inválidos.' };
  if (hash_(senha, u.salt) !== u.senhaHash) return { ok: false, erro: 'Usuário ou senha inválidos.' };
  const token = Utilities.getUuid();
  CacheService.getScriptCache().put('sess_' + token,
    JSON.stringify({ id: u.id, login: u.login, nome: u.nome, perfil: u.perfil }),
    APP.sessaoHoras * 3600);
  return { ok: true, token: token, primeiroAcesso: !!u.primeiroAcesso,
    user: { id: u.id, nome: u.nome, login: u.login, perfil: u.perfil } };
}

function sessao_(token) {
  const raw = CacheService.getScriptCache().get('sess_' + token);
  if (!raw) throw new Error('SESSAO_EXPIRADA');
  // renova o tempo de vida
  CacheService.getScriptCache().put('sess_' + token, raw, APP.sessaoHoras * 3600);
  return JSON.parse(raw);
}

function exigePerfil_(sess, perfis) {
  if (perfis.indexOf(sess.perfil) < 0) throw new Error('SEM_PERMISSAO');
}

function logout(token) {
  CacheService.getScriptCache().remove('sess_' + token);
  return { ok: true };
}

function trocarSenha(token, novaSenha) {
  const sess = sessao_(token);
  if (!novaSenha || String(novaSenha).length < 6)
    return { ok: false, erro: 'A senha precisa ter ao menos 6 caracteres.' };
  const u = sheetToObjects_('Usuarios').filter(function(x){ return Number(x.id) === Number(sess.id); })[0];
  if (!u) return { ok: false, erro: 'Usuário não encontrado.' };
  const salt = Utilities.getUuid();
  updateRow_('Usuarios', u._row, { senhaHash: hash_(novaSenha, salt), salt: salt, primeiroAcesso: false });
  return { ok: true };
}

/* ============================ BOOTSTRAP ============================ */

function apiBootstrap(token) {
  const sess = sessao_(token);
  return { ok: true, user: sess, dominios: DOMINIOS };
}

/* ============================ PACIENTES ============================ */

function listPacientes(token, q) {
  sessao_(token);
  q = String(q || '').toLowerCase().trim();
  let lista = sheetToObjects_('Pacientes');
  if (q) lista = lista.filter(function(p){
    return String(p.nome).toLowerCase().indexOf(q) >= 0 ||
           String(p.prontuario).toLowerCase().indexOf(q) >= 0;
  });
  lista.sort(function(a,b){ return String(a.nome).localeCompare(String(b.nome)); });
  return { ok: true, pacientes: lista.slice(0, 200) };
}

function savePaciente(token, obj) {
  const sess = sessao_(token);
  const lock = LockService.getScriptLock(); lock.tryLock(10000);
  try {
    if (obj.id) {
      const p = sheetToObjects_('Pacientes').filter(function(x){ return Number(x.id) === Number(obj.id); })[0];
      if (!p) return { ok:false, erro:'Paciente não encontrado.' };
      updateRow_('Pacientes', p._row, obj);
      return { ok: true, id: obj.id };
    }
    const id = nextId_('Pacientes');
    appendRow_('Pacientes', {
      id: id, nome: obj.nome, prontuario: obj.prontuario, sexo: obj.sexo,
      dataNascimento: obj.dataNascimento || '', criadoEm: new Date(), criadoPor: sess.nome
    });
    return { ok: true, id: id };
  } finally { lock.releaseLock(); }
}

/* ============================ INTERNAÇÕES ============================ */

function admitir(token, obj) {
  const sess = sessao_(token);
  const id = nextId_('Internacoes');
  appendRow_('Internacoes', {
    id: id, pacienteId: obj.pacienteId, contexto: obj.contexto, unidade: obj.unidade,
    setor: obj.setor || '', leito: obj.leito || '', dataAdmissao: obj.dataAdmissao || new Date(),
    dataAlta: '', status: 'ATIVA', criadoEm: new Date(), criadoPor: sess.nome
  });
  return { ok: true, id: id };
}

function darAlta(token, internacaoId, data) {
  const sess = sessao_(token);
  const i = sheetToObjects_('Internacoes').filter(function(x){ return Number(x.id) === Number(internacaoId); })[0];
  if (!i) return { ok:false, erro:'Internação não encontrada.' };
  updateRow_('Internacoes', i._row, { dataAlta: data || new Date(), status: 'ALTA' });
  return { ok: true };
}

/* ============================ EPISÓDIOS + FILA ============================ */

function saveEpisodio(token, obj) {
  const sess = sessao_(token);
  const lock = LockService.getScriptLock(); lock.tryLock(10000);
  try {
    if (obj.id) {
      const e = sheetToObjects_('Episodios').filter(function(x){ return Number(x.id) === Number(obj.id); })[0];
      if (!e) return { ok:false, erro:'Episódio não encontrado.' };
      updateRow_('Episodios', e._row, obj);
      return { ok:true, id: obj.id };
    }
    const id = nextId_('Episodios');
    obj.id = id; obj.status = obj.status || 'ABERTO'; obj.criadoEm = new Date(); obj.criadoPor = sess.nome;
    appendRow_('Episodios', obj);
    return { ok:true, id:id };
  } finally { lock.releaseLock(); }
}

function getFicha(token, episodioId) {
  sessao_(token);
  const e = sheetToObjects_('Episodios').filter(function(x){ return Number(x.id) === Number(episodioId); })[0];
  if (!e) return { ok:false, erro:'Episódio não encontrado.' };
  const p = sheetToObjects_('Pacientes').filter(function(x){ return Number(x.id) === Number(e.pacienteId); })[0] || {};
  const i = sheetToObjects_('Internacoes').filter(function(x){ return Number(x.id) === Number(e.internacaoId); })[0] || {};
  const at = sheetToObjects_('Atendimentos')
    .filter(function(x){ return Number(x.episodioId) === Number(episodioId); })
    .sort(function(a,b){ return new Date(b.data) - new Date(a.data); });
  return { ok:true, episodio:e, paciente:p, internacao:i, atendimentos:at };
}

function listFila(token, filtro) {
  sessao_(token);
  filtro = filtro || {};
  const pacientes = indexById_(sheetToObjects_('Pacientes'));
  const internacoes = sheetToObjects_('Internacoes').filter(function(i){ return i.status === 'ATIVA'; });
  const episodios = sheetToObjects_('Episodios').filter(function(e){ return e.status === 'ABERTO'; });
  const epByInt = {};
  episodios.forEach(function(e){ epByInt[e.internacaoId] = e; });

  let linhas = internacoes.map(function(i){
    const p = pacientes[i.pacienteId] || {};
    const e = epByInt[i.id] || null;
    return {
      internacaoId: i.id, episodioId: e ? e.id : null,
      pacienteId: i.pacienteId, nome: p.nome, prontuario: p.prontuario, sexo: p.sexo,
      contexto: i.contexto, unidade: i.unidade, setor: i.setor, leito: i.leito,
      prioridade: e ? e.prioridade : '', foisAdmissao: e ? e.foisAdmissao : '',
      decanulacao: e ? e.decanulacao : '', temEpisodio: !!e
    };
  });

  if (filtro.contexto) linhas = linhas.filter(function(l){ return l.contexto === filtro.contexto; });
  if (filtro.unidade)  linhas = linhas.filter(function(l){ return l.unidade === filtro.unidade; });

  linhas.sort(function(a,b){
    const pa = prioNum_(a.prioridade), pb = prioNum_(b.prioridade);
    if (pa !== pb) return pa - pb;
    return String(a.nome).localeCompare(String(b.nome));
  });
  return { ok:true, fila: linhas };
}

function prioNum_(p) {
  const m = String(p || '').match(/P?(\d+)/);
  return m ? Number(m[1]) : 99;
}

/* ============================ ATENDIMENTOS ============================ */

function registrarAtendimento(token, obj) {
  const sess = sessao_(token);
  const id = nextId_('Atendimentos');
  appendRow_('Atendimentos', {
    id: id, episodioId: obj.episodioId, pacienteId: obj.pacienteId,
    data: obj.data || new Date(),
    profissional: obj.profissional || sess.nome,
    condutas: (obj.condutas || []).join(' | '),
    turno: obj.turno || '', obs: obj.obs || '',
    criadoEm: new Date(), criadoPor: sess.nome
  });
  return { ok:true, id:id };
}

/* ============================ TRIAGEM NEONATAL ============================ */

function saveTriagem(token, obj) {
  const sess = sessao_(token);
  const id = nextId_('TriagemNeonatal');
  obj.id = id; obj.criadoEm = new Date(); obj.criadoPor = sess.nome;
  if (Array.isArray(obj.fatoresRisco)) obj.fatoresRisco = obj.fatoresRisco.join(' | ');
  appendRow_('TriagemNeonatal', obj);
  return { ok:true, id:id };
}

function listTriagem(token, filtro) {
  sessao_(token);
  filtro = filtro || {};
  let lista = sheetToObjects_('TriagemNeonatal');
  if (filtro.tipo) lista = lista.filter(function(t){ return t.tipo === filtro.tipo; });
  if (filtro.pendentes) lista = lista.filter(function(t){
    return String(t.encaminhamentoReteste).toUpperCase() === 'SIM' &&
           String(t.statusFollowUp).toUpperCase() !== 'CONCLUÍDO';
  });
  lista.sort(function(a,b){ return new Date(b.dataExame) - new Date(a.dataExame); });
  return { ok:true, triagens: lista.slice(0, 300) };
}

/* ============================ REUNIÕES ============================ */

function saveReuniao(token, obj) {
  const sess = sessao_(token);
  const id = nextId_('Reunioes');
  appendRow_('Reunioes', {
    id:id, data: obj.data || new Date(), quantidade: obj.quantidade || 1,
    participantes: obj.participantes || 0, pauta: obj.pauta || '',
    criadoEm: new Date(), criadoPor: sess.nome
  });
  return { ok:true, id:id };
}

function listReunioes(token) {
  sessao_(token);
  const lista = sheetToObjects_('Reunioes').sort(function(a,b){ return new Date(b.data) - new Date(a.data); });
  return { ok:true, reunioes: lista };
}

/* ============================ USUÁRIOS (ADMIN) ============================ */

function listUsuarios(token) {
  const sess = sessao_(token); exigePerfil_(sess, ['ADMIN']);
  const lista = sheetToObjects_('Usuarios').map(function(u){
    return { id:u.id, nome:u.nome, login:u.login, perfil:u.perfil, ativo:u.ativo,
             primeiroAcesso:u.primeiroAcesso };
  });
  return { ok:true, usuarios: lista };
}

function saveUsuario(token, obj) {
  const sess = sessao_(token); exigePerfil_(sess, ['ADMIN']);
  const lock = LockService.getScriptLock(); lock.tryLock(10000);
  try {
    const todos = sheetToObjects_('Usuarios');
    if (obj.id) {
      const u = todos.filter(function(x){ return Number(x.id) === Number(obj.id); })[0];
      if (!u) return { ok:false, erro:'Usuário não encontrado.' };
      const patch = { nome: obj.nome, perfil: obj.perfil, ativo: obj.ativo };
      if (obj.senha) { const salt = Utilities.getUuid();
        patch.senhaHash = hash_(obj.senha, salt); patch.salt = salt; patch.primeiroAcesso = true; }
      updateRow_('Usuarios', u._row, patch);
      return { ok:true, id: obj.id };
    }
    if (todos.some(function(x){ return String(x.login).toLowerCase() === String(obj.login).toLowerCase(); }))
      return { ok:false, erro:'Já existe usuário com esse login.' };
    const id = nextId_('Usuarios');
    const salt = Utilities.getUuid();
    appendRow_('Usuarios', {
      id:id, nome:obj.nome, login:obj.login, senhaHash: hash_(obj.senha || 'huc@2026', salt),
      salt:salt, perfil: obj.perfil || 'FONO', ativo: true, primeiroAcesso: true, criadoEm: new Date()
    });
    return { ok:true, id:id };
  } finally { lock.releaseLock(); }
}

/* ============================ DASHBOARD ============================ */

function dashboard(token, filtro) {
  sessao_(token);
  filtro = filtro || {};
  const de = filtro.de ? new Date(filtro.de) : new Date('2000-01-01');
  const ate = filtro.ate ? new Date(filtro.ate + 'T23:59:59') : new Date('2999-01-01');
  const noPeriodo = function(d){ const x = new Date(d); return x >= de && x <= ate; };

  const internacoes = sheetToObjects_('Internacoes');
  const episodios = sheetToObjects_('Episodios');
  const atend = sheetToObjects_('Atendimentos').filter(function(a){ return noPeriodo(a.data); });
  const triag = sheetToObjects_('TriagemNeonatal').filter(function(t){ return noPeriodo(t.dataExame); });
  const reun = sheetToObjects_('Reunioes').filter(function(r){ return noPeriodo(r.data); });

  const ativos = internacoes.filter(function(i){ return i.status === 'ATIVA'; }).length;

  // FOIS admissão (distribuição por nível)
  const foisDist = {};
  for (let n = 1; n <= 7; n++) foisDist['N' + n] = 0;
  episodios.forEach(function(e){ const m = String(e.foisAdmissao).match(/NÍVEL (\d)/);
    if (m) foisDist['N' + m[1]]++; });

  // Evolução FOIS: média admissão vs alta (só episódios com alta)
  const nivel = function(v){ const m = String(v).match(/NÍVEL (\d)/); return m ? Number(m[1]) : null; };
  let somaAdm = 0, somaAlta = 0, nEvo = 0;
  episodios.forEach(function(e){
    const a = nivel(e.foisAdmissao), b = nivel(e.foisAlta);
    if (a && b) { somaAdm += a; somaAlta += b; nEvo++; }
  });

  // Tempo médio de desmame de VAA (dias)
  let somaDias = 0, nDesmame = 0;
  episodios.forEach(function(e){
    if (e.vaaInicio && e.vaaConclusao) {
      const d = (new Date(e.vaaConclusao) - new Date(e.vaaInicio)) / 86400000;
      if (d >= 0) { somaDias += d; nDesmame++; }
    }
  });

  // Taxa de decanulação
  const emProtocolo = episodios.filter(function(e){ return String(e.decanulacao).toUpperCase() === 'SIM'; });
  const decanulados = emProtocolo.filter(function(e){ return e.decanulacaoData; }).length;

  // Produção por profissional
  const prod = {};
  atend.forEach(function(a){ const k = a.profissional || '—'; prod[k] = (prod[k] || 0) + 1; });
  const producao = Object.keys(prod).map(function(k){ return { nome:k, total:prod[k] }; })
    .sort(function(a,b){ return b.total - a.total; });

  // Triagem
  const okResultado = function(r){ const s = String(r).toUpperCase(); return s === 'PASSOU' || s === 'NORMAL'; };
  const triagOk = triag.filter(function(t){ return okResultado(t.resultado); }).length;
  const triagPend = triag.filter(function(t){
    return String(t.encaminhamentoReteste).toUpperCase() === 'SIM' &&
           String(t.statusFollowUp).toUpperCase() !== 'CONCLUÍDO'; }).length;

  return { ok:true, kpis: {
    pacientesAtivos: ativos,
    atendimentosPeriodo: atend.length,
    foisDist: foisDist,
    foisMediaAdmissao: nEvo ? +(somaAdm / nEvo).toFixed(1) : null,
    foisMediaAlta: nEvo ? +(somaAlta / nEvo).toFixed(1) : null,
    foisEvolucaoN: nEvo,
    tempoMedioDesmame: nDesmame ? +(somaDias / nDesmame).toFixed(1) : null,
    desmamesN: nDesmame,
    decanulacaoProtocolo: emProtocolo.length,
    decanulacaoConcluidas: decanulados,
    producao: producao.slice(0, 15),
    triagemTotal: triag.length,
    triagemOk: triagOk,
    triagemPendentes: triagPend,
    reunioes: reun.length,
    reunioesParticipantes: reun.reduce(function(s,r){ return s + (Number(r.participantes) || 0); }, 0)
  }};
}

/* ============================ UTIL ============================ */

function indexById_(arr) {
  const m = {}; arr.forEach(function(o){ m[o.id] = o; }); return m;
}
