/**
 * Maps common Supabase / network errors to short, actionable copy for alerts and inline UI.
 */
export function friendlyBackendError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('schema cache') || (m.includes('could not find') && m.includes('table'))) {
    return 'The cloud database is missing GymBros tables. In Supabase → SQL Editor, run the migration files from the repo in order (see README).';
  }
  if (
    m.includes('jwt expired') ||
    m.includes('invalid jwt') ||
    m.includes('invalid refresh token') ||
    m.includes('auth session missing')
  ) {
    return 'Your session may have expired. Sign out and sign in again under Account.';
  }
  if (
    m.includes('network request failed') ||
    m.includes('failed to fetch') ||
    m.includes('network error')
  ) {
    return 'No network connection. Check your internet and try again.';
  }
  return message;
}
