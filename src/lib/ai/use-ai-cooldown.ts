"use client";

import { useEffect, useState } from "react";

/**
 * After an AI-calling action resolves (success or failure), keeps its
 * trigger button disabled for a few more seconds - a click landing right as
 * `loading` flips back to `false` could otherwise re-fire the request
 * instantly. Paired with the server-side limiter in rate-limit.ts as
 * defense in depth (this is the fast, no-round-trip layer; the server one
 * is the real enforcement point).
 */
export function useAiCooldown(seconds = 4) {
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [secondsLeft]);

  return { secondsLeft, active: secondsLeft > 0, start: () => setSecondsLeft(seconds) };
}
