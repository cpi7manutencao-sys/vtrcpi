# SETUP DO SERVER - Sistema de Viaturas CPI-7

Guia completo pra subir a infra nova no server 10.36.177.138.

**IMPORTANTE:** este setup NAO TOCA no Controle de Materiais (`/opt/convex/`).
Cria infra paralela em `/opt/convex-viaturas/`.

---

## Pre-requisitos

- Acesso SSH ao server (user `pm`, senha `11192655`)
- Sudo via askpass ja configurado (`/opt/askpass-sudo.sh`)
- Docker rodando (ja esta, pro Materiais)
- ~500MB de espaco em disco

---

## Passo 1: Copiar arquivos pro server

Da sua maquina Windows (este workspace), faca upload dos arquivos pro server.

### 1.1 Copiar `auth-api/`

```bash
# No Windows PowerShell
scp -r D:/USER/DESKTOPP/excel/viaturas/server-config/auth-api pm@10.36.177.138:/tmp/viaturas-setup/
```

### 1.2 Copiar `auth_api_viaturas.py`

```bash
scp D:/USER/DESKTOPP/excel/viaturas/server-config/auth_api_viaturas.py pm@10.36.177.138:/tmp/viaturas-setup/
```

### 1.3 Copiar configs

```bash
scp D:/USER/DESKTOPP/excel/viaturas/server-config/docker-compose-viaturas.yml pm@10.36.177.138:/tmp/viaturas-setup/
scp D:/USER/DESKTOPP/excel/viaturas/server-config/nginx-viaturas.conf pm@10.36.177.138:/tmp/viaturas-setup/
scp D:/USER/DESKTOPP/excel/viaturas/server-config/setup-viaturas.sh pm@10.36.177.138:/tmp/viaturas-setup/
```

### 1.4 Copiar o codigo Convex (pra deploy)

```bash
scp -r D:/USER/DESKTOPP/excel/viaturas/convex pm@10.36.177.138:/tmp/viaturas-setup/
```

---

## Passo 2: Rodar setup no server

SSH no server:

```bash
ssh pm@10.36.177.138
```

Entrar como sudo via askpass (ja esta configurado). Os scripts abaixo ja usam sudo via askpass automaticamente.

### 2.1 Instalar o Convex CLI globalmente

```bash
sudo -A npm install -g convex
```

### 2.2 Organizar arquivos e rodar setup

```bash
# Cria a estrutura esperada
mkdir -p /tmp/viaturas-setup/auth-api
mv /tmp/viaturas-setup/auth_api_viaturas.py /tmp/viaturas-setup/auth-api/
mv /tmp/viaturas-setup/auth-api/* /tmp/viaturas-setup/auth-api/  # Dockerfile continua

# OU copie o conteudo do diretorio server-config direto
# (alternativa: rodar o setup-viaturas.sh que faz isso sozinho)

# Da pasta /tmp/viaturas-setup, rode:
chmod +x setup-viaturas.sh
./setup-viaturas.sh
```

O script `setup-viaturas.sh` faz:
1. Cria `/opt/convex-viaturas/{auth-api,dist,data,storage}`
2. Copia todos os arquivos
3. Build da imagem Docker do auth-api
4. Sobe os 3 containers (convex-backend, auth-api, nginx)
5. Valida com curl

### 2.3 Verificar

```bash
# Containers rodando
sudo -A docker ps | grep -i viaturas

# nginx respondendo
curl http://localhost:8081/health

# auth-api respondendo
curl http://localhost:8002/api/health

# Convex respondendo
curl http://localhost:3210/version  # porta interna do container
```

---

## Passo 3: Deploy do backend Convex

```bash
# Cria um projeto Convex self-hosted
cd /opt/convex-viaturas/convex

# Gera convex.json (solicita CONVEX_URL e CONVEX_DEPLOY_KEY)
npx convex dev --once --configure new --team CPI-7 --project viaturas --prod

# OU se ja existir:
npx convex deploy
```

O `npx convex deploy` faz:
1. Gera codigo (`_generated/`)
2. Faz deploy das mutations/queries
3. Retorna URL do Convex (ex: `https://viaturas-abc.convex.cloud`)

**IMPORTANTE:** anote a URL retornada. Vai precisar no deploy do frontend.

---

## Passo 4: Deploy do frontend

Volte pra maquina Windows. Build o frontend:

