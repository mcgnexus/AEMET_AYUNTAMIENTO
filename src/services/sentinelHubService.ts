const SENTINEL_HUB_TIMEOUT_MS = 45_000;

let tokenCache: { accessToken: string; expiresAt: number } | null = null;

type TokenResponse = {
  access_token: string;
  expires_in: number;
};

type SentinelHubError = {
  error?: {
    message?: string;
    status?: number;
  };
  error_description?: string;
};

function sentinelHubEndpoints(clientId: string) {
  const copernicusDataSpace = clientId.startsWith("sh-");
  return copernicusDataSpace
    ? {
        deployment: "COPERNICUS_DATA_SPACE",
        tokenUrl: "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token",
        statisticsUrl: "https://sh.dataspace.copernicus.eu/api/v1/statistics",
      }
    : {
        deployment: "SENTINEL_HUB",
        tokenUrl: "https://services.sentinel-hub.com/auth/realms/main/protocol/openid-connect/token",
        statisticsUrl: "https://services.sentinel-hub.com/api/v1/statistics",
      };
}

export type SentinelHubStatisticsRequest = {
  input: {
    bounds: {
      geometry: {
        type: "Polygon";
        coordinates: number[][][];
      };
      properties?: { crs?: string };
    };
    data: Array<{
      type: "sentinel-2-l2a";
      dataFilter?: {
        mosaickingOrder?: "mostRecent" | "leastRecent" | "leastCC";
        maxCloudCoverage?: number;
      };
    }>;
  };
  aggregation: {
    timeRange: { from: string; to: string };
    aggregationInterval: { of: string };
    evalscript: string;
    resx: number;
    resy: number;
  };
  calculations: Record<string, unknown>;
};

async function responseError(response: Response) {
  const body = await response.json().catch(() => null) as SentinelHubError | null;
  return new Error(
    body?.error?.message ??
    body?.error_description ??
    `Sentinel Hub respondió ${response.status}`,
  );
}

export async function getSentinelHubAccessToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.accessToken;
  }
  const clientId = process.env.SENTINEL_HUB_CLIENT_ID;
  const clientSecret = process.env.SENTINEL_HUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Credenciales Sentinel Hub no configuradas");
  }
  const response = await fetch(sentinelHubEndpoints(clientId).tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(SENTINEL_HUB_TIMEOUT_MS),
  });
  if (!response.ok) throw await responseError(response);
  const token = await response.json() as TokenResponse;
  if (!token.access_token || !token.expires_in) {
    throw new Error("Sentinel Hub no devolvió un token OAuth válido");
  }
  tokenCache = {
    accessToken: token.access_token,
    expiresAt: Date.now() + token.expires_in * 1000,
  };
  return token.access_token;
}

export async function getSentinelHubStatistics(request: SentinelHubStatisticsRequest) {
  const clientId = process.env.SENTINEL_HUB_CLIENT_ID;
  if (!clientId) throw new Error("SENTINEL_HUB_CLIENT_ID no configurado");
  const accessToken = await getSentinelHubAccessToken();
  const response = await fetch(sentinelHubEndpoints(clientId).statisticsUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(request),
    cache: "no-store",
    signal: AbortSignal.timeout(SENTINEL_HUB_TIMEOUT_MS),
  });
  if (!response.ok) throw await responseError(response);
  return response.json();
}

function circleAround(latitude: number, longitude: number, radiusKm: number, points = 48) {
  const coordinates = Array.from({ length: points + 1 }, (_, index) => {
    const angle = index / points * Math.PI * 2;
    const latitudeOffset = Math.sin(angle) * radiusKm / 111.32;
    const longitudeOffset = Math.cos(angle) * radiusKm /
      (111.32 * Math.cos(latitude * Math.PI / 180));
    return [longitude + longitudeOffset, latitude + latitudeOffset];
  });
  return [coordinates];
}

type StatisticsBand = {
  stats?: { mean?: number; sampleCount?: number; noDataCount?: number };
};

type StatisticsInterval = {
  outputs?: {
    metrics?: { bands?: Record<string, StatisticsBand> };
  };
};

type StatisticsResponse = { data?: StatisticsInterval[] };

function weightedCoverage(response: StatisticsResponse) {
  const intervals = (response.data ?? []).flatMap((interval) => {
    const bands = interval.outputs?.metrics?.bands;
    const vegetation = bands?.B0?.stats?.mean;
    const denseVegetation = bands?.B1?.stats?.mean;
    const water = bands?.B2?.stats?.mean;
    const cloud = bands?.B3?.stats?.mean;
    const sampleCount = bands?.B0?.stats?.sampleCount ?? 0;
    if ([vegetation, denseVegetation, water, cloud].some((value) => value == null) || !sampleCount) {
      return [];
    }
    const clearFraction = Math.max(0.05, 1 - cloud!);
    return [{
      vegetation: Math.min(1, vegetation! / clearFraction),
      denseVegetation: Math.min(1, denseVegetation! / clearFraction),
      water: Math.min(1, water! / clearFraction),
      cloud: cloud!,
      sampleCount,
    }];
  });
  const totalSamples = intervals.reduce((sum, interval) => sum + interval.sampleCount, 0);
  const weighted = (key: "vegetation" | "denseVegetation" | "water" | "cloud") =>
    intervals.reduce((sum, interval) => sum + interval[key] * interval.sampleCount, 0) /
    Math.max(1, totalSamples);
  return {
    vegetationPct: Math.round(weighted("vegetation") * 1000) / 10,
    denseVegetationPct: Math.round(weighted("denseVegetation") * 1000) / 10,
    waterDetectedPct: Math.round(weighted("water") * 1000) / 10,
    cloudPct: Math.round(weighted("cloud") * 1000) / 10,
    validIntervals: intervals.length,
  };
}

