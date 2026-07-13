/*************************************************************************
 * FONO ANALYTICS — Gestão de Fonoaudiologia Hospitalar
 * Google Apps Script (servidor)
 *
 * Como instalar:
 *  1. Crie (ou abra) uma planilha no Google Sheets — ela será o banco de dados.
 *  2. Extensões > Apps Script.
 *  3. Cole este arquivo como "Code.gs" e crie um arquivo HTML chamado "index".
 *  4. Execute a função setup() uma vez (autorize os acessos).
 *  5. Implantar > Nova implantação > tipo "App da Web":
 *       - Executar como: Eu
 *       - Quem tem acesso: conforme a política do hospital
 *
 * Primeiro acesso (criado pelo setup):
 *     usuário: admin
 *     senha:   fono@2026   (o app obriga a trocar no primeiro login)
 *
 * TUDO é configurável pela tela "Configurações" do app:
 * nome do hospital, serviços, setores, listas clínicas e usuários —
 * o sistema pode ser implantado em qualquer hospital sem tocar no código.
 *************************************************************************/

/* ============================ CONFIG ============================ */

const APP = {
  nome: 'Fono Analytics',
  // CacheService limita cada entrada a 6 h (21600 s) — valores maiores são
  // reduzidos em silêncio. A sessão é renovada a cada chamada (ver sessao_),
  // então 6 h é o tempo máximo OCIOSO; quem está usando não é deslogado.
  sessaoHoras: 6,
  adminLogin: 'admin',
  adminSenhaInicial: 'fono@2026',
  loginMaxTentativas: 5,   // erros de senha seguidos por login antes do bloqueio
  loginBloqueioMin: 10     // minutos de bloqueio após exceder as tentativas
};

// Tipos de serviço: controlam quais campos clínicos o formulário mostra.
const TIPOS_SERVICO = ['ADULTO', 'INFANTIL', 'AMBULATORIO'];

const SHEETS = {
  Config:    ['chave', 'valor'],
  Usuarios:  ['id','nome','login','senhaHash','salt','perfil','ehFono','ativo','primeiroAcesso','criadoEm'],
  Servicos:  ['id','nome','tipo','ordem','ativo'],
  Setores:   ['id','servicoId','nome','ordem','ativo'],
  Listas:    ['id','categoria','tipoServico','valor','ordem','ativo'],
  Pacientes: ['id','nome','prontuario','sexo','dataNascimento','criadoEm','criadoPor'],
  Episodios: ['id','pacienteId','servicoId','setorId','leito','status','dataAdmissao','dataSaida',
              'idade','idadeGestacional','prioridade','solicitacao','hipoteseDiagnostica',
              'foisAdmissao','foisAlta','dietaAdmissao','dietaSaida','utensilio',
              'vaaInicio','vaaConclusao','vaaJustificativa',
              'decanulacaoProtocolo','decanulacaoAvaliacao','decanulacaoData',
              'altaFono','obs','criadoEm','criadoPor'],
  Atendimentos: ['id','episodioId','data','procedimentos','profissional','extra','obs','criadoEm','criadoPor'],
  Triagens:  ['id','tipo','nome','prontuario','sexo','dataNascimento','leito','dataExame',
              'resultado','resultadoBera','encReteste','encBera','encFrenotomia','frenotomiaHospital',
              'necessidadeAcompanhamento','conduta','localFrenotomia','fatoresRisco',
              'procedimentos','profissional','criadoEm','criadoPor'],
  Reunioes:  ['id','data','setor','fonoaudiologo','participantes','pauta','criadoEm','criadoPor']
};

/* ===================== SEEDS (dados iniciais — tudo editável no app) ===================== */

const SEED_CONFIG = {
  hospitalNome: 'HUC — Hospital Universitário',
  servicoLabel: 'Serviço de Fonoaudiologia',
  corPrimaria: '#0e5f6a'   // cor institucional — toda a interface deriva dela
};

const SEED_SERVICOS = [
  { nome: 'ADULTO',           tipo: 'ADULTO' },
  { nome: 'NEONATOLOGIA',     tipo: 'INFANTIL' },
  { nome: 'CARDIOPEDIATRIA',  tipo: 'INFANTIL' },
  { nome: 'AMBULATÓRIO',      tipo: 'AMBULATORIO' }
];

const SEED_SETORES = {
  'ADULTO': ['UCP 5º ANDAR TORRE A','5º ANDAR TORRE A','6º ANDAR TORRE A','7º ANDAR TORRE A',
             '5º ANDAR TORRE B','6º ANDAR TORRE B','6º ANDAR TORRE C','7º ANDAR TORRE C',
             'UIB','UTI 2','UTI 3','UTI 4','UTI 5'],
  'NEONATOLOGIA': ['UTIN 1','UTIN 2','UTIN 3','UTIN 4','UCINCO 1','UCINCO 2','UCINCO 3','UCINCA','FOLLOW-UP'],
  'CARDIOPEDIATRIA': ['CARDIO PED ENFERMARIA','SEMI INTENSIVA CARDIO PED'],
  'AMBULATÓRIO': ['CABEÇA E PESCOÇO','GERIATRIA','BARIÁTRICA']
};

