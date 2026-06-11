export const GEOGRAPHIC_PROFILE_VERSION = "geo-v1.0.0";

const OPEN_METEO_ENDPOINT = "https://api.open-meteo.com/v1/forecast";
const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";
const SAMPLE_RADIUS_KM = 5;

const locations = [
  { id: "huescar", name: "Huéscar", latitude: 37.811, longitude: -2.5412 },
  { id: "puebla-don-fadrique", name: "Puebla de Don Fadrique", latitude: 37.8758, longitude: -2.3817 },
  { id: "castril", name: "Castril", latitude: 37.7956, longitude: -2.7807 },
  { id: "galera", name: "Galera", latitude: 37.7425, longitude: -2.5519 },
  { id: "orce", name: "Orce", latitude: 37.7211, longitude: -2.4775 },
  { id: "castillejar", name: "Castilléjar", latitude: 37.7147, longitude: -2.6406 },
] as const;

type Location = (typeof locations)[number];
type Point = { latitude: number; longitude: number; elevationM: number };
type EnvironmentalFeature = {
  latitude: number;
  longitude: number;
  type: "water" | "forest";
};

export type GeographicProfile = {
  locationId: string;
  name: string;
  version: string;
  generatedAt: string;
  coordinates: { latitude: number; longitude: number };
  terrain: {
    centerElevationM: number;
    meanElevationM: number;
    minimumElevationM: number;
    maximumElevationM: number;
    elevationRangeM: number;
    elevationStdDevM: number;
    dominantAspectDeg: number;
    slopeProxyPct: number;
    valleyExposureIndex: number;
    sampleRadiusKm: number;
  };
  environment: {
    nearestWaterKm: number | null;
    nearestForestKm: number | null;
    waterFeatureCount15Km: number | null;
    forestFeatureCount15Km: number | null;
  };
  satelliteCoverage?: {
    source: "Sentinel-2 L2A via Copernicus Data Space Statistical API";
    generatedAt: string;
    periodFrom: string;
    periodTo: string;
    radii: Record<"1km" | "5km" | "15km", {
      vegetationPct: number;
      denseVegetationPct: number;
      waterDetectedPct: number;
      cloudPct: number;
      validIntervals: number;
      resolutionM: number;
    }>;
  };
  microclimate: {
    initialClass: "VALLEY" | "EXPOSED_PLATEAU" | "PIEDMONT" | "MIXED_RELIEF";
    notes: string[];
  };
  quality: {
    status: "COMPLETE" | "PARTIAL";
    terrainSource: string;
    environmentSource: string | null;
    warnings: string[];
  };
};

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function distanceKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const radius = 6371;
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(b.latitude - a.latitude);
  const longitudeDelta = radians(b.longitude - a.longitude);
  const h = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}

function sampleCoordinates(location: Location) {
  const latitudeOffset = SAMPLE_RADIUS_KM / 111.32;
  const longitudeOffset = SAMPLE_RADIUS_KM / (111.32 * Math.cos(location.latitude * Math.PI / 180));
  return [
    { latitude: location.latitude, longitude: location.longitude },
    { latitude: location.latitude + latitudeOffset, longitude: location.longitude },
    { latitude: location.latitude - latitudeOffset, longitude: location.longitude },
    { latitude: location.latitude, longitude: location.longitude + longitudeOffset },
    { latitude: location.latitude, longitude: location.longitude - longitudeOffset },
    { latitude: location.latitude + latitudeOffset, longitude: location.longitude + longitudeOffset },
    { latitude: location.latitude + latitudeOffset, longitude: location.longitude - longitudeOffset },
    { latitude: location.latitude - latitudeOffset, longitude: location.longitude + longitudeOffset },
    { latitude: location.latitude - latitudeOffset, longitude: location.longitude - longitudeOffset },
  ];
}

async function getTerrainSamples(location: Location): Promise<Point[]> {
  const coordinates = sampleCoordinates(location);
  const params = new URLSearchParams({
    latitude: coordinates.map((point) => point.latitude).join(","),
    longitude: coordinates.map((point) => point.longitude).join(","),
    forecast_days: "1",
    daily: "temperature_2m_mean",
    timezone: "Europe/Madrid",
  });
  const response = await fetch(`${OPEN_METEO_ENDPOINT}?${params}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Open-Meteo respondió ${response.status}`);
  const raw = await response.json();
  const results = Array.isArray(raw) ? raw : [raw];
  return coordinates.map((coordinate, index) => ({
    ...coordinate,
    elevationM: Number(results[index].elevation),
  }));
}

