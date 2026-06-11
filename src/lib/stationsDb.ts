import { Pool } from "pg";

let stationsPool: Pool | null = null;

export function getStationsPool() {
  if (stationsPool) return stationsPool;
  const connectionString = process.env.STATIONS_DATABASE_URL;
  if (!connectionString) throw new Error("STATIONS_DATABASE_URL no configurada");
  stationsPool = new Pool({
    connectionString,
    max: 3,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  return stationsPool;
}

export interface StationNode {
  id: string;
  nodeCode: string;
  name: string;
  locationName: string;
  crop: string;
  active: boolean;
}

export interface SensorReading {
  id: number;
  nodeId: string;
  measuredAt: Date;
  airTempC: number | null;
  airHumidityPct: number | null;
  pressureHpa: number | null;
  leafTempC: number | null;
  soilMoistureRaw: number | null;
  soilMoisturePct: number | null;
  batteryV: number | null;
  rssiDbm: number | null;
}

export async function getActiveNodes(): Promise<StationNode[]> {
  const pool = getStationsPool();
  const result = await pool.query(
    `SELECT id, node_code, name, location_name, crop, active
     FROM nodes WHERE active = true ORDER BY node_code`
  );
  return result.rows.map((r) => ({
    id: r.id,
    nodeCode: r.node_code,
    name: r.name,
    locationName: r.location_name,
    crop: r.crop,
    active: r.active,
  }));
}

export async function getLatestReadings(nodeIds: string[]): Promise<Map<string, SensorReading>> {
  if (nodeIds.length === 0) return new Map();
  const pool = getStationsPool();
  const result = await pool.query(
    `SELECT DISTINCT ON (node_id)
       id, node_id, measured_at, air_temp_c, air_humidity_pct,
       pressure_hpa, leaf_temp_c, soil_moisture_raw, soil_moisture_pct,
       battery_v, rssi_dbm
     FROM sensor_readings
     WHERE node_id = ANY($1)
     ORDER BY node_id, measured_at DESC`,
    [nodeIds]
  );
  const map = new Map<string, SensorReading>();
  for (const r of result.rows) {
    map.set(r.node_id, {
      id: r.id,
      nodeId: r.node_id,
      measuredAt: r.measured_at,
      airTempC: r.air_temp_c != null ? Number(r.air_temp_c) : null,
      airHumidityPct: r.air_humidity_pct != null ? Number(r.air_humidity_pct) : null,
      pressureHpa: r.pressure_hpa != null ? Number(r.pressure_hpa) : null,
      leafTempC: r.leaf_temp_c != null ? Number(r.leaf_temp_c) : null,
      soilMoistureRaw: r.soil_moisture_raw,
      soilMoisturePct: r.soil_moisture_pct != null ? Number(r.soil_moisture_pct) : null,
      batteryV: r.battery_v != null ? Number(r.battery_v) : null,
      rssiDbm: r.rssi_dbm,
    });
  }
  return map;
}
