import { getWeatherPayloadLegacy } from "@/services/weatherAggregator";
import type { WeatherPayload, SourceObservation, SourceHealth, CurrentWeather, WeatherAlert, HourlyWeather, DailyWeather, ComparisonHourlyWeather } from "@/types/weather";

export type { WeatherPayload, SourceObservation, SourceHealth, CurrentWeather, WeatherAlert, HourlyWeather, DailyWeather, ComparisonHourlyWeather };

export async function getFusedHuescarWeather(): Promise<WeatherPayload> {
  return getWeatherPayloadLegacy();
}
