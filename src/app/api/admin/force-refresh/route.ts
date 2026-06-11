import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, verifyAdminSession } from "@/lib/adminAuth";
import { clearAemetRateLimitState } from "@/lib/weatherStore";
import { clearOpenMeteoCooldown } from "@/services/layers/openMeteoForecastClient";
import { getAggregatedWeather } from "@/services/weatherAggregator";

export async function POST() {
  const cookieStore = await cookies();
  if (!verifyAdminSession(cookieStore.get(ADMIN_COOKIE)?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await clearAemetRateLimitState();
    await clearOpenMeteoCooldown();
    const aggregated = await getAggregatedWeather({ forceRefresh: true });
    return NextResponse.json({
      ok: true,
      capturedAt: aggregated.generatedAt,
      confidencePct: aggregated.observation.confidence.pct,
      source: aggregated.observation.meta.status === "OK" && aggregated.observation.sources.length >= 2 ? "FUSED" : "OPEN_METEO",
      availability: aggregated.availability,
      warnings: aggregated.warnings,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al forzar actualización" },
      { status: 502 },
    );
  }
}
