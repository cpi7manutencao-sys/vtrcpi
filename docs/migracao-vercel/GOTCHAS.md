# Gotchas — VTR Vercel

Problemas que levei horas pra debugar. NÃO repita esses erros.

## 1. `@vercel/postgres` rejeita direct connection

**Sintoma:**
```
VercelPostgresError - 'invalid connection string':
This connection string is meant to be used with a direct connection.
Make sure to use a pooled connection string or try 'createClient()' instead.
```

**Causa:** `@vercel/postgres` v0.10+ exige **pooled** connection string. Prisma Postgres só dá **direct** (porta 5432).

**Solução:** Usar `pg` (node-postgres) que aceita ambas:
```ts
import pgMod from "pg";
const { Pool } = pgMod;
const pool = new Pool({ connectionString: POSTGRES_URL, ssl: { rejectUnauthorized: false } });
```

## 2. `pg` retorna colunas em LOWERCASE

**Sintoma:** código que faz `user.warName`, `user.viaturasRole`, `user.isMaster` recebe `undefined`, mas `user.warname`, `user.viaturasrole`, `user.ismaster` têm valor.

**Causa:** `pg` por padrão converte nomes de coluna pra lowercase. Não tem opção nativa pra preservar case.

**Solução:** map manual das colunas conhecidas em `internal/lib/db.ts`:
```ts
const COLUMN_CAMEL_MAP: Record<string, string> = {
  warname: "warName",
  postograduacao: "postoGraduacao",
  viaturasrole: "viaturasRole",
  ismaster: "isMaster",
  // ... ~80 colunas
};

function camelizeRow(row: any): any {
  if (!row || typeof row !== "object") return row;
  const result: any = {};
  for (const k of Object.keys(row)) {
    result[COLUMN_CAMEL_MAP[k.toLowerCase()] || k] = row[k];
  }
  return result;
}
```

⚠️ **Não dá pra fazer via regex** (`warname` → `warName` precisa de informação semântica).

⚠️ **Manter sincronizado** com `schema-postgres.sql`. Quando adicionar coluna nova, adicionar no map.

## 3. Vercel Hobby: 12 functions max

**Sintoma:** `vercel deploy` falha com `Function count exceeded`.

**Causa:** Vercel Hobby limita 12 serverless functions. VTR tem 59+ endpoints em `api/`.

**Solução:** Consolidar tudo em 1 function usando Build Output API v3:
- Mover handlers pra `internal/` (FORA de `api/`)
- Esbuild bundle tudo em 1 arquivo `.vercel/output/functions/api/index.func/index.js`
- Router único em `tools/api-entry.ts` mapeia path → handler

⚠️ **Pastas com prefixo `_` no `api/`** são EXCLUÍDAS do bundle pela Vercel (não viram functions, mas também somem do código). Mover pra FORA de `api/`.

## 4. `shouldAddHelpers: true` é obrigatório

**Sintoma:** `res.status(200).json(...)` falha com `"res.status is not a function"`.

**Causa:** Sem `shouldAddHelpers: true` no `.vc-config.json`, a Vercel não injeta os helpers no response object.

**Solução:**
```json
{
  "runtime": "nodejs20.x",
  "handler": "index.js",
  "launcherType": "Nodejs",
  "shouldAddHelpers": true
}
```

## 5. `createRequire(import.meta.url)` quebra em CJS bundle

**Sintoma:** `Error: filename must be a file URL object` ao tentar `require()` de módulo nativo.

**Causa:** `createRequire(import.meta.url)` não funciona em bundle CJS (import.meta.url vira undefined).

**Solução:** Usar `require` GLOBAL direto:
```ts
// ❌ Errado
const _require = createRequire(import.meta.url);

// ✅ Certo
function safeRequire(name: string) {
  try {
    return (globalThis as any).require(name);
  } catch {
    return null;
  }
}
```

⚠️ `require` global existe em CJS e é emulado em Vercel Serverless ESM.

## 6. `import()` dinâmico quebra com esbuild ESM

