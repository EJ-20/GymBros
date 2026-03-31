import * as SQLite from 'expo-sqlite';
import { runInitialSetup, type DbSync } from './schema';

let db: SQLite.SQLiteDatabase | null = null;

export function getDb(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync('gymbros.db');
  }
  return db;
}

export async function initDatabase(): Promise<void> {
  const d = getDb();
  d.execSync('PRAGMA journal_mode = WAL;');
  runInitialSetup(d as unknown as DbSync);
}
