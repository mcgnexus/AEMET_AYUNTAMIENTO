import { NextResponse } from "next/server";
import { getFusedHuescarWeather } from "@/services/weatherService";
import { getLightningData } from "@/services/lightningService";

export async function GET() {
  try {
    const [weather, lightning] = await Promise.all([
      getFusedHuescarWeather(),
      getLightningData().catch(() => undefined),
    ]);

    if (lightning) {
      (weather as Record<string, unknown>)["lightning"] = lightning;
    }

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
