// ============================================================
// db.ts - Abstracao de DB
// DEV SQLite (better-sqlite3) OU PGlite OU Postgres via `pg` (prod)
// API unificada: query(text, params) -> { rows: [...] }
//
// IMPORTANTE: Em Vercel Serverless, modulos nativos (better-sqlite3)
// NAO funcionam. Por isso usamos safeRequire que retorna null
// se nao conseguir carregar.
//
// @vercel/postgres v0.10+ exige pooled connection string, mas
// Prisma Postgres so fornece direct connection. Solucao: usar
// `pg` (node-postgres) puro JS com Pool, que aceita ambas.
// `pg` e bundleado pelo esbuild (puro JS, sem deps nativas).
//
// CRITICO: `pg` retorna nomes de coluna em LOWERCASE por padrao
// (warname, viaturasrole, ismaster), mas o codigo do projeto
// espera camelCase (warName, viaturasRole, isMaster). Configuramos
// o parser de tipo OID 25 (TEXT) e 1043 (VARCHAR) pra preservar
// o case original vindo do Postgres.
// ============================================================

import { safeRequire } from "./safe-load";

// `pg` e bundleado no esbuild (puro JS, sem deps nativas)
import pgMod from "pg";
const { Pool: PgPool } = pgMod;

let sqliteDb: any = null;
let pgliteInstance: any = null;
let pgliteReady: Promise<void> | null = null;
let pgPool: any = null;

// Carrega modulo nativo sob demanda; retorna null se nao existir
function _safeRequire(name: string): any {
  const mod = safeRequire(name);
  if (!mod) {
    console.warn(`[db] ${name} nao disponivel`);
  }
  return mod;
}

// Detecta modo
const POSTGRES_URL = process.env.POSTGRES_URL || "";
const usePostgres =
  POSTGRES_URL.startsWith("postgres://") || POSTGRES_URL.startsWith("postgresql://");
const usePGlite = !usePostgres && POSTGRES_URL.startsWith("pglite://");
const useSqlite =
  !usePostgres && !usePGlite &&
  (!POSTGRES_URL ||
    POSTGRES_URL.startsWith("sqlite://") ||
    POSTGRES_URL === "sqlite");

function getSqlite() {
  if (sqliteDb) return sqliteDb;
  const Database = _safeRequire("better-sqlite3");
  if (!Database) {
    throw new Error("better-sqlite3 nao disponivel. Em prod, configure POSTGRES_URL.");
  }
  const file = POSTGRES_URL.startsWith("sqlite://")
    ? POSTGRES_URL.replace("sqlite://", "")
    : "./viaturas.db";
  sqliteDb = new Database(file);
  sqliteDb.pragma("journal_mode = WAL");
  sqliteDb.pragma("foreign_keys = ON");
  console.log(`[db] SQLite opened: ${file}`);
  return sqliteDb;
}

function getPGliteDb() {
  if (pgliteInstance) return pgliteInstance;
  const PGliteMod = _safeRequire("@electric-sql/pglite");
  if (!PGliteMod) {
    throw new Error("@electric-sql/pglite nao disponivel.");
  }
  const dataDir = POSTGRES_URL.startsWith("pglite://")
    ? POSTGRES_URL.replace("pglite://", "")
    : "./.pgdata";
  pgliteInstance = new PGliteMod.PGlite(dataDir);
  pgliteReady = pgliteInstance.waitReady;
  return pgliteInstance;
}

async function ensurePGlite() {
  if (pgliteReady) await pgliteReady;
}

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

function toSqlitePlaceholders(sql: string): string {
  return sql.replace(/\$\d+/g, "?");
}

/**
 * Mapeamento lowercase -> camelCase pra colunas conhecidas.
 * O `pg` retorna nomes de coluna em LOWERCASE, mas o codigo
 * espera camelCase. Como snake_case -> camelCase via regex nao
 * funciona (ex: "warname" -> "warName"), precisamos de um map.
 *
 * Manter sincronizado com schema-postgres.sql.
 * Gerado a partir do schema em 2026-09-19.
 */
