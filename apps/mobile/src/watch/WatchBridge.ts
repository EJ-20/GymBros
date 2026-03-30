import * as Linking from 'expo-linking';

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
