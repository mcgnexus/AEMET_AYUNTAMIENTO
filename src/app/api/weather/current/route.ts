import { NextResponse } from "next/server";
import { getFusedHuescarWeather } from "@/services/weatherService";
import { getLightningData } from "@/services/lightningService";
import { getAemetWarnings } from "@/services/aemetWarningsService";
import { calculateAgriculturalData } from "@/services/agriculturalService";
import { calculateLivestockData } from "@/services/livestockService";

export async function GET() {
  try {
    const [weather, lightning, aemetWarnings] = await Promise.all([
      getFusedHuescarWeather(),
      getLightningData().catch(() => undefined),
      getAemetWarnings().catch(() => []),
    ]);

    if (lightning) {
      (weather as Record<string, unknown>)["lightning"] = lightning;
    }

    if (aemetWarnings.length > 0) {
      weather.alerts = [...aemetWarnings, ...weather.alerts];
    }

    try {
      const agri = calculateAgriculturalData(weather.hourly, weather.daily);
      (weather as Record<string, unknown>)["agricultural"] = agri;
    } catch {}

    try {
      const livestock = calculateLivestockData(
        weather.hourly,
        weather.current.temperatureC,
        weather.current.humidityPct,
      );
      (weather as Record<string, unknown>)["livestock"] = livestock;
    } catch {}

    const response = NextResponse.json(weather);
    response.headers.set(
      "Cache-Control",
      "public, max-age=60, s-maxage=120, stale-while-revalidate=300",
    );
    return response;
  } catch (error) {
    console.error("[weather/current] Error:", error);
    const message = error instanceof Error ? error.message : "Error desconocido";
    const now = new Date().toISOString();
    
    // Return a degraded response with empty but valid data structures
    return NextResponse.json(
      {
        location: "Huéscar",
        latitude: 37.811,
        longitude: -2.5412,
        elevation: 953,
        timezone: "Europe/Madrid",
        source: "ERROR",
        fetchedAt: now,
        confidencePct: 0,
        confidenceExplanation: `Error: ${message}`,
        current: {
          time: now,
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
            checkedAt: now,
            message: "No disponible",
            lastError: message,
          },
          {
            source: "OPEN_METEO",
            status: "ERROR",
            checkedAt: now,
            message: "No disponible",
          },
        ],
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
        alerts: [],
      },
      { status: 503 },
    );
  }
}
