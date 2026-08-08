import "server-only";

const GEMINI_MODEL = "gemini-flash-latest";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const REQUEST_TIMEOUT_MS = 15_000;
/** One initial attempt plus this many retries - see isRetryable below for which failures qualify. */
const RETRY_BACKOFF_MS = [500, 1500];

export class GeminiConfigError extends Error {}

export class GeminiRequestError extends Error {
  /** HTTP status Gemini returned, when known - undefined for timeouts/network failures (no response was ever received). Used by isRetryable to tell a transient failure (429/5xx) from a permanent one (400/401/403 etc, retrying won't help). */
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

function isRetryable(err: unknown): boolean {
  if (err instanceof GeminiRequestError) {
    return err.status === 429 || (err.status !== undefined && err.status >= 500);
  }
  // AbortError (our own 15s timeout) or a raw fetch network failure (TypeError)
  // - both worth one retry, unlike a malformed response, which is deterministic.
  return err instanceof Error && (err.name === "AbortError" || err.name === "TypeError");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Root-cause fix for the "cannot connect to AI service" error students hit
 * during a Gemini rate-limit blip (429) or a brief 5xx: a single failed
 * attempt used to surface immediately as a hard failure. Now transient
 * failures get up to 2 retries with a short backoff before giving up - a
 * missing API key (GeminiConfigError) or a malformed/empty response is
 * never retried, since trying again can't fix either.
 */
async function withRetry<T>(attempt: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= RETRY_BACKOFF_MS.length; i++) {
    try {
      return await attempt();
    } catch (err) {
      lastErr = err;
      if (err instanceof GeminiConfigError) throw err;
      if (i === RETRY_BACKOFF_MS.length || !isRetryable(err)) throw err;
      await sleep(RETRY_BACKOFF_MS[i]);
    }
  }
  throw lastErr;
}

async function callGeminiOnce(body: object): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new GeminiConfigError("GEMINI_API_KEY is not set.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const responseBody = await res.text().catch(() => "");
      throw new GeminiRequestError(`Gemini API returned ${res.status}: ${responseBody.slice(0, 300)}`, res.status);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== "string" || !text.trim()) {
      throw new GeminiRequestError("Gemini API returned no text.");
    }
    return text.trim();
  } finally {
    clearTimeout(timeout);
  }
}

/** Calls the Gemini API with a single text prompt and returns the reply text. */
export async function generateGeminiText(prompt: string): Promise<string> {
  return withRetry(() => callGeminiOnce({ contents: [{ parts: [{ text: prompt }] }] }));
}

/**
 * Calls Gemini with `responseMimeType: "application/json"` and a strict
 * `responseSchema` (Gemini's OpenAPI-subset schema format), so the reply is
 * guaranteed valid JSON matching the given shape - no markdown fences or
 * prose to strip, no brittle text parsing. Caller is still responsible for
 * validating the parsed value actually satisfies T at runtime.
 */
export async function generateGeminiJSON<T>(prompt: string, schema: object): Promise<T> {
  const text = await withRetry(() =>
    callGeminiOnce({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    })
  );

  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new GeminiRequestError(`Gemini API returned invalid JSON: ${(err as Error).message}`);
  }
}
