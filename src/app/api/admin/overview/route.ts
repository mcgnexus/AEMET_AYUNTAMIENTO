import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, verifyAdminSession } from "@/lib/adminAuth";
import { getSourceMetrics } from "@/lib/weatherStore";
import { getAggregatedWeather } from "@/services/weatherAggregator";

const algorithm = {
  currentConsensus: {
    description: "Consenso horario entre observación AEMET y Open-Meteo alineado temporalmente.",
    formula: "estimación = media ponderada por fuente × qualityScore",
    temperatureCorrection: "AEMET se corrige por diferencia de altitud con gradiente de 0,006 °C/m.",
  },
  confidence: {
    description: "Parte de 92 % y resta desacuerdo, antigüedad, desfase temporal, calidad y caché obsoleta.",
    calibration: "Las tolerancias se calibran con MAE histórico AEMET/Open-Meteo y RIA diaria con peso secundario.",
  },
  comarca: {
    description: "AEMET Huéscar es el ancla en tiempo real; RIA Puebla corrige tendencias agrícolas (~5 días de retraso); Open-Meteo aporta diferencias espaciales hacia cada localidad.",
    limitation: "Las salidas comarcales son estimaciones diarias, no observaciones reales locales.",
  },
  satellite: {
    description: "Sentinel-2 L2A mediante Statistical API de Copernicus Data Space.",
    vegetation: "NDVI > 0,25; vegetación densa NDVI > 0,55.",
    water: "SCL agua y NDWI > 0.",
    radii: "1 km a 20 m, 5 km a 50 m y 15 km a 100 m; 12 intervalos mensuales.",
  },
};

export async function GET() {
  const cookieStore = await cookies();
  if (!verifyAdminSession(cookieStore.get(ADMIN_COOKIE)?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const [aggregated, metrics] = await Promise.all([
      getAggregatedWeather(),
      getSourceMetrics(),
    ]);
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      weather: aggregated.observation,
      metrics,
      profiles: aggregated.geographic?.profiles ?? [],
      comarca: aggregated.comarca,
      algorithm,
      availability: aggregated.availability,
      warnings: aggregated.warnings,
      configuration: {
        aemetConfigured: Boolean(process.env.AEMET_API_KEY),
        sentinelHubConfigured: Boolean(
          process.env.SENTINEL_HUB_CLIENT_ID && process.env.SENTINEL_HUB_CLIENT_SECRET,
        ),
        databaseConfigured: Boolean(process.env.DATABASE_URL ?? process.env.NEON_DATABASE_URL),
        adminUsesDedicatedPassword: Boolean(process.env.ADMIN_PASSWORD),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo cargar la consola técnica" },
      { status: 500 },
    );
  }
}
