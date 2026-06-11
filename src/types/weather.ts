export type WeatherAlert = {
  type: string;
  level: "aviso" | "peligro" | "severo";
  title: string;
  message: string;
};

export type CurrentWeather = {
  time: string;
  temperatureC: number;
  apparentTemperatureC: number;
  humidityPct: number;
  precipitationMm: number;
  weatherCode: number;
  windSpeedKmh: number;
  windDirectionDeg: number;
  windGustKmh: number;
  solarRadiationWm2: number;
  et0Mm: number;
};

export type SourceObservation = {
  source: "AEMET" | "OPEN_METEO";
  stationId?: string;
  locationName: string;
  time: string;
  observationPeriod: "current" | "daily";
  dataAgeMinutes: number;
  qualityScore: number;
  status: "OK" | "Retrasada";
  retrievalStatus?: "LIVE" | "FRESH_CACHE" | "STALE_CACHE";
  retrievalWarning?: string;
  elevationM?: number;
  rawTemperatureC?: number;
  altitudeCorrectionC?: number;
  temperatureC: number;
  humidityPct: number;
  precipitationMm: number;
  windSpeedKmh: number;
  windGustKmh: number;
  pressureHpa?: number;
  solarRadiationMjM2?: number;
  et0Mm?: number;
};

export type SourceHealth = {
  source: "AEMET" | "OPEN_METEO";
  status: "OK" | "DEGRADED" | "ERROR";
  checkedAt: string;
  dataTime?: string;
  dataAgeMinutes?: number;
  lastError?: string;
  message: string;
};

export type HourlyWeather = {
  time: string[];
  temperatureC: number[];
  precipitationProbabilityPct: number[];
  precipitationMm: number[];
  weatherCode: number[];
  windSpeedKmh: number[];
};

export type ComparisonHourlyWeather = {
  time: string[];
  temperatureC: number[];
  humidityPct: number[];
  precipitationMm: number[];
  windSpeedKmh: number[];
  windGustKmh: number[];
};

export type DailyWeather = {
  time: string[];
  temperatureMaxC: number[];
  temperatureMinC: number[];
  precipitationProbabilityPct: number[];
  precipitationSumMm: number[];
  windGustKmh: number[];
  et0Mm: number[];
  weatherCode: number[];
};

export type WeatherPayload = {
  location: string;
  latitude: number;
  longitude: number;
  elevation: number;
  timezone: string;
  source: "FUSED" | "OPEN_METEO" | "AEMET";
  fetchedAt: string;
  confidencePct: number;
  confidenceExplanation: string;
  current: CurrentWeather;
  sources: SourceObservation[];
  sourceHealth: SourceHealth[];
  hourly: HourlyWeather;
  comparisonHourly: ComparisonHourlyWeather;
  daily: DailyWeather;
  alerts: WeatherAlert[];
};
