import type {
  CurrentWeather,
  SourceObservation,
  SourceHealth,
  WeatherPayload,
} from "@/types/weather";
import {
  aemetRecordsToSourceObservation,
  fetchAemetObservation,
  AEMET_STATION_ID,
} from "./aemetClient";
import {
  alignOpenMeteoSourceToAemetTime,
  currentToSourceObservation,
  fetchOpenMeteoForecast,
  HUESCAR_COORDINATES,
} from "./openMeteoForecastClient";
import {
  asFreshCache,
  asStaleCache,
  AEMET_CACHE_MAX_AGE_MINUTES,
  buildFailureCooldown,
  cooldownMessage,
  isFreshEnough,
  isInCooldown,
  loadAemetState,
  saveAemetState,
} from "./aemetState";
import {
  applyAltitudeCorrection,
} from "./altitudeCorrection";
import {
  calculateConsensusConfidence,
  weightedFusion,
} from "./consensusConfidence";
import {
  getConfidenceCalibration,
} from "@/lib/weatherStore";
import { buildAlerts } from "@/lib/weatherRules";
import type { LayerObservation, LayerStatus } from "./layerObservation.types";

export type ObservationLayerOptions = {
  signal?: AbortSignal;
  forceRefresh?: boolean;
};

function toHealthOpenMeteoOk(time: string, dataAgeMinutes: number): SourceHealth {
  return {
    source: "OPEN_METEO",
    status: "OK",
    checkedAt: new Date().toISOString(),
    dataTime: time,
    dataAgeMinutes,
    message: "Modelo alineado temporalmente con AEMET.",
  };
}

function buildAemetHealth(
  aemet: SourceObservation,
  options: { lastError?: string } = {},
): SourceHealth {
  const status: "OK" | "DEGRADED" = aemet.status === "OK" && aemet.retrievalStatus !== "STALE_CACHE" ? "OK" : "DEGRADED";
  const message = aemet.retrievalStatus === "STALE_CACHE"
    ? "AEMET no respondió; se reutiliza la última observación válida."
    : aemet.retrievalStatus === "FRESH_CACHE"
      ? "Observación oficial servida desde caché fresca para respetar límites AEMET."
      : aemet.status === "OK"
        ? "Observación oficial disponible."
        : "Observación oficial retrasada.";
  return {
    source: "AEMET",
    status,
    checkedAt: new Date().toISOString(),
    dataTime: aemet.time,
    dataAgeMinutes: aemet.dataAgeMinutes,
    lastError: options.lastError,
    message,
  };
}

function buildConsensus(
  openMeteo: WeatherPayload,
  aemet: SourceObservation,
  openMeteoSource: SourceObservation,
): CurrentWeather {
  const sources: SourceObservation[] = [aemet, openMeteoSource];
  return {
    ...openMeteo.current,
    time: aemet.time,
    temperatureC: weightedFusion("temperatureC", sources),
    humidityPct: weightedFusion("humidityPct", sources),
    precipitationMm: weightedFusion("precipitationMm", sources),
    windSpeedKmh: weightedFusion("windSpeedKmh", sources),
    windGustKmh: weightedFusion("windGustKmh", sources),
  };
}

function buildExplanation(params: {
  aemet: SourceObservation;
  openMeteoSource: SourceObservation;
  confidence: ReturnType<typeof calculateConsensusConfidence>;
  alignedTime: string;
}): string {
  const spread = Math.abs(params.aemet.temperatureC - params.openMeteoSource.temperatureC);
  const correctionC = params.aemet.altitudeCorrectionC ?? 0;
  const correction = `${correctionC >= 0 ? "+" : ""}${correctionC.toFixed(1)} °C`;
  return spread <= 2
    ? `AEMET y Open-Meteo alineado a las ${params.alignedTime} muestran buena coincidencia térmica tras aplicar a AEMET un ajuste aproximado de ${correction} por altitud. ${params.confidence.details}`
    : `La confianza se reduce por diferencia térmica con Open-Meteo alineado a las ${params.alignedTime}, incluso tras aplicar a AEMET un ajuste aproximado de ${correction} por altitud. ${params.confidence.details}`;
}

