import "server-only";

const GEMINI_MODEL = "gemini-flash-latest";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export class GeminiConfigError extends Error {}
export class GeminiRequestError extends Error {}

/** Calls the Gemini API with a single text prompt and returns the reply text. */
export async function generateGeminiText(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new GeminiConfigError("GEMINI_API_KEY is not set.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new GeminiRequestError(`Gemini API returned ${res.status}: ${body.slice(0, 300)}`);
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

/**
 * Calls Gemini with `responseMimeType: "application/json"` and a strict
 * `responseSchema` (Gemini's OpenAPI-subset schema format), so the reply is
 * guaranteed valid JSON matching the given shape - no markdown fences or
 * prose to strip, no brittle text parsing. Caller is still responsible for
 * validating the parsed value actually satisfies T at runtime.
 */
export async function generateGeminiJSON<T>(prompt: string, schema: object): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new GeminiConfigError("GEMINI_API_KEY is not set.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: schema,
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new GeminiRequestError(`Gemini API returned ${res.status}: ${body.slice(0, 300)}`);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== "string" || !text.trim()) {
      throw new GeminiRequestError("Gemini API returned no text.");
    }

    try {
      return JSON.parse(text) as T;
    } catch (err) {
      throw new GeminiRequestError(`Gemini API returned invalid JSON: ${(err as Error).message}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}
