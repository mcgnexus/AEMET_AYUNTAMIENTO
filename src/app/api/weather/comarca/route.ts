import { NextResponse } from "next/server";
import { getLatestComarcaEstimation } from "@/lib/weatherStore";
import { getComarcaEstimates } from "@/services/layers/layerComarca";

export async function GET() {
  try {
    const persisted = await getLatestComarcaEstimation().catch(() => null);
    return NextResponse.json(persisted ?? await getComarcaEstimates());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo calcular la aproximación comarcal" },
      { status: 502 },
    );
  }
}