export async function getSentinelCoverage(
  latitude: number,
  longitude: number,
  radiusKm: number,
  resolutionM: number,
) {
  const to = new Date();
  const from = new Date(to);
  from.setUTCFullYear(from.getUTCFullYear() - 1);
  const evalscript = `//VERSION=3
function setup() {
  return {
    input: ["B03", "B04", "B08", "SCL", "dataMask"],
    output: [
      { id: "metrics", bands: 4 },
      { id: "dataMask", bands: 1 }
    ]
  };
}
function evaluatePixel(sample) {
  const ndvi = (sample.B08 - sample.B04) / (sample.B08 + sample.B04);
  const ndwi = (sample.B03 - sample.B08) / (sample.B03 + sample.B08);
  const cloud = sample.SCL === 3 || sample.SCL === 8 || sample.SCL === 9 || sample.SCL === 10;
  return {
    metrics: [
      !cloud && ndvi > 0.25 ? 1 : 0,
      !cloud && ndvi > 0.55 ? 1 : 0,
      !cloud && sample.SCL === 6 && ndwi > 0 ? 1 : 0,
      cloud ? 1 : 0
    ],
    dataMask: [sample.dataMask]
  };
}`;
  const response = await getSentinelHubStatistics({
    input: {
      bounds: {
        geometry: { type: "Polygon", coordinates: circleAround(latitude, longitude, radiusKm) },
        properties: { crs: "http://www.opengis.net/def/crs/OGC/1.3/CRS84" },
      },
      data: [{
        type: "sentinel-2-l2a",
        dataFilter: { mosaickingOrder: "leastCC", maxCloudCoverage: 80 },
      }],
    },
    aggregation: {
      timeRange: { from: from.toISOString(), to: to.toISOString() },
      aggregationInterval: { of: "P30D" },
      evalscript,
      resx: resolutionM / 111_320,
      resy: resolutionM / 111_320,
    },
    calculations: { metrics: {} },
  }) as StatisticsResponse;
  return {
    ...weightedCoverage(response),
    resolutionM,
    periodFrom: from.toISOString(),
    periodTo: to.toISOString(),
  };
}

function squareAround(latitude: number, longitude: number, radiusKm: number) {
  const latitudeOffset = radiusKm / 111.32;
  const longitudeOffset = radiusKm / (111.32 * Math.cos(latitude * Math.PI / 180));
  return [[
    [longitude - longitudeOffset, latitude - latitudeOffset],
    [longitude + longitudeOffset, latitude - latitudeOffset],
    [longitude + longitudeOffset, latitude + latitudeOffset],
    [longitude - longitudeOffset, latitude + latitudeOffset],
    [longitude - longitudeOffset, latitude - latitudeOffset],
  ]];
}

export async function runSentinelHubSmokeTest() {
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 90);
  const evalscript = `//VERSION=3
function setup() {
  return {
    input: ["B03", "B04", "B08", "SCL", "dataMask"],
    output: [
      { id: "metrics", bands: 3 },
      { id: "dataMask", bands: 1 }
    ]
  };
}
function evaluatePixel(sample) {
  const ndvi = (sample.B08 - sample.B04) / (sample.B08 + sample.B04);
  const ndwi = (sample.B03 - sample.B08) / (sample.B03 + sample.B08);
  const cloud = sample.SCL === 3 || sample.SCL === 8 || sample.SCL === 9 || sample.SCL === 10;
  return {
    metrics: [ndvi > 0.45 ? 1 : 0, sample.SCL === 6 && ndwi > 0 ? 1 : 0, cloud ? 1 : 0],
    dataMask: [sample.dataMask]
  };
}`;
  return getSentinelHubStatistics({
    input: {
      bounds: {
        geometry: {
          type: "Polygon",
          coordinates: squareAround(37.811, -2.5412, 1),
        },
        properties: { crs: "http://www.opengis.net/def/crs/OGC/1.3/CRS84" },
      },
      data: [{
        type: "sentinel-2-l2a",
        dataFilter: { mosaickingOrder: "leastCC", maxCloudCoverage: 80 },
      }],
    },
    aggregation: {
      timeRange: { from: from.toISOString(), to: to.toISOString() },
      aggregationInterval: { of: "P30D" },
      evalscript,
      resx: 0.0002,
      resy: 0.0002,
    },
    calculations: { metrics: {} },
  });
}