// categoria -> { tipoServico ('' = todos) -> [valores] }
const SEED_LISTAS = {
  PRIORIDADE: {
    'ADULTO': [
      'PRIORIDADE 1 - PACIENTE PÓS EXTUBAÇÃO',
      'PRIORIDADE 2 - PACIENTE TRAQUEOSTOMIZADO',
      'PRIORIDADE 3 - PACIENTE IDOSO (>60 ANOS)',
      'PRIORIDADE 4 - PACIENTE DISFÁGICO',
      'PRIORIDADE 5 - PACIENTE APÓS CIRURGIA DE CABEÇA E PESCOÇO',
      'PRIORIDADE 6 - PACIENTE OBESO',
      'PRIORIDADE 7 - PACIENTE COM REBAIXAMENTO DO SENSÓRIO',
      'PRIORIDADE 8 - PACIENTE RESTRITO AO LEITO',
      'PRIORIDADE 9 - PACIENTE COM PRESENÇA DE REFLUXO OU VÔMITOS',
      'PRIORIDADE PACIENTE DE VAA (SNE/SNG/GTT)'
    ],
    'INFANTIL': [
      'PRIORIDADE 1 - AVALIAÇÃO ORAL',
      'PRIORIDADE 2 - TRANSIÇÃO ORAL',
      'PRIORIDADE 3 - ALEITAMENTO MATERNO',
      'PRIORIDADE 4 - GERENCIAMENTO'
    ],
    'AMBULATORIO': [
      'PRIORIDADE 1 - PACIENTE PÓS EXTUBAÇÃO',
      'PRIORIDADE 2 - PACIENTE TRAQUEOSTOMIZADO',
      'PRIORIDADE 3 - PACIENTE IDOSO (>60 ANOS)',
      'PRIORIDADE 4 - PACIENTE DISFÁGICO',
      'PRIORIDADE 5 - PACIENTE APÓS CIRURGIA DE CABEÇA E PESCOÇO',
      'PRIORIDADE 6 - PACIENTE OBESO'
    ]
  },
  SOLICITACAO: {
    '': ['BUSCA ATIVA FONO','PRESCRIÇÃO MÉDICA','INTERCONSULTA','EQUIPE MULTI']
  },
  FOIS: {
    '': [
      'NADA POR VIA ORAL - NÍVEL 1',
      'DEPENDENTE DE VAA E MÍNIMA VIA ORAL DE ALGUM ALIMENTO OU LÍQUIDO - NÍVEL 2',
      'DEPENDENTE DE VAA COM CONSISTENTE VIA ORAL DE ALIMENTO OU LÍQUIDO - NÍVEL 3',
      'VIA ORAL TOTAL DE UMA ÚNICA CONSISTÊNCIA - NÍVEL 4',
      'VIA ORAL TOTAL DE MÚLTIPLAS CONSISTÊNCIAS, PORÉM COM NECESSIDADE DE PREPARO ESPECIAL OU COMPENSAÇÕES - NÍVEL 5',
      'VIA ORAL TOTAL COM MÚLTIPLAS CONSISTÊNCIAS, PORÉM SEM NECESSIDADE DE PREPARO ESPECIAL - NÍVEL 6',
      'VIA ORAL TOTAL SEM RESTRIÇÕES - NÍVEL 7'
    ]
  },
  DIETA_ADMISSAO: {
    'ADULTO': ['LÍQUIDA ESPESSADA (NÉCTAR)','LÍQUIDA ESPESSADA (MEL)','LÍQUIDA ESPESSADA (PUDIM)',
      'PASTOSA','LÍQUIDA','LÍQUIDA RESTRITA','BRANDA','GERAL','MISTA','DIETA ZERO','ZERO PÓS-CIRÚRGICA',
      'VAA - SNE','VAA - SNG','VAA - GTT','VAA - NPT','DIETA DE TRANSIÇÃO (VAA + VO)'],
    'INFANTIL': ['SEIO MATERNO','LEITE AR','FÓRMULA/LEITE MATERNO/LHP','MAMADEIRA/CHUCA','SOG','SNE',
      'DIETA ZERO','ZERO PÓS-CIRÚRGICA','VAA - SNG','VAA - GTT','VAA - NPT','DIETA DE TRANSIÇÃO (VAA + VO)'],
    'AMBULATORIO': ['LÍQUIDA ESPESSADA (NÉCTAR)','LÍQUIDA ESPESSADA (MEL)','LÍQUIDA ESPESSADA (PUDIM)',
      'PASTOSA','LÍQUIDA','LÍQUIDA RESTRITA','BRANDA','GERAL','MISTA','DIETA ZERO',
      'VAA - SNE','VAA - SNG','VAA - GTT','DIETA DE TRANSIÇÃO (VAA + VO)']
  },
  DIETA_SAIDA: {
    '': ['ALTA COM SNE','ALTA COM SNG','ALTA COM GTT','ALTA VIA ORAL COM ESPESSANTE','ALTA VO PASTOSA',
      'ALTA VO LÍQUIDA','ALTA VO BRANDA','ALTA GERAL - SEM RESTRIÇÃO DE CONSISTÊNCIAS',
      'PERMANÊNCIA COM SNE','PERMANÊNCIA COM SNG','PERMANÊNCIA COM GTT','PERMANÊNCIA VIA ORAL COM ESPESSANTE',
      'PERMANÊNCIA VO PASTOSA','PERMANÊNCIA VO BRANDA','PERMANÊNCIA VO LÍQUIDA','PERMANÊNCIA VO GERAL',
      'PERMANECE EM DIETA ZERO','ALTA DE NPT','PERMANECE DE NPT','ÓBITO']
  },
  JUSTIFICATIVA_DESMAME: {
    '': ['DESMAME EM ANDAMENTO','DESMAME CONCLUÍDO','SEM CONDIÇÃO DE DESMAME NO MOMENTO','PIORA CLÍNICA',
      'MUDANÇA DE SETOR','TRANSFERÊNCIA EXTERNA','ÓBITO','DIETA MISTA','PUXOU SONDA',
      'INDICAÇÃO DE VIA ALTERNATIVA/GTT','N/A']
  },
  PROCEDIMENTO: {
    'ADULTO': ['AVALIAÇÃO INDIRETA','AVALIAÇÃO INDIRETA - SUGERIDO SNE','TERAPIA DIRETA','TERAPIA INDIRETA',
      "AVALIAÇÃO DE OFA'S",'ESTIMULAÇÃO TÁTIL - TÉRMICA - GUSTATIVA','TRANSIÇÃO DE VIA ALTERNATIVA PARA VIA ORAL',
      'AVALIAÇÃO LÍQUIDO ESPESSADO (NÉCTAR)','AVALIAÇÃO LÍQUIDO ESPESSADO (MEL)','MANTIDA DIETA ESPESSADA',
      'ESTIMULAR DEGLUTIÇÃO','ORIENTAÇÕES','GERENCIAMENTO','PROGREDIR CONSISTÊNCIA',
      'AGUARDO LIBERAÇÃO MÉDICA PARA AVALIAR','REBAIXAMENTO DO SENSÓRIO','APLICAÇÃO DE BANDAGEM',
      'ALTA FONOAUDIOLÓGICA','ALTA HOSPITALAR','TRANSFERÊNCIA INTERNA','TRANSFERÊNCIA EXTERNA','ÓBITO'],
    'INFANTIL': ['AMAMENTAÇÃO','ORIENTAÇÕES','GERENCIAMENTO','TERAPIA DIRETA','TERAPIA INDIRETA',
      'DESMAME DE VIA ALTERNATIVA','AVALIAÇÃO DE OFAS','OFERTA DE VIA ORAL','GAVAGEM','SUCÇÃO NÃO NUTRITIVA',
      'ESTIMULAÇÃO TÁTIL - TÉRMICA - GUSTATIVA','APLICAÇÃO DE BANDAGEM','INSTABILIDADE CLÍNICA','DIETA ZERO',
      'AGUARDO LIBERAÇÃO MÉDICA','REPASSAR SONDA','ALTA FONO','ALTA HOSPITALAR','ÓBITO'],
    'AMBULATORIO': ['AVALIAÇÃO INDIRETA','TERAPIA DIRETA','TERAPIA INDIRETA',"AVALIAÇÃO DE OFA'S",
      'AVALIAÇÃO SÓLIDO','AVALIAÇÃO LÍQUIDO','ESTIMULAR DEGLUTIÇÃO','ESTIMULAÇÃO TÁTIL - TÉRMICA - GUSTATIVA',
      'ORIENTAÇÕES','TREINO VOCAL','ALTA FONOAUDIOLÓGICA','FALTOU','REMARCADO']
  },
  UTENSILIO: {
    'INFANTIL': ['COPO','MAMADEIRA/CHUCA','AME','AM + COMPLEMENTO','SUCÇÃO SNN','SUCÇÃO NUTRITIVA',
      'SERINGA','COLHER','DIETA POR SOG','SNE']
  },
  DECANULACAO: { '': ['NÃO','SIM','TQT METAL'] },
  RESULTADO_ORELHINHA: { '': ['PASSOU','FALHOU','INCONSISTENTE','ENCAMINHADO PARA RETESTE'] },
  RESULTADO_LINGUINHA: { '': ['NORMAL','DUVIDOSO','ALTERADO'] },
  RESULTADO_BERA: { '': ['PASSOU','FALHOU','NÃO REALIZADO'] },
  PROC_ORELHINHA: { '': ['ANAMNESE','INSPEÇÃO DE CAE','MEATOSCOPIA','REALIZAÇÃO DAS EOA','ORIENTAÇÕES'] },
  PROC_LINGUINHA: { '': ['AVALIAÇÃO DE FRÊNULO','AVALIAÇÃO DE SUCÇÃO','AVALIAÇÃO DE OFAS',
    'AVALIAÇÃO DE PADRÃO RESPIRATÓRIO','ESTIMULAÇÃO TÁTIL - TÉRMICA - GUSTATIVA','AVALIAÇÃO INDIRETA',
    'TERAPIA FONOAUDIOLÓGICA','OBSERVAÇÃO FUNCIONAL','ALTA FONOAUDIOLÓGICA'] },
  FATOR_RISCO: { '': ['PERMANÊNCIA EM UTI NEONATAL > 5 DIAS','HIPERBILIRRUBINEMIA','MEDICAÇÃO OTOTÓXICA',
    'VENTILAÇÃO MECÂNICA','PESO < 1.500g','INFECÇÃO CONGÊNITA','SÍNDROME GENÉTICA',
    'HISTÓRICO FAMILIAR DE SURDEZ','ANOMALIA CRANIOFACIAL'] },
  LOCAL_FRENOTOMIA: { '': ['NO HOSPITAL','AMBULATÓRIO','REDE EXTERNA','NÃO REALIZADA'] }
};

/* ============================ WEB ENTRY ============================ */

function doGet() {
  ensureSetup_();
  return HtmlService.createTemplateFromFile('index').evaluate()
    .setTitle(APP.nome)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* Dados públicos injetados no HTML antes do login: identidade visual do
   hospital (nome + cor). Nada sensível — serve para a tela de login já
   abrir com a marca do hospital, sem esperar o bootstrap autenticado. */
function bootJson_() {
  const config = {};
  sheetToObjects_('Config').forEach(function(c) { config[c.chave] = c.valor; });
  return JSON.stringify({
    hospitalNome: String(config.hospitalNome || ''),
    corPrimaria: String(config.corPrimaria || '')
  }).replace(/</g, '\\u003c');
}

/* ============================ SETUP ============================ */

function setup() {
  const info = ensureSetup_(true);
  Logger.log(JSON.stringify(info));
  return info;
}

/* Carimbo do setup: quando é igual ao valor gravado nas ScriptProperties, o
   ensureSetup_ retorna na hora, sem varrer a planilha — isso corta segundos
   do doGet() e do login(). Mude o valor ao alterar os SEEDs para que
   implantações existentes reexecutem o setup completo no próximo acesso. */
const SETUP_STAMP = 'v2';

function ensureSetup_(force) {
  const props = PropertiesService.getScriptProperties();
  if (!force && props.getProperty('SETUP_OK') === SETUP_STAMP)
    return { ok: true, seededAdmin: false, login: null, senhaInicial: null };
  const ss = getSS_();
  Object.keys(SHEETS).forEach(function(name) {
    let sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      sh.getRange(1, 1, 1, SHEETS[name].length).setValues([SHEETS[name]]).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
  });
  ['Página1','Sheet1','Planilha1'].forEach(function(n) {
    const s = ss.getSheetByName(n);
    if (s && s.getLastRow() === 0 && ss.getSheets().length > 1) { try { ss.deleteSheet(s); } catch (e) {} }
  });

  // Config
  const cfg = sheetToObjects_('Config');
  Object.keys(SEED_CONFIG).forEach(function(k) {
    if (!cfg.some(function(c) { return c.chave === k; }))
      appendRow_('Config', { chave: k, valor: SEED_CONFIG[k] });
  });

  // Admin
  let seededAdmin = false;
  if (sheetToObjects_('Usuarios').length === 0) {
    const salt = Utilities.getUuid();
    appendRow_('Usuarios', {
      id: 1, nome: 'Administrador', login: APP.adminLogin,
      senhaHash: hash_(APP.adminSenhaInicial, salt), salt: salt,
      perfil: 'ADMIN', ehFono: false, ativo: true, primeiroAcesso: true, criadoEm: new Date()
    });
    seededAdmin = true;
  }

  // Serviços + setores
  if (sheetToObjects_('Servicos').length === 0) {
    let sid = 0, stId = 0;
    SEED_SERVICOS.forEach(function(sv, i) {
      sid++;
      appendRow_('Servicos', { id: sid, nome: sv.nome, tipo: sv.tipo, ordem: i + 1, ativo: true });
      (SEED_SETORES[sv.nome] || []).forEach(function(nome, j) {
        stId++;
        appendRow_('Setores', { id: stId, servicoId: sid, nome: nome, ordem: j + 1, ativo: true });
      });
    });
  }

  // Listas
  if (sheetToObjects_('Listas').length === 0) {
    let id = 0;
    const rows = [];
    Object.keys(SEED_LISTAS).forEach(function(cat) {
      Object.keys(SEED_LISTAS[cat]).forEach(function(tipo) {
        SEED_LISTAS[cat][tipo].forEach(function(valor, i) {
          id++;
          rows.push([id, cat, tipo, valor, i + 1, true]);
        });
      });
    });
    if (rows.length) {
      getSheet_('Listas').getRange(2, 1, rows.length, 6).setValues(rows);
      invalidateSheetCache_('Listas');
    }
  }

  props.setProperty('SETUP_OK', SETUP_STAMP);
  return { ok: true, seededAdmin: seededAdmin,
    login: seededAdmin ? APP.adminLogin : null,
    senhaInicial: seededAdmin ? APP.adminSenhaInicial : null };
}

/* ===================================================================
 * CORREÇÃO TEMPORÁRIA — reparo de esquema legado da planilha
 * (remover este bloco inteiro, e o item de menu em onOpen(), depois
 *  de rodar a correção uma vez com sucesso)
 * =================================================================== */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🔧 Manutenção')
    .addItem('Reparar cabeçalhos da planilha (rodar 1x)', 'repararEsquemaLegado')
    .addToUi();
}

