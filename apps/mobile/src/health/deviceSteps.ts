import { Platform } from 'react-native';

export type StepFetchResult =
  | { ok: true; steps: number }
  | { ok: false; reason: string };

/**
 * Today’s step count from the OS pedometer (includes Apple Watch–contributed steps on iOS when available).
 * Web: not supported. Requires `expo-sensors` and a dev build after prebuild for full Android permissions.
 */
export async function fetchTodayStepCountFromDevice(): Promise<StepFetchResult> {
  if (Platform.OS === 'web') {
    return { ok: false, reason: 'Step sync runs on the iOS or Android app.' };
  }
  try {
    const { Pedometer } = await import('expo-sensors');
    const available = await Pedometer.isAvailableAsync();
    if (!available) {
      return { ok: false, reason: 'Step counting is not available on this device.' };
    }
    const perm = await Pedometer.requestPermissionsAsync();
    if (!perm.granted) {
      return { ok: false, reason: 'Allow motion / activity access to read steps.' };
    }
    const end = new Date();
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const result = await Pedometer.getStepCountAsync(start, end);
    if (result == null) {
      return {
        ok: false,
        reason:
          'Could not read steps for this range. On some Android builds use Health Connect instead.',
      };
    }
    return { ok: true, steps: result.steps };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Could not read steps from the device.';
    return { ok: false, reason: msg };
  }
}
