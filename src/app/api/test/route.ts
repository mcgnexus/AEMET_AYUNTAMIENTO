import { NextResponse } from "next/server";

export async function GET() {
  try {
    const apiKey = process.env.AEMET_API_KEY;
    console.log("AEMET_KEY:", apiKey ? "exists" : "missing");

    let aemetStatus = "not called";
    let aemetError = null;
    try {
      const aemetRes = await fetch("https://opendata.aemet.es/opendata/api/observacion/convencional/datos/estacion/5051X", {
        headers: { accept: "application/json", connection: "close", api_key: apiKey! },
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      aemetStatus = `${aemetRes.status} ${aemetRes.ok ? "ok" : "not ok"}`;
      console.log("AEMET status:", aemetRes.status);
    } catch (e) {
      aemetError = e instanceof Error ? e.message : "unknown";
      console.error("AEMET error:", aemetError);
    }

    let omStatus = "not called";
    let omError = null;
    let omCause = null;
    try {
      const http = require("http");
      const omData = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("timeout")), 10000);
        http.get("http://api.open-meteo.com/v1/forecast?latitude=37.811&longitude=-2.5412&current=temperature_2m&forecast_days=1&timezone=Europe%2FMadrid", {
          headers: { "User-Agent": "curl/8.0.1" },
        }, (res: any) => {
          let data = "";
          res.on("data", (chunk: any) => data += chunk);
          res.on("end", () => { clearTimeout(timeout); resolve(data); });
          res.on("error", (e: any) => { clearTimeout(timeout); reject(e); });
        }).on("error", (e: any) => { clearTimeout(timeout); reject(e); });
      });
      omStatus = `200 ${omData.length > 0 ? "ok" : "empty"}`;
      console.log("OM status: 200, length:", omData.length);
    } catch (e: any) {
      omError = e instanceof Error ? e.message : "unknown";
      omCause = e?.code || "no code";
      console.error("OM error:", omError, "cause:", omCause);
    }

    return NextResponse.json({
      aemet: { status: aemetStatus, error: aemetError },
      openMeteo: { status: omStatus, error: omError },
      env: {
        NODE_TLS_REJECT_UNAUTHORIZED: process.env.NODE_TLS_REJECT_UNAUTHORIZED || "not set",
      }
    });
  } catch (error) {
    console.error("TEST ERROR:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Unknown",
      stack: error instanceof Error ? error.stack : null,
    }, { status: 500 });
  }
}