const COLUMN_CAMEL_MAP: Record<string, string> = {
  // ========== units ==========
  parentunit: "parentUnit",
  commandunit: "commandUnit",

  // ========== users ==========
  warname: "warName",
  postograduacao: "postoGraduacao",
  viaturasrole: "viaturasRole",
  ismaster: "isMaster",
  opmcode: "opmCode",
  googleid: "googleId",
  unidadesgestor: "unidadesGestor",
  unidadeseditor: "unidadesEditor",
  lastlogin: "lastLogin",
  logincount: "loginCount",
  createdat: "createdAt",
  promotedat: "promotedAt",
  datanascimento: "dataNascimento",
  assinaturadigitalsvg: "assinaturaDigitalSvg",
  assinaturadigitalcriadoem: "assinaturaDigitalCriadoEm",

  // ========== viaturas ==========
  marcamodelo: "marcaModelo",
  emdescarga: "emDescarga",
  linkronda: "linkRonda",
  databaixa: "dataBaixa",
  datareativadoem: "dataReativadoEm",
  cadconv: "cadConv",
  anofab: "anoFab",
  contapatrimonial: "contaPatrimonial",
  criadoem: "criadoEm",
  criadopor: "criadoPor",
  atualizadoem: "atualizadoEm",
  atualizadopor: "atualizadoPor",

  // ========== viaturaHistorico ==========
  viaturaid: "viaturaId",
  datahora: "dataHora",
  registradopor: "registradoPor",

  // ========== agendamentos ==========
  nomeguerra: "nomeGuerra",
  unidaderequerente: "unidadeRequerente",
  unidaderequerenteoutro: "unidadeRequerenteOutro",
  unidadeorigem: "unidadeOrigem",
  secaosetor: "secaoSetor",
  tipoviaturasolicitada: "tipoViaturaSolicitada",
  tipoviaturaoutro: "tipoViaturaOutro",
  datamissao: "dataMissao",
  oficialautorizador: "oficialAutorizador",
  horarioapresentacao: "horarioApresentacao",
  solicitantemotorista: "solicitanteMotorista",
  motoristare: "motoristaRe",
  motoristaposto: "motoristaPosto",
  motoristanome: "motoristaNome",
  motoristaopm: "motoristaOpm",
  motoristaopmcode: "motoristaOpmCode",
  motoristacnh: "motoristaCnh",
  motoristaboletim: "motoristaBoletim",
  motoristadataprova: "motoristaDataProva",
  motoristapublicacoes: "motoristaPublicacoes",
  retiradadata: "retiradaData",
  retiradahora: "retiradaHora",
  devolucaodata: "devolucaoData",
  devolucaohora: "devolucaoHora",
  aprovadopor: "aprovadoPor",
  aprovadoem: "aprovadoEm",
  rejeitadopor: "rejeitadoPor",
  rejeitadoem: "rejeitadoEm",
  motivorejeicao: "motivoRejeicao",
  concluidopor: "concluidoPor",
  concluidoem: "concluidoEm",
  naocompareceu: "naoCompareceu",
  viaturaatribuida: "viaturaAtribuida",
  odometroretirada: "odometroRetirada",
  odometroretiradaem: "odometroRetiradaEm",
  odometroretiradapor: "odometroRetiradaPor",
  odometrodevolucao: "odometroDevolucao",
  odometrodevolucaoem: "odometroDevolucaoEm",
  odometrodevolucaopor: "odometroDevolucaoPor",
  kmrodados: "kmRodados",
  odometroeditado: "odometroEditado",
  linkifct: "linkIfct",
  linkifctexpiraem: "linkIfctExpiraEm",
  ifctstatus: "ifctStatus",
  ifctdata: "ifctData",
  ifctvalidadopor: "ifctValidadoPor",
  ifctvalidadoem: "ifctValidadoEm",
  ifctvalidadoobservacao: "ifctValidadoObservacao",

  // FIX (William 2026-09-20): colunas novas de ifctEncerramentos que faltavam.
  // Sem elas, o camelizeRows deixava campos como undefined e o get-by-token
  // retornava encerramento vazio - KM inicial aparecia em branco no mobile
  // e "consideracoesVeiculo" truncado.
  hodometropartida: "hodometroPartida",
  hodometroretorno: "hodometroRetorno",
  hodometrodiferenca: "hodometroDiferenca",
  partidaconfirmadaem: "partidaConfirmadaEm",
  defeitosverificados: "defeitosVerificados",
  novaapresentacaodata: "novaApresentacaoData",
  novaapresentacaohora: "novaApresentacaoHora",
  novaapresentacaolocal: "novaApresentacaoLocal",
  consideracoesveiculo: "consideracoesVeiculo",
  assinaturacondutorsvg: "assinaturaCondutorSvg",
  iporigem: "ipOrigem",
  useragentorigem: "userAgentOrigem",

  // ========== rondas ==========
  rondadopor: "rondadoPor",
  textolivre: "textoLivre",
  unidadepertence: "unidadePertence",
  // FIX (William 2026-09-20 v72): sem isso, o PDF nao renderizava a
  // assinatura do rondante porque checava r.assinaturaSvg (camelCase)
  // mas recebia r.assinaturasvg (lowercase) do camelizeRows.
  assinaturasvg: "assinaturaSvg",
  preenchidoem: "preenchidoEm",

  // ========== ifctAbastecimentos (FIX William 2026-09-20) ==========
  // FIX: sem esses mapeamentos, o camelizeRows retornava chave
  // lowercase (fotocomprovante, observacao, posto) em vez de camelCase.
  // Resultado: o PDF nao renderizava pagina 3 (comprovantes) pq
  // abs.fotoComprovante era undefined.
  fotocomprovante: "fotoComprovante",
  quantidadelitros: "quantidadeLitros",
  // observacao, posto, datahora, agendamentoid ja cobertos acima
  // (iporigem, postograduacao, tipoviatura, useragentorigem ja cobertos acima)

  // ========== auditLog ==========
  // campos genericos ja cobertos (userId, cpf, action, etc)
};

