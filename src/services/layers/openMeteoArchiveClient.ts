const OPEN_METEO_ARCHIVE_ENDPOINT = "https://archive-api.open-meteo.com/v1/archive";

export type OpenMeteoArchiveParams = {
  latitude: number;
  longitude: number;
  startDate: string;
  endDate: string;
  variables?: string[];
  signal?: AbortSignal;
};

export type OpenMeteoArchiveRaw = {
  elevation: number;
  daily: {
    time: string[];
    temperature_2m_mean?: number[];
    relative_humidity_2m_mean?: number[];
    precipitation_sum?: number[];
    wind_speed_10m_mean?: number[];
    wind_gusts_10m_max?: number[];
    shortwave_radiation_sum?: number[];
    et0_fao_evapotranspiration?: number[];
  };
};

export type OpenMeteoArchiveDailyRecord = {
  date: string;
  temperatureC: number;
  humidityPct: number;
  precipitationMm: number;
  windSpeedKmh: number;
  windGustKmh: number;
  solarRadiationMjM2?: number;
  et0Mm?: number;
};

export const DEFAULT_ARCHIVE_VARIABLES = [
  "temperature_2m_mean",
  "relative_humidity_2m_mean",
  "precipitation_sum",
  "wind_speed_10m_mean",
  "wind_gusts_10m_max",
  "shortwave_radiation_sum",
  "et0_fao_evapotranspiration",
] as const;

async function fetchWithRetry(url: string, signal: AbortSignal | undefined, maxRetries = 3): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: signal ?? AbortSignal.timeout(10_000),
      });
      if (response.ok) return response;
      if (response.status === 429) {
        const delay = 1000 * (2 ** attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
        lastError = new Error(`Open-Meteo Archive respondió 429 (reintentando ${attempt + 1}/${maxRetries})`);
        continue;
      }
      throw new Error(`Open-Meteo Archive respondió ${response.status}`);
    } catch (error) {
      if (attempt === maxRetries - 1) throw lastError ?? error;
      const delay = 1000 * (2 ** attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }
  throw lastError ?? new Error("Open-Meteo Archive no respondió tras múltiples reintentos");
}

export async function fetchOpenMeteoArchive(
  params: OpenMeteoArchiveParams,
): Promise<OpenMeteoArchiveRaw> {
  const variables = params.variables ?? DEFAULT_ARCHIVE_VARIABLES;
  const queryParams = new URLSearchParams({
    latitude: String(params.latitude),
    longitude: String(params.longitude),
    start_date: params.startDate,
    end_date: params.endDate,
    daily: variables.join(","),
    wind_speed_unit: "kmh",
    timezone: "Europe/Madrid",
  });
  const response = await fetchWithRetry(
    `${OPEN_METEO_ARCHIVE_ENDPOINT}?${queryParams}`,
    params.signal,
  );
  return (await response.json()) as OpenMeteoArchiveRaw;
}

export function indexArchiveByDate(raw: OpenMeteoArchiveRaw): Map<string, OpenMeteoArchiveDailyRecord> {
  const index = new Map<string, OpenMeteoArchiveDailyRecord>();
  const daily = raw.daily;
  for (let i = 0; i < daily.time.length; i += 1) {
    index.set(daily.time[i], {
      date: daily.time[i],
      temperatureC: daily.temperature_2m_mean?.[i] ?? NaN,
      humidityPct: daily.relative_humidity_2m_mean?.[i] ?? NaN,
      precipitationMm: daily.precipitation_sum?.[i] ?? NaN,
      windSpeedKmh: daily.wind_speed_10m_mean?.[i] ?? NaN,
      windGustKmh: daily.wind_gusts_10m_max?.[i] ?? NaN,
      solarRadiationMjM2: daily.shortwave_radiation_sum?.[i],
      et0Mm: daily.et0_fao_evapotranspiration?.[i],
    });
  }
  return index;
}
