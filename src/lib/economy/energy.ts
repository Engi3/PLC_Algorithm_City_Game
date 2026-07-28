export const MAX_ENERGY = 100;
export const ENERGY_REGEN_MS = 60_000; // +1 energy per minute

/** Read-only: what the student's energy would be right now, without persisting anything. */
export function computeLiveEnergy(
  storedEnergy: number,
  energyUpdatedAt: string | Date,
  now: Date = new Date()
): number {
  if (storedEnergy >= MAX_ENERGY) return MAX_ENERGY;
  const last = typeof energyUpdatedAt === "string" ? new Date(energyUpdatedAt) : energyUpdatedAt;
  const elapsedMs = now.getTime() - last.getTime();
  const regenTicks = Math.floor(elapsedMs / ENERGY_REGEN_MS);
  if (regenTicks <= 0) return storedEnergy;
  return Math.min(MAX_ENERGY, storedEnergy + regenTicks);
}

/**
 * Applies regen and advances the baseline timestamp by only the ticks that
 * were actually consumed, so partial progress toward the next tick isn't
 * lost. Used right before a mutation (spend/deduct) that will persist the
 * result - pure read paths should use computeLiveEnergy instead.
 */
export function applyEnergyRegen(
  storedEnergy: number,
  energyUpdatedAt: string | Date,
  now: Date = new Date()
): { energy: number; energyUpdatedAt: Date } {
  const last = typeof energyUpdatedAt === "string" ? new Date(energyUpdatedAt) : energyUpdatedAt;
  if (storedEnergy >= MAX_ENERGY) {
    return { energy: MAX_ENERGY, energyUpdatedAt: last };
  }
  const elapsedMs = now.getTime() - last.getTime();
  const regenTicks = Math.floor(elapsedMs / ENERGY_REGEN_MS);
  if (regenTicks <= 0) {
    return { energy: storedEnergy, energyUpdatedAt: last };
  }
  return {
    energy: Math.min(MAX_ENERGY, storedEnergy + regenTicks),
    energyUpdatedAt: new Date(last.getTime() + regenTicks * ENERGY_REGEN_MS),
  };
}

const MIN_COINS_PER_PASS = 2;

/** Coins scale with score (0-100), rewarding concise solutions like the score itself does. */
export function computeCoinsForScore(score: number): number {
  return Math.max(MIN_COINS_PER_PASS, Math.round(score / 10));
}