// Converte datas legadas tipo "2026 quarta-07-01" para Date real.
function parseDataLegado_(v) {
  if (!(typeof v === 'string')) return v;
  const m = v.match(/^(\d{4})\s+\S+-(\d{2})-(\d{2})$/);
  if (!m) return v;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function repararEsquemaLegado() {
  const ui = SpreadsheetApp.getUi();
  const relatorio = [];

  // --- Episodios: cabeçalho legado, mas dados já na posição certa ---
  (function() {
    const sh = getSheet_('Episodios');
    const head = SHEETS.Episodios;
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
    const last = sh.getLastRow();
    if (last > 1) {
      const colAdm = head.indexOf('dataAdmissao') + 1;
      const colSaida = head.indexOf('dataSaida') + 1;
      [colAdm, colSaida].forEach(function(col) {
        const range = sh.getRange(2, col, last - 1, 1);
        const vals = range.getValues();
        let changed = false;
        const fixed = vals.map(function(row) {
          const nv = parseDataLegado_(row[0]);
          if (nv !== row[0]) changed = true;
          return [nv];
        });
        if (changed) range.setValues(fixed);
      });
    }
    relatorio.push('Episodios: cabeçalho corrigido.');
  })();

  // --- Atendimentos: cabeçalho legado + coluna extra 'pacienteId' ---
  (function() {
    const sh = getSheet_('Atendimentos');
    const head = SHEETS.Atendimentos; // 9 colunas
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
    if (sh.getLastColumn() > head.length) {
      sh.getRange(1, head.length + 1, 1, sh.getLastColumn() - head.length).clearContent();
    }
    const last = sh.getLastRow();
    if (last > 1) {
      const colData = head.indexOf('data') + 1;
      const range = sh.getRange(2, colData, last - 1, 1);
      const vals = range.getValues();
      let changed = false;
      const fixed = vals.map(function(row) {
        const nv = parseDataLegado_(row[0]);
        if (nv !== row[0]) changed = true;
        return [nv];
      });
      if (changed) range.setValues(fixed);
    }
    relatorio.push('Atendimentos: cabeçalho corrigido e coluna extra limpa.');
  })();

  // --- Reunioes: só cabeçalho, sem dados legados a preservar ---
  (function() {
    const sh = getSheet_('Reunioes');
    const head = SHEETS.Reunioes;
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
    relatorio.push('Reunioes: cabeçalho corrigido.');
  })();

  // --- Usuarios: falta a coluna 'ehFono' (não é só rótulo, é estrutural) ---
  (function() {
    const sh = getSheet_('Usuarios');
    const headAtual = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    if (headAtual.indexOf('ehFono') === -1) {
      sh.insertColumnBefore(7); // antes de 'ativo', que hoje está na col 7
      sh.getRange(1, 1, 1, SHEETS.Usuarios.length).setValues([SHEETS.Usuarios]).setFontWeight('bold');
      const last = sh.getLastRow();
      if (last > 1) {
        const perfis = sh.getRange(2, 6, last - 1, 1).getValues(); // col 6 = perfil
        const ehFonoVals = perfis.map(function(r) { return [String(r[0]).toUpperCase() !== 'ADMIN']; });
        sh.getRange(2, 7, last - 1, 1).setValues(ehFonoVals);
      }
      relatorio.push('Usuarios: coluna ehFono inserida e preenchida (perfil ADMIN = false, demais = true).');
    } else {
      relatorio.push('Usuarios: coluna ehFono já existia, nada a fazer.');
    }
    // Detecta duplicados de id (ex.: dois logins 'admin' com id=1) sem apagar nada.
    const objs = sheetToObjects_('Usuarios');
    const porId = {};
    objs.forEach(function(o) { (porId[o.id] = porId[o.id] || []).push(o); });
    Object.keys(porId).forEach(function(id) {
      if (porId[id].length > 1) {
        relatorio.push('⚠️ ATENÇÃO: id=' + id + ' aparece ' + porId[id].length +
          ' vezes na aba Usuarios (linhas ' + porId[id].map(function(o){return o._row;}).join(', ') +
          '). Revise manualmente qual login/senha está em uso antes de apagar a duplicata.');
      }
    });
  })();

  // --- Episodios: setorId gravado como TEXTO (nome do setor) pela migração ---
  // A importação de planilhas antigas gravou o NOME do setor na coluna setorId
  // e deixou servicoId vazio; esses episódios somem dos filtros e do consolidado.
  // Converte nome -> id numérico e preenche servicoId a partir do setor.
  (function() {
    const setores = sheetToObjects_('Setores');
    const porNome = {}, porId = {};
    setores.forEach(function(s) {
      porNome[String(s.nome).trim().toUpperCase()] = s;
      porId[String(Number(s.id))] = s;
    });
    const sh = getSheet_('Episodios');
    const head = SHEETS.Episodios;
    const last = sh.getLastRow();
    if (last < 2) { relatorio.push('Episodios: sem dados para normalizar.'); return; }
    const colServ = head.indexOf('servicoId') + 1;
    const range = sh.getRange(2, colServ, last - 1, 2); // servicoId + setorId (adjacentes)
    const vals = range.getValues();
    let nSetor = 0, nServ = 0, changed = false;
    vals.forEach(function(row) {
      const raw = row[1];
      let setor = null;
      if (raw !== '' && raw !== null) {
        setor = isNaN(Number(raw))
          ? (porNome[String(raw).trim().toUpperCase()] || null)
          : (porId[String(Number(raw))] || null);
      }
      if (setor && isNaN(Number(raw))) { row[1] = Number(setor.id); nSetor++; changed = true; }
      if ((row[0] === '' || row[0] === null) && setor) {
        row[0] = Number(setor.servicoId); nServ++; changed = true;
      }
    });
    if (changed) { range.setValues(vals); invalidateSheetCache_('Episodios'); }
    relatorio.push('Episodios: ' + nSetor + ' setorId convertidos de texto para id; ' +
      nServ + ' servicoId preenchidos a partir do setor.');
  })();

  // --- Abas órfãs de versões antigas do esquema (Internacoes, TriagemNeonatal) ---
  // Removidas apenas se estiverem vazias (só o cabeçalho) — nunca se houver dado.
  (function() {
    const ss = getSS_();
    ['Internacoes', 'TriagemNeonatal'].forEach(function(n) {
      const s = ss.getSheetByName(n);
      if (!s) return;
      if (s.getLastRow() <= 1) {
        ss.deleteSheet(s);
        relatorio.push(n + ': aba órfã de versão antiga removida (estava vazia).');
      } else {
        relatorio.push('⚠️ ' + n + ': aba de versão antiga CONTÉM dados — mantida; revise manualmente.');
      }
    });
  })();

  const msg = relatorio.join('\n');
  Logger.log(msg);
  ui.alert('Reparo concluído', msg, ui.ButtonSet.OK);
}

/* ================= FIM DA CORREÇÃO TEMPORÁRIA ================= */

/* ============================ SHEET HELPERS ============================ */

function getSS_() {
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  const id = PropertiesService.getScriptProperties().getProperty('SS_ID');
  if (id) return SpreadsheetApp.openById(id);
  throw new Error('Nenhuma planilha vinculada. Rode o script a partir da planilha (Extensões > Apps Script).');
}

function getSheet_(name) {
  const sh = getSS_().getSheetByName(name);
  if (!sh) throw new Error('Aba não encontrada: ' + name);
  return sh;
}

/* cache em memória, válido apenas durante a execução atual (uma chamada RPC do cliente).
   Evita reler a mesma aba várias vezes dentro de uma única requisição — cada leitura de
   planilha é uma chamada de rede, e funções como dashboard()/consolidado() combinam dados
   de várias abas, algumas mais de uma vez. Invalidado em toda escrita (ver appendRow_/
   updateRow_/deleteRowById_) para nunca devolver dado desatualizado após um save. */
let _sheetCache_ = {};

function sheetToObjects_(name) {
  if (_sheetCache_[name]) return _sheetCache_[name];
  const sh = getSheet_(name);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) { _sheetCache_[name] = []; return []; }
  const head = values[0];
  const out = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    if (row.join('') === '') continue;
    const o = {};
    head.forEach(function(h, i) { o[h] = row[i] instanceof Date ? isoDate_(row[i]) : row[i]; });
    o._row = r + 1;
    out.push(o);
  }
  _sheetCache_[name] = out;
  return out;
}

function invalidateSheetCache_(name) {
  delete _sheetCache_[name];
}

function isoDate_(d) {
  // datas puras viram 'YYYY-MM-DD'; timestamps mantêm hora
  // Usa formatDate para checar a hora no TZ do script, não no TZ do runtime V8
  const tz = Session.getScriptTimeZone();
  const h = Number(Utilities.formatDate(d, tz, 'H'));
  const m = Number(Utilities.formatDate(d, tz, 'm'));
  const s = Number(Utilities.formatDate(d, tz, 's'));
  if (h === 0 && m === 0 && s === 0)
    return Utilities.formatDate(d, tz, 'yyyy-MM-dd');
  return Utilities.formatDate(d, tz, "yyyy-MM-dd HH:mm");
}

function nextId_(name) {
  let max = 0;
  sheetToObjects_(name).forEach(function(o) { const n = Number(o.id) || 0; if (n > max) max = n; });
  return max + 1;
}

function appendRow_(name, obj) {
  const sh = getSheet_(name);
  const head = SHEETS[name];
  sh.appendRow(head.map(function(h) { return obj[h] === undefined ? '' : obj[h]; }));
  invalidateSheetCache_(name);
  return obj;
}

