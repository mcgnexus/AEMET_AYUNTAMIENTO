import {
  getAemetRateLimitState,
  setAemetRateLimitState,
  clearAemetRateLimitState as clearAemetRateLimitStateDb,
  type AemetRateLimitState,
} from "@/lib/weatherStore";

export const AEMET_REFRESH_INTERVAL_MS = 15 * 60_000;
export const AEMET_FAILURE_COOLDOWN_MS = 10 * 60_000;
export const AEMET_RATE_LIMIT_COOLDOWN_MS = 15 * 60_000;
export const AEMET_CACHE_MAX_AGE_MINUTES = 240;
export const AEMET_INMEMORY_TTL_MS = 10_000;
export const AEMET_COOLDOWN_MAX_LOOKAHEAD_MS = 30 * 60 * 1000; // 30 minutos máximo

const inMemoryCache = new Map<string, { value: unknown; expiresAt: number }>();

function cacheGet<T>(key: string): T | undefined {
  const entry = inMemoryCache.get(key);
  if (entry && entry.expiresAt > Date.now()) return entry.value as T;
  inMemoryCache.delete(key);
  return undefined;
}

function cacheSet(key: string, value: unknown, ttlMs: number) {
  inMemoryCache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function clearMemoryCache() {
  inMemoryCache.clear();
}

export type AemetState = {
  observation: import("@/types/weather").SourceObservation | null;
  lastFetchAt: number;
  failureMessage: string | null;
  cooldownUntil: number;
};

const EMPTY_STATE: AemetState = {
  observation: null,
  lastFetchAt: 0,
  failureMessage: null,
  cooldownUntil: 0,
};

export async function loadAemetState(): Promise<AemetState> {
  const cached = cacheGet<AemetState>("aemet_state");
  if (cached) return cached;
  // Stale cache: only use if >10s old (fresher than that would hit the live cache)
  const stale = cacheGet<AemetState>("aemet_state_stale");
  if (stale) {
    cacheSet("aemet_state", stale, AEMET_INMEMORY_TTL_MS);
    return stale;
  }
  // Last resort: DB query
  const [rateLimitState, persistedObservation] = await Promise.all([
    getAemetRateLimitState().catch(() => null),
    (await import("@/lib/weatherStore")).getLatestSourceObservation("AEMET").catch(() => null),
  ]);
  let cooldownUntil = rateLimitState?.cooldownUntil ?? 0;
  if (cooldownUntil > Date.now() + AEMET_COOLDOWN_MAX_LOOKAHEAD_MS) {
    cooldownUntil = 0;
  }
  const state: AemetState = {
    observation: persistedObservation,
    lastFetchAt: rateLimitState?.lastFetchAt ?? 0,
    failureMessage: rateLimitState?.lastFailureMessage ?? null,
    cooldownUntil,
  };
  cacheSet("aemet_state", state, AEMET_INMEMORY_TTL_MS);
  cacheSet("aemet_state_stale", state, 300_000);
  return state;
}

export async function saveAemetState(state: AemetState): Promise<void> {
  cacheSet("aemet_state", state, AEMET_INMEMORY_TTL_MS);
  cacheSet("aemet_state_stale", state, 300_000);
  // All DB writes are fire-and-forget — must not block the response
  if (state.observation) {
    const obs = state.observation;
    (async () => {
      try {
        const { upsertSourceObservation } = await import("@/lib/weatherStore");
        await upsertSourceObservation(obs);
      } catch { /* ignore */ }
    })();
  }
  (async () => {
    try {
      const prev = await getAemetRateLimitState().catch(() => null);
      if (
        !prev ||
        prev.lastFetchAt !== state.lastFetchAt ||
        prev.cooldownUntil !== state.cooldownUntil ||
        prev.lastFailureMessage !== state.failureMessage
      ) {
        const rateLimitState: AemetRateLimitState = {
          lastFetchAt: state.lastFetchAt,
          cooldownUntil: state.cooldownUntil,
          lastFailureMessage: state.failureMessage,
        };
        await setAemetRateLimitState(rateLimitState);
      }
    } catch { /* ignore */ }
  })();
}

export function isFreshEnough(state: AemetState): boolean {
  return Boolean(state.observation) && Date.now() - state.lastFetchAt < AEMET_REFRESH_INTERVAL_MS;
}

export function isInCooldown(state: AemetState): boolean {
  return Boolean(state.failureMessage) && Date.now() < state.cooldownUntil;
}

export function cooldownMessage(state: AemetState): string {
  const secondsRemaining = Math.max(1, Math.ceil((state.cooldownUntil - Date.now()) / 1000));
  return `AEMET en pausa temporal (${secondsRemaining}s): ${state.failureMessage}`;
}

export function asFreshCache(
  observation: import("@/types/weather").SourceObservation,
): import("@/types/weather").SourceObservation {
  const dataAgeMinutes = Math.max(
    0,
    Math.round((Date.now() - Date.parse(observation.time)) / 60_000),
  );
  return {
    ...observation,
    retrievalStatus: "FRESH_CACHE",
    retrievalWarning: undefined,
    dataAgeMinutes,
    status: dataAgeMinutes <= 120 ? "OK" : "Retrasada",
  };
}

export function asStaleCache(
  observation: import("@/types/weather").SourceObservation,
  warning: string,
): import("@/types/weather").SourceObservation {
  const dataAgeMinutes = Math.max(
    0,
    Math.round((Date.now() - Date.parse(observation.time)) / 60_000),
  );
  return {
    ...observation,
    retrievalStatus: "STALE_CACHE",
    retrievalWarning: warning,
    dataAgeMinutes,
    qualityScore: Math.max(0.25, observation.qualityScore * 0.7),
    status: "Retrasada",
  };
}

export function buildFailureCooldown(message: string, now: number = Date.now()): number {
  const isRateLimit = message.includes("(429)");
  const cooldownMs = isRateLimit ? AEMET_RATE_LIMIT_COOLDOWN_MS : AEMET_FAILURE_COOLDOWN_MS;
  return now + cooldownMs;
}

export { clearAemetRateLimitStateDb, EMPTY_STATE };
