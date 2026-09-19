# Configuração — VTR Vercel

## 1. Variáveis de ambiente (Vercel)

Configurar no painel: **vercel.com/cpi7manutencao-sys/vtrcpi → Settings → Environment Variables**

| Variável | Valor (formato) | Descrição |
|---|---|---|
| `POSTGRES_URL` | `postgres://<user>:<pass>@db.prisma.io:5432/postgres?sslmode=require` | URL Prisma Postgres (direct connection, NÃO usar `@vercel/postgres`) |
| `JWT_SECRET` | `<base64-de-24-bytes>` | Secret JWT — usado LITERAL, não decodificado |
| `APP_BASE_URL` | `https://vtrcpi-five.vercel.app` | URL público (sem `/api`) |
| `GOOGLE_CLIENT_ID` | `<id>.apps.googleusercontent.com` | OAuth Google |
| `GOOGLE_CLIENT_SECRET` | `GOCSPX-...` | OAuth Google secret |

⚠️ **NÃO COMMITE OS VALORES REAIS** — use placeholders no repo, valores reais só no painel Vercel.

### Frontend (Vite build-time)

| Variável | Onde | Valor |
|---|---|---|
| `VITE_GOOGLE_CLIENT_ID` | Vercel env (visible no build) | mesmo `GOOGLE_CLIENT_ID` |
| `VITE_API_BASE` | Vercel env (visible no build) | vazio (usa mesma origem) |

⚠️ Variáveis `VITE_*` são visíveis no bundle — não colocar secrets aí.

## 2. Google OAuth Setup

**Google Cloud Console:** https://console.cloud.google.com/apis/credentials

**Client OAuth:**
- Tipo: Web application
- Nome: `VTR CPI-7`
- Authorized JavaScript origins:
  - `https://vtrcpi-five.vercel.app`
  - `https://vtr-sigma.vercel.app`
- Authorized redirect URIs:
  - `https://vtrcpi-five.vercel.app/api/auth/google/callback`
  - `https://vtr-sigma.vercel.app/api/auth/google/callback`

**Conta usada:** Gmail pessoal do William (não precisa ser `@policiamilitar.sp.gov.br`).

## 3. Banco de dados (Prisma Postgres)

**Provider:** Prisma Postgres
**URL:** ver env var `POSTGRES_URL` (valor real só no painel Vercel)
**Por que Prisma Postgres (e não Vercel Postgres)?**
- Plano Hobby do Vercel dá 256MB Postgres grátis mas com pooled URL obrigatória
- Prisma Postgres free tier: 256MB direct connection (compatível com `pg`)
- O Vercel Postgres v0.10+ rejeita direct connection (exige pooled)
- Solução: usar `pg` (node-postgres) que aceita ambas

**Aplicar schema:**
```bash
psql "$POSTGRES_URL" -f schema-postgres.sql
```

**Tabela crítica — seed units (10 OPMs):**
```sql
INSERT INTO units (code, name, sigla, active) VALUES
  ('607000', 'CPI-7', 'CPI-7', TRUE),
  ('607070', '7º BPM-I', '7BPMI', TRUE),
  ('607120', '12º BPM-I', '12BPMI', TRUE),
  ('607140', '14º BAEP', '14BAEP', TRUE),
  ('607220', '22º BPM-I', '22BPMI', TRUE),
  ('607400', '40º BPM-I', '40BPMI', TRUE),
  ('607500', '50º BPM-I', '50BPMI', TRUE),
  ('607530', '53º BPM-I', '53BPMI', TRUE),
  ('607540', '54º BPM-I', '54BPMI', TRUE),
  ('607550', '55º BPM-I', '55BPMI', TRUE);
```

## 4. Admin Master

**Constante (em código):** `internal/lib/config.ts`

```ts
export const MASTER_CPFS: string[] = [
  "26034202833", // Cabo William Michel Moraes - TI CPI-7
];

export function isMasterCpf(cpf: string | null | undefined): boolean {
  if (!cpf) return false;
  const cleaned = String(cpf).replace(/\D/g, "");
  return MASTER_CPFS.includes(cleaned);
}
```

**Auto-promoção (em 2 lugares):**
1. `internal/auth/google/callback.ts` — quando user é criado/atualizado por email
2. `internal/users/profile.ts` — quando user completa perfil

