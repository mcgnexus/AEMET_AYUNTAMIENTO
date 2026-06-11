import { Pool, type PoolClient } from "pg";
import type { CurrentWeather, SourceObservation, WeatherPayload } from "@/types/weather";
import type { ComarcaEstimationPayload } from "@/services/layers/layerComarca.types";
import type { GeographicProfile } from "@/services/geographicProfileService";

const variables: Array<keyof Pick<
  SourceObservation,
  "temperatureC" | "humidityPct" | "precipitationMm" | "windSpeedKmh" | "windGustKmh"
>> = ["temperatureC", "humidityPct", "precipitationMm", "windSpeedKmh", "windGustKmh"];

export type CalibratedVariable = (typeof variables)[number];
export type ConfidenceCalibration = Record<CalibratedVariable, {
  historicalMae: number | null;
  sampleCount: number;
  aemetSampleCount: number;
  riaSampleCount: number;
  tolerance: number;
  historicalWeight: number;
}>;
export type ExternalCalibrationSample = {
  source: "RIA";
  date: string;
  values: Partial<Record<CalibratedVariable, { observed: number; predicted: number }>>;
};

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

export function getPool() {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL ?? process.env.NEON_DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL no configurada");
  pool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  return pool;
}

export function ensureWeatherSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = getPool().query(`
    CREATE TABLE IF NOT EXISTS consensus_snapshots (
      id bigserial PRIMARY KEY,
      consensus_time timestamptz NOT NULL UNIQUE,
      recorded_at timestamptz NOT NULL,
      confidence_pct double precision NOT NULL,
      estimate_json jsonb NOT NULL,
      explanation text NOT NULL
    );
    CREATE TABLE IF NOT EXISTS source_measurements (
      snapshot_id bigint NOT NULL REFERENCES consensus_snapshots(id) ON DELETE CASCADE,
      source text NOT NULL,
      observation_time timestamptz NOT NULL,
      observation_period text NOT NULL,
      variable text NOT NULL,
      value double precision NOT NULL,
      reference_value double precision,
      error double precision,
      absolute_error double precision,
      squared_error double precision,
      PRIMARY KEY (snapshot_id, source, variable)
    );
    CREATE INDEX IF NOT EXISTS idx_measurements_metrics
      ON source_measurements(source, variable, reference_value);
    CREATE TABLE IF NOT EXISTS forecast_predictions (
      source text NOT NULL,
      issued_at timestamptz NOT NULL,
      valid_for timestamptz NOT NULL,
      lead_hours double precision NOT NULL,
      variable text NOT NULL,
      predicted_value double precision NOT NULL,
      observed_value double precision,
      error double precision,
      absolute_error double precision,
      squared_error double precision,
      PRIMARY KEY (source, issued_at, valid_for, variable)
    );
    CREATE INDEX IF NOT EXISTS idx_forecast_resolution
      ON forecast_predictions(valid_for, observed_value);
    CREATE TABLE IF NOT EXISTS latest_source_observations (
      source text PRIMARY KEY,
      observation jsonb NOT NULL,
      observation_time timestamptz NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS external_calibration_measurements (
      source text NOT NULL,
      observation_date date NOT NULL,
      variable text NOT NULL,
      observed_value double precision NOT NULL,
      predicted_value double precision NOT NULL,
      error double precision NOT NULL,
      absolute_error double precision NOT NULL,
      squared_error double precision NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (source, observation_date, variable)
    );
    CREATE TABLE IF NOT EXISTS comarca_estimations (
      reference_date date PRIMARY KEY,
      generated_at timestamptz NOT NULL,
      payload jsonb NOT NULL
    );
    CREATE TABLE IF NOT EXISTS location_profiles (
      location_id text NOT NULL,
      version text NOT NULL,
      generated_at timestamptz NOT NULL,
      profile jsonb NOT NULL,
      is_active boolean NOT NULL DEFAULT true,
      PRIMARY KEY (location_id, version)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_location_profiles_active
      ON location_profiles(location_id) WHERE is_active;
  `).then(() => undefined);
  return schemaReady;
}

function sourceValues(source: SourceObservation | CurrentWeather) {
  return Object.fromEntries(variables.map((variable) => [variable, source[variable]])) as Record<
    (typeof variables)[number],
    number
  >;
}

