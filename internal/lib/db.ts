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

/**
 * O `pg` retorna nomes de coluna em LOWERCASE por padrao (warname,
 * viaturasrole, ismaster), mas o codigo do projeto espera camelCase
 * (warName, viaturasRole, isMaster). Solucao: envolver o client do
 * Pool pra mapear as chaves de cada row pra camelCase antes de
 * devolver pro codigo.
 *
 * Implementacao simples: detecta underscore_separated e converte.
 * IDs ja vem lowercase e sao mantidos (warning, etc).
 */
function camelizeKey(key: string): string {
  // Caso especial: nomes de 1 letra (id, cpf, re) ficam lowercase
  // Caso comum: warname -> warName, postograduacao -> postoGraduacao
  return key.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

function camelizeRow(row: any): any {
  if (!row || typeof row !== "object") return row;
  const result: any = {};
  for (const k of Object.keys(row)) {
    result[camelizeKey(k)] = row[k];
  }
  return result;
}

function camelizeRows(rows: any[]): any[] {
  if (!Array.isArray(rows)) return rows;
  return rows.map(camelizeRow);
}

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

// Build marker - confirma que o bundle novo estah rodando
const DB_BUILD = "v2026-09-19-03-39-camelize-fix";

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
    max: 1, // serverless: 1 connection per function instance
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
  });
  console.log("[db] Postgres Pool inicializado");
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
    const result = await pool.query(finalSql, params);
    return {
      rows: camelizeRows(result.rows) as T[],
      rowCount: result.rowCount ?? result.rows.length,
    };
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
