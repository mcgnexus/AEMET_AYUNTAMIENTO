import { generateGeographicProfiles } from "@/services/geographicProfileService";
import { enrichProfilesWithSentinelCoverage } from "@/services/sentinelCoverageProfileService";
import { getLatestGeographicProfiles, persistGeographicProfiles } from "./geographicRepository";
import type { LayerGeographic } from "./layerGeographic.types";

export async function getGeographicLayer(): Promise<LayerGeographic> {
  try {
    const existing = new Map(
      (await getLatestGeographicProfiles()).map((profile) => [profile.locationId, profile]),
    );
    const profiles = (await generateGeographicProfiles()).map((profile) => {
      const current = existing.get(profile.locationId);
      return {
        ...profile,
        version: current?.version ?? profile.version,
        satelliteCoverage: current?.satelliteCoverage,
      };
    });
    return {
      meta: {
        generatedAt: new Date().toISOString(),
        status: "OK",
        warnings: [],
      },
      satelliteLastUpdate: profiles[0]?.satelliteCoverage?.generatedAt ?? null,
      satellitePeriodFrom: profiles[0]?.satelliteCoverage?.periodFrom ?? null,
      satellitePeriodTo: profiles[0]?.satelliteCoverage?.periodTo ?? null,
      profiles,
      fallback: {
        used: false,
        reason: null,
      },
    };
  } catch (error) {
    const fallbackProfiles = await getLatestGeographicProfiles().catch(() => []);
    return {
      meta: {
        generatedAt: new Date().toISOString(),
        status: fallbackProfiles.length ? "DEGRADED" : "ERROR",
        warnings: [
          error instanceof Error ? error.message : "Error al generar perfiles geográficos",
        ],
      },
      satelliteLastUpdate: fallbackProfiles[0]?.satelliteCoverage?.generatedAt ?? null,
      satellitePeriodFrom: fallbackProfiles[0]?.satelliteCoverage?.periodFrom ?? null,
      satellitePeriodTo: fallbackProfiles[0]?.satelliteCoverage?.periodTo ?? null,
      profiles: fallbackProfiles,
      fallback: {
        used: true,
        reason: error instanceof Error ? error.message : "Error al generar perfiles geográficos",
      },
    };
  }
}

export async function refreshGeographicWithSentinel(): Promise<{
  ok: boolean;
  profiles: import("@/services/geographicProfileService").GeographicProfile[];
}> {
  const existing = new Map(
    (await getLatestGeographicProfiles()).map((profile) => [profile.locationId, profile]),
  );
  const profiles = (await generateGeographicProfiles()).map((profile) => {
    const current = existing.get(profile.locationId);
    return {
      ...profile,
      version: current?.version ?? profile.version,
      satelliteCoverage: current?.satelliteCoverage,
    };
  });
  const enriched = await enrichProfilesWithSentinelCoverage(profiles);
  await persistGeographicProfiles(enriched);
  return { ok: true, profiles: enriched };
}

export { getLatestGeographicProfiles };
