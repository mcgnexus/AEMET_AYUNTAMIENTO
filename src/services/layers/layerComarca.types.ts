import type { LayerMetadata } from "./layerObservation.types";

export type ComarcaEstimate = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  elevationM: number;
  distanceFromAemetKm: number;
  confidencePct: number;
  values: {
    temperatureC: number;
    humidityPct: number;
    precipitationMm: number;
    windSpeedKmh: number;
    windGustKmh: number;
    solarRadiationMjM2: number;
    et0Mm: number;
  };
};

export type ComarcaEstimationPayload = {
  anchorSource: "AEMET_5051X";
  trendSource: "RIA_PUEBLA_GR02";
  anchorDate: string;
  trendDate: string | null;
  trendAgeDays: number | null;
  generatedAt: string;
  methodology: string;
  estimates: ComarcaEstimate[];
};

export type LayerComarca = {
  meta: LayerMetadata;
  reference: {
    source: ComarcaEstimationPayload["trendSource"];
    date: ComarcaEstimationPayload["trendDate"];
    ageDays: number;
  };
  methodology: ComarcaEstimationPayload["methodology"];
  estimates: ComarcaEstimate[];
  generatedAt: ComarcaEstimationPayload["generatedAt"];
};

export type LayerComarcaOptions = {
  timeoutMs?: number;
  allowStale?: boolean;
  maxAgeDays?: number;
  signal?: AbortSignal;
};