function buildLayer(params: {
  openMeteo: WeatherPayload;
  aemet: SourceObservation;
  openMeteoSource: SourceObservation;
  status: LayerStatus;
  warnings: string[];
  lastError?: string;
}): LayerObservation {
  const consensus = buildConsensus(params.openMeteo, params.aemet, params.openMeteoSource);
  const sources: SourceObservation[] = [params.aemet, params.openMeteoSource];
  const temperatureSpread = Math.abs(params.aemet.temperatureC - params.openMeteoSource.temperatureC);
  const alignedTime = params.openMeteoSource.time.slice(11, 16);
  return {
    meta: {
      generatedAt: new Date().toISOString(),
      status: params.status,
      warnings: params.warnings,
    },
    location: {
      name: params.openMeteo.location,
      latitude: params.openMeteo.latitude,
      longitude: params.openMeteo.longitude,
      elevation: params.openMeteo.elevation,
      timezone: params.openMeteo.timezone,
    },
    fetchedAt: params.openMeteo.fetchedAt,
    consensus,
    sourceHealth: [
      buildAemetHealth(params.aemet, { lastError: params.lastError }),
      toHealthOpenMeteoOk(params.openMeteoSource.time, params.openMeteoSource.dataAgeMinutes),
    ],
    sources,
    confidence: {
      pct: 0,
      explanation: "",
      calibrationWeightPct: 0,
    },
    hourly: params.openMeteo.hourly,
    comparisonHourly: params.openMeteo.comparisonHourly,
    daily: params.openMeteo.daily,
    alerts: buildAlerts(consensus),
  };
}

async function buildFusedLayerWithConfidence(params: {
  openMeteo: WeatherPayload;
  aemet: SourceObservation;
  openMeteoSource: SourceObservation;
  status: LayerStatus;
  warnings: string[];
  lastError?: string;
}): Promise<LayerObservation> {
  const layer = buildLayer(params);
  const calibration = await getConfidenceCalibration().catch(() => null);
  const confidence = calculateConsensusConfidence({
    sources: [params.aemet, params.openMeteoSource],
    calibration,
  });
  const alignedTime = params.openMeteoSource.time.slice(11, 16);
  layer.confidence = {
    pct: confidence.value,
    explanation: buildExplanation({
      aemet: params.aemet,
      openMeteoSource: params.openMeteoSource,
      confidence,
      alignedTime,
    }),
    calibrationWeightPct: confidence.calibrationWeightPct,
  };
  return layer;
}

function buildOpenMeteoOnlyLayer(
  openMeteo: WeatherPayload,
  aemetErrorMessage: string,
): LayerObservation {
  const aemetSource = currentToSourceObservation(openMeteo.current, openMeteo.elevation);
  return {
    meta: {
      generatedAt: new Date().toISOString(),
      status: "DEGRADED",
      warnings: [aemetErrorMessage],
    },
    location: {
      name: openMeteo.location,
      latitude: openMeteo.latitude,
      longitude: openMeteo.longitude,
      elevation: openMeteo.elevation,
      timezone: openMeteo.timezone,
    },
    fetchedAt: openMeteo.fetchedAt,
    consensus: openMeteo.current,
    sourceHealth: [
      {
        source: "AEMET",
        status: "ERROR",
        checkedAt: new Date().toISOString(),
        lastError: aemetErrorMessage,
        message: "Sin observación oficial disponible; se activa fallback.",
      },
      {
        source: "OPEN_METEO",
        status: "OK",
        checkedAt: new Date().toISOString(),
        dataTime: openMeteo.current.time,
        dataAgeMinutes: 0,
        message: "Modelo por coordenada disponible.",
      },
    ],
    sources: [aemetSource],
    confidence: {
      pct: Math.min(openMeteo.confidencePct, 62),
      explanation: `AEMET temporalmente no disponible (${aemetErrorMessage}). Estimación actual basada solo en Open-Meteo.`,
      calibrationWeightPct: 0,
    },
    hourly: openMeteo.hourly,
    comparisonHourly: openMeteo.comparisonHourly,
    daily: openMeteo.daily,
    alerts: buildAlerts(openMeteo.current),
  };
}

