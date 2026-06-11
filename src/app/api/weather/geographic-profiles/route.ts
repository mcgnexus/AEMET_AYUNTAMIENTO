import { NextResponse } from "next/server";
import { getGeographicLayer, refreshGeographicWithSentinel } from "@/services/layers/layerGeographic";

export async function GET() {
  try {
    const layer = await getGeographicLayer();
    return NextResponse.json(layer.profiles);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudieron consultar los perfiles geográficos" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await refreshGeographicWithSentinel();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudieron generar los perfiles geográficos" },
      { status: 502 },
    );
  }
}
