// ============================================================
// db.ts - Abstracao de DB
// DEV SQLite (better-sqlite3) OU PGlite OU Vercel Postgres (prod)
// API unificada: query(text, params) -> { rows: [...] }
//
// IMPORTANTE: Em Vercel Serverless, modulos nativos (better-sqlite3)
// NAO funcionam. Por isso usamos createRequire + try/catch pra
// carregar SOB DEMANDA.
// ============================================================

import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);

// Carrega modulo nativo sob demanda; retorna null se nao existir
function safeRequire(name: string): any {
  try {
    return require_(name);
  } catch (e: any) {
    console.warn(`[db] ${name} nao disponivel:`, e.message);
    return null;
  }
}

let sqliteDb: any = null;
let pgliteInstance: any = null;
let pgliteReady: Promise<void> | null = null;

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
  const Database = safeRequire("better-sqlite3");
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
  const PGliteMod = safeRequire("@electric-sql/pglite");
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

export async function query<T = any>(
  text: string,
  params: any[] = []
): Promise<QueryResult<T>> {
  if (usePostgres) {
    const vercelPostgres = safeRequire("@vercel/postgres");
    if (!vercelPostgres) {
      throw new Error("@vercel/postgres nao disponivel");
    }
    const { sql: vsql } = vercelPostgres;
    const result = await vsql.query(text, params);
    return {
      rows: result.rows as T[],
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
  const fs = require_("fs/promises");
  const path = require_("path");
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
    const vercelPostgres = safeRequire("@vercel/postgres");
    if (vercelPostgres) await vercelPostgres.sql.query(text);
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
