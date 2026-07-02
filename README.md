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
  FOIS admissão/alta, consistência da alta), com filtro de período e exportação CSV —
  equivalente à aba CONSOLIDADO das planilhas, sem `#REF!`.
- **Configurações** — nome do hospital, serviços, setores, todas as listas clínicas
  (dietas, procedimentos, prioridades, resultados de exame, fatores de risco…) e
  usuários com perfis (ADMIN, COORDENAÇÃO, FONO). Tudo editável pela interface.

## Instalação

1. Crie uma planilha nova no Google Sheets (será o banco de dados).
2. Abra **Extensões > Apps Script**.
3. Cole `Code.gs` no arquivo de script e crie um arquivo HTML chamado `index`
   com o conteúdo de `index.html`.
4. Execute a função `setup()` uma vez e autorize os acessos — ela cria todas as
   abas, listas iniciais e o usuário administrador.
5. **Implantar > Nova implantação > App da Web**:
   - Executar como: *Eu*
   - Quem tem acesso: conforme a política do hospital
6. Acesse a URL gerada e entre com `admin` / `fono@2026` (o sistema obriga a
   trocar a senha no primeiro acesso).

## Estrutura do banco (abas criadas pelo setup)

| Aba | Conteúdo |
|---|---|
| `Config` | nome do hospital e do serviço |
| `Usuarios` | equipe e acessos (senha com hash + salt) |
| `Servicos` / `Setores` | linhas de cuidado e setores, editáveis |
| `Listas` | todas as listas clínicas, por categoria e tipo de serviço |
| `Pacientes` | base única de pacientes |
| `Episodios` | internações/acompanhamentos com dados clínicos |
| `Atendimentos` | registros diários com procedimentos e profissional |
| `Triagens` | orelhinha, linguinha e retornos |
| `Reunioes` | controle de reuniões |
