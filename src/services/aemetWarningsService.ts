import type { WeatherAlert } from "@/types/weather";

const AEMET_AVISOS_ENDPOINT = "https://opendata.aemet.es/opendata/api/avisos_cap/ultimoelaborado/area/esp";

const HUESCAR_LAT = 37.811;
const HUESCAR_LON = -2.5412;

const HUESCAR_ZONES = new Set(["611802", "611803"]);

const CACHE_TTL_MS = 10 * 60_000;
let cachedAlerts: WeatherAlert[] = [];
let cachedAt = 0;

type AemetAlertInfo = {
  event: string;
  onset: string;
  expires: string;
  severity: string;
  level: string;
  description: string;
  instruction: string;
  parameter: string;
  probability: string;
  areaDesc: string;
  zoneCode: string;
};

function parseCapXmlBatch(xmlContent: string): AemetAlertInfo[] {
  const alerts: AemetAlertInfo[] = [];
  const alertRegex = /<alert[^>]*>([\s\S]*?)<\/alert>/g;
  let match: RegExpExecArray | null;

  while ((match = alertRegex.exec(xmlContent)) !== null) {
    const block = match[1];
    const infoRegex = /<info>\s*<language>es-ES<\/language>([\s\S]*?)<\/info>/;
    const infoMatch = infoRegex.exec(block);
    if (!infoMatch) continue;

    const info = infoMatch[1];

    const getTag = (tag: string) => {
      const r = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`);
      const m = r.exec(info);
      return m ? m[1].trim() : "";
    };

    const getParamValue = (valueName: string) => {
      const r = new RegExp(
        `<valueName>${valueName}<\\/valueName>\\s*<value>([\\s\\S]*?)<\\/value>`
      );
      const m = r.exec(info);
      return m ? m[1].trim() : "";
    };

    const event = getTag("event");
    const onset = getTag("onset");
    const expires = getTag("expires");
    const severity = getTag("severity");
    const level = getParamValue("AEMET-Meteoalerta nivel");
    const description = getTag("description");
    const instruction = getTag("instruction");
    const parameter = getParamValue("AEMET-Meteoalerta parametro");
    const probability = getParamValue("AEMET-Meteoalerta probabilidad");
    const areaDesc = getTag("areaDesc");
    const zoneCode = getParamValue("AEMET-Meteoalerta zona");

    alerts.push({
      event,
      onset,
      expires,
      severity,
      level,
      description,
      instruction,
      parameter,
      probability,
      areaDesc,
      zoneCode,
    });
  }

  return alerts;
}

function parseTarContent(raw: string): AemetAlertInfo[] {
  const allAlerts: AemetAlertInfo[] = [];
  const xmlParts = raw.split(/<\?xml/);

  for (const part of xmlParts) {
    if (part.includes("<alert")) {
      const xml = "<?xml" + part;
      const parsed = parseCapXmlBatch(xml);
      allAlerts.push(...parsed);
    }
  }

  return allAlerts;
}

function pointInPolygon(lat: number, lon: number, polygon: string): boolean {
  const coords = polygon.trim().split(/\s+/).map((pair) => {
    const [latStr, lonStr] = pair.split(",");
    return { lat: parseFloat(latStr), lon: parseFloat(lonStr) };
  });

  let inside = false;
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const xi = coords[i].lat;
    const yi = coords[i].lon;
    const xj = coords[j].lat;
    const yj = coords[j].lon;

    const intersect =
      yi > lon !== yj > lon && lat < ((xj - xi) * (lon - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function isRelevantForHuescar(info: AemetAlertInfo, block: string): boolean {
  if (HUESCAR_ZONES.has(info.zoneCode)) return true;

  const polygonRegex = /<polygon>([^<]+)<\/polygon>/g;
  let polyMatch: RegExpExecArray | null;
  while ((polyMatch = polygonRegex.exec(block)) !== null) {
    if (pointInPolygon(HUESCAR_LAT, HUESCAR_LON, polyMatch[1])) {
      return true;
    }
  }

  return false;
}

function levelToAlertLevel(
  level: string
): "aviso" | "peligro" | "severo" {
  if (level === "rojo") return "severo";
  if (level === "naranja") return "peligro";
  return "aviso";
}

function levelEmoji(level: string): string {
  if (level === "rojo") return "🔴";
  if (level === "naranja") return "🟠";
  if (level === "amarillo") return "🟡";
  return "⚠️";
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("es-ES", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export async function getAemetWarnings(): Promise<WeatherAlert[]> {
  const now = Date.now();
  if (cachedAlerts.length > 0 && now - cachedAt < CACHE_TTL_MS) {
    return cachedAlerts;
  }

  const apiKey = process.env.AEMET_API_KEY;
  if (!apiKey) return [];

  try {
    const metaResponse = await fetch(AEMET_AVISOS_ENDPOINT, {
      headers: { api_key: apiKey, accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });

    if (!metaResponse.ok) return cachedAlerts;

    const meta = (await metaResponse.json()) as {
      datos?: string;
      estado?: number;
    };
    if (!meta.datos) return cachedAlerts;

    const dataResponse = await fetch(meta.datos, {
      signal: AbortSignal.timeout(30_000),
    });

    if (!dataResponse.ok) return cachedAlerts;

    const rawContent = await dataResponse.text();
    const allAlerts = parseTarContent(rawContent);

    const relevantBlocks = rawContent.split(/<\?xml/);
    const relevantAlerts: WeatherAlert[] = [];

    for (const alert of allAlerts) {
      const blockIdx = relevantBlocks.findIndex(
        (b) =>
          b.includes(alert.event) && b.includes(alert.areaDesc)
      );
      const block = blockIdx >= 0 ? "<?xml" + relevantBlocks[blockIdx] : "";

      if (!isRelevantForHuescar(alert, block)) continue;

      const expiresDate = new Date(alert.expires);
      if (expiresDate.getTime() < Date.now()) continue;

      relevantAlerts.push({
        type: "aemet_oficial",
        level: levelToAlertLevel(alert.level),
        title: `${levelEmoji(alert.level)} ${alert.event}`,
        message: `${alert.description}${
          alert.probability ? ` Probabilidad: ${alert.probability}.` : ""
        } Válido hasta ${formatTime(alert.expires)}.`,
      });
    }

    relevantAlerts.sort((a, b) => {
      const order = { severo: 3, peligro: 2, aviso: 1 };
      return (order[b.level] ?? 0) - (order[a.level] ?? 0);
    });

    cachedAlerts = relevantAlerts;
    cachedAt = Date.now();
    return relevantAlerts;
  } catch (error) {
    console.error("[aemetWarnings] Error:", error);
    return cachedAlerts;
  }
}