**Promoção manual (fallback se auto falhar):**
```sql
UPDATE users SET
  isMaster = TRUE, approved = TRUE,
  role = 'admin', viaturasRole = 'admin', escopo = 'total'
WHERE cpf = '26034202833';
```

## 5. JWT

**Biblioteca:** `jose` (HS256)
**Algoritmo:** HS256
**Issuer:** `viaturas-cpi7`
**Audience:** `viaturas-cpi7-app`
**Expiração:** 7 dias

**Estrutura do payload (SessionPayload):**
```ts
{
  googleId, email, name, picture,
  userId, cpf, re, warName, postoGraduacao,
  unitId, unitCode,
  role, viaturasRole,
  unidadesGestor: number[],
  unidadesEditor: number[],
  approved, isMaster, escopo
}
```

⚠️ `JWT_SECRET` é usado **LITERAL** (não decodificado de base64). Se você criar um secret novo, salve o valor direto na env var.

## 6. Frontend (Vite + React)

**Stack:**
- React 18 + React Router 6
- Vite 5
- TypeScript 5

**Build output:** `frontend/dist/` (copiado pra `.vercel/output/static/`)

**API client:** `frontend/src/lib/auth.ts → apiFetch()`
- Lê JWT do `localStorage` (chave `viaturas_token`)
- User object em `viaturas_user`
- Envia `Authorization: Bearer <token>` em toda chamada
- Redireciona pra `/login` em 401

**Refresh do user no boot:** `App.tsx → BootRefresher` chama `/api/auth/me` ao montar pra sincronizar role/isMaster com DB (evita usar JWT cacheado).

## 7. Estrutura de pastas

```
vtr/
├── api/                          # VAZIO (só .gitkeep)
├── frontend/                     # React + Vite
│   ├── dist/                     # Build output
│   ├── src/
│   │   ├── App.tsx              # Router + BootRefresher
│   │   ├── lib/auth.ts          # JWT + apiFetch
│   │   ├── components/Sidebar.tsx
│   │   └── pages/
│   ├── package.json
│   └── vite.config.ts
├── internal/                     # Handlers (FORA de api/!)
│   ├── auth/
│   ├── users/
│   ├── units/
│   ├── viaturas/
│   ├── agendamentos/
│   ├── ifct/
│   ├── rondas/
│   ├── dashboard/
│   ├── handlers/health.ts
│   ├── lib/
│   │   ├── db.ts                # pg (Postgres) | better-sqlite3 (SQLite dev) | PGlite
│   │   ├── jwt.ts               # jose HS256
│   │   ├── google.ts            # OAuth helpers
│   │   ├── auth.ts              # requireAuth, hasRole
│   │   ├── config.ts            # MASTER_CPFS, isMasterCpf
│   │   ├── safe-load.ts         # safeRequire() helper
│   │   └── audit.ts             # audit log
│   └── debug/dump.ts            # Endpoint de debug
├── tools/
│   ├── api-entry.ts             # Router único (mapa path → handler)
│   └── build-api.mjs            # esbuild bundle script
├── vercel.json                   # Build config (Build Output API v3)
├── schema-postgres.sql           # Schema + seed
├── package.json                  # Deps backend
└── docs/
    ├── SETUP-SERVER.md          # Documentação original (servidor PM)
    └── migracao-vercel/         # ← esta pasta
```

## 8. Configuração `.vercel/output/`

Gerado automaticamente pelo `tools/build-api.mjs`:

```
.vercel/
└── output/
    ├── config.json              # Routes (Build Output API v3)
    ├── static/                  # frontend/dist copiado aqui
    └── functions/
        └── api/
            └── index.func/
                ├── index.js     # Bundle esbuild (1.2MB)
                └── .vc-config.json  # shouldAddHelpers: true
```

## 9. Headers HTTP (vercel.json)

```json
"headers": [
  {
    "source": "/(.*)",
    "headers": [
      { "key": "X-Content-Type-Options", "value": "nosniff" },
      { "key": "X-Frame-Options", "value": "DENY" },
      { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" }
    ]
  },
  {
    "source": "/assets/(.*)",
    "headers": [
      { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
    ]
  }
]
```

## 10. `.vercelignore`

Ignora: `node_modules/`, `frontend/node_modules/`, `.git/`, `convex/`, `scripts/`, `docs/`, `*.bak`, `*.db`, `.env*`, etc.

⚠️ Importante: `api/` NÃO é ignorado porque precisa ter `.gitkeep` (mas a pasta fica vazia).