function buildAemetOnlyLayer(
  aemet: SourceObservation,
  aemetErrorMessage: string | null,
  openMeteoErrorMessage: string | null,
): LayerObservation {
  const dataAgeMinutes = Math.max(
    0,
    Math.round((Date.now() - Date.parse(aemet.time)) / 60_000),
  );
  const aemetSource = aemetErrorMessage
    ? asStaleCache(aemet, aemetErrorMessage)
    : asFreshCache(aemet);
  return {
    meta: {
      generatedAt: new Date().toISOString(),
      status: aemetErrorMessage ? "DEGRADED" : "OK",
      warnings: [
        ...(openMeteoErrorMessage ? [openMeteoErrorMessage] : []),
        ...(aemetErrorMessage ? [aemetErrorMessage] : []),
      ].filter(Boolean),
    },
    location: {
      name: "Huéscar",
      latitude: 37.811,
      longitude: -2.5412,
      elevation: 953,
      timezone: "Europe/Madrid",
    },
    fetchedAt: new Date().toISOString(),
    consensus: {
      time: aemetSource.time,
      temperatureC: aemetSource.temperatureC,
      apparentTemperatureC: aemetSource.temperatureC,
      humidityPct: aemetSource.humidityPct ?? 0,
      precipitationMm: aemetSource.precipitationMm ?? 0,
      weatherCode: 0,
      windSpeedKmh: aemetSource.windSpeedKmh ?? 0,
      windDirectionDeg: 0,
      windGustKmh: aemetSource.windGustKmh ?? 0,
      solarRadiationWm2: 0,
      et0Mm: 0,
    },
    sourceHealth: [
      buildAemetHealth(aemetSource, { lastError: aemetErrorMessage ?? undefined }),
      {
        source: "OPEN_METEO",
        status: "ERROR",
        checkedAt: new Date().toISOString(),
        message: "No disponible",
        lastError: openMeteoErrorMessage ?? undefined,
      },
    ],
    sources: [aemetSource],
    confidence: {
      pct: aemetErrorMessage ? 60 : 85,
      explanation: aemetErrorMessage
        ? `Open-Meteo no disponible. Usando AEMET (${dataAgeMinutes}min). ${aemetErrorMessage}`
        : `Open-Meteo no disponible. Observación AEMET oficial disponible (${dataAgeMinutes}min).`,
      calibrationWeightPct: 0,
    },
    hourly: {
      time: [],
      temperatureC: [],
      humidityPct: [],
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
    alerts: buildAlerts({
      time: aemetSource.time,
      temperatureC: aemetSource.temperatureC,
      apparentTemperatureC: aemetSource.temperatureC,
      humidityPct: aemetSource.humidityPct ?? 0,
      precipitationMm: aemetSource.precipitationMm ?? 0,
      weatherCode: 0,
      windSpeedKmh: aemetSource.windSpeedKmh ?? 0,
      windDirectionDeg: 0,
      windGustKmh: aemetSource.windGustKmh ?? 0,
      solarRadiationWm2: 0,
      et0Mm: 0,
    }),
  };
}

export async function getObservationLayer(
  options: ObservationLayerOptions = {},
): Promise<LayerObservation> {
  const apiKey = process.env.AEMET_API_KEY;
  let openMeteo: import("@/types/weather").WeatherPayload | null = null;
  let openMeteoError: string | null = null;

  try {
    openMeteo = await fetchOpenMeteoForecast({ signal: options.signal });
  } catch (error) {
    openMeteoError = error instanceof Error ? error.message : "Open-Meteo no disponible";
    console.error("[layerObservation] Open-Meteo failed:", openMeteoError);
  }

  // If Open-Meteo fails, try AEMET live directly
  if (!openMeteo) {
    console.warn("[layerObservation] Open-Meteo unavailable, trying AEMET directly...");
    
    if (!apiKey) {
      // No API key, try cached AEMET
      const state = await loadAemetState();
      if (state.observation) {
        return buildAemetOnlyLayer(state.observation, "AEMET_API_KEY no configurada", "AEMET_API_KEY no configurada");
      }
      throw new Error("Open-Meteo y AEMET no disponibles: API_KEY no configurada");
    }

    const state = await loadAemetState();
    
    // Try AEMET live first
    try {
      const aemetLive = await fetchAemetObservation({ apiKey, signal: options.signal });
      await saveAemetState({
        observation: aemetLive,
        lastFetchAt: Date.now(),
        failureMessage: null,
        cooldownUntil: 0,
      });
      return buildAemetOnlyLayer(aemetLive, null, openMeteoError ?? "Open-Meteo no disponible");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "AEMET no disponible";
      console.error("[layerObservation] AEMET live failed:", msg);
      const cooldownUntil = buildFailureCooldown(msg);
      await saveAemetState({
        observation: state.observation,
        lastFetchAt: state.lastFetchAt,
        failureMessage: msg,
        cooldownUntil,
      });
      
      // Try cached AEMET
      if (state.observation) {
        const dataAgeMinutes = Math.max(
          0,
          Math.round((Date.now() - Date.parse(state.observation.time)) / 60_000),
        );
        if (dataAgeMinutes <= AEMET_CACHE_MAX_AGE_MINUTES) {
          return buildAemetOnlyLayer(
            state.observation,
            msg,
            openMeteoError ?? "Open-Meteo no disponible",
          );
        }
      }
      
      throw new Error(`${openMeteoError ?? "Open-Meteo no disponible"}. AEMET: ${msg}`);
    }
  }

  if (!apiKey) {
    return buildOpenMeteoOnlyLayer(openMeteo, "AEMET_API_KEY no configurada");
  }

  const state = await loadAemetState();

  if (!options.forceRefresh && isFreshEnough(state) && state.observation) {
    const cached = asFreshCache(state.observation);
    const alignment = alignOpenMeteoSourceToAemetTime(openMeteo, cached.time);
    const aemetCorrected = applyAltitudeCorrection(cached, openMeteo.elevation);
    return buildFusedLayerWithConfidence({
      openMeteo,
      aemet: aemetCorrected,
      openMeteoSource: alignment.source,
      status: "OK",
      warnings: [],
    });
  }

  if (!options.forceRefresh && isInCooldown(state)) {
    const warning = cooldownMessage(state);
    if (state.observation) {
      const dataAgeMinutes = Math.max(
        0,
        Math.round((Date.now() - Date.parse(state.observation.time)) / 60_000),
      );
      if (dataAgeMinutes <= AEMET_CACHE_MAX_AGE_MINUTES) {
        const stale = asStaleCache(state.observation, warning);
        const alignment = alignOpenMeteoSourceToAemetTime(openMeteo, stale.time);
        const aemetCorrected = applyAltitudeCorrection(stale, openMeteo.elevation);
        return buildFusedLayerWithConfidence({
          openMeteo,
          aemet: aemetCorrected,
          openMeteoSource: alignment.source,
          status: "DEGRADED",
          warnings: [warning],
        });
      }
    }
    return buildOpenMeteoOnlyLayer(openMeteo, warning);
  }

  try {
    const aemetLive = await fetchAemetObservation({ apiKey, signal: options.signal });
    await saveAemetState({
      observation: aemetLive,
      lastFetchAt: Date.now(),
      failureMessage: null,
      cooldownUntil: 0,
    });
    const alignment = alignOpenMeteoSourceToAemetTime(openMeteo, aemetLive.time);
    const aemetCorrected = applyAltitudeCorrection(aemetLive, openMeteo.elevation);
    return buildFusedLayerWithConfidence({
      openMeteo,
      aemet: aemetCorrected,
      openMeteoSource: alignment.source,
      status: "OK",
      warnings: [],
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "AEMET no disponible";
    const cooldownUntil = buildFailureCooldown(msg);
    await saveAemetState({
      observation: state.observation,
      lastFetchAt: state.lastFetchAt,
      failureMessage: msg,
      cooldownUntil,
    });
    if (state.observation) {
      const dataAgeMinutes = Math.max(
        0,
        Math.round((Date.now() - Date.parse(state.observation.time)) / 60_000),
      );
      if (dataAgeMinutes <= AEMET_CACHE_MAX_AGE_MINUTES) {
        const stale = asStaleCache(state.observation, msg);
        const alignment = alignOpenMeteoSourceToAemetTime(openMeteo, stale.time);
        const aemetCorrected = applyAltitudeCorrection(stale, openMeteo.elevation);
        return buildFusedLayerWithConfidence({
          openMeteo,
          aemet: aemetCorrected,
          openMeteoSource: alignment.source,
          status: "DEGRADED",
          warnings: [msg],
          lastError: msg,
        });
      }
    }
    return buildOpenMeteoOnlyLayer(openMeteo, msg);
  }
}

export async function getFusedHuescarWeather(): Promise<WeatherPayload> {
  const layer = await getObservationLayer();
  return {
    location: layer.location.name,
    latitude: layer.location.latitude,
    longitude: layer.location.longitude,
    elevation: layer.location.elevation,
    timezone: layer.location.timezone,
    source: layer.sourceHealth.every((h) => h.status === "OK") && layer.sources.length >= 2
      ? "FUSED"
      : "OPEN_METEO",
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

export { AEMET_STATION_ID as getAemetStationId } from "./aemetClient";
export { HUESCAR_COORDINATES as getHuescarCoordinates } from "./openMeteoForecastClient";
export { aemetRecordsToSourceObservation };
export { applyAltitudeCorrection };
