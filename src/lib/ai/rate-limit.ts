import "server-only";

const WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 5;

/**
 * Basic in-memory sliding-window rate limiter, keyed by (action, userId).
 * Single-process/in-memory by design - resets on redeploy and isn't shared
 * across multiple serverless instances, but that's fine for what this
 * actually guards against (one student mashing "Ask AI for a hint"), not a
 * hard multi-instance quota; a real distributed limiter would need a
 * shared store (Redis/Supabase) this app's scale doesn't call for.
 */
const requestLog = new Map<string, number[]>();

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export function checkAiRateLimit(action: string, userId: string, maxRequests = DEFAULT_MAX_REQUESTS): RateLimitResult {
  const key = `${action}:${userId}`;
  const now = Date.now();
  const timestamps = (requestLog.get(key) ?? []).filter((t) => now - t < WINDOW_MS);

  if (timestamps.length >= maxRequests) {
    requestLog.set(key, timestamps);
    const retryAfterSeconds = Math.max(1, Math.ceil((WINDOW_MS - (now - timestamps[0])) / 1000));
    return { allowed: false, retryAfterSeconds };
  }

  timestamps.push(now);
  requestLog.set(key, timestamps);
  return { allowed: true };
}

export function rateLimitMessage(retryAfterSeconds: number): string {
  return `ขอ AI บ่อยเกินไป กรุณารออีก ${retryAfterSeconds} วินาทีแล้วลองใหม่`;
}