function camelizeKey(key: string): string {
  return COLUMN_CAMEL_MAP[key.toLowerCase()] || key;
}

/**
 * Converte valores BIGINT/INTEGER que o `pg` retorna como STRING em
 * number pra que comparacoes como Array.includes(id) funcionem.
 *
 * Aplicado a campos conhecidos: id, FKs (userId, viaturaiId, etc) e
 * BIGINTs em geral (dataMissao, criadoEm, etc).
 */
const NUMERIC_FIELDS = new Set([
  "id", "userid", "viaturaid", "agendamentoid", "solicitante",
  "parentunit", "commandunit", "unit", "opm", "createdby", "createdbyuserid",
  "aprovadopor", "rejeitadopor", "concluidopor", "viaturaatribuida",
  "odometroretiradapor", "odometrodevolucaopor", "ifctvalidadopor",
  "criadopor", "atualizadopor", "registradopor",
  "dataBaixa", "databaixa", "datareativadoem",
  "criadoem", "atualizadoem", "ultimoLogin", "lastlogin",
  "datamissao", "retiradata", "devolucaodata",
  "aprovadoem", "rejeitadoem", "concluidoem", "promotedat",
  "odometroretiradaem", "odometrodevolucaoem", "partidaconfirmadaem",
  "linkifctexpiraem", "ifctvalidadoem", "linkifctexpiraem",
  "logincount", "datahora", "preenchidoem", "assinaturacriadoem",
  "horarioapresentacao", "anofab", "kmrodados",
  // FIX (William 2026-09-20): adiciona IDs/IDs de unidade que faltavam.
  // Sem isso, o `pg` retorna esses BIGINTs como string, causando
  // comparacoes como Array.includes(11) === false porque "11" !== 11.
  "unidaderequerente", "unidadeorigem", "unidaderequerenteoutro",
  "unidadesgestor", "unidadeseditor",
  // auditoria
  "targetuserid", "performedby",
  // IFCT
  "odometro", "hodometropartida", "hodometroretorno", "hodometrodiferenca",
  "novaapresentacaodata",
  // rondas (km em rondas)
  "km",
  // agendamento DEJEM
  "dejemdesignacaoid",
]);

