import type { SourceObservation } from "@/types/weather";

export const AEMET_DEFAULT_ENDPOINT =
  "https://opendata.aemet.es/opendata/api/observacion/convencional/datos/estacion/5051X";

export const AEMET_DEFAULT_TIMEOUT_MS = 4_000;
export const AEMET_DEFAULT_MAX_ATTEMPTS = 2;
export const AEMET_DEFAULT_RETRY_DELAY_MS = 350;

export const AEMET_STATION_ID = "5051X";

export type AemetRaw = {
  idema: string;
  ubi: string;
  fint: string;
  ta?: number;
  hr?: number;
  prec?: number;
  vv?: number;
  vmax?: number;
  pres?: number;
  alt?: number;
};

export type AemetClientOptions = {
  endpoint?: string;
  apiKey: string;
  timeoutMs?: number;
  maxAttempts?: number;
  retryDelayMs?: number;
  signal?: AbortSignal;
};

export function buildAemetError(response: Response, body: { descripcion?: string } | null) {
  if (response.status === 401) {
    return new Error("Clave AEMET inválida o revocada (401). Genera una nueva clave en AEMET OpenData");
  }
  if (response.status === 429) {
    return new Error("Límite temporal de peticiones AEMET alcanzado (429)");
  }
  return new Error(body?.descripcion ?? `AEMET respondió ${response.status}`);
}

export function buildAemetNetworkError(error: unknown, timeoutMs: number) {
  const code =
    error instanceof Error && "cause" in error
      ? (error.cause as { code?: string } | undefined)?.code
      : undefined;
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return `AEMET agotó el tiempo de conexión (${timeoutMs / 1000}s)`;
  }
  if (code === "UND_ERR_CONNECT_TIMEOUT") {
    return `AEMET agotó el tiempo de conexión (${timeoutMs / 1000}s)`;
  }
  return `No se pudo conectar con AEMET: ${error instanceof Error ? error.message : "error de red"}`;
}

function shouldRetryStatus(status: number) {
  return status >= 500;
}

async function fetchAemetWithRetry(
  url: string,
  apiKey: string,
  timeoutMs: number,
  maxAttempts: number,
  retryDelayMs: number,
  signal?: AbortSignal,
): Promise<Response> {
  let lastError = "AEMET no disponible";
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const fetchOptions: RequestInit = {
        headers: { accept: "application/json", connection: "close", api_key: apiKey },
        cache: "no-store",
      };
      if (signal) {
        fetchOptions.signal = signal;
      } else {
        fetchOptions.signal = AbortSignal.timeout(timeoutMs);
      }
      const response = await fetch(url, fetchOptions);
      if (!shouldRetryStatus(response.status) || attempt === maxAttempts) {
        return response;
      }
      lastError = `AEMET respondió ${response.status}`;
      await response.body?.cancel();
    } catch (error) {
      lastError = buildAemetNetworkError(error, timeoutMs);
      if (attempt === maxAttempts) {
        throw new Error(`${lastError} tras ${attempt} intentos`);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
  }
  throw new Error(lastError);
}

export function aemetRecordsToSourceObservation(
  records: AemetRaw[],
  stationId: string = AEMET_STATION_ID,
): SourceObservation {
  const raw = records
    .filter((record) => record.idema === stationId && typeof record.ta === "number")
    .sort((a, b) => Date.parse(b.fint) - Date.parse(a.fint))[0];
  if (!raw) throw new Error(`AEMET no devolvió observaciones válidas para ${stationId}`);
  const dataAgeMinutes = Math.max(0, Math.round((Date.now() - Date.parse(raw.fint)) / 60_000));
  const qualityScore = dataAgeMinutes <= 90 ? 1 : Math.max(0.35, 1 - (dataAgeMinutes - 90) / 600);
  return {
    source: "AEMET",
    stationId: raw.idema,
    locationName: raw.ubi,
    time: raw.fint,
    observationPeriod: "current",
    retrievalStatus: "LIVE",
    dataAgeMinutes,
    qualityScore,
    status: dataAgeMinutes <= 120 ? "OK" : "Retrasada",
    elevationM: raw.alt,
    temperatureC: raw.ta!,
    humidityPct: raw.hr ?? 0,
    precipitationMm: raw.prec ?? 0,
    windSpeedKmh: (raw.vv ?? 0) * 3.6,
    windGustKmh: (raw.vmax ?? 0) * 3.6,
    pressureHpa: raw.pres,
  };
}

export async function fetchAemetObservation(
  options: AemetClientOptions,
): Promise<SourceObservation> {
  const endpoint = options.endpoint ?? AEMET_DEFAULT_ENDPOINT;
  const apiKey = options.apiKey;
  const timeoutMs = options.timeoutMs ?? AEMET_DEFAULT_TIMEOUT_MS;
  const maxAttempts = options.maxAttempts ?? AEMET_DEFAULT_MAX_ATTEMPTS;
  const retryDelayMs = options.retryDelayMs ?? AEMET_DEFAULT_RETRY_DELAY_MS;

  const metadataResponse = await fetchAemetWithRetry(
    endpoint,
    apiKey,
    timeoutMs,
    maxAttempts,
    retryDelayMs,
    options.signal,
  );
  if (!metadataResponse.ok) {
    const body = await metadataResponse.json().catch(() => null) as { descripcion?: string } | null;
    throw buildAemetError(metadataResponse, body);
  }
  let metadata: { datos?: string; descripcion?: string };
  try {
    metadata = await metadataResponse.json() as { datos?: string; descripcion?: string };
  } catch {
    const text = await metadataResponse.text().catch(() => "");
    throw new Error(`AEMET devolvió respuesta no válida (metadata corrupta). Longitud: ${text.length} caracteres. Posible mantenimiento del servidor.`);
  }
  if (!metadata.datos) throw new Error(metadata.descripcion ?? "AEMET no devolvió URL de datos");

  const dataResponse = await fetchAemetWithRetry(
    metadata.datos,
    apiKey,
    timeoutMs,
    maxAttempts,
    retryDelayMs,
    options.signal,
  );
  if (!dataResponse.ok) {
    const body = await dataResponse.json().catch(() => null) as { descripcion?: string } | null;
    throw buildAemetError(dataResponse, body);
  }
  let records: AemetRaw[];
  try {
    records = await dataResponse.json() as AemetRaw[];
  } catch {
    const text = await dataResponse.text().catch(() => "");
    throw new Error(`AEMET devolvió datos corruptos (JSON inválido). Longitud: ${text.length} caracteres. Posible mantenimiento del servidor.`);
  }
  return aemetRecordsToSourceObservation(records);
}
