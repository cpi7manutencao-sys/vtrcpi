# Sistema de Viaturas CPI-7 — Vercel

App de controle de viaturas migrado pra Vercel com login Google.

## Stack

- **Frontend**: Vite+React (mesma base do projeto original)
- **Backend**: Vercel Serverless Functions (`/api/*`)
- **Database**:
  - **Prod**: Vercel Postgres
  - **Dev**: PGlite (Postgres real via WASM, sem Docker)
- **Auth**: Google Identity Services (GIS) + JWT próprio (`jose`)
- **Hospedagem**: Vercel (free tier)

---

## 🚀 Dev local (antes de deploy)

### 1. Instalar ferramentas

```bash
# Vercel CLI (global)
npm install -g vercel
```

(Não precisa de Docker — PGlite roda no Node via WASM)

### 2. Setup automático (1 comando)

```bash
cd D:\USER\DESKTOPP\excel\VERCEL\viaturas
npm install
cd frontend
npm install
cd ..
npm run setup
```

O `npm run setup` (executa `setup-local.ps1`):
- Cria `.env.local` com `POSTGRES_URL=pglite://./.pgdata`
- Gera JWT_SECRET randomico (32 chars)
- Cria pasta `.pgdata/` pro banco

**Depois edite `.env.local`** e cole seu `GOOGLE_CLIENT_ID` (do Google Cloud Console).

### 3. Rodar em modo dev

```bash
vercel dev
```

Abre em **http://localhost:3000** (porta padrão do Vercel CLI).

O `vercel dev`:
- Detecta Vite → roda `npm run dev` no frontend (porta 5174)
- Detecta `/api/*.ts` → roda Vercel Functions localmente
- Carrega `.env.local` automaticamente

**Schema + seed rodam automaticamente na 1a request** (graças ao `ensureSchema()` e `ensureSeed()` no `db.ts`):
- Cria as 8 tabelas
- Insere as 10 unidades raiz (CPI-7 + 9 BPMs)
- Insere o William como admin master

### 4. Testar fluxo

1. Abre http://localhost:3000
2. Clica "Login com Google" → escolhe sua conta
3. Se for `michelwilliam@policiamilitar.sp.gov.br` (mesmo email do seed) → entra direto como admin
4. Se for outra conta → vai pra "Completar Cadastro" → "Aguardando Aprovação" → você aprova logado como William

### Resetar banco local

```bash
npm run reset   # apaga .pgdata/, recria na próxima request
```

Ou manual:
```powershell
Remove-Item -Recurse -Force .pgdata
```

---

## ☁️ Deploy pra Vercel (depois de testar local)

### 1. Subir pro GitHub

1. Cria repo novo `viaturas-vercel` em https://github.com/new (privado)
2. Copia o conteúdo de `VERCEL/viaturas/` pra uma pasta limpa (sem `.git/` e sem `.pgdata/`)
3. Push:
   ```bash
   cd viaturas-vercel
   git init
   git add .
   git commit -m "Initial commit - Vercel"
   git branch -M main
   git remote add origin https://github.com/cpi7em-lgtm/viaturas-vercel.git
   git push -u origin main
   ```

### 2. Importar na Vercel

1. https://vercel.com/new → importa `cpi7em-lgtm/viaturas-vercel`
2. **Storage** → **Create Database** → **Postgres** → nome: `viaturas-db`
3. Pega o `POSTGRES_URL` que ele gera
4. **Settings** → **Environment Variables**:
   - `POSTGRES_URL` = `postgres://...` (do passo 2) - **NÃO** `pglite://`
   - `GOOGLE_CLIENT_ID` = (do Google Cloud Console)
   - `JWT_SECRET` = `openssl rand -base64 32`

### 3. Deploy

```bash
vercel --prod
```

### 4. Rodar schema no banco de prod

Como o `ensureSchema()` só roda em PGlite (dev), em prod precisa rodar manual:

No Vercel dashboard → Storage → `viaturas-db` → aba **Query** → cola o `schema.sql` → Run.

Depois seed manual (rodar no Query do dashboard) - copia o SQL de `setup-local.ps1`:
```sql
INSERT INTO units (code, name, sigla) VALUES ...;
INSERT INTO users (...) VALUES (...);
```

---

## Estrutura

```
.
├── api/                    # Vercel Functions
│   ├── _lib/
│   │   ├── db.ts          # PGlite (dev) / Vercel Postgres (prod) com mesma API
│   │   ├── jwt.ts         # sign/verify JWT
│   │   ├── google.ts      # validar Google token
│   │   ├── auth.ts        # requireAuth, hasRole
│   │   └── audit.ts       # log LGPD
│   ├── auth/{google,me,refresh}.ts
│   ├── users/{profile,pending,approve,reject,list,promote}.ts
│   ├── units/list.ts
│   └── health.ts
├── frontend/               # React+Vite
│   └── src/
│       ├── lib/auth.ts     # Google Sign-In + JWT
│       ├── lib/api.ts      # apiFetch wrappers
│       └── pages/          # LoginPage, CompletarCadastroPage, etc
├── schema.sql              # Schema Postgres (8 tabelas)
├── setup-local.ps1         # Setup automatizado (sem Docker)
├── reset-local.ps1         # Apaga .pgdata
├── vercel.json             # Config Vercel
├── .env.local              # Criado pelo setup (gitignored)
├── .pgdata/                # Banco PGlite local (gitignored)
└── README.md
```

## Endpoints (Sprint 1)

| Método | Path                          | Quem         | Descrição                          |
| ------ | ----------------------------- | ------------ | ---------------------------------- |
| GET    | /api/health                   | público      | Health check                       |
| POST   | /api/auth/google              | público      | Login com Google (GIS)             |
| GET    | /api/auth/me                  | autenticado  | Dados do user logado               |
| POST   | /api/auth/refresh             | autenticado  | Renovar JWT                        |
| POST   | /api/users/profile            | autenticado  | Completar CPF/RE/Posto/Unidade     |
| GET    | /api/users/pending            | gestor+      | Lista users aguardando aprovação   |
| POST   | /api/users/approve            | gestor+      | Aprovar user pendente              |
| POST   | /api/users/reject             | gestor+      | Rejeitar user pendente             |
| GET    | /api/users/list               | gestor+      | Listar users                       |
| POST   | /api/users/promote            | isMaster     | Mudar role/unidades                |
| GET    | /api/units/list               | autenticado  | Listar unidades                    |

## Roles

- **viewer**: só vê viaturas/agendamentos da sua unidade
- **editor**: viewer + cria agendamentos/atribui viaturas
- **gestor**: editor + aprova agendamentos, aprova users
- **admin**: tudo
- **isMaster** (William): promove qualquer user, ações destrutivas

## Próximas sprints

- **Sprint 2**: CRUD agendamentos, viaturas, units (dashboard) - 1-2 dias
- **Sprint 3**: IFCT, Rondas, script migração Convex - 1 dia
- **Sprint 4**: Refinamento + deploy prod

## Limitações conhecidas

- **Sem SAT** (consulta PM por RE) — depende de SOAP/intranet
- **Sem upload de fotos IFCT** por enquanto (TODO: Vercel Blob)
- **Sem Cloudflare Tunnel** — firewall da PM bloqueia
- **PGlite não roda em Vercel Edge Runtime** (só Node.js, que é o padrão)
