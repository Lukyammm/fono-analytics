# Fono Analytics

Sistema web de gestão de fonoaudiologia hospitalar, construído em **Google Apps Script**
com **Google Sheets** como banco de dados. Substitui as planilhas mensais de produção
(Adulto, Neonatologia, Cardiopediatria e Ambulatório) por um sistema único, com
dashboard, consolidado por setor e cadastros totalmente configuráveis — pronto para
ser implantado em qualquer hospital sem alterar código.

## Funcionalidades

- **Dashboard** — pacientes ativos, atendimentos, procedimentos, evolução FOIS
  (admissão → alta), tempo médio de desmame de VAA, decanulações, triagens e
  reuniões, com gráficos de procedimentos por dia, por setor, por profissional
  e por tipo.
- **Relatórios** — indicadores de resultado que as planilhas nunca mostraram,
  calculados dos campos que a equipe já preenche: taxa de transição para via
  oral (entrou com sonda × saiu em VO), desmames de VAA iniciados/concluídos com
  tempo médio e justificativas, permanência média, tempo até o 1º atendimento,
  atendimentos por paciente, ganho na escala FOIS, decanulações com tempo médio,
  óbitos, alta fonoaudiológica (ambulatório), taxa de atendimentos extra (carga
  fora da rotina, por profissional), desfecho da saída, hipóteses diagnósticas
  mais frequentes, origem da solicitação, idade gestacional, resultados e
  fatores de risco da triagem neonatal (orelhinha/linguinha), local da
  frenotomia, conduta no retorno e reuniões por setor/fonoaudiólogo — tudo com
  filtro de período/serviço, exportação CSV e um **demonstrativo mensal**
  (admissões, saídas, óbitos, atendimentos, procedimentos, desmames concluídos,
  decanulações, triagens e reuniões por mês).
- **Pacientes internados (censo)** — fila por serviço e setor, ordenada por
  prioridade, com ficha clínica completa e grade diária de atendimentos
  (equivalente às colunas de datas das planilhas).
- **Formulário clínico adaptado por tipo de serviço** — ADULTO/AMBULATÓRIO usam
  FOIS, prioridades de adulto e decanulação; INFANTIL usa idade gestacional,
  utensílio e dietas infantis.
- **Triagem neonatal** — Teste da Orelhinha, Teste da Linguinha, retornos de cada
  um (reteste, BERA, frenotomia) e aba de **pendências** que cruza encaminhamentos
  com retornos já registrados.
- **Reuniões** — data, setor/local, fonoaudiólogo, participantes e pauta.
- **Consolidado** — matrizes por setor (faixa etária, sexo, perfil de solicitação,
  prioridade, dieta na admissão, utensílio, FOIS admissão/alta, consistência da
  alta e justificativa do desmame de VAA), com filtro de período e exportação CSV —
  equivalente à aba CONSOLIDADO das planilhas, sem `#REF!`.
- **Configurações** — nome do hospital, serviços, setores, todas as listas clínicas
  (dietas, procedimentos, prioridades, resultados de exame, fatores de risco…) e
  usuários com perfis (ADMIN, COORDENAÇÃO, FONO). Tudo editável pela interface.
- **Identidade do hospital** — além do nome, a **cor institucional** é configurável
  em Configurações > Geral (com pré-visualização imediata): a interface inteira —
  botões, navegação, KPIs, login — deriva dessa única cor, nos temas claro e escuro.
- **Tema claro / escuro / automático** — alternável no rodapé do menu lateral (ou no
  "Mais" do celular); o padrão acompanha o sistema operacional do usuário e a
  preferência fica salva no aparelho. Impressões saem sempre em tema claro.

## Segurança

- Senhas com hash + salt; troca obrigatória no primeiro acesso; mínimo de 6 caracteres.
- Bloqueio automático de força bruta: 5 senhas erradas seguidas bloqueiam o login
  por 10 minutos.
- Sessões expiram após 6 h de inatividade (renovadas automaticamente durante o uso —
  limite do CacheService do Apps Script).
- Só ADMIN concede o perfil ADMIN, e o sistema impede desativar/rebaixar o último
  administrador ativo.
- Prontuário duplicado é bloqueado no cadastro de pacientes; datas clínicas
  inconsistentes (saída antes da admissão, desmame concluído antes de iniciar)
  são rejeitadas.

## Instalação

1. Crie uma planilha nova no Google Sheets (será o banco de dados).
2. Abra **Extensões > Apps Script**.
3. Cole `Code.gs` no arquivo de script e crie um arquivo HTML chamado `index`
   com o conteúdo de `index.html`.
4. Execute a função `setup()` uma vez e autorize os acessos — ela cria todas as
   abas, listas iniciais e o usuário administrador. O setup grava um carimbo em
   ScriptProperties para os próximos acessos serem instantâneos; se você alterar
   os SEEDs do código, rode `setup()` de novo (ou mude `SETUP_STAMP`).
5. **Implantar > Nova implantação > App da Web**:
   - Executar como: *Eu*
   - Quem tem acesso: conforme a política do hospital
6. Acesse a URL gerada e entre com `admin` / `fono@2026` (o sistema obriga a
   trocar a senha no primeiro acesso).

## Estrutura do banco (abas criadas pelo setup)

| Aba | Conteúdo |
|---|---|
| `Config` | nome do hospital, nome do serviço e cor institucional |
| `Usuarios` | equipe e acessos (senha com hash + salt) |
| `Servicos` / `Setores` | linhas de cuidado e setores, editáveis |
| `Listas` | todas as listas clínicas, por categoria e tipo de serviço |
| `Pacientes` | base única de pacientes |
| `Episodios` | internações/acompanhamentos com dados clínicos |
| `Atendimentos` | registros diários com procedimentos e profissional |
| `Triagens` | orelhinha, linguinha e retornos |
| `Reunioes` | controle de reuniões |

## Migração de planilhas antigas

O menu **🔧 Manutenção > Reparar cabeçalhos da planilha** (dentro do Google Sheets)
corrige bancos criados por versões anteriores: cabeçalhos legados, datas em texto
(`"2026 quarta-07-01"`), coluna `ehFono` ausente, `setorId` gravado como **nome**
do setor pela importação (com `servicoId` vazio) e abas órfãs vazias
(`Internacoes`, `TriagemNeonatal`). É seguro rodar mais de uma vez; nada com dados
é apagado. Enquanto o reparo não roda, o app já tolera `setorId` como texto em
todas as leituras (censo, dashboard, consolidado e ficha).
