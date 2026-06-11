import type { SourceObservation } from "@/types/weather";
import type { ConfidenceCalibration } from "@/lib/weatherStore";

export const FUSION_WEIGHTS = {
  temperatureC: { AEMET: 0.45, OPEN_METEO: 0.35 },
  humidityPct: { AEMET: 0.4, OPEN_METEO: 0.35 },
  precipitationMm: { AEMET: 0.35, OPEN_METEO: 0.4 },
  windSpeedKmh: { AEMET: 0.35, OPEN_METEO: 0.4 },
  windGustKmh: { AEMET: 0.35, OPEN_METEO: 0.4 },
} as const;

export type FusionVariable = keyof typeof FUSION_WEIGHTS;

export function weightedFusion(
  variable: FusionVariable,
  sources: SourceObservation[],
): number {
  let sum = 0;
  let totalWeight = 0;
  for (const source of sources) {
    const weight = FUSION_WEIGHTS[variable][source.source] * source.qualityScore;
    sum += source[variable] * weight;
    totalWeight += weight;
  }
  return sum / totalWeight;
}

const FALLBACK_TOLERANCE: Record<FusionVariable, number> = {
  temperatureC: 1.5,
  humidityPct: 10,
  precipitationMm: 1,
  windSpeedKmh: 8,
  windGustKmh: 12,
};

function calibratedPenalty(
  spread: number,
  variable: FusionVariable,
  budget: number,
  calibration: ConfidenceCalibration | null,
): number {
  const tolerance = calibration?.[variable].tolerance ?? FALLBACK_TOLERANCE[variable];
  return Math.min(budget, budget * spread / (tolerance * 3));
}

export function localMadridTimestamp(time: string): number {
  const date = time.slice(0, 10);
  const middayUtc = new Date(`${date}T12:00:00Z`);
  const madridParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    timeZoneName: "longOffset",
  }).formatToParts(middayUtc);
  const offset = madridParts.find((part) => part.type === "timeZoneName")?.value.replace("GMT", "") || "+01:00";
  return Date.parse(`${time}${offset}`);
}

export type ConsensusConfidenceInput = {
  sources: SourceObservation[];
  calibration: ConfidenceCalibration | null;
};

export type ConsensusConfidenceResult = {
  value: number;
  details: string;
  calibrationWeightPct: number;
};

export function calculateConsensusConfidence(
  input: ConsensusConfidenceInput,
): ConsensusConfidenceResult {
  const { sources, calibration } = input;
  if (sources.length < 2) {
    return {
      value: 50,
      details: "Insuficientes fuentes para calcular confianza.",
      calibrationWeightPct: 0,
    };
  }
  const [a, b] = sources;
  const temperatureSpread = Math.abs(a.temperatureC - b.temperatureC);
  const humiditySpread = Math.abs(a.humidityPct - b.humidityPct);
  const windSpread = Math.abs(a.windSpeedKmh - b.windSpeedKmh);
  const precipitationSpread = Math.abs(a.precipitationMm - b.precipitationMm);
  const alignmentMinutes = Math.abs(
    Date.parse(a.time) - localMadridTimestamp(b.time),
  ) / 60_000;
  const disagreementPenalty =
    calibratedPenalty(temperatureSpread, "temperatureC", 24, calibration) +
    calibratedPenalty(humiditySpread, "humidityPct", 12, calibration) +
    calibratedPenalty(windSpread, "windSpeedKmh", 12, calibration) +
    calibratedPenalty(precipitationSpread, "precipitationMm", 12, calibration);
  const agePenalty = Math.min(20, Math.max(0, a.dataAgeMinutes - 30) / 6);
  const alignmentPenalty = Math.min(15, alignmentMinutes / 4);
  const qualityPenalty = Math.max(0, 2 - a.qualityScore - b.qualityScore) * 12;
  const staleCachePenalty = a.retrievalStatus === "STALE_CACHE" ? 10 : 0;
  const value = Math.round(Math.max(
    20,
    Math.min(
      92,
      92 - disagreementPenalty - agePenalty - alignmentPenalty - qualityPenalty - staleCachePenalty,
    ),
  ));
  const calibrationSamples = calibration
    ? Math.min(...Object.values(calibration).map((metric) => metric.sampleCount))
    : 0;
  const calibrationWeightPct = calibration
    ? Math.round(
        Object.values(calibration).reduce((sum, metric) => sum + metric.historicalWeight, 0) /
        Object.values(calibration).length * 100,
      )
    : 0;
  return {
    value,
    details: `Discrepancias: ${temperatureSpread.toFixed(1)} °C, ${humiditySpread.toFixed(0)} % HR y ${windSpread.toFixed(1)} km/h de viento. Antigüedad AEMET: ${a.dataAgeMinutes} min; desfase temporal: ${Math.round(alignmentMinutes)} min. Calibración histórica: ${calibrationSamples} muestras mínimas por variable, peso ${calibrationWeightPct} %.`,
    calibrationWeightPct,
  };
}
