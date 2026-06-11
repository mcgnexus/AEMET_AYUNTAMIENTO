import { getPool } from "@/lib/weatherStore";
import type {
  CalibratedVariable,
  ConfidenceCalibration,
  ExternalCalibrationSample,
} from "@/lib/weatherStore";

const variables: Array<CalibratedVariable> = [
  "temperatureC",
  "humidityPct",
  "precipitationMm",
  "windSpeedKmh",
  "windGustKmh",
];

const calibrationPriors: Record<CalibratedVariable, number> = {
  temperatureC: 1.5,
  humidityPct: 10,
  precipitationMm: 1,
  windSpeedKmh: 8,
  windGustKmh: 12,
};
const CALIBRATION_PRIOR_SAMPLES = 24;
const CALIBRATION_CACHE_MS = 900_000;

let calibrationCache: { value: ConfidenceCalibration; expiresAt: number } | null = null;

/**
 * Calcula el número efectivo de muestras RIA ponderadas por su frecuencia.
 *
 * RIA es una estación diaria (1 muestra/día). AEMET/Open-Meteo son horarias
 * (24 muestras/día). Para que la calibración no sobre-valore las muestras
 * horarias frente a las diarias, aplicamos un factor de ponderación:
 *
 *   effectiveSamples = rawCount * frequencyWeight
 *
 * frequencyWeight = 1/24 (≈ 0.0417) para RIA, pero usamos 0.25 como
 * compromiso práctico: es más conservador que 1/24 pero sigue dando
 * a RIA un peso real tras ~3 meses de operación (90 días × 0.25 = 22.5
 * muestras efectivas, comparable a ~1 día de AEMET).
 *
 * Con `riaCount = 90` (3 meses) y `period = 90`:
 *   effectiveRiaSamples = 90 × 0.25 = 22.5
 *   → Peso máximo aproximado: 22.5 / (90 + 24) ≈ 20%
 */
export function computeEffectiveRiaSamples(riaCount: number, period: number = 90): number {
  const frequencyWeight = 0.25;
  return riaCount * frequencyWeight;
}

export async function getConfidenceCalibration(): Promise<ConfidenceCalibration> {
  if (calibrationCache && calibrationCache.expiresAt > Date.now()) {
    return calibrationCache.value;
  }
  const db = getPool();
  const [aemetResult, riaResult] = await Promise.all([db.query<{
    variable: CalibratedVariable;
    sampleCount: number;
    mae: number | null;
  }>(`
    SELECT variable, COUNT(*)::int AS "sampleCount", AVG(absolute_error)::float8 AS mae
    FROM source_measurements
    WHERE source = 'OPEN_METEO'
      AND reference_value IS NOT NULL
      AND observation_period = 'current'
      AND observation_time >= now() - interval '90 days'
    GROUP BY variable
  `), db.query<{
    variable: CalibratedVariable;
    sampleCount: number;
    mae: number | null;
  }>(`
    SELECT variable, COUNT(*)::int AS "sampleCount", AVG(absolute_error)::float8 AS mae
    FROM external_calibration_measurements
    WHERE source = 'RIA' AND observation_date >= current_date - 90
    GROUP BY variable
  `)]);
  const aemetRows = new Map(aemetResult.rows.map((row) => [row.variable, row]));
  const riaRows = new Map(riaResult.rows.map((row) => [row.variable, row]));
  const calibration = Object.fromEntries(variables.map((variable) => {
    const prior = calibrationPriors[variable];
    const aemetRow = aemetRows.get(variable);
    const riaRow = riaRows.get(variable);
    const aemetSampleCount = Number(aemetRow?.sampleCount ?? 0);
    const riaSampleCount = Number(riaRow?.sampleCount ?? 0);
    const effectiveRiaSamples = computeEffectiveRiaSamples(riaSampleCount, 90);
    const sampleCount = aemetSampleCount + effectiveRiaSamples;
    const aemetMae = aemetRow?.mae == null ? null : Number(aemetRow.mae);
    const riaMae = riaRow?.mae == null ? null : Number(riaRow.mae);
    const historicalMae = sampleCount === 0
      ? null
      : ((aemetMae ?? 0) * aemetSampleCount + (riaMae ?? 0) * effectiveRiaSamples) / sampleCount;
    const historicalWeight = sampleCount / (sampleCount + CALIBRATION_PRIOR_SAMPLES);
    const blended = historicalMae == null
      ? prior
      : prior * (1 - historicalWeight) + historicalMae * historicalWeight;
    const tolerance = Math.max(prior * 0.5, Math.min(prior * 2, blended));
    return [variable, {
      historicalMae,
      sampleCount,
      aemetSampleCount,
      riaSampleCount,
      tolerance,
      historicalWeight,
    }];
  })) as ConfidenceCalibration;
  calibrationCache = { value: calibration, expiresAt: Date.now() + CALIBRATION_CACHE_MS };
  return calibration;
}

export async function persistExternalCalibration(samples: ExternalCalibrationSample[]) {
  if (!samples.length) return;
  const db = getPool();
  const rows = samples.flatMap((sample) => variables.flatMap((variable) => {
    const value = sample.values[variable];
    if (!value || !Number.isFinite(value.observed) || !Number.isFinite(value.predicted)) return [];
    const error = value.predicted - value.observed;
    return [[
      sample.source, sample.date, variable, value.observed, value.predicted,
      error, Math.abs(error), error * error,
    ]];
  }));
  if (!rows.length) return;
  const params = rows.flat();
  const valuesSql = rows.map((_, index) => {
    const offset = index * 8;
    return `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5},$${offset + 6},$${offset + 7},$${offset + 8})`;
  }).join(",");
  await db.query(`
    INSERT INTO external_calibration_measurements (
      source, observation_date, variable, observed_value, predicted_value,
      error, absolute_error, squared_error
    ) VALUES ${valuesSql}
    ON CONFLICT(source, observation_date, variable) DO UPDATE SET
      observed_value = excluded.observed_value,
      predicted_value = excluded.predicted_value,
      error = excluded.error,
      absolute_error = excluded.absolute_error,
      squared_error = excluded.squared_error,
      updated_at = now()
  `, params);
  calibrationCache = null;
}

export { calibrationCache };
