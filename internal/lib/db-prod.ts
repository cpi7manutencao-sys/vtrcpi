// ============================================================
// db-prod.ts - DB APENAS pra Postgres (Vercel/Prisma)
// SEM better-sqlite3 nem pglite - modulos nativos nao funcionam
// em Vercel Serverless Functions
// ============================================================

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

export const now = () => Date.now();

// Traduz placeholders Postgres ($1, $2) - ja eh Postgres entao nao faz nada
function toPostgresPlaceholders(sql: string): string {
  return sql;
}

export async function query<T = any>(
  text: string,
  params: any[] = []
): Promise<QueryResult<T>> {
  const POSTGRES_URL = process.env.POSTGRES_URL || "";
  if (!POSTGRES_URL) {
    throw new Error("POSTGRES_URL nao configurada");
  }
  if (!POSTGRES_URL.startsWith("postgres://") && !POSTGRES_URL.startsWith("postgresql://")) {
    throw new Error(`POSTGRES_URL invalida (esperado postgres://, recebi: ${POSTGRES_URL.substring(0, 20)}...)`);
  }

  // Usa @vercel/postgres (ja vem com cliente HTTP otimizado)
  const { sql: vsql } = await import("@vercel/postgres");
  const pgSql = toPostgresPlaceholders(text);
  const result = await vsql.query(pgSql, params);
  return {
    rows: result.rows as T[],
    rowCount: result.rowCount ?? result.rows.length,
  };
}

// Template tag helper
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
  // Em Postgres, exec = query sem retorno
  await query(text, []);
}