function madridLocalToUtcIso(time: string) {
  const date = time.slice(0, 10);
  const middayUtc = new Date(`${date}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    timeZoneName: "longOffset",
  }).formatToParts(middayUtc);
  const offset = parts.find((part) => part.type === "timeZoneName")?.value.replace("GMT", "") || "+01:00";
  return new Date(`${time}${offset}`).toISOString();
}

async function persistOpenMeteoForecasts(client: PoolClient, payload: WeatherPayload) {
  const issued = new Date(payload.fetchedAt);
  issued.setUTCMinutes(0, 0, 0);
  const issuedAt = issued.toISOString();
  const hourly = payload.comparisonHourly;
  const rows: Array<[string, string, string, number, string, number]> = [];
  for (let index = 0; index < hourly.time.length; index += 1) {
    const validFor = madridLocalToUtcIso(hourly.time[index]);
    const leadHours = (Date.parse(validFor) - issued.getTime()) / 3_600_000;
    if (leadHours <= 0 || leadHours > 48) continue;
    const values = {
      temperatureC: hourly.temperatureC[index],
      humidityPct: hourly.humidityPct[index],
      precipitationMm: hourly.precipitationMm[index],
      windSpeedKmh: hourly.windSpeedKmh[index],
      windGustKmh: hourly.windGustKmh[index],
    };
    for (const variable of variables) {
      rows.push(["OPEN_METEO", issuedAt, validFor, leadHours, variable, values[variable]]);
    }
  }
  if (!rows.length) return;
  const params = rows.flat();
  const valuesSql = rows.map((_, index) => {
    const offset = index * 6;
    return `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5},$${offset + 6})`;
  }).join(",");
  await client.query(`
    INSERT INTO forecast_predictions (
      source, issued_at, valid_for, lead_hours, variable, predicted_value
    ) VALUES ${valuesSql}
    ON CONFLICT DO NOTHING
  `, params);
}

async function resolveForecastsWithAemet(client: PoolClient, aemet: SourceObservation | undefined) {
  if (!aemet) return;
  const reference = sourceValues(aemet);
  for (const variable of variables) {
    const observed = reference[variable];
    await client.query(`
      UPDATE forecast_predictions
      SET
        observed_value = $1,
        error = predicted_value - $1,
        absolute_error = ABS(predicted_value - $1),
        squared_error = POWER(predicted_value - $1, 2)
      WHERE valid_for = $2 AND variable = $3 AND observed_value IS NULL
    `, [observed, aemet.time, variable]);
  }
}

export async function persistConsensus(payload: WeatherPayload) {
  await ensureWeatherSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const snapshotResult = await client.query<{ id: string }>(`
      INSERT INTO consensus_snapshots (
        consensus_time, recorded_at, confidence_pct, estimate_json, explanation
      ) VALUES ($1, $2, $3, $4::jsonb, $5)
      ON CONFLICT(consensus_time) DO UPDATE SET
        recorded_at = excluded.recorded_at,
        confidence_pct = excluded.confidence_pct,
        estimate_json = excluded.estimate_json,
        explanation = excluded.explanation
      RETURNING id
    `, [
      payload.current.time,
      payload.fetchedAt,
      payload.confidencePct,
      JSON.stringify(payload.current),
      payload.confidenceExplanation,
    ]);
    const snapshotId = snapshotResult.rows[0].id;
    await client.query("DELETE FROM source_measurements WHERE snapshot_id = $1", [snapshotId]);

    const aemet = payload.sources.find((source) => source.source === "AEMET");
    const reference = aemet ? sourceValues(aemet) : null;
    const records: Array<{
      source: string;
      time: string;
      period: string;
      values: ReturnType<typeof sourceValues>;
    }> = payload.sources.map((source) => ({
      source: source.source,
      time: source.time,
      period: source.observationPeriod,
      values: sourceValues(source),
    }));
    records.push({
      source: "FUSED",
      time: payload.current.time,
      period: "current",
      values: sourceValues(payload.current),
    });

    const measurementRows: unknown[][] = [];
    for (const record of records) {
      for (const variable of variables) {
        const value = record.values[variable];
        const comparable = reference && record.period === "current" && record.source !== "AEMET";
        const referenceValue = comparable ? reference[variable] : null;
        const error = referenceValue == null ? null : value - referenceValue;
        measurementRows.push([
          snapshotId, record.source, record.time, record.period, variable, value,
          referenceValue, error, error == null ? null : Math.abs(error),
          error == null ? null : error * error,
        ]);
      }
    }
    const measurementParams = measurementRows.flat();
    const measurementValues = measurementRows.map((_, index) => {
      const offset = index * 10;
      return `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5},$${offset + 6},$${offset + 7},$${offset + 8},$${offset + 9},$${offset + 10})`;
    }).join(",");
    await client.query(`
      INSERT INTO source_measurements (
        snapshot_id, source, observation_time, observation_period, variable,
        value, reference_value, error, absolute_error, squared_error
      ) VALUES ${measurementValues}
    `, measurementParams);
    const sourceParams = payload.sources.flatMap((source) => [
      source.source,
      JSON.stringify(source),
      source.time,
    ]);
    const sourceValuesSql = payload.sources.map((_, index) => {
      const offset = index * 3;
      return `($${offset + 1},$${offset + 2}::jsonb,$${offset + 3})`;
    }).join(",");
    await client.query(`
      INSERT INTO latest_source_observations (source, observation, observation_time)
      VALUES ${sourceValuesSql}
      ON CONFLICT(source) DO UPDATE SET
        observation = excluded.observation,
        observation_time = excluded.observation_time,
        updated_at = now()
    `, sourceParams);
    await persistOpenMeteoForecasts(client, payload);
    await resolveForecastsWithAemet(client, aemet);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export type AemetRateLimitState = {
  lastFetchAt: number;
  cooldownUntil: number;
  lastFailureMessage: string | null;
};

export async function getAemetRateLimitState(): Promise<AemetRateLimitState | null> {
  await ensureWeatherSchema();
  const result = await getPool().query<{ observation: AemetRateLimitState }>(
    "SELECT observation FROM latest_source_observations WHERE source = 'AEMET_RATE_LIMIT'",
  );
  return result.rows[0]?.observation ?? null;
}

export async function setAemetRateLimitState(state: AemetRateLimitState) {
  await ensureWeatherSchema();
  await getPool().query(`
    INSERT INTO latest_source_observations (source, observation, observation_time)
    VALUES ('AEMET_RATE_LIMIT', $1::jsonb, now())
    ON CONFLICT(source) DO UPDATE SET
      observation = excluded.observation,
      observation_time = excluded.observation_time,
      updated_at = now()
  `, [JSON.stringify(state)]);
}

export async function clearAemetRateLimitState() {
  await ensureWeatherSchema();
  await getPool().query(
    "DELETE FROM latest_source_observations WHERE source = 'AEMET_RATE_LIMIT'",
  );
}

export type OpenMeteoRateLimitState = {
  lastFetchAt: number;
  cooldownUntil: number;
  lastFailureMessage: string | null;
};

export async function getOpenMeteoRateLimitState(): Promise<OpenMeteoRateLimitState | null> {
  await ensureWeatherSchema();
  const result = await getPool().query<{ observation: OpenMeteoRateLimitState }>(
    "SELECT observation FROM latest_source_observations WHERE source = 'OPEN_METEO_RATE_LIMIT'",
  );
  return result.rows[0]?.observation ?? null;
}

export async function setOpenMeteoRateLimitState(state: OpenMeteoRateLimitState) {
  await ensureWeatherSchema();
  await getPool().query(`
    INSERT INTO latest_source_observations (source, observation, observation_time)
    VALUES ('OPEN_METEO_RATE_LIMIT', $1::jsonb, now())
    ON CONFLICT(source) DO UPDATE SET
      observation = excluded.observation,
      observation_time = excluded.observation_time,
      updated_at = now()
  `, [JSON.stringify(state)]);
}

export async function clearOpenMeteoRateLimitState() {
  await ensureWeatherSchema();
  await getPool().query(
    "DELETE FROM latest_source_observations WHERE source = 'OPEN_METEO_RATE_LIMIT'",
  );
}

export async function upsertSourceObservation(observation: SourceObservation) {
  await ensureWeatherSchema();
  await getPool().query(`
    INSERT INTO latest_source_observations (source, observation, observation_time)
    VALUES ($1, $2::jsonb, $3)
    ON CONFLICT(source) DO UPDATE SET
      observation = excluded.observation,
      observation_time = excluded.observation_time,
      updated_at = now()
  `, [observation.source, JSON.stringify(observation), observation.time]);
}

export async function getLatestSourceObservation(source: SourceObservation["source"]) {
  await ensureWeatherSchema();
  const result = await getPool().query<{ observation: SourceObservation }>(
    "SELECT observation FROM latest_source_observations WHERE source = $1",
    [source],
  );
  return result.rows[0]?.observation ?? null;
}

export async function getConfidenceCalibration(): Promise<ConfidenceCalibration> {
  const { getConfidenceCalibration: impl } = await import("@/services/calibration/calibrationService");
  return impl();
}

export async function persistExternalCalibration(samples: ExternalCalibrationSample[]) {
  const { persistExternalCalibration: impl } = await import("@/services/calibration/calibrationService");
  return impl(samples);
}

export async function persistComarcaEstimation(payload: ComarcaEstimationPayload) {
  await ensureWeatherSchema();
  await getPool().query(`
    INSERT INTO comarca_estimations (reference_date, generated_at, payload)
    VALUES ($1, $2, $3::jsonb)
    ON CONFLICT(reference_date) DO UPDATE SET
      generated_at = excluded.generated_at,
      payload = excluded.payload
  `, [payload.anchorDate, payload.generatedAt, JSON.stringify(payload)]);
}

export async function getLatestComarcaEstimation() {
  await ensureWeatherSchema();
  const result = await getPool().query<{ payload: ComarcaEstimationPayload }>(`
    SELECT payload FROM comarca_estimations ORDER BY reference_date DESC LIMIT 1
  `);
  return result.rows[0]?.payload ?? null;
}

export async function persistGeographicProfiles(profiles: GeographicProfile[]) {
  const { persistGeographicProfiles: repo } = await import("@/services/layers/geographicRepository");
  return repo(profiles);
}

export async function getLatestGeographicProfiles() {
  const { getLatestGeographicProfiles: repo } = await import("@/services/layers/geographicRepository");
  return repo();
}

export async function updateGeographicProfiles(profiles: GeographicProfile[]) {
  await persistGeographicProfiles(profiles);
}

export async function getSourceMetrics() {
  await ensureWeatherSchema();
  const db = getPool();
  const [snapshots, simultaneous, external, forecasts, pending, confidenceCalibration] = await Promise.all([
    db.query("SELECT COUNT(*)::int AS count FROM consensus_snapshots"),
    db.query(`
      SELECT source, variable, COUNT(*)::int AS "sampleCount",
        AVG(absolute_error) AS mae, AVG(error) AS bias,
        SQRT(AVG(squared_error)) AS rmse
      FROM source_measurements WHERE reference_value IS NOT NULL
      GROUP BY source, variable ORDER BY source, variable
    `),
    db.query(`
      SELECT source, variable, COUNT(*)::int AS "sampleCount",
        AVG(absolute_error) AS mae, AVG(error) AS bias,
        SQRT(AVG(squared_error)) AS rmse
      FROM external_calibration_measurements
      GROUP BY source, variable ORDER BY source, variable
    `),
    db.query(`
      SELECT source, variable, COUNT(*)::int AS "sampleCount",
        AVG(lead_hours) AS "averageLeadHours", AVG(absolute_error) AS mae,
        AVG(error) AS bias, SQRT(AVG(squared_error)) AS rmse
      FROM forecast_predictions WHERE observed_value IS NOT NULL
      GROUP BY source, variable ORDER BY source, variable
    `),
    db.query("SELECT COUNT(*)::int AS count FROM forecast_predictions WHERE observed_value IS NULL"),
    getConfidenceCalibration(),
  ]);
  return {
    snapshotCount: snapshots.rows[0].count,
    referenceSource: "AEMET",
    simultaneousMetrics: simultaneous.rows,
    externalCalibrationMetrics: external.rows,
    forecastMetrics: forecasts.rows,
    pendingForecastMeasurements: pending.rows[0].count,
    confidenceCalibration,
  };
}
