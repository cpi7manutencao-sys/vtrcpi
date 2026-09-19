# Como fazer deploy — VTR Vercel

## Setup inicial (já feito)

Documentado em [`CONFIGURACAO.md`](./CONFIGURACAO.md).

## Deploy do dia-a-dia

### 1. Garantir que tá no projeto certo

```powershell
cd "C:\Users\CASA\Desktop\evo crm\Projetos\vtr"
# Linkar ao projeto vtrcpi (não vtr!)
& "C:\Temp\pg-test\node_modules\.bin\vercel.cmd" link --scope cpi7manutencao-sys --project vtrcpi --yes
```

⚠️ Se você acidentalmente linkar em `vtr` em vez de `vtrcpi`, o alias `vtrcpi-five.vercel.app` continua servindo o bundle antigo. Ver `GOTCHAS.md#10`.

### 2. Fazer mudanças

Edite o código em `internal/`, `frontend/src/`, `tools/`, etc.

### 3. Build local (teste antes de deployar)

```powershell
cd "C:\Users\CASA\Desktop\evo crm\Projetos\vtr"
& "C:\Program Files\nodejs\node.exe" tools\build-api.mjs
```

Isso gera `.vercel/output/`. Se falhar, ver `GOTCHAS.md`.

### 4. Commit + push pro GitHub

```powershell
git add -A
git commit -m "feat: ..."
git push origin main
```

⚠️ O push só é necessário se você quiser histórico no GitHub. O Vercel pode deployar direto do local também.

⚠️ **NÃO commitar secrets!** O GitHub bloqueia push com Client IDs, tokens, connection strings.

### 5. Deploy

```powershell
$env:VERCEL_TOKEN = "vcp_..."  # seu token Vercel (NÃO commitar)
cd "C:\Users\CASA\Desktop\evo crm\Projetos\vtr"
& "C:\Temp\pg-test\node_modules\.bin\vercel.cmd" deploy --prod --yes --scope cpi7manutencao-sys
```

⚠️ `--prod` faz deploy direto em produção (sem preview). Se quiser testar antes:
```powershell
& "C:\Temp\pg-test\node_modules\.bin\vercel.cmd" deploy --yes --scope cpi7manutencao-sys
# Isso gera URL tipo https://vtrcpi-XXXXX-cpi7manutencao-sys.vercel.app (preview)
```

### 6. Verificar deploy

```powershell
# Status do alias
& "C:\Temp\pg-test\node_modules\.bin\vercel.cmd" inspect vtrcpi-five.vercel.app --scope cpi7manutencao-sys

# Logs em tempo real
& "C:\Temp\pg-test\node_modules\.bin\vercel.cmd" logs vtrcpi-five.vercel.app --scope cpi7manutencao-sys

# Testar ping
curl.exe -s "https://vtrcpi-five.vercel.app/api/ping"
# Esperado: {"ok":true,"message":"pong","timestamp":...}
```

### 7. Testar fluxo completo

1. Acessar `https://vtrcpi-five.vercel.app/#/login`
2. Clicar "Entrar com Google"
3. Logar com Gmail pessoal
4. Se for primeiro login, completar perfil
5. Verificar se virou admin (sidebar mostra menus de admin)

## Deploy de emergência (rollback)

Se um deploy quebrou tudo:

```powershell
# Listar deployments antigos
& "C:\Temp\pg-test\node_modules\.bin\vercel.cmd" ls --all --scope cpi7manutencao-sys

# Pegar ID do último bom (ex: vtrcpi-evx8yfwnf-cpi7manutencao-sys.vercel.app)
$GOOD_DEPLOY = "vtrcpi-evx8yfwnf-cpi7manutencao-sys.vercel.app"

# Apontar alias pra esse deployment
& "C:\Temp\pg-test\node_modules\.bin\vercel.cmd" alias set vtrcpi-five.vercel.app $GOOD_DEPLOY --scope cpi7manutencao-sys
```

## Mudanças que NÃO precisam de redeploy

- **Env vars:** mudar direto no painel Vercel → Settings → Environment Variables. Aplica na próxima invocação (cold start).
- **Schema do DB:** rodar `psql ... -f schema-update.sql` ou via Node. NÃO precisa redeploy.
- **Seed units/viaturas:** inserir direto no DB.

## Mudanças que precisam de redeploy

- Qualquer coisa em `internal/` (handlers, libs)
- Qualquer coisa em `frontend/src/` (UI)
- `vercel.json`, `tools/build-api.mjs`, `tools/api-entry.ts`
- `package.json` (novas deps)

## Promover user a admin master (manual)

Via SQL direto (recomendado):
```sql
UPDATE users SET
  isMaster = TRUE, approved = TRUE,
  role = 'admin', viaturasRole = 'admin', escopo = 'total'
WHERE cpf = '26034202833';
```

Ou via script Node (em `C:\Temp\pg-test\promote-master.cjs`):
```powershell
$env:POSTGRES_URL = "postgres://..."
& "C:\Program Files\nodejs\node.exe" "C:\Temp\pg-test\promote-master.cjs"
```

## Verificar DB

```powershell
$env:POSTGRES_URL = "postgres://..."
& "C:\Program Files\nodejs\node.exe" "C:\Temp\pg-test\check-users.cjs"
```

## Próximos passos após primeiro deploy

- [ ] Importar backup do DB (ver `BACKUP-RESTAURACAO.md`)
- [ ] Configurar SMTP (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` no Vercel env)
- [ ] Configurar domínio customizado (opcional)
- [ ] Adicionar rate limiting (opcional)
