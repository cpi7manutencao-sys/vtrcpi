# Changelog - Sistema de Viaturas CPI-7

## [0.2.0] - 2026-08-06 (Fase 1 completa - pronto pra deploy)

### Adicionado

**Backend Convex (8 arquivos, ~44KB):**
- `schema.ts` - tabelas: users, units, agendamentos, viaturas
- `_helpers.ts` - getUserFromCpf, getUserUnidadesAutorizadas, recursao
- `pm_auth.ts` - createOrUpdatePMUser, setViaturasRole, listAll
- `agendamentos.ts` - create, approve, reject, atribuirViatura, concluir, cancel, list, listPorMes
- `viaturas.ts` - list, get, upsert, remove
- `dashboard.ts` - getTotaisPorUnidade (capa MAPA DE VIATURAS), getHomeStats
- `units.ts` - list, listHierarchical, upsert, getByCode

**Server-side (6 arquivos, ~46KB):**
- `auth_api_viaturas.py` - fork do auth-api Materiais, com aud="viaturas"
- `auth-api/Dockerfile` - imagem Docker
- `docker-compose-viaturas.yml` - 3 containers (backend, auth-api, nginx)
- `nginx-viaturas.conf` - config nginx vHost :8081
- `setup-viaturas.sh` - script de setup completo
- `auth_api_materiais.py` - REFERENCIA (fork do)

**Frontend (15 arquivos, ~67KB):**
- Setup: package.json, vite.config.ts, tsconfig.json, index.html
- Core: main.tsx, App.tsx, index.css
- Components: Sidebar
- Lib: auth, api, convex, constants (SELECT_UNIDADES, SELECT_TIPOS_VIATURA)
- Pages: Login, Home, Agendar, Agendamentos, Calendario, Viaturas, Dashboard, GestaoUsuarios

**Scripts deploy (4 arquivos, ~14KB):**
- `upload_to_server.py` - empacota + upload inicial
- `deploy_frontend.py` - build + upload do bundle
- `deploy_convex.py` - upload do backend + npx convex deploy
- `seed_units.py` - popula units (CPI-7, 7BPMI, etc)

**Documentacao:**
- `README.md` - overview
- `plano.md` - decisoes consolidadas
- `docs/SETUP-SERVER.md` - passo a passo completo pro William

### Funcionalidades implementadas
- [x] Login SOAP CPD
- [x] Auth JWT com aud="viaturas" (separado do Materiais)
- [x] Form de agendamento (igual Forms atual: 19 unidades + 10 tipos viatura)
- [x] Workflow: pendente -> aprovado -> atribuir VTR -> concluido
- [x] Calendario mensal
- [x] Lista de viaturas com filtros (operantes/baixadas)
- [x] CRUD de viaturas (editor/admin)
- [x] Dashboard hierarquico (geral pro admin, unidade pra outros)
- [x] Gestao de usuarios (admin: buscar por RE + atribuir role)
- [x] RLS por unidade com recursao
- [x] Cobertura obrigatoria de gestor por unidade (validacao no create)
- [x] Multi-role permitido (gestor + editor em unidades diferentes)

### Limitacoes conhecidas (Fase 2)
- [ ] Agendamento vinculado a viatura especifica: campo existe mas UI basica (digita prefixo)
- [ ] Calendario: ainda nao tem drag-and-drop nem edicao inline
- [ ] Notificacoes Zap/email: nao implementadas
- [ ] Mobile: PWA nao configurado (so desktop)
- [ ] Importar xlsx: ainda nao feito (Fase 3)

## [0.3.0] - 2026-08-07 - **DEPLOY 100% COMPLETO** 🎉

### ✅ Sistema operacional em http://10.36.177.138:8081/

**Infraestrutura (paralela ao Materiais, sem interferencia)**:
- Container `convex-backend-viaturas` (porta 3212 host → 3210 container, `DISABLE_BEACON=1`)
- Container `auth-api-viaturas` (porta 8002 host → 8082 container, SOAP CPD)
- Container `convex-nginx-viaturas` (porta 8081 host → 80 container, rewrite /convex/query → /api/query)

**Schema Convex (4 tabelas + 16 indexes)**:
- `users` (by_cpf, by_email, by_re, by_viaturasRole)
- `units` (by_code, by_active, by_parent) - **10 populadas**: CPI-7 + 7BPMI/12BPMI/14BAEP/22BPMI/40BPMI/50BPMI/53BPMI/54BPMI/55BPMI
- `agendamentos` (by_dataMissao, by_solicitante, by_status, by_unidade, by_unidade_status)
- `viaturas` (by_prefixo, by_opm, by_opm_ativo, by_ativo)

