import { NextResponse } from "next/server";
import { getSourceMetrics } from "@/lib/weatherStore";

export async function GET() {
  try {
    return NextResponse.json(await getSourceMetrics());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudieron calcular métricas" },
      { status: 500 },
    );
  }
}