function updateRow_(name, rowNumber, obj) {
  const sh = getSheet_(name);
  const head = SHEETS[name];
  const cur = sh.getRange(rowNumber, 1, 1, head.length).getValues()[0];
  const row = head.map(function(h, i) { return obj[h] === undefined ? cur[i] : obj[h]; });
  sh.getRange(rowNumber, 1, 1, head.length).setValues([row]);
  invalidateSheetCache_(name);
  return obj;
}

function deleteRowById_(name, id) {
  const o = byId_(name, id);
  if (!o) return false;
  getSheet_(name).deleteRow(o._row);
  invalidateSheetCache_(name);
  return true;
}

function byId_(name, id) {
  return sheetToObjects_(name).filter(function(x) { return Number(x.id) === Number(id); })[0] || null;
}

function indexById_(arr) {
  const m = {}; arr.forEach(function(o) { m[o.id] = o; }); return m;
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000); // lança exceção se não conseguir o lock em 15 s
  try { return fn(); } finally { lock.releaseLock(); }
}

/* ============================ AUTH ============================ */

function hash_(senha, salt) {
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(senha) + '::' + salt);
  return raw.map(function(b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
}

function login(loginStr, senha) {
  ensureSetup_();
  const chave = String(loginStr || '').toLowerCase().trim();
  // Freio de força bruta: N erros seguidos bloqueiam o login por alguns minutos.
  const cache = CacheService.getScriptCache();
  const kFail = 'fail_' + chave;
  const falhas = Number(cache.get(kFail) || 0);
  if (falhas >= APP.loginMaxTentativas)
    return { ok: false, erro: 'Muitas tentativas seguidas. Aguarde ' +
      APP.loginBloqueioMin + ' minutos e tente novamente.' };
  const falhou = function() {
    cache.put(kFail, String(falhas + 1), APP.loginBloqueioMin * 60);
    return { ok: false, erro: 'Usuário ou senha inválidos.' };
  };
  const u = sheetToObjects_('Usuarios').filter(function(x) {
    return String(x.login).toLowerCase() === chave;
  })[0];
  if (!u || u.ativo === false || String(u.ativo).toUpperCase() === 'FALSE')
    return falhou();
  if (hash_(senha, u.salt) !== u.senhaHash) return falhou();
  cache.remove(kFail);
  const token = Utilities.getUuid();
  CacheService.getScriptCache().put('sess_' + token,
    JSON.stringify({ id: u.id, login: u.login, nome: u.nome, perfil: u.perfil }),
    APP.sessaoHoras * 3600);
  return { ok: true, token: token,
    primeiroAcesso: u.primeiroAcesso === true || String(u.primeiroAcesso).toUpperCase() === 'TRUE',
    user: { id: u.id, nome: u.nome, login: u.login, perfil: u.perfil } };
}

function sessao_(token) {
  const raw = CacheService.getScriptCache().get('sess_' + token);
  if (!raw) throw new Error('SESSAO_EXPIRADA');
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
  const u = byId_('Usuarios', sess.id);
  if (!u) return { ok: false, erro: 'Usuário não encontrado.' };
  const salt = Utilities.getUuid();
  updateRow_('Usuarios', u._row, { senhaHash: hash_(novaSenha, salt), salt: salt, primeiroAcesso: false });
  return { ok: true };
}

/* ============================ BOOTSTRAP ============================ */

function apiBootstrap(token) {
  const sess = sessao_(token);
  return { ok: true, user: sess, dados: refData_() };
}

function refData_() {
  const config = {};
  sheetToObjects_('Config').forEach(function(c) { config[c.chave] = c.valor; });
  const fonos = sheetToObjects_('Usuarios')
    .filter(function(u) { return truthy_(u.ativo) && truthy_(u.ehFono); })
    .map(function(u) { return u.nome; }).sort();
  return {
    config: config,
    servicos: sheetToObjects_('Servicos').sort(byOrdem_),
    setores: sheetToObjects_('Setores').sort(byOrdem_),
    listas: sheetToObjects_('Listas').sort(byOrdem_),
    fonos: fonos,
    tiposServico: TIPOS_SERVICO
  };
}

function truthy_(v) { return v === true || String(v).toUpperCase() === 'TRUE'; }
function byOrdem_(a, b) { return (Number(a.ordem) || 0) - (Number(b.ordem) || 0); }

/* ============================ CONFIGURAÇÕES (ADMIN/COORDENAÇÃO) ============================ */

function saveConfig(token, mapa) {
  const sess = sessao_(token); exigePerfil_(sess, ['ADMIN', 'COORDENACAO']);
  return withLock_(function() {
    const atuais = sheetToObjects_('Config');
    Object.keys(mapa || {}).forEach(function(k) {
      const c = atuais.filter(function(x) { return x.chave === k; })[0];
      if (c) updateRow_('Config', c._row, { valor: mapa[k] });
      else appendRow_('Config', { chave: k, valor: mapa[k] });
    });
    return { ok: true, dados: refData_() };
  });
}

function saveServico(token, obj) {
  const sess = sessao_(token); exigePerfil_(sess, ['ADMIN', 'COORDENACAO']);
  return withLock_(function() {
    if (obj.id) {
      const s = byId_('Servicos', obj.id);
      if (!s) return { ok: false, erro: 'Serviço não encontrado.' };
      updateRow_('Servicos', s._row, { nome: obj.nome, tipo: obj.tipo, ordem: obj.ordem, ativo: obj.ativo });
    } else {
      const id = nextId_('Servicos');
      appendRow_('Servicos', { id: id, nome: obj.nome, tipo: obj.tipo || 'ADULTO',
        ordem: obj.ordem || id, ativo: true });
    }
    return { ok: true, dados: refData_() };
  });
}

function saveSetor(token, obj) {
  const sess = sessao_(token); exigePerfil_(sess, ['ADMIN', 'COORDENACAO']);
  return withLock_(function() {
    if (obj.id) {
      const s = byId_('Setores', obj.id);
      if (!s) return { ok: false, erro: 'Setor não encontrado.' };
      updateRow_('Setores', s._row, { nome: obj.nome, servicoId: obj.servicoId, ordem: obj.ordem, ativo: obj.ativo });
    } else {
      const id = nextId_('Setores');
      appendRow_('Setores', { id: id, servicoId: obj.servicoId, nome: obj.nome, ordem: obj.ordem || id, ativo: true });
    }
    return { ok: true, dados: refData_() };
  });
}

function saveListaItem(token, obj) {
  const sess = sessao_(token); exigePerfil_(sess, ['ADMIN', 'COORDENACAO']);
  return withLock_(function() {
    if (obj.id) {
      const s = byId_('Listas', obj.id);
      if (!s) return { ok: false, erro: 'Item não encontrado.' };
      updateRow_('Listas', s._row, { valor: obj.valor, ordem: obj.ordem, ativo: obj.ativo, tipoServico: obj.tipoServico });
    } else {
      const id = nextId_('Listas');
      appendRow_('Listas', { id: id, categoria: obj.categoria, tipoServico: obj.tipoServico || '',
        valor: obj.valor, ordem: obj.ordem || id, ativo: true });
    }
    return { ok: true, dados: refData_() };
  });
}

function deleteListaItem(token, id) {
  const sess = sessao_(token); exigePerfil_(sess, ['ADMIN', 'COORDENACAO']);
  return withLock_(function() {
    deleteRowById_('Listas', id);
    return { ok: true, dados: refData_() };
  });
}

/* ============================ USUÁRIOS ============================ */

function listUsuarios(token) {
  const sess = sessao_(token); exigePerfil_(sess, ['ADMIN', 'COORDENACAO']);
  const lista = sheetToObjects_('Usuarios').map(function(u) {
    return { id: u.id, nome: u.nome, login: u.login, perfil: u.perfil,
      ehFono: truthy_(u.ehFono), ativo: truthy_(u.ativo), primeiroAcesso: truthy_(u.primeiroAcesso) };
  });
  return { ok: true, usuarios: lista };
}

function saveUsuario(token, obj) {
  const sess = sessao_(token); exigePerfil_(sess, ['ADMIN', 'COORDENACAO']);
  return withLock_(function() {
    const todos = sheetToObjects_('Usuarios');
    const perfilNovo = String(obj.perfil || 'FONO').toUpperCase();
    // só ADMIN concede (ou mantém em outra conta) o perfil ADMIN — sem isso a
    // COORDENAÇÃO conseguiria criar/promover administradores.
    if (sess.perfil !== 'ADMIN' && perfilNovo === 'ADMIN')
      return { ok: false, erro: 'Apenas administradores podem conceder o perfil ADMIN.' };
    if (obj.senha && String(obj.senha).length < 6)
      return { ok: false, erro: 'A senha precisa ter ao menos 6 caracteres.' };
    if (obj.id) {
      const u = byId_('Usuarios', obj.id);
      if (!u) return { ok: false, erro: 'Usuário não encontrado.' };
      if (sess.perfil !== 'ADMIN' && u.perfil === 'ADMIN')
        return { ok: false, erro: 'Sem permissão para editar contas de administrador.' };
      // nunca deixar o hospital sem nenhum administrador ativo
      const eraAdminAtivo = u.perfil === 'ADMIN' && truthy_(u.ativo);
      if (eraAdminAtivo && (perfilNovo !== 'ADMIN' || !obj.ativo)) {
        const outroAdmin = todos.some(function(x) {
          return Number(x.id) !== Number(u.id) && x.perfil === 'ADMIN' && truthy_(x.ativo);
        });
        if (!outroAdmin)
          return { ok: false, erro: 'Este é o único administrador ativo — promova outro usuário antes de rebaixar ou desativar esta conta.' };
      }
      const patch = { nome: obj.nome, perfil: perfilNovo, ehFono: !!obj.ehFono, ativo: !!obj.ativo };
      if (obj.senha) {
        const salt = Utilities.getUuid();
        patch.senhaHash = hash_(obj.senha, salt); patch.salt = salt; patch.primeiroAcesso = true;
      }
      updateRow_('Usuarios', u._row, patch);
      return { ok: true, id: obj.id };
    }
    if (!String(obj.nome || '').trim() || !String(obj.login || '').trim())
      return { ok: false, erro: 'Informe nome e login.' };
    if (todos.some(function(x) { return String(x.login).toLowerCase() === String(obj.login).toLowerCase(); }))
      return { ok: false, erro: 'Já existe usuário com esse login.' };
    const id = nextId_('Usuarios');
    const salt = Utilities.getUuid();
    appendRow_('Usuarios', {
      id: id, nome: obj.nome, login: obj.login,
      senhaHash: hash_(obj.senha || APP.adminSenhaInicial, salt), salt: salt,
      perfil: perfilNovo, ehFono: obj.ehFono !== false, ativo: true,
      primeiroAcesso: true, criadoEm: new Date()
    });
    return { ok: true, id: id };
  });
}

/* ============================ PACIENTES ============================ */

function listPacientes(token, q) {
  sessao_(token);
  q = String(q || '').toLowerCase().trim();
  let lista = sheetToObjects_('Pacientes');
  if (q) lista = lista.filter(function(p) {
    return String(p.nome).toLowerCase().indexOf(q) >= 0 ||
           String(p.prontuario).toLowerCase().indexOf(q) >= 0;
  });
  lista.sort(function(a, b) { return String(a.nome).localeCompare(String(b.nome)); });
  return { ok: true, pacientes: lista.slice(0, 250) };
}

function savePaciente(token, obj) {
  const sess = sessao_(token);
  return withLock_(function() {
    // prontuário é o identificador clínico — duplicá-lo espalha os episódios
    // do mesmo paciente por fichas diferentes e quebra o cruzamento de retornos.
    const pront = String(obj.prontuario == null ? '' : obj.prontuario).trim();
    if (pront) {
      const dup = sheetToObjects_('Pacientes').filter(function(p) {
        return String(p.prontuario).trim() === pront &&
               (!obj.id || Number(p.id) !== Number(obj.id));
      })[0];
      if (dup) return { ok: false, erro: 'Já existe paciente com o prontuário ' +
        pront + ' (' + dup.nome + ').' };
    }
    if (obj.id) {
      const p = byId_('Pacientes', obj.id);
      if (!p) return { ok: false, erro: 'Paciente não encontrado.' };
      updateRow_('Pacientes', p._row, { nome: up_(obj.nome), prontuario: pront,
        sexo: obj.sexo, dataNascimento: obj.dataNascimento || '' });
      return { ok: true, id: obj.id };
    }
    const id = nextId_('Pacientes');
    appendRow_('Pacientes', {
      id: id, nome: up_(obj.nome), prontuario: pront, sexo: obj.sexo,
      dataNascimento: obj.dataNascimento || '', criadoEm: new Date(), criadoPor: sess.nome
    });
    return { ok: true, id: id };
  });
}

function up_(s) { return String(s || '').toUpperCase().trim(); }

/* ============================ EPISÓDIOS (internações / acompanhamentos) ============================ */

const EPISODIO_CAMPOS = ['pacienteId','servicoId','setorId','leito','dataAdmissao','dataSaida',
  'idade','idadeGestacional','prioridade','solicitacao','hipoteseDiagnostica',
  'foisAdmissao','foisAlta','dietaAdmissao','dietaSaida','utensilio',
  'vaaInicio','vaaConclusao','vaaJustificativa',
  'decanulacaoProtocolo','decanulacaoAvaliacao','decanulacaoData','altaFono','obs'];

function saveEpisodio(token, obj) {
  const sess = sessao_(token);
  return withLock_(function() {
    const dados = {};
    EPISODIO_CAMPOS.forEach(function(c) { if (obj[c] !== undefined) dados[c] = obj[c]; });
    const vIni = String(dados.vaaInicio || '').slice(0, 10);
    const vFim = String(dados.vaaConclusao || '').slice(0, 10);
    if (vIni && vFim && vFim < vIni)
      return { ok: false, erro: 'A conclusão do desmame de VAA não pode ser anterior ao início.' };
    if (obj.id) {
      const e = byId_('Episodios', obj.id);
      if (!e) return { ok: false, erro: 'Registro não encontrado.' };
      if (obj.status) dados.status = obj.status;
      updateRow_('Episodios', e._row, dados);
      return { ok: true, id: obj.id };
    }
    const id = nextId_('Episodios');
    dados.id = id;
    dados.status = 'ATIVO';
    dados.dataAdmissao = dados.dataAdmissao || isoDate_(new Date());
    dados.criadoEm = new Date();
    dados.criadoPor = sess.nome;
    appendRow_('Episodios', dados);
    return { ok: true, id: id };
  });
}

function encerrarEpisodio(token, obj) {
  const sess = sessao_(token);
  return withLock_(function() {
    const e = byId_('Episodios', obj.id);
    if (!e) return { ok: false, erro: 'Registro não encontrado.' };
    if (e.status !== 'ATIVO') return { ok: false, erro: 'O episódio já está encerrado.' };
    const adm = String(e.dataAdmissao || '').slice(0, 10);
    const saida = String(obj.dataSaida || isoDate_(new Date())).slice(0, 10);
    if (adm && saida && saida < adm)
      return { ok: false, erro: 'A data de saída não pode ser anterior à admissão (' + adm + ').' };
    updateRow_('Episodios', e._row, {
      status: 'ENCERRADO',
      dataSaida: obj.dataSaida || isoDate_(new Date()),
      dietaSaida: obj.dietaSaida !== undefined ? obj.dietaSaida : e.dietaSaida,
      foisAlta: obj.foisAlta !== undefined ? obj.foisAlta : e.foisAlta
    });
    return { ok: true };
  });
}

function reabrirEpisodio(token, id) {
  const sess = sessao_(token); exigePerfil_(sess, ['ADMIN', 'COORDENACAO']);
  return withLock_(function() {
    const e = byId_('Episodios', id);
    if (!e) return { ok: false, erro: 'Registro não encontrado.' };
    updateRow_('Episodios', e._row, { status: 'ATIVO', dataSaida: '' });
    return { ok: true };
  });
}

/* Resolve o setor de um episódio de forma tolerante: aceita id numérico OU o
   nome do setor como texto — a migração de planilhas antigas gravou o nome na
   coluna setorId, e sem esta tolerância ~todos os episódios migrados somem dos
   filtros, do dashboard e do consolidado. Retorna o objeto do setor ou null. */
function setorResolver_() {
  const all = sheetToObjects_('Setores');
  const porId = {}, porNome = {};
  all.forEach(function(s) {
    porId[String(Number(s.id))] = s;
    porNome[String(s.nome).trim().toUpperCase()] = s;
  });
  return function(v) {
    if (v === '' || v === null || v === undefined) return null;
    if (!isNaN(Number(v))) return porId[String(Number(v))] || null;
    return porNome[String(v).trim().toUpperCase()] || null;
  };
}

/* servicoId efetivo do episódio: usa o campo quando preenchido; quando vazio
   (dados migrados), herda do setor resolvido. */
function servicoDe_(e, setor) {
  const n = Number(e.servicoId);
  if (e.servicoId !== '' && e.servicoId !== null && e.servicoId !== undefined && !isNaN(n) && n)
    return n;
  return setor ? Number(setor.servicoId) : null;
}

function listEpisodios(token, filtro) {
  sessao_(token);
  filtro = filtro || {};
  const pacientes = indexById_(sheetToObjects_('Pacientes'));
  const stOf = setorResolver_();
  const atds = sheetToObjects_('Atendimentos');
  const atdPorEp = {};
  atds.forEach(function(a) {
    const k = Number(a.episodioId);
    if (!atdPorEp[k]) atdPorEp[k] = { n: 0, ultima: '' };
    atdPorEp[k].n++;
    if (String(a.data) > atdPorEp[k].ultima) atdPorEp[k].ultima = String(a.data);
  });

  let lista = sheetToObjects_('Episodios');
  if (filtro.status) lista = lista.filter(function(e) { return e.status === filtro.status; });
  if (filtro.servicoId) lista = lista.filter(function(e) {
    return servicoDe_(e, stOf(e.setorId)) === Number(filtro.servicoId); });
  if (filtro.setorId) lista = lista.filter(function(e) {
    const s = stOf(e.setorId); return s && Number(s.id) === Number(filtro.setorId); });

  let linhas = lista.map(function(e) {
    const p = pacientes[e.pacienteId] || {};
    const at = atdPorEp[Number(e.id)] || { n: 0, ultima: '' };
    const st = stOf(e.setorId);
    return {
      id: e.id, pacienteId: e.pacienteId, nome: p.nome || '—', prontuario: p.prontuario || '',
      sexo: p.sexo || '', dataNascimento: p.dataNascimento || '',
      servicoId: servicoDe_(e, st), setorId: st ? Number(st.id) : e.setorId,
      setor: st ? st.nome : '', leito: e.leito,
      status: e.status, dataAdmissao: e.dataAdmissao, dataSaida: e.dataSaida,
      prioridade: e.prioridade, solicitacao: e.solicitacao,
      hipoteseDiagnostica: e.hipoteseDiagnostica,
      foisAdmissao: e.foisAdmissao, dietaAdmissao: e.dietaAdmissao,
      decanulacaoProtocolo: e.decanulacaoProtocolo,
      vaaInicio: e.vaaInicio, idade: e.idade,
      nAtendimentos: at.n, ultimoAtendimento: at.ultima
    };
  });

  if (filtro.q) {
    const q = String(filtro.q).toLowerCase();
    linhas = linhas.filter(function(l) {
      return String(l.nome).toLowerCase().indexOf(q) >= 0 ||
             String(l.prontuario).toLowerCase().indexOf(q) >= 0 ||
             String(l.leito || '').toLowerCase().indexOf(q) >= 0;
    });
  }

  linhas.sort(function(a, b) {
    const pa = prioNum_(a.prioridade), pb = prioNum_(b.prioridade);
    if (pa !== pb) return pa - pb;
    return String(a.nome).localeCompare(String(b.nome));
  });
  return { ok: true, episodios: linhas.slice(0, 500) };
}

function prioNum_(p) {
  const m = String(p || '').match(/(\d+)/);
  return m ? Number(m[1]) : 99;
}

function getFicha(token, episodioId) {
  sessao_(token);
  const e = byId_('Episodios', episodioId);
  if (!e) return { ok: false, erro: 'Registro não encontrado.' };
  // normaliza setor/serviço de dados migrados (setorId como texto, servicoId vazio)
  // para a ficha abrir com o setor certo e o formulário clínico do tipo correto
  const st = setorResolver_()(e.setorId);
  if (st) {
    e.setorId = Number(st.id);
    if (!servicoDe_(e, null)) e.servicoId = Number(st.servicoId);
  }
  const p = byId_('Pacientes', e.pacienteId) || {};
  const at = sheetToObjects_('Atendimentos')
    .filter(function(x) { return Number(x.episodioId) === Number(episodioId); })
    .sort(function(a, b) { return String(b.data).localeCompare(String(a.data)); });
  return { ok: true, episodio: e, paciente: p, atendimentos: at };
}

/* ============================ ATENDIMENTOS DIÁRIOS ============================ */

function registrarAtendimento(token, obj) {
  const sess = sessao_(token);
  return withLock_(function() {
    const id = nextId_('Atendimentos');
    appendRow_('Atendimentos', {
      id: id, episodioId: obj.episodioId,
      data: obj.data || isoDate_(new Date()),
      procedimentos: (obj.procedimentos || []).join(' | '),
      profissional: obj.profissional || sess.nome,
      extra: !!obj.extra, obs: obj.obs || '',
      criadoEm: new Date(), criadoPor: sess.nome
    });
    return { ok: true, id: id };
  });
}

function excluirAtendimento(token, id) {
  const sess = sessao_(token); exigePerfil_(sess, ['ADMIN', 'COORDENACAO', 'FONO']);
  return withLock_(function() {
    const a = byId_('Atendimentos', id);
    if (!a) return { ok: false, erro: 'Atendimento não encontrado.' };
    deleteRowById_('Atendimentos', id);
    return { ok: true };
  });
}

/* ============================ TRIAGEM NEONATAL ============================ */

const TRIAGEM_CAMPOS = ['tipo','nome','prontuario','sexo','dataNascimento','leito','dataExame',
  'resultado','resultadoBera','encReteste','encBera','encFrenotomia','frenotomiaHospital',
  'necessidadeAcompanhamento','conduta','localFrenotomia','fatoresRisco','procedimentos','profissional'];

function saveTriagem(token, obj) {
  const sess = sessao_(token);
  return withLock_(function() {
    const dados = {};
    TRIAGEM_CAMPOS.forEach(function(c) { if (obj[c] !== undefined) dados[c] = obj[c]; });
    if (Array.isArray(dados.fatoresRisco)) dados.fatoresRisco = dados.fatoresRisco.join(' | ');
    if (Array.isArray(dados.procedimentos)) dados.procedimentos = dados.procedimentos.join(' | ');
    if (dados.nome) dados.nome = up_(dados.nome);
    if (obj.id) {
      const t = byId_('Triagens', obj.id);
      if (!t) return { ok: false, erro: 'Registro não encontrado.' };
      updateRow_('Triagens', t._row, dados);
      return { ok: true, id: obj.id };
    }
    const id = nextId_('Triagens');
    dados.id = id; dados.criadoEm = new Date(); dados.criadoPor = sess.nome;
    appendRow_('Triagens', dados);
    return { ok: true, id: id };
  });
}

function excluirTriagem(token, id) {
  const sess = sessao_(token); exigePerfil_(sess, ['ADMIN', 'COORDENACAO']);
  return withLock_(function() {
    deleteRowById_('Triagens', id);
    return { ok: true };
  });
}

function listTriagens(token, filtro) {
  sessao_(token);
  filtro = filtro || {};
  let lista = sheetToObjects_('Triagens');
  if (filtro.tipo) lista = lista.filter(function(t) { return t.tipo === filtro.tipo; });
  if (filtro.q) {
    const q = String(filtro.q).toLowerCase();
    lista = lista.filter(function(t) {
      return String(t.nome).toLowerCase().indexOf(q) >= 0 ||
             String(t.prontuario).toLowerCase().indexOf(q) >= 0;
    });
  }
  if (filtro.pendentes) {
    // encaminhados para reteste/BERA que ainda não têm registro de retorno com o
    // mesmo prontuário — registros SEM prontuário nunca são baixados por engano
    const retornos = {};
    sheetToObjects_('Triagens').forEach(function(t) {
      const tipo = String(t.tipo || '');
      const pront = String(t.prontuario || '').trim();
      if (tipo.indexOf('RETORNO_') === 0 && pront)
        retornos[pront + '::' + tipo.replace('RETORNO_', '')] = true;
    });
    lista = lista.filter(function(t) {
      const tipo = String(t.tipo || '');
      if (tipo.indexOf('RETORNO') === 0) return false;
      const enc = String(t.encReteste).toUpperCase() === 'SIM' || String(t.encBera).toUpperCase() === 'SIM' ||
                  String(t.encFrenotomia).toUpperCase() === 'SIM';
      const pront = String(t.prontuario || '').trim();
      return enc && !(pront && retornos[pront + '::' + tipo]);
    });
  }
  lista.sort(function(a, b) { return String(b.dataExame).localeCompare(String(a.dataExame)); });
  return { ok: true, triagens: lista.slice(0, 400) };
}

/* ============================ REUNIÕES ============================ */

function saveReuniao(token, obj) {
  const sess = sessao_(token);
  return withLock_(function() {
    if (obj.id) {
      const r = byId_('Reunioes', obj.id);
      if (!r) return { ok: false, erro: 'Registro não encontrado.' };
      updateRow_('Reunioes', r._row, { data: obj.data, setor: obj.setor,
        fonoaudiologo: obj.fonoaudiologo, participantes: obj.participantes, pauta: obj.pauta });
      return { ok: true, id: obj.id };
    }
    const id = nextId_('Reunioes');
    appendRow_('Reunioes', {
      id: id, data: obj.data || isoDate_(new Date()), setor: obj.setor || '',
      fonoaudiologo: obj.fonoaudiologo || sess.nome,
      participantes: Number(obj.participantes) || 0, pauta: obj.pauta || '',
      criadoEm: new Date(), criadoPor: sess.nome
    });
    return { ok: true, id: id };
  });
}

function excluirReuniao(token, id) {
  const sess = sessao_(token); exigePerfil_(sess, ['ADMIN', 'COORDENACAO']);
  return withLock_(function() {
    deleteRowById_('Reunioes', id);
    return { ok: true };
  });
}

function listReunioes(token) {
  sessao_(token);
  const lista = sheetToObjects_('Reunioes')
    .sort(function(a, b) { return String(b.data).localeCompare(String(a.data)); });
  return { ok: true, reunioes: lista.slice(0, 300) };
}

/* ============================ PERÍODO / DATAS ============================ */

function dentroPeriodo_(dataStr, de, ate) {
  const d = String(dataStr || '').slice(0, 10);
  if (!d) return false;
  if (de && d < de) return false;
  if (ate && d > ate) return false;
  return true;
}

function idadeAnos_(episodio, paciente) {
  if (episodio.idade !== '' && episodio.idade !== undefined && episodio.idade !== null && !isNaN(Number(episodio.idade)))
    return Number(episodio.idade);
  const dn = paciente && paciente.dataNascimento;
  if (!dn) return null;
  const nasc = new Date(String(dn).slice(0, 10) + 'T12:00:00');
  if (isNaN(nasc)) return null;
  const ref = episodio.dataAdmissao ? new Date(String(episodio.dataAdmissao).slice(0, 10) + 'T12:00:00') : new Date();
  return Math.max(0, Math.floor((ref - nasc) / 31557600000));
}

/* ============================ DASHBOARD ============================ */

function dashboard(token, filtro) {
  sessao_(token);
  filtro = filtro || {};
  const de = filtro.de || '';
  const ate = filtro.ate || '';
  const servicoId = filtro.servicoId ? Number(filtro.servicoId) : null;

  const stOf = setorResolver_();

  let episodios = sheetToObjects_('Episodios');
  if (servicoId) episodios = episodios.filter(function(e) {
    return servicoDe_(e, stOf(e.setorId)) === servicoId; });
  const epIdx = indexById_(episodios);

  const atend = sheetToObjects_('Atendimentos').filter(function(a) {
    return epIdx[a.episodioId] && dentroPeriodo_(a.data, de, ate);
  });
  const triag = sheetToObjects_('Triagens').filter(function(t) { return dentroPeriodo_(t.dataExame, de, ate); });
  const reun = sheetToObjects_('Reunioes').filter(function(r) { return dentroPeriodo_(r.data, de, ate); });

  const ativos = episodios.filter(function(e) { return e.status === 'ATIVO'; });

  // ------ período anterior (mesma duração, imediatamente antes de "de") p/ deltas ------
  let anterior = null;
  if (de && ate) {
    const dDe = new Date(de + 'T00:00:00'), dAte = new Date(ate + 'T00:00:00');
    const durMs = dAte - dDe;
    if (durMs >= 0) {
      const pad = function(n) { return (n < 10 ? '0' : '') + n; };
      const fmt = function(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
      const antAte = new Date(dDe); antAte.setDate(antAte.getDate() - 1);
      const antDe = new Date(antAte.getTime() - durMs);
      const antDeStr = fmt(antDe), antAteStr = fmt(antAte);
      const atendAnt = sheetToObjects_('Atendimentos').filter(function(a) {
        return epIdx[a.episodioId] && dentroPeriodo_(a.data, antDeStr, antAteStr);
      });
      let procAnt = 0;
      atendAnt.forEach(function(a) {
        const procs = String(a.procedimentos || '').split(' | ').filter(function(x) { return x; });
        procAnt += Math.max(1, procs.length);
      });
      anterior = {
        pacientesAtivos: episodios.filter(function(e) {
          const admStr = String(e.dataAdmissao || '').slice(0, 10);
          if (!admStr || admStr > antAteStr) return false; // ainda não havia sido admitido
          return e.status === 'ATIVO' || (e.dataSaida && String(e.dataSaida).slice(0,10) > antAteStr);
        }).length,
        atendimentos: atendAnt.length,
        procedimentos: procAnt,
        admissoesPeriodo: episodios.filter(function(e) { return dentroPeriodo_(e.dataAdmissao, antDeStr, antAteStr); }).length
      };
    }
  }

  // episódios com movimento no período (admissão ou saída dentro dele)
  const epPeriodo = episodios.filter(function(e) {
    return dentroPeriodo_(e.dataAdmissao, de, ate) || dentroPeriodo_(e.dataSaida, de, ate);
  });

  // ------ procedimentos ------
  let totalProc = 0;
  const procPorDia = {};       // yyyy-mm-dd -> n procedimentos
  const procPorSetor = {};     // setor -> n
  const procPorProf = {};      // profissional -> n
  const procPorTipo = {};      // procedimento -> n
  atend.forEach(function(a) {
    const procs = String(a.procedimentos || '').split(' | ').filter(function(x) { return x; });
    const n = Math.max(1, procs.length);
    totalProc += n;
    const dia = String(a.data).slice(0, 10);
    procPorDia[dia] = (procPorDia[dia] || 0) + n;
    const ep = epIdx[a.episodioId];
    const st = ep ? stOf(ep.setorId) : null;
    const setor = st ? st.nome : '—';
    procPorSetor[setor] = (procPorSetor[setor] || 0) + n;
    const prof = a.profissional || '—';
    procPorProf[prof] = (procPorProf[prof] || 0) + n;
    procs.forEach(function(p) { procPorTipo[p] = (procPorTipo[p] || 0) + 1; });
  });

  // ------ FOIS: evolução admissão -> alta ------
  const nivel = function(v) { const m = String(v).match(/N[ÍI]VEL\s*(\d)/i); return m ? Number(m[1]) : null; };
  let somaAdm = 0, somaAlta = 0, nEvo = 0;
  const foisDist = { 1:0, 2:0, 3:0, 4:0, 5:0, 6:0, 7:0 };
  epPeriodo.forEach(function(e) {
    const a = nivel(e.foisAdmissao);
    if (a) foisDist[a]++;
    const b = nivel(e.foisAlta);
    if (a && b) { somaAdm += a; somaAlta += b; nEvo++; }
  });

  // ------ desmame de VAA ------
  let somaDias = 0, nDesmame = 0;
  epPeriodo.forEach(function(e) {
    if (e.vaaInicio && e.vaaConclusao) {
      const d = (new Date(String(e.vaaConclusao).slice(0,10)) - new Date(String(e.vaaInicio).slice(0,10))) / 86400000;
      if (d >= 0) { somaDias += d; nDesmame++; }
    }
  });

  // ------ decanulação ------
  const emProtocolo = epPeriodo.filter(function(e) { return String(e.decanulacaoProtocolo).toUpperCase() === 'SIM'; });
  const decanulados = emProtocolo.filter(function(e) { return e.decanulacaoData; }).length;

  // ------ triagens ------
  const triagPorTipo = {};
  let triagFalha = 0;
  triag.forEach(function(t) {
    triagPorTipo[t.tipo] = (triagPorTipo[t.tipo] || 0) + 1;
    const r = String(t.resultado).toUpperCase();
    if (r === 'FALHOU' || r === 'ALTERADO' || r === 'DUVIDOSO' || r === 'INCONSISTENTE') triagFalha++;
  });

  const top = function(obj, n) {
    return Object.keys(obj).map(function(k) { return { nome: k, total: obj[k] }; })
      .sort(function(a, b) { return b.total - a.total; }).slice(0, n);
  };

  const serieDias = Object.keys(procPorDia).sort().map(function(d) { return { dia: d, total: procPorDia[d] }; });

  return { ok: true, kpis: {
    pacientesAtivos: ativos.length,
    admissoesPeriodo: episodios.filter(function(e) { return dentroPeriodo_(e.dataAdmissao, de, ate); }).length,
    saidasPeriodo: episodios.filter(function(e) { return e.dataSaida && dentroPeriodo_(e.dataSaida, de, ate); }).length,
    atendimentos: atend.length,
    procedimentos: totalProc,
    foisMediaAdmissao: nEvo ? +(somaAdm / nEvo).toFixed(1) : null,
    foisMediaAlta: nEvo ? +(somaAlta / nEvo).toFixed(1) : null,
    foisEvolucaoN: nEvo,
    foisDist: foisDist,
    tempoMedioDesmame: nDesmame ? +(somaDias / nDesmame).toFixed(1) : null,
    desmamesN: nDesmame,
    decanulacaoProtocolo: emProtocolo.length,
    decanulacaoConcluidas: decanulados,
    triagemTotal: triag.length,
    triagemFalha: triagFalha,
    triagPorTipo: triagPorTipo,
    reunioes: reun.length,
    reunioesParticipantes: reun.reduce(function(s, r) { return s + (Number(r.participantes) || 0); }, 0),
    serieDias: serieDias,
    procPorSetor: top(procPorSetor, 14),
    procPorProf: top(procPorProf, 12),
    procPorTipo: top(procPorTipo, 12)
  }, anterior: anterior };
}

/* ============================ CONSOLIDADO (matrizes por setor) ============================ */

function consolidado(token, filtro) {
  sessao_(token);
  filtro = filtro || {};
  const de = filtro.de || '';
  const ate = filtro.ate || '';
  const servicoId = filtro.servicoId ? Number(filtro.servicoId) : null;

  const pacientes = indexById_(sheetToObjects_('Pacientes'));
  const setoresAll = sheetToObjects_('Setores').sort(byOrdem_);
  const stOf = setorResolver_();

  let episodios = sheetToObjects_('Episodios').filter(function(e) {
    return dentroPeriodo_(e.dataAdmissao, de, ate) || dentroPeriodo_(e.dataSaida, de, ate) ||
           (e.status === 'ATIVO' && (!ate || String(e.dataAdmissao).slice(0,10) <= ate));
  });
  if (servicoId) episodios = episodios.filter(function(e) {
    return servicoDe_(e, stOf(e.setorId)) === servicoId; });

  // resolve o setor de cada episódio uma única vez (id numérico ou nome legado)
  episodios.forEach(function(e) {
    const s = stOf(e.setorId);
    e._sid = s ? Number(s.id) : null;
  });

  // setores presentes (na ordem cadastrada)
  const usados = {};
  episodios.forEach(function(e) { if (e._sid !== null) usados[e._sid] = true; });
  const cols = setoresAll
    .filter(function(s) { return usados[Number(s.id)] && (!servicoId || Number(s.servicoId) === servicoId); })
    .map(function(s) { return { id: Number(s.id), nome: s.nome }; });

  function matriz(linhas, valorFn) {
    // linhas: array de rótulos; valorFn(e) -> rótulo (ou null)
    const m = {};
    linhas.forEach(function(l) { m[l] = {}; cols.forEach(function(c) { m[l][c.id] = 0; }); });
    const totalCol = {}; cols.forEach(function(c) { totalCol[c.id] = 0; });
    episodios.forEach(function(e) {
      const l = valorFn(e);
      if (l === null || l === undefined || m[l] === undefined) return;
      const sid = e._sid;
      if (sid === null || m[l][sid] === undefined) return;
      m[l][sid]++;
      totalCol[sid]++;
    });
    return { linhas: linhas.map(function(l) {
      const vals = cols.map(function(c) { return m[l][c.id]; });
      return { rotulo: l, valores: vals, total: vals.reduce(function(a, b) { return a + b; }, 0) };
    }), totais: cols.map(function(c) { return totalCol[c.id]; }) };
  }

  const faixas = ['0-20', '21-40', '41-60', '61-80', '81-100', '>100'];
  const faixaDe = function(e) {
    const p = pacientes[e.pacienteId];
    const a = idadeAnos_(e, p);
    if (a === null) return null;
    if (a <= 20) return '0-20';
    if (a <= 40) return '21-40';
    if (a <= 60) return '41-60';
    if (a <= 80) return '61-80';
    if (a <= 100) return '81-100';
    return '>100';
  };

  const listaVals = function(cat) {
    const seen = {};
    const out = [];
    sheetToObjects_('Listas').sort(byOrdem_).forEach(function(l) {
      if (l.categoria === cat && truthy_(l.ativo) && !seen[l.valor]) { seen[l.valor] = true; out.push(l.valor); }
    });
    return out;
  };

  const nivFois = listaVals('FOIS');
  const dietasSaida = listaVals('DIETA_SAIDA');
  const solicitacoes = listaVals('SOLICITACAO');

  return { ok: true,
    setores: cols,
    periodo: { de: de, ate: ate },
    nEpisodios: episodios.length,
    matrizes: {
      idade: matriz(faixas, faixaDe),
      sexo: matriz(['F', 'M'], function(e) {
        const p = pacientes[e.pacienteId]; return p && p.sexo ? String(p.sexo).toUpperCase() : null;
      }),
      perfil: matriz(solicitacoes, function(e) { return e.solicitacao || null; }),
      foisAdmissao: matriz(nivFois, function(e) { return e.foisAdmissao || null; }),
      foisAlta: matriz(nivFois, function(e) { return e.foisAlta || null; }),
      dietaSaida: matriz(dietasSaida, function(e) { return e.dietaSaida || null; })
    }
  };
}

/* ============================ IMPORTAÇÃO LEGADO ============================ */

function importarPlanilhasLegadas() {
  const folderIds = [
    "1xEZPO4XM-BfTF7C2re2J55QJJ5W_3v3T",
    "1QyvhjZEoUMc2gFbHGrB9DdpddBeZUaOO",
    "1myYvjirA0PkILbj43kuktdtdEEJu9Lki",
    "1Xs7_VbSiiwSSYjQ7KCYg-OpSj_PDD_YA"
  ];

  const MAP_PACIENTE = {
    'PACIENTE': 'nome', 'PRONT': 'prontuario', 'Sexo': 'sexo', 'DATA DE NASCIMENTO': 'dataNascimento'
  };

  const MAP_EPISODIO = {
    'LEITO': 'leito', 'PRIORIDADE PARA ATENDIMENTO': 'prioridade', 'IDADE GESTACIONAL': 'idadeGestacional',
    'HIPÓTESE DIAGNÓSTICA': 'hipoteseDiagnostica', 'SOLICITAÇÃO': 'solicitacao',
    'INÍCIO TRANSIÇÃO DE VAA PARA VIA ORAL': 'vaaInicio', 'DIA DA CONCLUSÃO': 'vaaConclusao',
    'JUSTIFICATIVA DA CONCLUSÃO OU NÃO': 'vaaJustificativa', 'TIPO DE DIETA DA ADMISSÃO': 'dietaAdmissao',
    'UTENSÍLIO UTILIZADO': 'utensilio', 'TIPO DE DIETA DA ALTA OU DA PERMANÊNCIA': 'dietaSaida'
  };

  const regexData = /\d{2}\/\d{2}\/\d{4}/;
  const timeZero = new Date();
  const startTime = Date.now();
  const LIMIT_MS = 4.5 * 60 * 1000; // 4.5 minutos limite por execução (segurança para o limite de 6 min do Google)

  const props = PropertiesService.getScriptProperties();
  let pendingFilesStr = props.getProperty('MIGRATION_PENDING_FILES');
  let pendingFiles = [];

  // Se não tem arquivos pendentes gravados, faz a varredura nas pastas e empilha todos os IDs de arquivos
  if (!pendingFilesStr) {
    Logger.log("Iniciando nova varredura de pastas...");
    folderIds.forEach(function(folderId) {
      try {
        const folder = DriveApp.getFolderById(folderId);
        const files = folder.getFilesByType(MimeType.GOOGLE_SHEETS);
        while (files.hasNext()) {
          pendingFiles.push(files.next().getId());
        }
      } catch (e) {
        Logger.log("Erro ao acessar pasta " + folderId + ": " + e);
      }
    });
    props.setProperty('MIGRATION_PENDING_FILES', JSON.stringify(pendingFiles));
  } else {
    pendingFiles = JSON.parse(pendingFilesStr);
    Logger.log("Retomando execução. Faltam " + pendingFiles.length + " arquivos.");
  }

  if (pendingFiles.length === 0) {
    Logger.log("Todos os arquivos já foram importados com sucesso.");
    props.deleteProperty('MIGRATION_PENDING_FILES');
    return;
  }

  // Prepara estado inicial
  const fakeSess = {nome: 'Importador (Migração)'};
  let pacIdOffset = nextId_('Pacientes');
  let epIdOffset = nextId_('Episodios');
  let atIdOffset = nextId_('Atendimentos');

  // Cache de setores: nome (uppercase) -> id numérico
  const setoresBase = sheetToObjects_('Setores');
  const setoresNomeCache = {};
  setoresBase.forEach(function(s) {
    if (s.nome) setoresNomeCache[String(s.nome).trim().toUpperCase()] = Number(s.id);
  });

  const pacientesBase = sheetToObjects_('Pacientes');
  const pacientesCache = {};
  pacientesBase.forEach(function(p) {
    if (p.prontuario) pacientesCache[String(p.prontuario).trim().toUpperCase()] = p.id;
  });

  const ssTarget = getSS_();
  const shPac = ssTarget.getSheetByName('Pacientes');
  const shEp = ssTarget.getSheetByName('Episodios');
  const shAt = ssTarget.getSheetByName('Atendimentos');

  let processedCount = 0;

  // Itera sobre a lista de arquivos pendentes
  while (pendingFiles.length > 0) {
    if (Date.now() - startTime > LIMIT_MS) {
      Logger.log("Tempo limite próximo. Parando execução após " + processedCount + " planilhas processadas. POR FAVOR, EXECUTE O SCRIPT NOVAMENTE para continuar.");
      props.setProperty('MIGRATION_PENDING_FILES', JSON.stringify(pendingFiles));
      return;
    }

    const currentFileId = pendingFiles.shift(); // Remove e pega o primeiro arquivo da lista

    // Filas para Inserção Batch - extremamente mais rápido que appendRow
    const batchPacientes = [];
    const batchEpisodios = [];
    const batchAtendimentos = [];

    try {
      const ss = SpreadsheetApp.openById(currentFileId);
      const sheets = ss.getSheets();

      sheets.forEach(function(sh) {
        const sheetName = sh.getName();
        const data = sh.getDataRange().getValues();
        if (data.length < 2) return;

        const headers = data[0].map(function(h) { return String(h).trim(); });

        const idxPac = {}; const idxEp = {}; const idxAtends = []; const idxObs = [];

        headers.forEach(function(h, i) {
          if (!h) return;
          if (MAP_PACIENTE[h]) idxPac[MAP_PACIENTE[h]] = i;
          else if (MAP_EPISODIO[h]) idxEp[MAP_EPISODIO[h]] = i;
          else if (regexData.test(h)) idxAtends.push({dataStr: h, index: i});
          else idxObs.push({key: h, index: i});
        });

        for (let r = 1; r < data.length; r++) {
          const row = data[r];

          const prontStr = String(idxPac['prontuario'] !== undefined ? row[idxPac['prontuario']] : '').trim();
          const nomeStr = String(idxPac['nome'] !== undefined ? row[idxPac['nome']] : '').trim();

          if (!nomeStr) continue;

          let curPacId = pacientesCache[prontStr.toUpperCase()];
          if (!curPacId) {
            curPacId = pacIdOffset++;
            if (prontStr) pacientesCache[prontStr.toUpperCase()] = curPacId;

            // Ordem: ['id','nome','prontuario','sexo','dataNascimento','criadoEm','criadoPor']
            batchPacientes.push([
              curPacId,
              up_(nomeStr),
              prontStr,
              idxPac['sexo'] !== undefined ? row[idxPac['sexo']] : '',
              idxPac['dataNascimento'] !== undefined ? row[idxPac['dataNascimento']] : '',
              timeZero,
              fakeSess.nome
            ]);
          }

          const obsLinhas = [];
          idxObs.forEach(function(obj) {
            const val = row[obj.index];
            if (val !== '' && val !== null && val !== undefined) obsLinhas.push(obj.key + ': ' + val);
          });

          let admData = '';
          for (let k = 0; k < idxAtends.length; k++) {
            if (row[idxAtends[k].index]) {
              const parts = idxAtends[k].dataStr.split('/');
              if (parts.length === 3) admData = parts[2] + '-' + parts[1] + '-' + parts[0];
              break;
            }
          }
          if (!admData) admData = isoDate_(timeZero);

          const curEpId = epIdOffset++;
          const objEp = {
            id: curEpId, pacienteId: curPacId, servicoId: '',
            setorId: setoresNomeCache[sheetName.trim().toUpperCase()] || '',
            leito: '', status: 'ENCERRADO',
            dataAdmissao: admData, dataSaida: '', idade: '', idadeGestacional: '', prioridade: '', solicitacao: '',
            hipoteseDiagnostica: '', foisAdmissao: '', foisAlta: '', dietaAdmissao: '', dietaSaida: '', utensilio: '',
            vaaInicio: '', vaaConclusao: '', vaaJustificativa: '', decanulacaoProtocolo: '', decanulacaoAvaliacao: '',
            decanulacaoData: '', altaFono: '', obs: obsLinhas.join(' | '), criadoEm: timeZero, criadoPor: fakeSess.nome
          };

          Object.keys(idxEp).forEach(function(k) { objEp[k] = row[idxEp[k]]; });

          // Converter obj para o array de cabeçalho exato de Episodios
          batchEpisodios.push(SHEETS.Episodios.map(function(k) { return objEp[k] === undefined ? '' : objEp[k]; }));

          idxAtends.forEach(function(at) {
            const valProc = String(row[at.index]).trim();
            if (valProc) {
              const pDate = at.dataStr.split('/');
              const atDateStr = pDate.length === 3 ? pDate[2] + '-' + pDate[1] + '-' + pDate[0] : isoDate_(timeZero);

              // ['id','episodioId','data','procedimentos','profissional','extra','obs','criadoEm','criadoPor']
              batchAtendimentos.push([
                atIdOffset++,
                curEpId,
                atDateStr,
                valProc,
                'Legado (Migração)',
                '', // extra
                '', // obs
                timeZero,
                fakeSess.nome
              ]);
            }
          });
        }
      });

      // Realiza Batch Insetion no BD
      if (batchPacientes.length > 0) shPac.getRange(shPac.getLastRow() + 1, 1, batchPacientes.length, batchPacientes[0].length).setValues(batchPacientes);
      if (batchEpisodios.length > 0) shEp.getRange(shEp.getLastRow() + 1, 1, batchEpisodios.length, batchEpisodios[0].length).setValues(batchEpisodios);
      if (batchAtendimentos.length > 0) shAt.getRange(shAt.getLastRow() + 1, 1, batchAtendimentos.length, batchAtendimentos[0].length).setValues(batchAtendimentos);

      processedCount++;
      props.setProperty('MIGRATION_PENDING_FILES', JSON.stringify(pendingFiles)); // Grava checkpoint por arquivo
      Logger.log("Arquivo importado com sucesso: " + ss.getName());

    } catch(e) {
      Logger.log("Erro ao importar arquivo " + currentFileId + ": " + e);
      // Volta o ID do arquivo para tentar de novo ou descarta. Neste caso, não fazemos push back para evitar loop infinito caso o erro seja da própria planilha, porém isso pode ser ajustado.
    }
  } // end while

  Logger.log("Migração de todas as planilhas concluída com sucesso! Nenhum arquivo pendente.");
  props.deleteProperty('MIGRATION_PENDING_FILES');
}