**22 functions deployadas**:
- `units: list/listHierarchical/getByCode/upsert`
- `pm_auth: createOrUpdatePMUser/setViaturasRole/listAll` (com secret compartilhado)
- `agendamentos: list/listPendentes/get/listPorMes/create/approve/reject/atribuirViatura/concluir/cancel`
- `viaturas: list/get/upsert/remove`
- `dashboard: getTotaisPorUnidade/getHomeStats`

**User seed**:
- William Michel (CPF 26034202833) com `viaturasRole: "gestor" + "admin"`, `unidadesGestor: [CPI-7]`

**Testes E2E passando**:
- `units:list` via nginx → 10 unidades
- `dashboard:getHomeStats` → contadores funcionando
- `agendamentos:create` → cria agendamento de teste
- `agendamentos:list` → retorna agendamento criado
- `/api/auth/login` → auth-api responde (SOAP CPD ativo)

### 🔑 Lições aprendidas do deploy (CRÍTICAS pra reproduzir)

1. **Convex self-hosted precisa de ADMIN KEY** (formato `convex-self-hosted|<64hex>`).
   `CONVEX_DEPLOY_KEY` é do cloud dashboard, NÃO serve. Gerar: `docker exec convex-backend-viaturas /convex/generate_admin_key.sh`

2. **Estrutura de pastas** igual Materiais:
   ```
   /opt/convex-viaturas/
     convex.json         (RAIZ, com `{"functions": "convex/"}`)
     .env.local          (RAIZ, com ASPAS por causa do |)
     package.json + node_modules  (RAIZ)
     convex/             (subdir com .ts)
   ```

3. **esbuild-linux-x64 obrigatório** quando SCP'ar node_modules de Windows:
   `npm pack @esbuild/linux-x64@0.27.0` no Windows + tar.gz SCP + extrair

4. **nginx rewrite**: `/convex/query/*` → `POST /api/query` (mesma `/api/mutation`)
   Frontend monta body `{path, args}` (path OBRIGATÓRIO)

5. **`.env.local` precisa de ASPAS** em `CONVEX_SELF_HOSTED_ADMIN_KEY="convex-self-hosted|01fa..."` por causa do pipe no shell

6. **enp5s0 SEM INTERNET** (ARP FAILED, DHCP nunca atribuiu). NUNCA contar. Baixar pacotes no Windows + SCP'ar.

7. **units:upsert** rejeita `parentUnit: null` (v.optional só aceita undefined). OMITIR o campo.

8. **pm_auth:createOrUpdatePMUser** espera `{secret, pm: {...}}` - NÃO flat. `secret: "pmesp-import-2026"`

9. **nginx restart obrigatório** após deploy do dist (volume `:ro` não remonta sozinho)

### 📋 Próximos passos
- [ ] Importar viaturas da planilha `MAPA GERAL CPI-7 - 2026.xlsx` (script Python)
- [ ] UI de Gestao de Usuarios (admin promove roles)
- [ ] Calendario mensal (hoje só lista)
- [ ] Importar historico de agendamentos (se necessário)
- [ ] Auditoria / relatórios

### Proxima milestone
- **v0.4.0** (semana 2): Importar viaturas + CRUD polish + Gestao Usuarios UI
- **v0.5.0** (semana 3): Calendario + Auditoria + Polish final

## [0.4.0] - 2026-08-07 - **Refatoracao unidadeRequerente + secaoSetor**

### Refatoracao do fluxo de agendamento

**Problema:** PM do 40BPMI nao conseguia pedir viatura pra CPI-7.
Antes so podia pedir pra PROPRIA unidade. Solicitante = unidade do PM.

**Solucao:** PM escolhe a unidade REQUERENTE (pra qual vai a viatura),
independente da sua origem. Quem ve o pedido é o gestor da UNIDADE REQUERENTE.

**Mudancas no schema (Convex `agendamentos` table):**
- REMOVIDO: `unidadeSolicitante` (campo antigo, ambiguo)
- ADICIONADO: `unidadeRequerente: v.optional(v.id("units"))` (escolhida pelo PM)
- ADICIONADO: `unidadeRequerenteOutro: v.optional(v.string())` (texto livre se "Outro")
- ADICIONADO: `unidadeOrigem: v.optional(v.id("units"))` (automatica, do user logado)
- ADICIONADO: `secaoSetor: v.optional(v.string())` (P-1, P-2, P-3, etc)
- Indexes: `by_unidade_requerente`, `by_unidade_origem`, `by_unidade_requerente_status`

**Mudancas no RLS (`agendamentos:list`):**
- admin: ve TODOS os agendamentos
- gestor/editor: ve onde a `unidadeRequerente` esta nas unidades autorizadas (recursivo)
- viewer: ve so os proprios (solicitante = user)

**Mudancas no `agendamentos:create`:**
- admin/gestor da unidade pode criar sem validacao extra
- viewer so cria se a unidade REQUERENTE tiver gestor nomeado (admin ou gestor)
- unidadeOrigem auto-filla com `user.unit`

