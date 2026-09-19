# Migração VTR → Vercel

**Data:** 2026-09-19
**Autor:** Cabo William Michel Moraes (TI CPI-7) + agente Mavis
**Status:** ✅ Produção

## Contexto

O sistema **Viaturas CPI-7** (controle de viaturas da Polícia Militar) estava rodando num servidor interno PM (10.36.177.138:8081) que **deixou de existir**. O William precisou migrar tudo para Vercel (Hobby plan) usando:

- **Frontend:** Vite + React (build estático)
- **Backend:** Vercel Serverless Functions
- **Banco:** Postgres (Prisma Postgres — free tier)
- **Auth:** Google OAuth 2.0 (popup flow)

## Arquitetura final

```
Browser (React SPA)
   │
   │ HTTPS
   ▼
Vercel (1 única function bundled via esbuild)
   │  GET /api/* → esbuild bundle → handler
   │
   ├─ Frontend (Vite build) → static files
   │
   └─ Backend (Node.js 20.x)
       │
       │ pg (node-postgres, bundleado)
       ▼
   Prisma Postgres (db.prisma.io:5432)
```

**NÃO** usa `@vercel/postgres` (incompatível com Prisma Postgres direct connection).
**NÃO** usa Convex (mantido só pra legacy, sem deploy ativo).
**NÃO** usa SQLite/better-sqlite3 em prod (módulos nativos quebram em Vercel Serverless).

## Por que bundle único?

Vercel **Hobby plan** limita a **12 serverless functions** por projeto. O VTR tinha **59+ endpoints** em `api/`. Solução: bundle esbuild → Build Output API v3 → 1 function com router interno.

## Estrutura

| Path | Conteúdo |
|---|---|
| `vercel.json` | Build config (Build Output API v3) |
| `tools/api-entry.ts` | Router único (mapa de rotas → handlers) |
| `tools/build-api.mjs` | esbuild bundle script |
| `internal/` | Handlers (todos os endpoints — FORA de `api/`) |
| `api/` | **VAZIO** (só `.gitkeep`) — Vercel ignora |
| `frontend/dist/` | Vite build (copiado pro output) |
| `.vercel/output/` | Build Output API (gerado pelo build) |

## Documentação desta pasta

- **[CONFIGURACAO.md](./CONFIGURACAO.md)** — env vars, OAuth setup, DB, deploy
- **[GOTCHAS.md](./GOTCHAS.md)** — problemas conhecidos e soluções
- **[DEPLOY.md](./DEPLOY.md)** — como fazer deploy (primeira vez e atualizações)
- **[BACKUP-RESTAURACAO.md](./BACKUP-RESTAURACAO.md)** — como restaurar o banco quando tiver o dump

## URL principal

- **Produção:** `https://vtrcpi-five.vercel.app`
- **Alias projeto:** `cpi7manutencao-sys/vtrcpi` (Vercel team)
- **Alias adicional:** `vtr-sigma.vercel.app` (gerado pelo CLI)

## Admin master

- **CPF:** `26034202833` (Cabo William Michel Moraes)
- **Promoção automática:** ao logar/completar perfil com este CPF, vira `isMaster=TRUE, approved=TRUE, role=admin, escopo=total`
- **Constante:** `MASTER_CPFS[]` em `internal/lib/config.ts`
- **Script manual de promoção:** (em `C:\Temp\pg-test\promote-master.cjs` — script local, não no repo)

## Banco de dados

- **Provider:** Prisma Postgres (não Vercel Postgres)
- **URL:** ver env var `POSTGRES_URL` no painel Vercel (não commitar no repo)
- **SSL:** obrigatório (Prisma Postgres exige)
- **IMPORTANTE:** é **direct connection** (porta 5432), não pooled. Por isso usamos `pg` puro (não `@vercel/postgres`).

## Tabelas criadas

Ver `schema-postgres.sql` na raiz do projeto. 9 tabelas principais:
- `units` (10 OPMs seeded: CPI-7, 7BPMI, 12BPMI, 14BAEP, 22BPMI, 40BPMI, 50BPMI, 53BPMI, 54BPMI, 55BPMI)
- `users`
- `viaturas`
- `viaturaHistorico`
- `agendamentos`
- `rondas`
- `auditLog`
- (mais 2)

## Histórico

- **2026-09-19** — Migração completa, primeiro login master OK
- Aguardando: backup DB para popular viaturas/agendamentos históricos

## Próximos passos

1. 📦 **Importar backup do DB** quando William tiver o dump do servidor antigo (ver `BACKUP-RESTAURACAO.md`)
2. 📧 Configurar SMTP para envio de e-mails (SMTP_HOST, SMTP_USER, SMTP_PASS)
3. 🌐 Configurar domínio customizado (opcional: vtr.pmesp.gov.br)
4. 🔒 Revisar segurança (rate limiting, CSP headers)
