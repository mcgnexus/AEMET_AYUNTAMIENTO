import { NextResponse } from "next/server";
import { getAemetWarnings } from "@/services/aemetWarningsService";

export async function GET() {
  try {
    const warnings = await getAemetWarnings();
    const response = NextResponse.json({ warnings });
    response.headers.set(
      "Cache-Control",
      "public, max-age=300, s-maxage=600, stale-while-revalidate=900"
    );
    return response;
  } catch (error) {
    console.error("[weather/avisos] Error:", error);
    return NextResponse.json(
      { warnings: [] },
      { status: 500 }
    );
  }
}
