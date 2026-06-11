import { NextResponse } from "next/server";
import { captureCurrentWeather } from "@/services/weatherCaptureService";

export const maxDuration = 60;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Captura completa (calibración + comarca) solo cada 3 horas
    const full = new Date().getUTCHours() % 3 === 0;
    const weather = await captureCurrentWeather(full);
    return NextResponse.json({
      ok: true,
      full,
      capturedAt: weather.fetchedAt,
      consensusTime: weather.current.time,
      confidencePct: weather.confidencePct,
      sources: weather.sources.map((source) => ({
        source: source.source,
        status: source.status,
        time: source.time,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo ejecutar la captura horaria" },
      { status: 502 },
    );
  }
}
