import { NextResponse } from "next/server";
import { runSentinelHubSmokeTest } from "@/services/sentinelHubService";

export const maxDuration = 60;

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const statistics = await runSentinelHubSmokeTest();
    return NextResponse.json({ ok: true, statistics });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo probar Sentinel Hub" },
      { status: 502 },
    );
  }
}
