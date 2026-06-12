import { NextRequest, NextResponse } from "next/server";
import { getLightningData } from "@/services/lightningService";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = parseFloat(searchParams.get("lat") ?? "37.811");
    const lon = parseFloat(searchParams.get("lon") ?? "-2.5412");
    const radius = parseInt(searchParams.get("radius") ?? "20", 10);

    const data = await getLightningData(lat, lon, Math.min(radius, 100));
    const response = NextResponse.json(data);
    response.headers.set(
      "Cache-Control",
      "public, max-age=60, s-maxage=120, stale-while-revalidate=180",
    );
    return response;
  } catch (error) {
    console.error("[weather/lightning] Error:", error);
    return NextResponse.json(
      {
        active: false,
        level: "info",
        nearestStrikeKm: null,
        strikeCount: 0,
        strikes: [],
        lastCheckedAt: new Date().toISOString(),
        source: "unavailable",
        message: "Error al obtener datos de rayos.",
      },
      { status: 500 },
    );
  }
}
