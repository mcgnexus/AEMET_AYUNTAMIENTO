import type { CurrentWeather, HourlyWeather, DailyWeather, WeatherPayload } from "@/types/weather";
import { buildAlerts, calculateModelConfidence } from "@/lib/weatherRules";
import {
  getOpenMeteoRateLimitState,
  setOpenMeteoRateLimitState,
  clearOpenMeteoRateLimitState,
  type OpenMeteoRateLimitState,
} from "@/lib/weatherStore";
import https from "https";

export const HUESCAR_COORDINATES = { latitude: 37.811, longitude: -2.5412 } as const;

export const OPEN_METEO_FORECAST_ENDPOINT = "https://api.open-meteo.com/v1/forecast";
export const OPEN_METEO_COOLDOWN_MS = 15 * 60_000;
export const OPEN_METEO_INMEMORY_TTL_MS = 10_000;

// In-memory cache to avoid DB roundtrips on every request
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

export async function getOpenMeteoCooldownStatus(): Promise<{ inCooldown: boolean; remainingMs: number; lastError: string | null }> {
  const cached = cacheGet<OpenMeteoRateLimitState>("openmeteo_state");
  if (cached) {
    const now = Date.now();
    const inCooldown = now < cached.cooldownUntil;
    return {
      inCooldown,
      remainingMs: inCooldown ? cached.cooldownUntil - now : 0,
      lastError: cached.lastFailureMessage,
    };
  }

  // Stale cache fallback
  const stale = cacheGet<OpenMeteoRateLimitState>("openmeteo_state_stale");
  if (stale) {
    cacheSet("openmeteo_state", stale, OPEN_METEO_INMEMORY_TTL_MS);
    const now = Date.now();
    const inCooldown = now < stale.cooldownUntil;
    return {
      inCooldown,
      remainingMs: inCooldown ? stale.cooldownUntil - now : 0,
      lastError: stale.lastFailureMessage,
    };
  }

  return { inCooldown: false, remainingMs: 0, lastError: null };
}

async function setOpenMeteoCooldown(error: string, isRateLimit: boolean): Promise<void> {
  const cooldownMs = isRateLimit ? OPEN_METEO_COOLDOWN_MS : Math.floor(OPEN_METEO_COOLDOWN_MS / 2);
  const state: OpenMeteoRateLimitState = {
    lastFetchAt: Date.now(),
    cooldownUntil: Date.now() + cooldownMs,
    lastFailureMessage: error,
  };
  cacheSet("openmeteo_state", state, OPEN_METEO_INMEMORY_TTL_MS);
  cacheSet("openmeteo_state_stale", state, 300_000);
  // Fire-and-forget DB write
  setOpenMeteoRateLimitState(state).catch(() => {});
}

export async function clearOpenMeteoCooldown(): Promise<void> {
  inMemoryCache.delete("openmeteo_state");
  inMemoryCache.delete("openmeteo_state_stale");
  // Fire-and-forget DB write
  clearOpenMeteoRateLimitState().catch(() => {});
}

export type OpenMeteoForecastOptions = {
  forecastDays?: number;
  pastDays?: number;
  signal?: AbortSignal;
};

export type OpenMeteoRaw = {
  latitude: number;
  longitude: number;
  elevation: number;
  timezone: string;
  current: {
    time: string;
    temperature_2m: number;
    relative_humidity_2m: number;
    apparent_temperature: number;
    precipitation: number;
    weather_code: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
    wind_gusts_10m: number;
    shortwave_radiation: number;
    et0_fao_evapotranspiration: number;
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    relative_humidity_2m: number[];
    precipitation: number[];
    precipitation_probability: number[];
    weather_code: number[];
    wind_speed_10m: number[];
    wind_gusts_10m: number[];
  };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: number[];
    precipitation_sum: number[];
    wind_gusts_10m_max: number[];
    et0_fao_evapotranspiration: number[];
  };
};

export function buildOpenMeteoParams(options: OpenMeteoForecastOptions = {}): URLSearchParams {
  return new URLSearchParams({
    latitude: String(HUESCAR_COORDINATES.latitude),
    longitude: String(HUESCAR_COORDINATES.longitude),
    current: [
      "temperature_2m", "relative_humidity_2m", "apparent_temperature",
      "precipitation", "weather_code", "wind_speed_10m",
      "wind_direction_10m", "wind_gusts_10m", "shortwave_radiation",
      "et0_fao_evapotranspiration",
    ].join(","),
    hourly: "temperature_2m,relative_humidity_2m,precipitation,precipitation_probability,weather_code,wind_speed_10m,wind_gusts_10m",
    daily: [
      "weather_code", "temperature_2m_max", "temperature_2m_min",
      "precipitation_probability_max", "precipitation_sum",
      "wind_gusts_10m_max", "et0_fao_evapotranspiration",
    ].join(","),
    forecast_days: String(options.forecastDays ?? 7),
    past_days: String(options.pastDays ?? 1),
    timezone: "Europe/Madrid",
  });
}

