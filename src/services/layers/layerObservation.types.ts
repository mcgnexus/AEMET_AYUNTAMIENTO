import type { CurrentWeather, HourlyWeather, SourceObservation, SourceHealth } from "@/types/weather";

export type LayerStatus = "OK" | "DEGRADED" | "ERROR" | "UNAVAILABLE";

export type LayerMetadata = {
  generatedAt: string;
  status: LayerStatus;
  warnings: string[];
};

export type LayerObservation = {
  meta: LayerMetadata;
  location: {
    name: string;
    latitude: number;
    longitude: number;
    elevation: number;
    timezone: string;
  };
  fetchedAt: string;
  consensus: CurrentWeather;
  sourceHealth: SourceHealth[];
  sources: SourceObservation[];
  confidence: {
    pct: number;
    explanation: string;
    calibrationWeightPct: number;
  };
  hourly: HourlyWeather;
  comparisonHourly: {
    time: string[];
    temperatureC: number[];
    humidityPct: number[];
    precipitationMm: number[];
    windSpeedKmh: number[];
    windGustKmh: number[];
  };
  daily: {
    time: string[];
    temperatureMaxC: number[];
    temperatureMinC: number[];
    precipitationProbabilityPct: number[];
    precipitationSumMm: number[];
    windGustKmh: number[];
    et0Mm: number[];
    weatherCode: number[];
  };
  alerts: Array<{
    type: string;
    level: "aviso" | "peligro" | "severo";
    title: string;
    message: string;
  }>;
};
