import { getDb } from './database';
import { runInitialSetup } from './schema';

/**
 * Wipes all workout data and re-seeds default exercises (fresh local state after sign-out).
 */
export function resetLocalDatabase(): void {
  const d = getDb();
  d.execSync('DELETE FROM set_logs;');
  d.execSync('DELETE FROM workout_sessions;');
  d.execSync('DELETE FROM workout_templates;');
  d.execSync('DELETE FROM exercises;');
  d.execSync('DELETE FROM sync_meta;');
  runInitialSetup(d);
}
