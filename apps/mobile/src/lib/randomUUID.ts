/**
 * Hermes / some RN runtimes omit `globalThis.crypto.randomUUID`.
 * SQLite setup and repos need a synchronous id; Math.random fallback is fine for local rows.
 */
export function randomUUID(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) {
    return c.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const n = (Math.random() * 16) | 0;
    const v = ch === 'x' ? n : (n & 0x3) | 0x8;
    return v.toString(16);
  });
}
