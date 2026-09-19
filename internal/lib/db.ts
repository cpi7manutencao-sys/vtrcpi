// ============================================================
// db.ts - AbstraÃ§Ã£o de DB
// DEV SQLite (better-sqlite3, leve e nativo Node) OU
// PGlite (WASM pesado, deprecated por OOM) OU
// Vercel Postgres (prod)
// API unificada: query(text, params) -> { rows: [...] }
// ============================================================

import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

// Detecta modo
const POSTGRES_URL = process.env.POSTGRES_URL || "";
const usePGlite =
  POSTGRES_URL.startsWith("pglite://");
const useSqlite =
  !POSTGRES_URL ||
  POSTGRES_URL.startsWith("sqlite://") ||
  POSTGRES_URL === "sqlite";

let sqliteDb: Database.Database | null = null;
let pgliteInstance: PGlite | null = null;
let pgliteReady: Promise<void> | null = null;

function getSqlite(): Database.Database {
  if (!sqliteDb) {
    const file = POSTGRES_URL.startsWith("sqlite://")
      ? POSTGRES_URL.replace("sqlite://", "")
      : "./viaturas.db";
    sqliteDb = new Database(file);
    sqliteDb.pragma("journal_mode = WAL");
    sqliteDb.pragma("foreign_keys = ON");
    console.log(`[db] SQLite opened: ${file}`);
  }
  return sqliteDb;
}

function getPGlite(): PGlite {
  if (!pgliteInstance) {
    const dataDir = POSTGRES_URL.startsWith("pglite://")
      ? POSTGRES_URL.replace("pglite://", "")
      : "./.pgdata";
    pgliteInstance = new PGlite(dataDir);
    pgliteReady = pgliteInstance.waitReady;
  }
  return pgliteInstance;
}

async function ensurePGlite() {
  if (pgliteReady) await pgliteReady;
}

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

// ============================================================
// Translate Postgres placeholders ($1, $2) to SQLite (?, ?)
// ============================================================
function toSqlitePlaceholders(sql: string): string {
  return sql.replace(/\$\d+/g, "?");
}

export async function query<T = any>(
  text: string,
  params: any[] = []
): Promise<QueryResult<T>> {
  if (useSqlite) {
    // Auto-init schema/seed no SQLite
    await ensureSchema();
    await ensureSeed();
    const db = getSqlite();
    const sqliteSql = toSqlitePlaceholders(text);
    const stmt = db.prepare(sqliteSql);
    let rows: any[];
    let rowCount = 0;
    // Detecta queries que retornam rows: SELECT, PRAGMA, INSERT/UPDATE/DELETE com RETURNING
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
  if (usePGlite) {
    await ensurePGlite();
    await ensureSchema();
    await ensureSeed();
    const result = await getPGlite().query<T>(text, params);
    return {
      rows: result.rows,
      rowCount: result.affectedRows ?? result.rows.length,
    };
  }
  // Vercel Postgres (prod)
  const { sql: vsql } = await import("@vercel/postgres");
  const result = await (vsql as any).query(text, params);
  return {
    rows: result.rows,
    rowCount: result.rowCount ?? result.rows.length,
  };
}

// ============================================================
// NOTA: nao precisa de toCamel/toSnake - schema ja eh camelCase (clone Convex)
// ============================================================

export const now = () => Date.now();

// ============================================================
// Schema/Seed (SQLite OU PGlite - nao usa em prod/Vercel Postgres)
// ============================================================

let schemaInitialized = false;
export async function ensureSchema(): Promise<void> {
  if (usePGlite || schemaInitialized) return;
  if (!useSqlite) return;
  const fs = await import("fs/promises");
  const path = await import("path");
  // Procura schema.sqlite.sql
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
    getSqlite().exec(schema);
    schemaInitialized = true;
    console.log("[db] Schema SQLite inicializado");
  } catch (e: any) {
    console.error("[db] Erro ao rodar schema:", e.message);
  }
}

let seedInitialized = false;
export async function ensureSeed(): Promise<void> {
  if (usePGlite || seedInitialized) return;
  if (!useSqlite) return;
  await ensureSchema();
  const db = getSqlite();
  // Verifica se ja tem units (clone Convex: 10 matrizes = CPI-7 + 9 BPMs)
  const count = db.prepare("SELECT COUNT(*) as c FROM units").get() as { c: number };
  if (count.c > 0) {
    seedInitialized = true;
    return;
  }
  // Insere as 10 matrizes (clone EXATO do seed_units.py do Convex legacy).
  // - parentUnit: NULL (clearCPI7Children deixa os BPMs como raizes)
  // - commandUnit: NULL (sem sub-OPMs cadastradas)
  const insertUnit = db.prepare(`
    INSERT OR IGNORE INTO units (code, name, sigla, parentUnit, commandUnit, active)
    VALUES (?, ?, ?, NULL, NULL, 1)
  `);
  const units = [
    ["607000000", "CPI-7",     "CPI7"],
    ["607070000", "7o BPM/I",  "7BPMI"],
    ["607120000", "12o BPM/I", "12BPMI"],
    ["607140000", "14o BAEP",  "14BAEP"],
    ["607220000", "22o BPM/I", "22BPMI"],
    ["607400000", "40o BPM/I", "40BPMI"],
    ["607500000", "50o BPM/I", "50BPMI"],
    ["607530000", "53o BPM/I", "53BPMI"],
    ["607540000", "54o BPM/I", "54BPMI"],
    ["607550000", "55o BPM/I", "55BPMI"],
  ];
  for (const [code, name, sigla] of units) {
    insertUnit.run(code, name, sigla);
  }
  // William: criado via Google OAuth no primeiro login (NÃƒO seed hardcoded)
  // O sistema de auth (auth/google/callback) checa se ja existe user com aquele
  // googleId; se nao, cria. William tem isMaster=TRUE via promotion.
  // Por enquanto NAO criamos user hardcoded - ele aparece no primeiro login.
  seedInitialized = true;
  console.log("[db] Seed SQLite: 10 units inseridas (clone seed_units.py do Convex)");
}

// ============================================================
// sql template tag (compatibilidade)
// ============================================================

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
  if (useSqlite) {
    getSqlite().exec(text);
    return;
  }
  if (usePGlite) {
    await ensurePGlite();
    await getPGlite().exec(text);
    return;
  }
  const { sql: vsql } = await import("@vercel/postgres");
  await vsql.query(text);
}

export { query as default };