```bash
cd D:/USER/DESKTOPP/excel/viaturas/frontend

# Define a URL do Convex (a que o deploy retornou)
set VITE_CONVEX_URL=https://viaturas-abc.convex.cloud

# Instala dependencias
npm install

# Build
npm run build
```

Upload do bundle pro server:

```bash
# (do PowerShell, usando paramiko)
py D:/USER/DESKTOPP/excel/viaturas/scripts/deploy_frontend.py
```

OU manualmente via scp:

```bash
scp D:/USER/DESKTOPP/excel/viaturas/frontend/dist/index.html pm@10.36.177.138:/tmp/
scp -r D:/USER/DESKTOPP/excel/viaturas/frontend/dist/assets pm@10.36.177.138:/tmp/
```

No server:

```bash
sudo -A cp /tmp/index.html /opt/convex-viaturas/dist/
sudo -A cp -r /tmp/assets /opt/convex-viaturas/dist/
sudo -A chown -R pm:pm /opt/convex-viaturas/dist
```

---

## Passo 5: Testar

1. Abre `http://10.36.177.138:8081/` no Chrome
2. Faz login com CPF do William (26034202833) e senha do holerite
3. Confirma que aparece o dashboard
4. Vai em Agendar > preenche > submete
5. Vai em Agendamentos > confirma que aparece pendente
6. (Como admin) vai em Gestao > ve que tem 1+ usuario
7. Aprova o agendamento
8. Vai em Dashboard > ve os totais

---

## Estrutura final no server

```
/opt/
├── convex/                    (Materiais - INTOCADO)
└── convex-viaturas/          (NOVO)
    ├── auth-api/
    │   ├── Dockerfile
    │   └── auth_api_viaturas.py
    ├── data/                  (Postgres do Convex Viaturas)
    ├── storage/               (storage do Convex)
    ├── dist/                  (bundle React - sub diretorio)
    │   ├── index.html
    │   └── assets/
    │       ├── index-XXXX.js
    │       └── index-XXXX.css
    ├── convex/                (codigo fonte do Convex)
    │   ├── schema.ts
    │   ├── _helpers.ts
    │   ├── pm_auth.ts
    │   ├── agendamentos.ts
    │   ├── viaturas.ts
    │   ├── dashboard.ts
    │   ├── package.json
    │   └── tsconfig.json
    ├── docker-compose-viaturas.yml
    ├── nginx-viaturas.conf
    └── nginx.conf             (copia de nginx-viaturas.conf)
```

Containers Docker:
- `convex-backend-viaturas` (portas 3210-3211/tcp, sem host port)
- `auth-api-viaturas` (porta 8002->8082)
- `convex-nginx-viaturas` (porta 8081->80)

---

## Troubleshooting

### "Permission denied" ao rodar docker

```bash
sudo -A usermod -aG docker pm
# logout/login pra ativar
```

### "nginx ja esta usando porta 8080"

Nao conflita. O Materiais usa 8080. O Viaturas usa 8081.

### "Convex backend unhealthy"

```bash
sudo -A docker logs convex-backend-viaturas
```

Aguarde 1-2 min pro Convex inicializar o schema.

### Frontend mostra "Network error"

1. Verifica que `VITE_CONVEX_URL` foi setado certo no build
2. Verifica que nginx ta servindo a URL correta
3. Limpa cache do Chrome (Ctrl+Shift+Delete)

### Auth-api retorna 500

```bash
sudo -A docker logs auth-api-viaturas -f
```

Provavelmente erro de import. Verifica se o auth_api_viaturas.py ta com a sintaxe correta.

---

## Updates futuros (deploy rapido)

```bash
# 1. Atualizar codigo Convex
cd /opt/convex-viaturas/convex
npx convex deploy

# 2. Atualizar frontend (da maquina Windows)
cd D:/USER/DESKTOPP/excel/viaturas/frontend
npm run build
py ../scripts/deploy_frontend.py
```

---

## Validacao final

| Item | Esperado | Comando |
|------|----------|---------|
| nginx up | HTTP 200 em /health | `curl http://10.36.177.138:8081/health` |
| auth-api up | HTTP 200 em /api/health | `curl http://10.36.177.138:8081/api/health` |
| Convex up | HTTP 200 em /version | `curl http://10.36.177.138:8081/api/version` |
| Login funciona | Dashboard aparece | Chrome: `http://10.36.177.138:8081/` |
| Agendar funciona | Agendamento aparece na lista | Criar 1 agendamento de teste |
| Sync funciona | Aba MAPA DE VIATURAS atualiza | (pos-deploy) |