**Sintoma:** `Error: Cannot find module 'X'` em runtime, mas bundle compilou.

**Causa:** esbuild em formato ESM mantém referência lazy em `import()` dinâmico. Em runtime, não consegue resolver o path porque o módulo foi bundleado.

**Solução:** SEMPRE usar `import * as X from 'X'` estático. esbuild inlineia.

```ts
// ❌ Errado
const { signSession } = await import("../lib/jwt");

// ✅ Certo
import * as jwtLib from "../lib/jwt";
const { signSession } = jwtLib;
```

## 7. Módulos puros JS vs nativos

| Tipo | Estratégia | Exemplos |
|---|---|---|
| **Puros JS** (sem `.node` binary) | **bundlear** com esbuild (`external: []`) | `jose`, `google-auth-library`, `pg`, `@vercel/postgres` |
| **Nativos** (com `.node` binary) | marcar como `external` + usar `safeRequire()` lazy | `better-sqlite3`, `pdfkit`, `nodemailer`, `svg-to-pdfkit` |

**Como distinguir:**
```bash
# Procura por .node files
ls node_modules/better-sqlite3/build/Release/*.node
```

**Exemplo safeRequire:**
```ts
// internal/lib/safe-load.ts
export function safeRequire(name: string): any {
  try {
    return (globalThis as any).require(name);
  } catch {
    return null;
  }
}

// Uso
const nodemailer = safeRequire("nodemailer");
if (!nodemailer) {
  console.warn("nodemailer nao disponivel (Vercel/Serverless)");
  return null; // endpoint retorna 503
}
```

**No `tools/build-api.mjs`:**
```js
external: [
  "@vercel/node",
  "better-sqlite3",
  "@electric-sql/pglite",
  "pdfkit",
  "nodemailer",
  "svg-to-pdfkit",
  // puros JS sao bundleados
],
```

## 8. `installCommand` precisa instalar frontend

**Sintoma:** Vercel build falha com `Cannot find module '/vercel/path0/frontend/node_modules/vite/bin/vite.js'`.

**Causa:** `vercel.json` com `installCommand: "npm install"` só instala deps da raiz. `frontend/node_modules` não existe na Vercel.

**Solução:**
```json
{
  "installCommand": "npm install && cd frontend && npm install && cd .."
}
```

## 9. `@vercel/node` types no esbuild

**Sintoma:** TypeScript build OK, mas esbuild falha com "Cannot find module '@vercel/node'".

**Causa:** `@vercel/node` é só types/interface. Não precisa ser bundleado (não tem código runtime).

**Solução:** Marcar como `external` no esbuild (já está na lista).

## 10. Alias do Vercel pode estar em 2 projetos

**Sintoma:** Você faz `vercel deploy` mas o alias `vtrcpi-five.vercel.app` continua servindo bundle antigo.

**Causa:** Tinha 2 projetos: `cpi7manutencao-sys/vtr` e `cpi7manutencao-sys/vtrcpi`. O alias aponta pro `vtrcpi`. Você tá deployando no `vtr` (porque o `package.json` ou auto-detect colocou esse nome).

**Diagnóstico:**
```bash
vercel inspect vtrcpi-five.vercel.app --scope cpi7manutencao-sys
# Mostra pra qual deployment o alias aponta
```

**Solução:**
```bash
vercel link --scope cpi7manutencao-sys --project vtrcpi --yes
# Depois
vercel deploy --prod --yes --scope cpi7manutencao-sys
```

## 11. SSL warning do `pg`

**Sintoma:**
```
Warning: SECURITY WARNING: The SSL modes 'prefer', 'require', and 'verify-ca' are treated as
aliases for 'verify-full'. In the next major version (pg-connection-string v3.0.0 and pg v9.0.0),
these modes will adopt standard libpq semantics, which have weaker security guarantees.
```

**Causa:** Mudança no `pg` v8+. `'require'` agora = `'verify-full'` (mais seguro). É só warning, funciona igual.