async function getEnvironmentalFeatures(): Promise<EnvironmentalFeature[]> {
  const south = Math.min(...locations.map((location) => location.latitude)) - 0.16;
  const west = Math.min(...locations.map((location) => location.longitude)) - 0.2;
  const north = Math.max(...locations.map((location) => location.latitude)) + 0.16;
  const east = Math.max(...locations.map((location) => location.longitude)) + 0.2;
  const bbox = `${south},${west},${north},${east}`;
  const query = `[out:json][timeout:30];(
    nwr["natural"="water"](${bbox});
    nwr["waterway"~"river|stream"](${bbox});
    nwr["natural"="wood"](${bbox});
    nwr["landuse"="forest"](${bbox});
  );out center;`;
  const response = await fetch(`${OVERPASS_ENDPOINT}?data=${encodeURIComponent(query)}`, {
    headers: { "user-agent": "MeteoHuescar/1.0" },
    cache: "no-store",
    signal: AbortSignal.timeout(35_000),
  });
  if (!response.ok) throw new Error(`Overpass respondió ${response.status}`);
  const raw = await response.json();
  return raw.elements.flatMap((element: {
    lat?: number;
    lon?: number;
    center?: { lat: number; lon: number };
    tags?: Record<string, string>;
  }) => {
    const latitude = element.lat ?? element.center?.lat;
    const longitude = element.lon ?? element.center?.lon;
    if (latitude == null || longitude == null) return [];
    const forest = element.tags?.natural === "wood" || element.tags?.landuse === "forest";
    return [{
      latitude,
      longitude,
      type: forest ? "forest" as const : "water" as const,
    }];
  });
}

function terrainProfile(samples: Point[]) {
  const elevations = samples.map((point) => point.elevationM);
  const center = samples[0].elevationM;
  const mean = elevations.reduce((sum, value) => sum + value, 0) / elevations.length;
  const variance = elevations.reduce((sum, value) => sum + (value - mean) ** 2, 0) / elevations.length;
  const northSouthGradient = samples[1].elevationM - samples[2].elevationM;
  const eastWestGradient = samples[3].elevationM - samples[4].elevationM;
  const dominantAspectDeg = (Math.atan2(-eastWestGradient, -northSouthGradient) * 180 / Math.PI + 360) % 360;
  const elevationRangeM = Math.max(...elevations) - Math.min(...elevations);
  const valleyExposureIndex = (mean - center) / Math.max(1, Math.sqrt(variance));
  return {
    centerElevationM: round(center),
    meanElevationM: round(mean),
    minimumElevationM: round(Math.min(...elevations)),
    maximumElevationM: round(Math.max(...elevations)),
    elevationRangeM: round(elevationRangeM),
    elevationStdDevM: round(Math.sqrt(variance)),
    dominantAspectDeg: round(dominantAspectDeg),
    slopeProxyPct: round(elevationRangeM / (SAMPLE_RADIUS_KM * 20)),
    valleyExposureIndex: round(valleyExposureIndex, 2),
    sampleRadiusKm: SAMPLE_RADIUS_KM,
  };
}

function microclimateClass(terrain: ReturnType<typeof terrainProfile>) {
  if (terrain.valleyExposureIndex >= 0.6) return "VALLEY" as const;
  if (terrain.elevationRangeM >= 450) return "PIEDMONT" as const;
  if (terrain.valleyExposureIndex <= -0.5 && terrain.elevationRangeM < 300) return "EXPOSED_PLATEAU" as const;
  return "MIXED_RELIEF" as const;
}

export async function generateGeographicProfiles(): Promise<GeographicProfile[]> {
  const environmentalResult = await getEnvironmentalFeatures()
    .then((features) => ({ features, warning: null }))
    .catch((error) => ({
      features: [] as EnvironmentalFeature[],
      warning: error instanceof Error ? error.message : "Cartografía ambiental no disponible",
    }));
  return Promise.all(locations.map(async (location) => {
    const terrain = terrainProfile(await getTerrainSamples(location));
    const nearby = environmentalResult.features
      .map((feature) => ({ ...feature, distanceKm: distanceKm(location, feature) }))
      .filter((feature) => feature.distanceKm <= 15);
    const water = nearby.filter((feature) => feature.type === "water");
    const forest = nearby.filter((feature) => feature.type === "forest");
    const initialClass = microclimateClass(terrain);
    const notes = [
      initialClass === "VALLEY" ? "Mayor riesgo relativo de inversión térmica nocturna." : "",
      initialClass === "PIEDMONT" ? "Relieve complejo con mayor incertidumbre espacial." : "",
      initialClass === "EXPOSED_PLATEAU" ? "Mayor exposición potencial al viento." : "",
    ].filter(Boolean);
    return {
      locationId: location.id,
      name: location.name,
      version: GEOGRAPHIC_PROFILE_VERSION,
      generatedAt: new Date().toISOString(),
      coordinates: { latitude: location.latitude, longitude: location.longitude },
      terrain,
      environment: {
        nearestWaterKm: water.length ? round(Math.min(...water.map((feature) => feature.distanceKm)), 2) : null,
        nearestForestKm: forest.length ? round(Math.min(...forest.map((feature) => feature.distanceKm)), 2) : null,
        waterFeatureCount15Km: environmentalResult.warning ? null : water.length,
        forestFeatureCount15Km: environmentalResult.warning ? null : forest.length,
      },
      microclimate: { initialClass, notes },
      quality: {
        status: environmentalResult.warning ? "PARTIAL" : "COMPLETE",
        terrainSource: "Open-Meteo elevation grid, 9 samples at 5 km radius",
        environmentSource: environmentalResult.warning ? null : "OpenStreetMap via Overpass",
        warnings: environmentalResult.warning ? [environmentalResult.warning] : [],
      },
    };
  }));
}