export function mapOpenMeteoCurrent(raw: OpenMeteoRaw["current"]): CurrentWeather {
  return {
    time: raw.time,
    temperatureC: raw.temperature_2m,
    apparentTemperatureC: raw.apparent_temperature,
    humidityPct: raw.relative_humidity_2m,
    precipitationMm: raw.precipitation,
    weatherCode: raw.weather_code,
    windSpeedKmh: raw.wind_speed_10m,
    windDirectionDeg: raw.wind_direction_10m,
    windGustKmh: raw.wind_gusts_10m,
    solarRadiationWm2: raw.shortwave_radiation,
    et0Mm: raw.et0_fao_evapotranspiration,
  };
}

export function sliceHourlyFromCurrent(raw: OpenMeteoRaw): {
  from: number;
  to: number;
} {
  const currentHour = raw.current?.time
    ? raw.hourly.time.findIndex((time) => time >= raw.current.time.slice(0, 13))
    : -1;
  const from = currentHour >= 0 ? currentHour : 0;
  const to = Math.min(from + 24, raw.hourly.time.length);
  return { from, to };
}

export function mapOpenMeteoPayload(raw: OpenMeteoRaw): WeatherPayload {
  const current = mapOpenMeteoCurrent(raw.current);
  const { from, to } = sliceHourlyFromCurrent(raw);
  return {
    location: "Huéscar",
    latitude: raw.latitude,
    longitude: raw.longitude,
    elevation: raw.elevation,
    timezone: raw.timezone,
    source: "OPEN_METEO",
    fetchedAt: new Date().toISOString(),
    confidencePct: calculateModelConfidence(current),
    confidenceExplanation: "Confianza limitada al disponer únicamente del modelo Open-Meteo, sin observación AEMET para contrastarlo.",
    current,
    sources: [],
    sourceHealth: [{
      source: "OPEN_METEO",
      status: "OK",
      checkedAt: new Date().toISOString(),
      dataTime: current.time,
      dataAgeMinutes: 0,
      message: "Modelo por coordenada disponible.",
    }],
    hourly: {
      time: raw.hourly.time.slice(from, to),
      temperatureC: raw.hourly.temperature_2m.slice(from, to),
      humidityPct: raw.hourly.relative_humidity_2m.slice(from, to),
      precipitationProbabilityPct: raw.hourly.precipitation_probability.slice(from, to),
      precipitationMm: raw.hourly.precipitation.slice(from, to),
      weatherCode: raw.hourly.weather_code.slice(from, to),
      windSpeedKmh: raw.hourly.wind_speed_10m.slice(from, to),
    },
    comparisonHourly: {
      time: raw.hourly.time,
      temperatureC: raw.hourly.temperature_2m,
      humidityPct: raw.hourly.relative_humidity_2m,
      precipitationMm: raw.hourly.precipitation,
      windSpeedKmh: raw.hourly.wind_speed_10m,
      windGustKmh: raw.hourly.wind_gusts_10m,
    },
    daily: {
      time: raw.daily.time,
      temperatureMaxC: raw.daily.temperature_2m_max,
      temperatureMinC: raw.daily.temperature_2m_min,
      precipitationProbabilityPct: raw.daily.precipitation_probability_max,
      precipitationSumMm: raw.daily.precipitation_sum,
      windGustKmh: raw.daily.wind_gusts_10m_max,
      et0Mm: raw.daily.et0_fao_evapotranspiration,
      weatherCode: raw.daily.weather_code,
    },
    alerts: buildAlerts(current),
  };
}

const OPEN_METEO_AGENT = new https.Agent({
  rejectUnauthorized: false,
  minVersion: "TLSv1.2",
  maxVersion: "TLSv1.3",
});

function httpsFetch(url: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Open-Meteo agotó el tiempo de conexión (10s)"));
    }, 10_000);

    const req = https.get(url, { agent: OPEN_METEO_AGENT, headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        clearTimeout(timeout);
        if (res.statusCode && res.statusCode >= 400) {
          const isRateLimit = res.statusCode === 429;
          const error = `Open-Meteo respondió ${res.statusCode}`;
          setOpenMeteoCooldown(error, isRateLimit).catch(() => {});
          reject(new Error(error));
          return;
        }
        resolve(data);
      });
      res.on("error", (e) => {
        clearTimeout(timeout);
        reject(e);
      });
    });

    req.on("error", (e) => {
      clearTimeout(timeout);
      reject(e);
    });
  });
}

export async function fetchOpenMeteoForecast(
  options: OpenMeteoForecastOptions = {},
): Promise<WeatherPayload> {
  const cooldown = await getOpenMeteoCooldownStatus();
  if (cooldown.inCooldown) {
    const remainingSec = Math.ceil(cooldown.remainingMs / 1000);
    throw new Error(`Open-Meteo en cooldown (${remainingSec}s): ${cooldown.lastError}`);
  }

  const params = buildOpenMeteoParams(options);
  const url = `${OPEN_METEO_FORECAST_ENDPOINT}?${params}`;

  const raw = await httpsFetch(url);

  let parsed: OpenMeteoRaw;
  try {
    parsed = JSON.parse(raw) as OpenMeteoRaw;
  } catch {
    throw new Error(`Open-Meteo devolvió JSON inválido: ${raw.substring(0, 200)}`);
  }

  // Reset cooldown on success
  await clearOpenMeteoCooldown();
  return mapOpenMeteoPayload(parsed);
}

