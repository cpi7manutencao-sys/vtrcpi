# Backup e Restauração — VTR Vercel

## Status atual (2026-09-19)

⚠️ **O banco está VAZIO.** Apenas:
- Schema criado (9 tabelas)
- 10 OPMs (units) seeded
- 1 user admin master (William)

**Faltam:**
- Viaturas
- Agendamentos antigos
- Histórico
- Outros users

Quando o William tiver o dump do servidor antigo (10.36.177.138), seguimos este roteiro.

## 1. Dump do servidor antigo (formato esperado)

O servidor antigo provavelmente tinha SQLite (`schema.sqlite.sql` no repo). Dump esperado:
- `.sql` com `INSERT INTO ...` statements
- OU `.db` (arquivo SQLite direto)

## 2. Aplicar dump no Prisma Postgres

### Opção A: psql

```powershell
$env:PGPASSWORD = "<senha-prisma-postgres>"
psql "postgresql://<user>:<pass>@db.prisma.io:5432/postgres?sslmode=require" -f backup.sql
```

### Opção B: Node (mais robusto para encoding issues)

```javascript
// C:\Temp\pg-test\restore-backup.cjs
const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  const sql = fs.readFileSync('backup.sql', 'utf-8');
  await pool.query(sql);
  console.log('Backup restaurado!');
  await pool.end();
})();
```

```powershell
$env:POSTGRES_URL = "postgres://..."
& "C:\Program Files\nodejs\node.exe" "C:\Temp\pg-test\restore-backup.cjs"
```

## 3. Mapeamento de campos (SQLite → Postgres)

⚠️ **CRÍTICO:** o schema SQLite antigo tinha nomes **snake_case** (`google_id`, `last_login`). O Postgres tem **camelCase** (`googleId`, `lastLogin`). Antes de inserir, fazer:

```sql
-- Renomear colunas no INSERT
-- sqlite: google_id, last_login, war_name, posto_graduacao
-- postgres: googleId, lastLogin, warName, postoGraduacao
```

Ou usar sed pra converter:
```bash
sed -i 's/google_id/googleId/g; s/last_login/lastLogin/g; s/war_name/warName/g; s/posto_graduacao/postoGraduacao/g' backup.sql
```

## 4. Conversão de tipos

| SQLite | Postgres | Conversão |
|---|---|---|
| `INTEGER` (autoincrement) | `BIGSERIAL` | OK se o schema foi criado com BIGSERIAL |
| `TEXT` (JSON) | `JSONB` | `::jsonb` cast ou converter antes |
| `BOOLEAN` (0/1) | `BOOLEAN` (true/false) | converter `0` → `false`, `1` → `true` |
| `DATETIME` (unix ms) | `BIGINT` | já compatível (armazenamos unix ms) |

## 5. Validar após restore

```powershell
# Inspecionar users
& "C:\Program Files\nodejs\node.exe" "C:\Temp\pg-test\check-users.cjs"
# Esperado: vários users listados
```

```sql
-- psql
SELECT count(*) FROM viaturas;
SELECT count(*) FROM agendamentos;
SELECT count(*) FROM users;
```

## 6. Cuidados

- **Ordem de inserção:** respeitar FKs. Schema atual ordem: units → users → viaturas → agendamentos → rondas.
- **Conflictos:** se tentar inserir user com `googleId` que já existe (o admin), vai dar erro de UNIQUE. Solução: usar `INSERT ... ON CONFLICT DO NOTHING` ou pular esse user.
- **Duplicatas:** validar com `SELECT count(*)` antes e depois.

## 7. Quando terminar

Depois de restaurar, validar fluxo:
1. Login com admin (já tá master)
2. Tentar listar viaturas (`/api/viaturas/list`)
3. Tentar criar agendamento
4. Conferir se dashboard funciona

## Próximos passos (depois do restore)

- [ ] Configurar SMTP pra envio de e-mails
- [ ] Configurar backup automático do Postgres (cron diário)
- [ ] Revisar RLS se necessário
