import WebSocket from "ws";
import type { LightningData, LightningStrike } from "@/types/weather";

const HUESCAR_LAT = 37.811;
const HUESCAR_LON = -2.5412;
const DEFAULT_RADIUS_KM = 20;
const CACHE_TTL_MS = 120_000;

const BLITZORTUNG_WS_SERVERS = [
  "wss://ws1.blitzortung.org:3000/",
  "wss://ws2.blitzortung.org:3000/",
  "wss://ws3.blitzortung.org:3000/",
  "wss://ws4.blitzortung.org:3000/",
  "wss://ws5.blitzortung.org:3000/",
  "wss://ws6.blitzortung.org:3000/",
  "wss://ws7.blitzortung.org:3000/",
  "wss://ws8.blitzortung.org:3000/",
];

let cachedData: LightningData | null = null;
let cachedAt = 0;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getAlertLevel(distanceKm: number | null): LightningData["level"] {
  if (distanceKm === null) return "info";
  if (distanceKm < 5) return "peligro";
  if (distanceKm < 15) return "alerta";
  if (distanceKm < 30) return "precaucion";
  return "info";
}

function getAlertMessage(level: LightningData["level"], nearestKm: number | null, count: number): string {
  switch (level) {
    case "peligro":
      return `Rayo detectado a ${nearestKm?.toFixed(1)} km. Peligro inminente.`;
    case "alerta":
      return `Rayo detectado a ${nearestKm?.toFixed(1)} km. Tormenta cercana.`;
    case "precaucion":
      return `Tormenta en las proximidades (${nearestKm?.toFixed(1)} km, ${count} rayo${count !== 1 ? "s" : ""}).`;
    default:
      return count > 0
        ? `Sin rayos en ${DEFAULT_RADIUS_KM} km. Último detectado a ${nearestKm?.toFixed(0)} km.`
        : "Sin actividad eléctrica detectada en la zona.";
  }
}

function decodeBlitzortung(encoded: string): string {
  const charset = "a-zA-Z0-9+/=";
  const reversed = encoded.split("").reverse().join("");
  let decoded = "";
  for (let i = 0; i < reversed.length; i++) {
    const c = reversed[i];
    const idx = charset.indexOf(c);
    if (idx === -1) {
      decoded += c;
    } else {
      decoded += charset[(idx - 1 + charset.length) % charset.length];
    }
  }
  try {
    return Buffer.from(decoded, "base64").toString("utf-8");
  } catch {
    return decoded;
  }
}

function fetchStrikesViaWebSocket(
  centerLat: number,
  centerLon: number,
  radiusKm: number,
): Promise<LightningStrike[]> {
  return new Promise((resolve) => {
    const strikes: LightningStrike[] = [];
    const serverIdx = Math.floor(Math.random() * BLITZORTUNG_WS_SERVERS.length);
    const wsUrl = BLITZORTUNG_WS_SERVERS[serverIdx];

    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl, {
        handshakeTimeout: 8000,
        maxPayload: 1024 * 1024,
      });
    } catch {
      resolve([]);
      return;
    }

    const timeout = setTimeout(() => {
      try { ws.close(); } catch {}
      resolve(strikes);
    }, 10_000);

    let subscriptionSent = false;

    ws.on("open", () => {
      try {
        ws.send('{"a":1}');
        subscriptionSent = true;
      } catch {
        try { ws.close(); } catch {}
        clearTimeout(timeout);
        resolve(strikes);
      }
    });

    ws.on("message", (raw: WebSocket.Data) => {
      try {
        const rawStr = typeof raw === "string" ? raw : raw.toString("utf-8");
        let decoded: string;
        try {
          decoded = decodeBlitzortung(rawStr);
        } catch {
          decoded = rawStr;
        }

        let data: Record<string, unknown>;
        try {
          data = JSON.parse(decoded) as Record<string, unknown>;
        } catch {
          return;
        }

        if (typeof data["lat"] === "number" && typeof data["lon"] === "number") {
          const lat = data["lat"] as number;
          const lon = data["lon"] as number;
          const dist = haversineKm(centerLat, centerLon, lat, lon);

          if (dist <= radiusKm) {
            const delay = typeof data["delay"] === "number" ? (data["delay"] as number) : 0;
            const strikeTime = new Date(Date.now() - delay * 1000).toISOString();
            strikes.push({
              lat,
              lon,
              time: strikeTime,
              delayMs: delay * 1000,
              distanceKm: Math.round(dist * 10) / 10,
            });
          }
        }
      } catch {}
    });

    ws.on("error", () => {
      clearTimeout(timeout);
      try { ws.close(); } catch {}
      resolve(strikes);
    });

    ws.on("close", () => {
      clearTimeout(timeout);
      resolve(strikes);
    });
  });
}

export async function getLightningData(
  centerLat = HUESCAR_LAT,
  centerLon = HUESCAR_LON,
  radiusKm = DEFAULT_RADIUS_KM,
): Promise<LightningData> {
  const now = Date.now();

  if (cachedData && now - cachedAt < CACHE_TTL_MS) {
    return cachedData;
  }

  const emptyResult: LightningData = {
    active: false,
    level: "info",
    nearestStrikeKm: null,
    strikeCount: 0,
    strikes: [],
    lastCheckedAt: new Date().toISOString(),
    source: "unavailable",
    message: "Datos de rayos no disponibles temporalmente.",
  };

  try {
    const strikes = await fetchStrikesViaWebSocket(centerLat, centerLon, radiusKm);

    const now2 = new Date().toISOString();
    const nearest = strikes.length > 0
      ? strikes.reduce((min, s) => (s.distanceKm < min ? s.distanceKm : min), Infinity)
      : null;
    const level = getAlertLevel(nearest);
    const active = level === "peligro" || level === "alerta";
    const message = getAlertMessage(level, nearest, strikes.length);

    const result: LightningData = {
      active,
      level,
      nearestStrikeKm: nearest,
      strikeCount: strikes.length,
      strikes: strikes.slice(0, 50),
      lastCheckedAt: now2,
      source: "blitzortung",
      message,
    };

    cachedData = result;
    cachedAt = Date.now();
    return result;
  } catch {
    cachedData = emptyResult;
    cachedAt = Date.now();
    return emptyResult;
  }
}
