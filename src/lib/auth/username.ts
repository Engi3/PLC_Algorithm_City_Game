/**
 * Supabase Auth requires an email. This app logs in by username
 * (guest00, Admin101, student-chosen IDs, ...), so every account is
 * created with a synthetic email derived from its username. Login
 * (Phase 2) must run the entered username through this same function
 * before calling supabase.auth.signInWithPassword.
 */
const EMAIL_DOMAIN = "plc-city.internal";

export function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`;
}
