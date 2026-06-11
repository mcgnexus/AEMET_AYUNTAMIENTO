import type { GeographicProfile } from "@/services/geographicProfileService";
import { getSentinelCoverage } from "@/services/sentinelHubService";

const SENTINEL_PROFILE_VERSION = "geo-v1.1.0";
const SENTINEL_TASK_TIMEOUT_MS = 55_000;
const radii = [
  { key: "1km" as const, radiusKm: 1, resolutionM: 20 },
  { key: "5km" as const, radiusKm: 5, resolutionM: 50 },
  { key: "15km" as const, radiusKm: 15, resolutionM: 100 },
];

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  operation: (value: T) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await operation(values[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return results;
}

export async function enrichProfilesWithSentinelCoverage(profiles: GeographicProfile[]) {
  const tasks = profiles.flatMap((profile) =>
    radii.map((radius) => ({ profile, radius })),
  );
  const coverageResults = await mapWithConcurrency(tasks, 2, async ({ profile, radius }) => {
    const result = await Promise.race([
      getSentinelCoverage(
        profile.coordinates.latitude,
        profile.coordinates.longitude,
        radius.radiusKm,
        radius.resolutionM,
      ).then((coverage) => ({ ok: true as const, coverage })),
      new Promise<{ ok: false; error: Error }>((resolve) => {
        setTimeout(() => resolve({ ok: false, error: new Error(`Timeout tras ${SENTINEL_TASK_TIMEOUT_MS / 1000}s en ${profile.name} ${radius.key}`) }), SENTINEL_TASK_TIMEOUT_MS);
      }),
    ]);
    if (!result.ok) throw result.error;
    return {
      locationId: profile.locationId,
      key: radius.key,
      coverage: result.coverage,
    };
  });
  const generatedAt = new Date().toISOString();
  return profiles.map((profile): GeographicProfile => {
    const results = coverageResults.filter((result) => result.locationId === profile.locationId);
    const first = results[0].coverage;
    return {
      ...profile,
      version: SENTINEL_PROFILE_VERSION,
      generatedAt,
      satelliteCoverage: {
        source: "Sentinel-2 L2A via Copernicus Data Space Statistical API",
        generatedAt,
        periodFrom: first.periodFrom,
        periodTo: first.periodTo,
        radii: Object.fromEntries(results.map((result) => [
          result.key,
          {
            vegetationPct: result.coverage.vegetationPct,
            denseVegetationPct: result.coverage.denseVegetationPct,
            waterDetectedPct: result.coverage.waterDetectedPct,
            cloudPct: result.coverage.cloudPct,
            validIntervals: result.coverage.validIntervals,
            resolutionM: result.coverage.resolutionM,
          },
        ])) as NonNullable<GeographicProfile["satelliteCoverage"]>["radii"],
      },
    };
  });
}