function coerceValue(key: string, val: any): any {
  if (val === null || val === undefined) return val;
  // Se ja for number, mantem
  if (typeof val === "number") return val;
  // Se for string E o campo eh numerico, converter
  if (typeof val === "string" && NUMERIC_FIELDS.has(key.toLowerCase())) {
    const n = Number(val);
    if (!isNaN(n)) return n;
  }
  return val;
}

function camelizeRow(row: any): any {
  if (!row || typeof row !== "object") return row;
  const result: any = {};
  for (const k of Object.keys(row)) {
    const ck = camelizeKey(k);
    result[ck] = coerceValue(ck, row[k]);
  }
  return result;
}

function camelizeRows(rows: any[]): any[] {
  if (!Array.isArray(rows)) return rows;
  return rows.map(camelizeRow);
}

/**
 * Converte placeholders `?` (estilo SQLite/pg) em `$1, $2, ...` (Postgres).
 * Necessario pq `pg` (node-postgres) NAO aceita `?` como placeholder
 * (precisa ser $1, $2 etc). Faz contagem baseada em parametros pra
 * nao contar placeholders dentro de strings literais.
 */
function questionToPostgres(sql: string, paramCount: number): string {
  // regex simples: conta apenas `?` que nao estao dentro de aspas
  // (a maioria dos SQLs do projeto usa aspas simples pra strings)
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
      // checa escape ''
      if (sql[i + 1] === ch) {
        result += ch + ch;
        i++;
      } else {
        inString = false;
        result += ch;
      }
    } else if (!inString && ch === "?") {
      idx++;
      result += `$${idx}`;
    } else {
      result += ch;
    }
  }
  return result;
}

function getPgPool() {
  if (pgPool) return pgPool;
  pgPool = new PgPool({
    connectionString: POSTGRES_URL,
    ssl: POSTGRES_URL.includes("sslmode=require")
      ? { rejectUnauthorized: false }
      : undefined,
    // FIX (William 2026-09-22): Prisma Postgres no Vercel Serverless
    // hiberna apos inatividade (~5min sem acesso). Quando volta, a primeira
    // request falha com "Failed to connect to upstream database". Aumentamos
    // timeouts e ativamos keepAlive pra suavizar:
    max: 3, // margem de paralelismo sem estourar limites do free tier
    idleTimeoutMillis: 30000, // 30s
    connectionTimeoutMillis: 30000, // 30s (Prisma free tier acorda devagar)
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  });
  pgPool.on("error", (err: any) => {
    console.error("[db] Pool error (ignorado, sera recriado na prox request):", err?.message || err);
  });
  console.log("[db] Postgres Pool inicializado (max=3, timeout=30s, keepAlive=true)");
  return pgPool;
}

export async function query<T = any>(
  text: string,
  params: any[] = []
): Promise<QueryResult<T>> {
  if (usePostgres) {
    const pool = getPgPool();
    // Aceita tanto `$1, $2` quanto `?` em qualquer modo - converte se necessario
    const finalSql = text.includes("?") ? questionToPostgres(text, params.length) : text;
    // FIX (William 2026-09-22): Prisma Postgres hiberna apos inatividade.
    // A 1a tentativa pode falhar; retry transparente 1x com 1.5s de espera.
    const isConnError = (e: any) => {
      const msg: string = e?.message || "";
      return (
        msg.includes("Connection terminated") ||
        msg.includes("ECONNREFUSED") ||
        msg.includes("ETIMEDOUT") ||
        msg.includes("upstream database") ||
        msg.includes("Connection ended") ||
        msg.includes("Connection reset")
      );
    };
    try {
      const result = await pool.query(finalSql, params);
      return {
        rows: camelizeRows(result.rows) as T[],
        rowCount: result.rowCount ?? result.rows.length,
      };
    } catch (e: any) {
      if (isConnError(e)) {
        console.warn(`[db] Conexao caiu, retentando (1x) apos 1.5s: ${e?.message?.slice(0, 80)}`);
        await new Promise(r => setTimeout(r, 1500));
        const result = await pool.query(finalSql, params);
        return {
          rows: camelizeRows(result.rows) as T[],
          rowCount: result.rowCount ?? result.rows.length,
        };
      }
      throw e;
    }
  }

  if (usePGlite) {
    await ensurePGlite();
    const db = getPGliteDb();
    const result = await db.query<T>(text, params);
    return {
      rows: result.rows,
      rowCount: result.affectedRows ?? result.rows.length,
    };
  }

  // SQLite
  const db = getSqlite();
  const sqliteSql = toSqlitePlaceholders(text);
  const stmt = db.prepare(sqliteSql);
  let rows: any[];
  let rowCount = 0;
  if (/^\s*(SELECT|PRAGMA)/i.test(text) || /\bRETURNING\b/i.test(text)) {
    rows = stmt.all(...params);
    rowCount = rows.length;
  } else {
    const info = stmt.run(...params);
    rowCount = info.changes;
    rows = [];
  }
  return { rows: rows as T[], rowCount };
}

