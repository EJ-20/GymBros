import { healthWatchPayloadSchema } from '@gymbros/shared';
import * as Linking from 'expo-linking';
import { mergeHealthDaily } from '@/src/health/healthRepo';

/**
 * Hooks for a future Apple Watch / Wear OS companion.
 * Today: deep links so Shortcuts or a native watch app can open the phone UI.
 */
export function openWorkoutDeepLink(action: 'start' | 'active'): void {
  const path = action === 'start' ? 'workout/start' : 'workout/active';
  Linking.openURL(`gymbros://${path}`).catch(() => {});
}

export function parseWatchIntent(url: string): 'start' | 'active' | null {
  if (url.includes('workout/start')) return 'start';
  if (url.includes('workout/active')) return 'active';
  return null;
}

/** Placeholder for a native watch app to report elapsed time (requires custom dev client). */
export function reportWatchElapsedSeconds(_totalSeconds: number): void {}

/**
 * Ingest one calendar day of health metrics from a watch companion or native HealthKit / Health Connect bridge.
 * Call from native code (WatchConnectivity, modules) after validating JSON on the JS side.
 */
export function reportWatchHealthSnapshot(
  payload: unknown
): { ok: true } | { ok: false; error: string } {
  const parsed = healthWatchPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message };
  }
  mergeHealthDaily(parsed.data);
  return { ok: true };
}
