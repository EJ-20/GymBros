import { Platform } from 'react-native';
import type { DbSync } from './schema';

/**
 * Web does not use expo-sqlite (published package omits wa-sqlite.wasm). Load implementations lazily.
 */
export async function initDatabase(): Promise<void> {
  if (Platform.OS === 'web') {
    const w = await import('./database.web');
    return w.initDatabase();
  }
  const n = await import('./database.native');
  return n.initDatabase();
}

export function getDb(): DbSync {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('./database.web').getDb() as DbSync;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('./database.native').getDb() as unknown as DbSync;
}