export const now = () => Date.now();

// Schema/Seed (SQLite/PGlite dev only - Postgres roda via Query tab)
let schemaInitialized = false;
export async function ensureSchema(): Promise<void> {
  if (usePostgres) return;
  if (!useSqlite && !usePGlite) return;
  try {
    const fs = safeRequire("fs/promises") as any;
    const path = safeRequire("path") as any;
    if (!fs || !path) return;
    const candidates = [
      path.join(process.cwd(), "schema.sqlite.sql"),
      path.join(process.cwd(), "..", "schema.sqlite.sql"),
      path.join(process.cwd(), "..", "..", "schema.sqlite.sql"),
    ];
    let schema: string | null = null;
    for (const c of candidates) {
      try {
        schema = await fs.readFile(c, "utf-8");
        break;
      } catch {}
    }
    if (!schema) {
      console.warn("[db] schema.sqlite.sql nao encontrado");
      return;
    }
    try {
      if (useSqlite) {
        const db = getSqlite();
        db.exec(schema);
        schemaInitialized = true;
        console.log("[db] Schema SQLite inicializado");
      } else if (usePGlite) {
        await ensurePGlite();
        const db = getPGliteDb();
        await db.exec(schema);
        schemaInitialized = true;
        console.log("[db] Schema PGlite inicializado");
      }
    } catch (e: any) {
      console.error("[db] Erro ao rodar schema:", e.message);
    }
  } catch (e: any) {
    console.error("[db] ensureSchema erro:", e.message);
  }
}

function buildTaggedSql(strings: TemplateStringsArray, values: any[]): { text: string; params: any[] } {
  let text = "";
  for (let i = 0; i < strings.length; i++) {
    text += strings[i];
    if (i < values.length) {
      text += `$${i + 1}`;
    }
  }
  return { text, params: values };
}

export async function sql(strings: TemplateStringsArray, ...values: any[]): Promise<QueryResult> {
  const { text, params } = buildTaggedSql(strings, values);
  return query(text, params);
}

/**
 * Pega o ultimo ID inserido (BIGSERIAL).
 * SQLite: last_insert_rowid()
 * Postgres: currval(pg_get_serial_sequence(...))
 */
export async function lastInsertId(tableName: string): Promise<number | null> {
  if (usePostgres) {
    const pool = getPgPool();
    const r = await pool.query<{ id: number }>(
      `SELECT currval(pg_get_serial_sequence($1, 'id')) as id`,
      [tableName]
    );
    return r.rows[0]?.id != null ? Number(r.rows[0].id) : null;
  }
  if (usePGlite) {
    await ensurePGlite();
    const db = getPGliteDb();
    const r = await db.query<{ id: number }>("SELECT last_insert_rowid() as id");
    return r.rows[0]?.id != null ? Number(r.rows[0].id) : null;
  }
  const db = getSqlite();
  const r = db.prepare("SELECT last_insert_rowid() as id").get() as any;
  return r?.id != null ? Number(r.id) : null;
}

export async function exec(text: string): Promise<void> {
  if (usePostgres) {
    const pool = getPgPool();
    const finalSql = text.includes("?") ? questionToPostgres(text, 0) : text;
    await pool.query(finalSql);
    return;
  }
  if (usePGlite) {
    await ensurePGlite();
    const db = getPGliteDb();
    await db.exec(text);
    return;
  }
  const db = getSqlite();
  db.exec(text);
}