**Solução:** ignorar (não tem impacto funcional). Se quiser silenciar:
```ts
new Pool({
  connectionString: POSTGRES_URL,
  ssl: { rejectUnauthorized: false }, // ou true
});
```

## 12. JWT_SECRET — literal vs base64

**Sintoma:** JWT gerado localmente falha com "Token inválido ou expirado" no Vercel.

**Causa:** o código usa `JWT_SECRET` **LITERAL**, mas você tava decodificando de base64 antes de usar.

**No projeto:**
```ts
const SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "fallback");
```

Se você fizer:
```js
// ❌ Errado
new TextEncoder().encode(Buffer.from(JWT_SECRET, 'base64'))
```

Vai dar secret diferente do servidor.

**Solução:** usar o valor literal direto:
```js
// ✅ Certo
new TextEncoder().encode(process.env.JWT_SECRET)
```

## 13. Placeholder `?` em `query()` direto

**Sintoma:** `Error: syntax error at end of input` em queries estilo SQLite (`WHERE id = ?`).

**Causa:** o `query()` aceita ambos `?` (SQLite) e `$1, $2` (Postgres). Mas quando alguém chama `query("SELECT * FROM x WHERE id = ?", [id])` em modo Postgres, o `?` não é convertido.

**Solução:** `query()` converte `?` → `$N` automaticamente:
```ts
function questionToPostgres(sql: string, paramCount: number): string {
  let result = "";
  let inString = false;
  let stringChar = "";
  let idx = 0;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (!inString && (ch === "'" || ch === '"')) {
      inString = true;
      stringChar = ch;
      result += ch;
    } else if (inString && ch === stringChar) {
      if (sql[i + 1] === ch) { result += ch + ch; i++; }
      else { inString = false; result += ch; }
    } else if (!inString && ch === "?") {
      idx++;
      result += `$${idx}`;
    } else {
      result += ch;
    }
  }
  return result;
}
```

## 14. Frontend JWT cacheado

**Sintoma:** User completa perfil, é promovido no DB, mas o frontend ainda mostra "aguardando aprovação".

**Causa:** JWT contém os dados antigos (`isMaster: false`, `approved: false`). O frontend usa o JWT cacheado no localStorage.

**Solução:** Frontend chama `/api/auth/me` no boot (que lê do DB):
```tsx
// App.tsx
function BootRefresher() {
  useEffect(() => {
    if (!getUser()) return;
    refreshUserFromServer().catch(() => {});
  }, []);
  return null;
}
```

## 15. `package.json` no `frontend/` duplica instalação

**Sintoma:** 200+ packages no npm install da raiz + 73 no frontend.

**Causa:** `frontend/package.json` é separado (vite, react). Vercel precisa instalar ambos.

**Solução:** `installCommand` unificado (ver #8).

## 16. PowerShell quebra JSON inline

**Sintoma:** `vercel logs` ou `curl` com header JSON inline retorna erro de escape.

**Causa:** PowerShell tem problemas com aspas em argumentos inline.

**Solução:** gravar JSON em arquivo `.json` e usar `Get-Content -Raw`:
```powershell
$env:POSTGRES_URL | Out-File -FilePath "C:\Temp\pg-test\.env" -Encoding UTF8
& node script.js  # que usa dotenv
```

## 17. Vercel CLI em outro path

**Vercel CLI está em:** `C:\Temp\pg-test\node_modules\.bin\vercel.cmd` (não em `node_modules\.bin` da raiz).

Por que? Porque o William instalou o CLI via `npm install -g vercel` em outro projeto. Funciona, só precisa saber o path.

## 18. Múltiplos deployments podem coexistir

**Diagnóstico:** `vercel ls --all --scope cpi7manutencao-sys` mostra 20+ deployments.

**Não é problema**, mas pode confundir. Pra ver qual tá ativo:
```bash
vercel alias ls --scope cpi7manutencao-sys
```

Mostra qual deployment cada alias (`vtrcpi-five`, `vtr-sigma`) aponta.
