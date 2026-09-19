# Plano consolidado — Sistema de Viaturas CPI-7

## Decisões finais (validadas com William)

### 1. Infraestrutura
- **Servidor:** 10.36.177.138 (mesmo do Controle de Materiais)
- **Porta web:** 8081 (8080 ocupado pelo Materiais)
- **Convex backend:** porta 3211, schema separado `convex_viaturas`
- **Auth:** SOAP CPD via auth-api Python estendido (`client_id="viaturas"`)
- **Descontinua:** Sheets atual quando app entra em produção

### 2. Roles (4 níveis)

| Role | Dashboard | Cria agendamento | Aprova | Edita VTR | Atribuído por |
|---|---|---|---|---|---|
| **usuário** (padrão) | própria unidade | ✅ (pendente) | ❌ | ❌ | automático |
| **editor** | própria unidade | ✅ | ❌ | ✅ (própria unidade) | admin |
| **gestor** | própria unidade | ✅ | ✅ (própria unidade) | ✅ (própria unidade) | admin |
| **admin** (William) | **GERAL** | ✅ | ✅ (qualquer) | ✅ (qualquer) | ninguém |

- **Multi-role:** pode ser gestor + editor em unidades diferentes
- **Cobertura obrigatória:** toda unidade DEVE ter pelo menos 1 gestor
- **Recursão:** gestor de matriz cobre sub-OPMs filhas automaticamente

### 3. Fluxo de agendamento

```
USUÁRIO/EDITOR/GESTOR → preenche form (igual Forms atual)
  → status="pendente"
  → gestor da unidade vê no painel dele
  → [Aprovar] → status="aprovado"
  → [Rejeitar] → status="rejeitado" + motivo
  → (após aprovado) editor da unidade atribui viatura (prefixo)
  → (após data de devolução) status="aguardando_confirmacao"
  → user/editor clica "concluído" ou "não compareceu"
```

### 4. Form de agendamento (transcrição Forms atual)

**Campos:**
1. Posto/Graduação (select, do SOAP)
2. RE com Dígito (do SOAP)
3. Nome de Guerra (do SOAP)
4. E-mail do solicitante (do SOAP)
5. **Unidade/Seção/Setor** (select com 19 opções + "Outro:")
6. Data da Missão (date)
7. **Tipo de Viatura** (select com 10 opções + "Outro:")
8. Destino e Finalidade (textarea)
9. Oficial que autorizou (string)
10. Previsão retirada (data + hora)
11. Devolução (data + hora)

**Select "Unidade"** (hardcoded igual Forms):
- P-1 (Pessoal)
- P-2 (Inteligência)
- P-3 (Operações)
- P-4 (Logística)
- P-5 (Comunicação Social)
- PJMD (Justiça e Disciplina)
- 7º BPM/I, 12º BPM/I, 22º BPM/I, 40º BPM/I, 50º BPM/I, 53º BPM/I, 54º BPM/I, 55º BPM/I
- 14º BAEP
- COPOM, Banda Musical CPI-7, Guarda do Quartel CPI-7, Escola de Formação de Soldados, Reserva de Armas CPI-7
- Outro:

**Select "Tipo de Viatura"** (hardcoded):
- Ônibus 7-2 Caracterizado
- Ônibus 7-120 Descaracterizado (Transp. Seguro)
- Micro-Ônibus
- Furgão
- Caminhão Guincho
- Caminhão Baú
- GM/Trailblazer
- Caminhoneta S-10
- Ambulância
- Outro:

### 5. Schema Convex

#### `users` (extensão)
```typescript
{
  ...campos existentes do Controle de Materiais,
  viaturasRole: v.optional(v.union(
    v.literal("viewer"), v.literal("editor"),
    v.literal("gestor"), v.literal("admin")
  )),
  unidadesGestor: v.optional(v.array(v.id("units"))),
  unidadesEditor: v.optional(v.array(v.id("units"))),
}
```

#### `agendamentos` (novo)
```typescript
{
  // Solicitante
  solicitante: id("users"),
  postoGraduacao: string, re: string, nomeGuerra: string, email: string,
  
  // Unidade PRA QUAL é a viatura
  unidadeSolicitante: id("units"),
  unidadeOutro: v.optional(string),
  
  // Viatura SOLICITADA
  tipoViaturaSolicitada: string,
  tipoViaturaOutro: v.optional(string),
  
  // Missão
  dataMissao: number,
  destino: string, finalidade: string, oficialAutorizador: string,
  
  // Retirada/Devolução
  retiradaData: number, retiradaHora: string,
  devolucaoData: number, devolucaoHora: string,
  
  // Workflow
  status: "pendente" | "aprovado" | "rejeitado" | "concluido" | "cancelado",
  aprovadoPor: v.optional(id("users")),
  aprovadoEm: v.optional(number),
  rejeitadoPor: v.optional(id("users")),
  rejeitadoEm: v.optional(number),
  motivoRejeicao: v.optional(string),
  concluidoPor: v.optional(id("users")),
  concluidoEm: v.optional(number),
  viaturaAtribuida: v.optional(id("viaturas")),  // link cruzado
  
  // Auditoria
  criadoEm: number,
  // indices: by_solicitante, by_unidade, by_status, by_dataMissao
}
```

#### `viaturas` (novo)
```typescript
{
  opm: id("units"),
  prefixo: string,                    // "I-07019", "17-202", "E-14103"
  tipo: "MT" | "CR",                  // moto/carro (igual Sheets)
  categoria: "OPERACIONAL" | "ADM",
  marcaModelo: string,                // "GM/TRAILBLAZER"
  ativo: boolean,                     // true=operante, false=baixado
  dataBaixa: v.optional(number),
  motivo: v.optional(string),         // "MOTOR", "ARREFECIMENTO", etc
  situacao: v.optional(string),       // "AGUARDANDO PREGÃO", etc
  observacao: v.optional(string),
  criadoEm: number, criadoPor: id("users"),
  atualizadoEm: v.optional(number), atualizadoPor: v.optional(id("users")),
  // indices: by_opm, by_prefixo, by_ativo
}
```

### 6. RLS (Row-Level Security)

| Quem | Vê agendamentos | Edita viaturas | Aprova |
|---|---|---|---|
| usuário | só da SUA unidade | ❌ | ❌ |
| editor (unidades=X) | só onde X | ✅ onde X (recursivo) | ❌ |
| gestor (unidades=Y) | só onde Y (recursivo) | ✅ onde Y | ✅ onde Y |
| admin | TODAS | TODAS | TODAS |

### 7. Cronograma

| Semana | Entregas | Deploy |
|---|---|---|
| **1** | Setup (nginx :8081, Convex, auth); Schema; Agendar + Lista; Workflow aprovação; Calendário | sexta |
| **2** | CRUD Viaturas + Atribuição + Dashboard | sexta |
| **3** | Gestão usuários + Importar xlsx + Polish | sexta |

## Próximos passos (esta semana)

1. ✅ Criar estrutura de pastas
2. ✅ README + plano + changelog
3. ⏳ nginx config :8081 (server-side)
4. ⏳ Segundo container Convex (server-side)
5. ⏳ auth-api estendido (server-side)
6. ⏳ Schema Convex (viaturas.ts, agendamentos.ts)
7. ⏳ Frontend: LoginPage + AgendarPage + AgendamentosPage + CalendarioPage
8. ⏳ Deploy + teste E2E
