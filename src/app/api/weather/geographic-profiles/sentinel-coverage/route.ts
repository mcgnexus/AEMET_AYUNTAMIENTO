import { NextResponse } from "next/server";
import {
  getLatestGeographicProfiles,
  updateGeographicProfiles,
} from "@/lib/weatherStore";
import { enrichProfilesWithSentinelCoverage } from "@/services/sentinelCoverageProfileService";

export const maxDuration = 300;

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const profiles = await getLatestGeographicProfiles();
    if (!profiles.length) throw new Error("No existen perfiles geográficos activos");
    const updatedProfiles = await enrichProfilesWithSentinelCoverage(profiles);
    await updateGeographicProfiles(updatedProfiles);
    return NextResponse.json({ ok: true, profiles: updatedProfiles });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudieron calcular coberturas Sentinel Hub" },
      { status: 502 },
    );
  }
}
