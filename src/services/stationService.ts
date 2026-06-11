import { getActiveNodes, getLatestReadings, type SensorReading } from "@/lib/stationsDb";
import type { CurrentWeather } from "@/types/weather";

export type StationAlert = {
  type: "frost" | "drought" | "low_battery" | "weak_signal" | "high_temp";
  level: "aviso" | "peligro";
  title: string;
  message: string;
  value: number;
  threshold: number;
};

export type StationComparison = {
  metric: string;
  stationValue: number;
  aemetValue: number;
  diff: number;
  unit: string;
};

export type StationData = {
  nodeCode: string;
  name: string;
  locationName: string;
  crop: string;
  reading: SensorReading;
  ageMinutes: number;
  alerts: StationAlert[];
  comparison: StationComparison[];
};

// --- Alert thresholds ---
const FROST_THRESHOLD_C = 0;
const DROUGHT_THRESHOLD_PCT = 20;
const LOW_BATTERY_THRESHOLD_V = 3.3;
const WEAK_SIGNAL_THRESHOLD_DBM = -80;
const HIGH_TEMP_THRESHOLD_C = 40;

function detectAlerts(r: SensorReading): StationAlert[] {
  const alerts: StationAlert[] = [];

  if (r.leafTempC != null && r.leafTempC < FROST_THRESHOLD_C) {
    alerts.push({
      type: "frost",
      level: r.leafTempC < -3 ? "peligro" : "aviso",
      title: "Helada",
      message: `Temp. hoja ${r.leafTempC.toFixed(1)}°C`,
      value: r.leafTempC,
      threshold: FROST_THRESHOLD_C,
    });
  }

  if (r.airTempC != null && r.airTempC >= HIGH_TEMP_THRESHOLD_C) {
    alerts.push({
      type: "high_temp",
      level: r.airTempC >= 45 ? "peligro" : "aviso",
      title: "Temperatura extrema",
      message: `Temp. aire ${r.airTempC.toFixed(1)}°C`,
      value: r.airTempC,
      threshold: HIGH_TEMP_THRESHOLD_C,
    });
  }

  if (r.soilMoisturePct != null && r.soilMoisturePct < DROUGHT_THRESHOLD_PCT) {
    alerts.push({
      type: "drought",
      level: r.soilMoisturePct < 10 ? "peligro" : "aviso",
      title: "Sequía suelo",
      message: `Humedad suelo ${r.soilMoisturePct.toFixed(0)}%`,
      value: r.soilMoisturePct,
      threshold: DROUGHT_THRESHOLD_PCT,
    });
  }

  if (r.batteryV != null && r.batteryV < LOW_BATTERY_THRESHOLD_V) {
    alerts.push({
      type: "low_battery",
      level: "aviso",
      title: "Batería baja",
      message: `${r.batteryV.toFixed(2)}V`,
      value: r.batteryV,
      threshold: LOW_BATTERY_THRESHOLD_V,
    });
  }

  if (r.rssiDbm != null && r.rssiDbm < WEAK_SIGNAL_THRESHOLD_DBM) {
    alerts.push({
      type: "weak_signal",
      level: "aviso",
      title: "Señal débil",
      message: `${r.rssiDbm} dBm`,
      value: r.rssiDbm,
      threshold: WEAK_SIGNAL_THRESHOLD_DBM,
    });
  }

  return alerts;
}

function compareWithAemet(r: SensorReading, aemet: CurrentWeather | null): StationComparison[] {
  if (!aemet) return [];
  const comp: StationComparison[] = [];

  if (r.airTempC != null) {
    comp.push({
      metric: "Temperatura",
      stationValue: r.airTempC,
      aemetValue: aemet.temperatureC,
      diff: r.airTempC - aemet.temperatureC,
      unit: "°C",
    });
  }

  if (r.airHumidityPct != null) {
    comp.push({
      metric: "Humedad",
      stationValue: r.airHumidityPct,
      aemetValue: aemet.humidityPct,
      diff: r.airHumidityPct - aemet.humidityPct,
      unit: "%",
    });
  }

  if (r.pressureHpa != null && aemet.solarRadiationWm2 > 0) {
    // AEMET doesn't always provide pressure; compare if available
    // We use a placeholder for now
  }

  return comp;
}

export async function getStationData(
  aemetCurrent: CurrentWeather | null
): Promise<StationData[]> {
  const nodes = await getActiveNodes();
  if (nodes.length === 0) return [];

  const nodeIds = nodes.map((n) => n.id);
  const readings = await getLatestReadings(nodeIds);
  const now = Date.now();

  return nodes.map((node) => {
    const reading = readings.get(node.id);
    if (!reading) {
      return {
        nodeCode: node.nodeCode,
        name: node.name,
        locationName: node.locationName,
        crop: node.crop,
        reading: {
          id: 0,
          nodeId: node.id,
          measuredAt: new Date(0),
          airTempC: null,
          airHumidityPct: null,
          pressureHpa: null,
          leafTempC: null,
          soilMoistureRaw: null,
          soilMoisturePct: null,
          batteryV: null,
          rssiDbm: null,
        },
        ageMinutes: Infinity,
        alerts: [],
        comparison: [],
      };
    }

    const ageMinutes = Math.round(
      (now - new Date(reading.measuredAt).getTime()) / 60_000
    );

    return {
      nodeCode: node.nodeCode,
      name: node.name,
      locationName: node.locationName,
      crop: node.crop,
      reading,
      ageMinutes,
      alerts: detectAlerts(reading),
      comparison: compareWithAemet(reading, aemetCurrent),
    };
  });
}
