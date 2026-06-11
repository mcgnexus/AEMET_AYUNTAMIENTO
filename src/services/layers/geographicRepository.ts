import { PoolClient } from "pg";
import type { GeographicProfile } from "@/services/geographicProfileService";
import { getPool } from "@/lib/weatherStore";

export async function persistGeographicProfiles(profiles: GeographicProfile[]) {
  if (!profiles.length) return;
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    for (const profile of profiles) {
      await client.query(
        "UPDATE location_profiles SET is_active = false WHERE location_id = $1 AND version <> $2",
        [profile.locationId, profile.version],
      );
      await client.query(`
        INSERT INTO location_profiles (location_id, version, generated_at, profile, is_active)
        VALUES ($1, $2, $3, $4::jsonb, true)
        ON CONFLICT(location_id, version) DO UPDATE SET
          generated_at = excluded.generated_at,
          profile = excluded.profile,
          is_active = true
      `, [profile.locationId, profile.version, profile.generatedAt, JSON.stringify(profile)]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getLatestGeographicProfiles() {
  const result = await getPool().query<{ profile: GeographicProfile }>(`
    SELECT profile FROM location_profiles WHERE is_active ORDER BY location_id
  `);
  return result.rows.map((row) => row.profile);
}

export async function updateGeographicProfiles(profiles: GeographicProfile[]) {
  await persistGeographicProfiles(profiles);
}
