import { NextResponse } from "next/server";
import { getStationData } from "@/services/stationService";

export async function GET() {
  try {
    // We fetch AEMET current weather for comparison, but if it fails we still return stations
    let aemetCurrent = null;
    try {
      // Try to get cached weather data from the global cache
      const g = globalThis as Record<string, unknown>;
      const cache = g.__meteo_cache as { current?: Record<string, unknown> } | undefined;
      if (cache?.current) {
        aemetCurrent = cache.current as Parameters<typeof getStationData>[0];
      }
    } catch {
      // Ignore - we'll compare without AEMET
    }

    const stations = await getStationData(aemetCurrent);
    const response = NextResponse.json({ stations });
    response.headers.set(
      "Cache-Control",
      "public, max-age=60, s-maxage=120, stale-while-revalidate=300"
    );
    return response;
  } catch (error) {
    console.error("[weather/stations] Error:", error);
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json(
      { stations: [], error: message },
      { status: 503 }
    );
  }
}