export function currentToSourceObservation(
  current: CurrentWeather,
  elevationM: number,
): import("@/types/weather").SourceObservation {
  return {
    source: "OPEN_METEO",
    locationName: "Huéscar ciudad",
    time: current.time,
    observationPeriod: "current",
    dataAgeMinutes: 0,
    qualityScore: 0.88,
    status: "OK",
    elevationM,
    rawTemperatureC: current.temperatureC,
    altitudeCorrectionC: 0,
    temperatureC: current.temperatureC,
    humidityPct: current.humidityPct,
    precipitationMm: current.precipitationMm,
    windSpeedKmh: current.windSpeedKmh,
    windGustKmh: current.windGustKmh,
  };
}

export function alignOpenMeteoSourceToAemetTime(
  openMeteo: WeatherPayload,
  aemetTime: string,
): { source: import("@/types/weather").SourceObservation; alignedTime: string; alignmentMinutes: number } {
  const targetTimestamp = Date.parse(aemetTime);
  const localMadridTimestamp = (time: string): number => {
    const date = time.slice(0, 10);
    const middayUtc = new Date(`${date}T12:00:00Z`);
    const madridParts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Madrid",
      timeZoneName: "longOffset",
    }).formatToParts(middayUtc);
    const offset = madridParts.find((part) => part.type === "timeZoneName")?.value.replace("GMT", "") || "+01:00";
    return Date.parse(`${time}${offset}`);
  };
  const comparisonHourly = openMeteo.comparisonHourly;
  let bestIndex = 0;
  let bestDiff = Math.abs(localMadridTimestamp(comparisonHourly.time[0]) - targetTimestamp);
  for (let index = 1; index < comparisonHourly.time.length; index += 1) {
    const diff = Math.abs(localMadridTimestamp(comparisonHourly.time[index]) - targetTimestamp);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIndex = index;
    }
  }
  const alignedTime = comparisonHourly.time[bestIndex];
  const alignedTimestamp = localMadridTimestamp(alignedTime);
  const source: import("@/types/weather").SourceObservation = {
    source: "OPEN_METEO",
    locationName: "Huéscar ciudad",
    time: alignedTime,
    observationPeriod: "current",
    dataAgeMinutes: Math.max(0, Math.round((Date.now() - alignedTimestamp) / 60_000)),
    qualityScore: Math.abs(alignedTimestamp - targetTimestamp) <= 30 * 60_000 ? 0.88 : 0.7,
    status: "OK",
    elevationM: openMeteo.elevation,
    rawTemperatureC: comparisonHourly.temperatureC[bestIndex],
    altitudeCorrectionC: 0,
    temperatureC: comparisonHourly.temperatureC[bestIndex],
    humidityPct: comparisonHourly.humidityPct[bestIndex],
    precipitationMm: comparisonHourly.precipitationMm[bestIndex],
    windSpeedKmh: comparisonHourly.windSpeedKmh[bestIndex],
    windGustKmh: comparisonHourly.windGustKmh[bestIndex],
  };
  return {
    source,
    alignedTime,
    alignmentMinutes: Math.abs(alignedTimestamp - targetTimestamp) / 60_000,
  };
}

export function getHourlyWindow(raw: OpenMeteoRaw): { hourly: HourlyWeather; comparisonHourly: WeatherPayload["comparisonHourly"]; daily: DailyWeather } {
  const { from, to } = sliceHourlyFromCurrent(raw);
  return {
    hourly: {
      time: raw.hourly.time.slice(from, to),
      temperatureC: raw.hourly.temperature_2m.slice(from, to),
      humidityPct: raw.hourly.relative_humidity_2m.slice(from, to),
      precipitationProbabilityPct: raw.hourly.precipitation_probability.slice(from, to),
      precipitationMm: raw.hourly.precipitation.slice(from, to),
      weatherCode: raw.hourly.weather_code.slice(from, to),
      windSpeedKmh: raw.hourly.wind_speed_10m.slice(from, to),
    },
    comparisonHourly: {
      time: raw.hourly.time,
      temperatureC: raw.hourly.temperature_2m,
      humidityPct: raw.hourly.relative_humidity_2m,
      precipitationMm: raw.hourly.precipitation,
      windSpeedKmh: raw.hourly.wind_speed_10m,
      windGustKmh: raw.hourly.wind_gusts_10m,
    },
    daily: {
      time: raw.daily.time,
      temperatureMaxC: raw.daily.temperature_2m_max,
      temperatureMinC: raw.daily.temperature_2m_min,
      precipitationProbabilityPct: raw.daily.precipitation_probability_max,
      precipitationSumMm: raw.daily.precipitation_sum,
      windGustKmh: raw.daily.wind_gusts_10m_max,
      et0Mm: raw.daily.et0_fao_evapotranspiration,
      weatherCode: raw.daily.weather_code,
    },
  };
}
