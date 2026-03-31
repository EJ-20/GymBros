import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js';
import { runInitialSetup, type DbSync } from './schema';

let rawDb: SqlJsDatabase | null = null;
let compat: WebSqlCompat | null = null;

/**
 * sql.js-backed DB matching the sync subset of expo-sqlite used by workoutRepo.
 * WASM is loaded from sql.js.org (expo-sqlite's npm tarball omits wa-sqlite.wasm).
 */
class WebSqlCompat implements DbSync {
  constructor(private readonly inner: SqlJsDatabase) {}

  execSync(sql: string): void {
    this.inner.exec(sql);
  }

  runSync(sql: string, params?: unknown[]): void {
    const values = (params ?? []) as (string | number | null | Uint8Array)[];
    this.inner.run(sql, values);
  }

  getFirstSync<T extends Record<string, unknown>>(sql: string, params?: unknown[]): T | null {
    const stmt = this.inner.prepare(sql);
    try {
      const values = params ?? [];
      if (values.length > 0) {
        stmt.bind(values as (string | number | null | Uint8Array)[]);
      }
      if (!stmt.step()) return null;
      return stmt.getAsObject() as T;
    } finally {
      stmt.free();
    }
  }

  getAllSync<T extends Record<string, unknown>>(sql: string, params?: unknown[]): T[] {
    const stmt = this.inner.prepare(sql);
    try {
      const values = params ?? [];
      if (values.length > 0) {
        stmt.bind(values as (string | number | null | Uint8Array)[]);
      }
      const out: T[] = [];
      while (stmt.step()) {
        out.push(stmt.getAsObject() as T);
      }
      return out;
    } finally {
      stmt.free();
    }
  }
}

export function getDb(): WebSqlCompat {
  if (!compat) {
    throw new Error('Database not ready — call initDatabase() first');
  }
  return compat;
}

export async function initDatabase(): Promise<void> {
  if (compat) return;

  const SQL = await initSqlJs({
    locateFile: (file) => `https://sql.js.org/dist/${file}`,
  });

  rawDb = new SQL.Database();
  compat = new WebSqlCompat(rawDb);
  runInitialSetup(compat);
}
