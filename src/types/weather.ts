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
  humidityPct: number[];
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

export type LightningStrike = {
  lat: number;
  lon: number;
  time: string;
  delayMs: number;
  distanceKm: number;
};

export type LightningAlertLevel = "info" | "precaucion" | "alerta" | "peligro";

export type LightningData = {
  active: boolean;
  level: LightningAlertLevel;
  nearestStrikeKm: number | null;
  strikeCount: number;
  strikes: LightningStrike[];
  lastCheckedAt: string;
  source: "blitzortung" | "unavailable";
  message: string;
};

export type AgriculturalData = {
  et0AccumulatedWeekMm: number;
  et0AccumulatedMonthMm: number;
  et0DailyMm: number[];
  precipitationAccumulatedWeekMm: number;
  precipitationAccumulatedMonthMm: number;
  growingDegreeDays: number[];
  gddAccumulated: number;
  chillHours: number;
  chillHoursPartial: number[];
  frostRisk48h: FrostRisk[];
  heatStressDays: number;
  fieldWorkability: FieldWorkability[];
};

export type FrostRisk = {
  date: string;
  minTempC: number;
  probability: "baja" | "media" | "alta" | "muy_alta";
  hoursBelow0: number;
};

export type FieldWorkability = {
  date: string;
  workable: boolean;
  reason: string;
};

export type LivestockData = {
  thiCurrent: number;
  thiHourly: ThiHourly[];
  stressLevel: StressLevel;
  stressLabel: string;
  recommendation: string;
  cattleAffected: CattleAffected;
};

export type ThiHourly = {
  time: string;
  thi: number;
  stress: StressLevel;
};

export type StressLevel = "ninguno" | "leve" | "moderado" | "severo" | "peligroso";

export type CattleAffected = {
  dairy: boolean;
  beef: boolean;
  sheep: boolean;
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
  lightning?: LightningData;
  agricultural?: AgriculturalData;
  livestock?: LivestockData;
};
