import type { WeatherPayload } from "@/types/weather";
import { getObservationLayer } from "./layers/layerObservation";
import { getComarcaLayer } from "./layers/layerComarca";
import { getGeographicLayer } from "./layers/layerGeographic";
import { getConfidenceCalibration } from "./calibration/calibrationService";
import type {
  LayerObservation,
  LayerComarca,
  LayerGeographic,
  AggregatedWeather,
  AggregatorOptions,
  LayerAvailability,
} from "./layers";
import type { ConfidenceCalibration } from "@/lib/weatherStore";

const DEFAULT_TIMEOUTS = {
  observation: 15_000,
  comarca: 20_000,
  geographic: 15_000,
  calibration: 5_000,
};

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} agotó el tiempo de espera (${ms / 1000}s)`)), ms);
    }),
  ]);
}

function toLayerAvailability<T>(
  result: PromiseSettledResult<T | null>,
): "ok" | "degraded" | "unavailable" {
  if (result.status === "rejected") return "unavailable";
  const value = result.value;
  if (value == null) return "unavailable";
  if (typeof value === "object" && value !== null && "meta" in value) {
    const meta = (value as { meta?: { status?: string } }).meta;
    if (meta?.status === "OK") return "ok";
    if (meta?.status === "DEGRADED") return "degraded";
  }
  return "ok";
}

function flattenObservationLayerToLegacy(layer: LayerObservation): WeatherPayload {
  const source = (() => {
    if (layer.meta.status === "OK" && layer.sources.length >= 2) return "FUSED";
    if (layer.sources.length === 1 && layer.sources[0]?.source === "AEMET") return "AEMET";
    return "OPEN_METEO";
  })();
  return {
    location: layer.location.name,
    latitude: layer.location.latitude,
    longitude: layer.location.longitude,
    elevation: layer.location.elevation,
    timezone: layer.location.timezone,
    source,
    fetchedAt: layer.fetchedAt,
    confidencePct: layer.confidence.pct,
    confidenceExplanation: layer.confidence.explanation,
    current: layer.consensus,
    sources: layer.sources,
    sourceHealth: layer.sourceHealth,
    hourly: layer.hourly,
    comparisonHourly: layer.comparisonHourly,
    daily: layer.daily,
    alerts: layer.alerts,
  };
}

export async function getAggregatedWeather(
  options: AggregatorOptions = {},
): Promise<AggregatedWeather> {
  const generatedAt = new Date().toISOString();
  const timeouts = {
    observation: options.observationTimeoutMs ?? DEFAULT_TIMEOUTS.observation,
    comarca: options.comarcaTimeoutMs ?? DEFAULT_TIMEOUTS.comarca,
    geographic: options.geographicTimeoutMs ?? DEFAULT_TIMEOUTS.geographic,
    calibration: options.calibrationTimeoutMs ?? DEFAULT_TIMEOUTS.calibration,
  };

  const observationPromise = withTimeout(
    getObservationLayer({ signal: options.forceRefresh ? undefined : undefined }),
    timeouts.observation,
    "Capa 1 (Observación)",
  );
  const comarcaPromise = withTimeout(
    getComarcaLayer({ signal: undefined }),
    timeouts.comarca,
    "Capa 2 (Comarcal)",
  ).catch(() => null as LayerComarca | null);
  const geographicPromise = withTimeout(
    getGeographicLayer(),
    timeouts.geographic,
    "Capa 3 (Geográfica)",
  ).catch(() => null as LayerGeographic | null);
  const calibrationPromise = withTimeout(
    getConfidenceCalibration(),
    timeouts.calibration,
    "Capa 0 (Calibración)",
  ).catch(() => null as ConfidenceCalibration | null);

  const [observationResult, comarcaResult, geographicResult, calibrationResult] = await Promise.allSettled([
    observationPromise,
    comarcaPromise,
    geographicPromise,
    calibrationPromise,
  ]);

  const warnings: string[] = [];
  if (observationResult.status === "rejected") {
    // Instead of throwing, return a degraded response
    console.error("[aggregator] Observation layer failed:", observationResult.reason);
    warnings.push(
      `Capa 1 (Observación) falló: ${observationResult.reason instanceof Error ? observationResult.reason.message : String(observationResult.reason)}`,
    );
    
    // Create a minimal degraded observation
    const degradedObservation: LayerObservation = {
      meta: {
        generatedAt,
        status: "ERROR",
        warnings,
      },
      location: {
        name: "Huéscar",
        latitude: 37.811,
        longitude: -2.5412,
        elevation: 953,
        timezone: "Europe/Madrid",
      },
      fetchedAt: generatedAt,
      consensus: {
        time: generatedAt,
        temperatureC: 0,
        apparentTemperatureC: 0,
        humidityPct: 0,
        precipitationMm: 0,
        weatherCode: 0,
        windSpeedKmh: 0,
        windDirectionDeg: 0,
        windGustKmh: 0,
        solarRadiationWm2: 0,
        et0Mm: 0,
      },
      sources: [],
      sourceHealth: [
        {
          source: "AEMET",
          status: "ERROR",
          checkedAt: generatedAt,
          message: "No disponible",
          lastError: observationResult.reason instanceof Error ? observationResult.reason.message : String(observationResult.reason),
        },
        {
          source: "OPEN_METEO",
          status: "ERROR",
          checkedAt: generatedAt,
          message: "No disponible",
        },
      ],
      confidence: {
        pct: 0,
        explanation: "Error al obtener datos meteorológicos",
        calibrationWeightPct: 0,
      },
      hourly: {
        time: [],
        temperatureC: [],
        precipitationProbabilityPct: [],
        precipitationMm: [],
        weatherCode: [],
        windSpeedKmh: [],
      },
      comparisonHourly: {
        time: [],
        temperatureC: [],
        humidityPct: [],
        precipitationMm: [],
        windSpeedKmh: [],
        windGustKmh: [],
      },
      daily: {
        time: [],
        temperatureMaxC: [],
        temperatureMinC: [],
        precipitationProbabilityPct: [],
        precipitationSumMm: [],
        windGustKmh: [],
        et0Mm: [],
        weatherCode: [],
      },
      alerts: [],
    };
    
    return {
      generatedAt,
      availability: {
        observation: "unavailable" as const,
        comarca: "unavailable" as const,
        geographic: "unavailable" as const,
        calibration: "unavailable" as const,
      },
      warnings,
      observation: degradedObservation,
      comarca: null,
      geographic: null,
      calibration: null,
    };
  }
  const observation = observationResult.value;
  if (comarcaResult.status === "rejected" || comarcaResult.value == null) {
    warnings.push("Capa 2 (Comarcal) no disponible; estimaciones diarias omitidas.");
  }
  if (geographicResult.status === "rejected" || geographicResult.value == null) {
    warnings.push("Capa 3 (Geográfica) no disponible; contexto de perfiles omitido.");
  }
  if (calibrationResult.status === "rejected" || calibrationResult.value == null) {
    warnings.push("Capa 0 (Calibración) no disponible; tolerancias usando valores por defecto.");
  }

  const availability: LayerAvailability = {
    observation: toLayerAvailability({ status: "fulfilled", value: observation }),
    comarca: toLayerAvailability(comarcaResult),
    geographic: toLayerAvailability(geographicResult),
    calibration: toLayerAvailability(calibrationResult),
  };

  return {
    generatedAt,
    availability,
    warnings,
    observation,
    comarca: comarcaResult.status === "fulfilled" ? comarcaResult.value : null,
    geographic: geographicResult.status === "fulfilled" ? geographicResult.value : null,
    calibration: calibrationResult.status === "fulfilled" ? calibrationResult.value : null,
  };
}

export async function getWeatherPayloadLegacy(
  options: AggregatorOptions = {},
): Promise<WeatherPayload> {
  const aggregated = await getAggregatedWeather(options);
  return flattenObservationLayerToLegacy(aggregated.observation);
}

export { flattenObservationLayerToLegacy };