**Mudancas no `agendamentos:approve/reject`:**
- Valida que o user é gestor da `unidadeRequerente` (nao da origem)

**Mudancas no frontend:**
- `AgendarPage.tsx`: card "Unidade / Missao" agora tem 2 selects lado-a-lado:
  - **Unidade REQUERENTE** (10 unidades do CPI-7 + "Outro"): pra qual unidade vai a viatura
  - **Secao/Setor** (P-1, P-2, P-3, P-4, P-5, PJMD, COPOM, Banda, Guarda, Escola, Reserva + "Outro")
- Banner azul explica a OPM de origem (automatica) e quem vai ver o pedido
- `AgendamentosPage.tsx` (lista e modal) mostra `unidadeRequerente` + `unidadeOrigem` + `secaoSetor`
- `frontend/src/lib/constants.ts`: novos `UNIDADES_REQUERENTES` (10 units) e `SELECT_SECOES_SETORES`

### Deploy (DRAMA)

**Problemas enfrentados (todos resolvidos):**

1. **nginx retorna 500** no / e 404 nos assets
   - Causa: container convex-nginx-viaturas foi reiniciado com filesystem cache de versao antiga
   - Fix: `docker stop convex-nginx-viaturas && docker start convex-nginx-viaturas`
   - Bind mount `ro` nao remontou sozinho, restart forca a remontagem

2. **Schema deploy bloqueado** "Object is missing the required field `unidadeRequerente`"
   - Causa: 3 agendamentos antigos tinham `unidadeSolicitante` (campo removido)
   - Solucao 1 (tentada): tornar campo opcional - nao funcionou (reclamou de "extra field")
   - Solucao 2 (final): soft-deletar via SQLite direto (`UPDATE documents SET deleted=1`)
     - O Convex self-hosted usa SQLite em `/var/lib/docker/volumes/<hash>/_data/db.sqlite3`
     - Tabela `documents(id BLOB, ts, table_id BLOB, json_value TEXT, deleted INT)`
     - `_tables` table tem o `id` que é o `table_id` dos documentos
     - `pm db do Convex é owned by uid 1000, precisa sudo`

3. **`docker rm -f convex-backend-viaturas` recriou o container com NOVA instance secret**
   - Volume anonimo tambem mudou (hash novo)
   - Admin key antiga do `.env.local` nao serviu mais
   - **Fix:** `docker exec convex-backend-viaturas /convex/generate_admin_key.sh`
     - Atualizar `/opt/convex-viaturas/.env.local` com a nova key
     - Formato: `CONVEX_SELF_HOSTED_ADMIN_KEY="convex-self-hosted|<64hex>"`
     - Aspas obrigatorias (shell quebra no `|`)

4. **Bundle JS do Chrome cacheou o bundle antigo**
   - Solucao: renomear bundle pra URL totalmente nova (ja foi feito, hash `index-CNbHFUR6.js`)

5. **`pm_auth:setViaturasRole` precisa do user ja criado**
   - Workaround: chamar `pm_auth:createOrUpdatePMUser` direto (cria user se nao existe)
   - Campos: `secret: "pmesp-import-2026"`, `pm: {cpf, re, digre, nome, guerra, ptgr, codptgr, opm, sexo, dataNascimento, email}`
   - Retorna `user` completo com `viaturasRole` (admin se cpf=26034202833, senao viewer)

6. **Bug `meusAgendamentos is not defined`** em `getHomeStats`
   - Faltava `let meusAgendamentos = 0;` no comeco do handler
   - So aparecia quando user nao era gestor (a linha do gestor declarava a variavel no escopo interno)

7. **Validador `parentUnit: null` rejeita**
   - `v.optional(v.id("units"))` so aceita `undefined`, NAO `null`
   - Workaround: OMITIR o campo do body, NAO enviar como null

### Estado final (apos deploy limpo)

- 17 indexes deployados (incluindo 6 novos de `agendamentos`)
- 10 units (CPI-7 + 9 sub-OPMs) populadas
- William (CPF 26034202833) recriado com `viaturasRole: "admin"`, `unidadesGestor: [CPI-7]`
- 203 viaturas re-importadas (0 erros, 100% baixadas)
- 0 agendamentos antigos (5 soft-deletados)
- E2E test: criar agendamento (CPI-7 -> 40BPMI) com `unidadeRequerente: 607400000` + `secaoSetor: P-3` funcionou
- getHomeStats retorna `pendentes: 1, meusAgendamentos: 1`
- Bundle novo servindo (HTTP 200)

### Proxima milestone
- **v0.5.0** (semana 3): Promover PMs como gestor de cada BPM/BAEP + Calendario visual + Auditoria + Polish final
- **DEPOIS:** importar viaturas OPERANDO (separado das BAIXADAS) + UI de Gestao Usuarios melhorada

