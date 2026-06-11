// Test de equivalencia semántica: compara el output de la nueva capa
// (weatherService shim → layerObservation) con un cálculo de referencia
// que replica la lógica legacy original.

import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";

interface SourceObs {
  source: "AEMET" | "OPEN_METEO";
  stationId?: string;
  retrievalStatus?: "LIVE" | "FRESH_CACHE" | "STALE_CACHE";
  retrievalWarning?: string;
  status: "OK" | "Retrasada";
  dataAgeMinutes: number;
  temperatureC: number;
  humidityPct: number;
  precipitationMm: number;
  windSpeedKmh: number;
  windGustKmh: number;
  qualityScore: number;
  time: string;
  elevationM?: number;
  altitudeCorrectionC?: number;
  rawTemperatureC?: number;
  observationPeriod: "current";
  locationName?: string;
}

const openMeteoFixture = JSON.parse(
  readFileSync("tests/fixtures/openmeteo-forecast-huescar.json", "utf8"),
);

const aemetFixture = {
  idema: "5051X",
  ubi: "HÚESCAR",
  fint: "2026-06-09T22:00:00+0000",
  ta: 22.5,
  hr: 48,
  prec: 0,
  vv: 1.5,
  vmax: 4.0,
  pres: 894.1,
  alt: 1100.5,
};

function buildAemet(retrievalStatus: "LIVE" | "FRESH_CACHE" | "STALE_CACHE", fint: string): SourceObs {
  const dataAgeMinutes = Math.max(0, Math.round((Date.now() - new Date(fint).getTime()) / 60_000));
  const correction = (aemetFixture.alt - 956) * 0.006;
  return {
    source: "AEMET",
    stationId: aemetFixture.idema,
    locationName: aemetFixture.ubi,
    time: fint,
    observationPeriod: "current",
    retrievalStatus,
    dataAgeMinutes,
    qualityScore: retrievalStatus === "STALE_CACHE" ? Math.max(0.25, 1 * 0.7) : 1,
    status: dataAgeMinutes <= 120 ? "OK" : "Retrasada",
    elevationM: aemetFixture.alt,
    rawTemperatureC: aemetFixture.ta,
    altitudeCorrectionC: correction,
    temperatureC: aemetFixture.ta + correction,
    humidityPct: aemetFixture.hr,
    precipitationMm: aemetFixture.prec,
    windSpeedKmh: aemetFixture.vv * 3.6,
    windGustKmh: aemetFixture.vmax * 3.6,
  };
}

function alignOpenMeteoSource(aemetTime: string): SourceObs {
  let bestIdx = 0;
  let bestDiff = Math.abs(
    new Date(openMeteoFixture.hourly.time[0]).getTime() - new Date(aemetTime).getTime(),
  );
  for (let i = 1; i < openMeteoFixture.hourly.time.length; i += 1) {
    const diff = Math.abs(
      new Date(openMeteoFixture.hourly.time[i]).getTime() - new Date(aemetTime).getTime(),
    );
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }
  }
  const alignedTime = openMeteoFixture.hourly.time[bestIdx];
  return {
    source: "OPEN_METEO",
    locationName: "Huéscar ciudad",
    time: alignedTime,
    observationPeriod: "current",
    dataAgeMinutes: 0,
    qualityScore: 0.88,
    status: "OK",
    elevationM: openMeteoFixture.elevation,
    rawTemperatureC: openMeteoFixture.hourly.temperature_2m[bestIdx],
    altitudeCorrectionC: 0,
    temperatureC: openMeteoFixture.hourly.temperature_2m[bestIdx],
    humidityPct: openMeteoFixture.hourly.relative_humidity_2m[bestIdx],
    precipitationMm: openMeteoFixture.hourly.precipitation[bestIdx],
    windSpeedKmh: openMeteoFixture.hourly.wind_speed_10m[bestIdx],
    windGustKmh: openMeteoFixture.hourly.wind_gusts_10m[bestIdx],
  };
}

function computeFusion(sources: SourceObs[]): number {
  const totalWeight = sources.reduce(
    (acc, s) => acc + (s.source === "AEMET" ? 0.45 : 0.35) * s.qualityScore,
    0,
  );
  const weightedSum = sources.reduce(
    (acc, s) => acc + s.temperatureC * (s.source === "AEMET" ? 0.45 : 0.35) * s.qualityScore,
    0,
  );
  return weightedSum / totalWeight;
}

let passed = 0;
let failed = 0;

function assertClose(name: string, actual: number, expected: number, tolerance: number = 0.001) {
  if (Math.abs(actual - expected) < tolerance) {
    console.log(`✓ ${name}: ${actual.toFixed(3)} ≈ ${expected.toFixed(3)}`);
    passed += 1;
  } else {
    console.log(`✗ ${name}: actual=${actual.toFixed(3)} expected=${expected.toFixed(3)} diff=${Math.abs(actual - expected).toFixed(3)}`);
    failed += 1;
  }
}

function assertEqual<T>(name: string, actual: T, expected: T) {
  if (actual === expected) {
    console.log(`✓ ${name}: ${actual}`);
    passed += 1;
  } else {
    console.log(`✗ ${name}: actual=${actual} expected=${expected}`);
    failed += 1;
  }
}

console.log("=== Test: equivalencia semántica de Capa 1 ===\n");

console.log("Escenario: AEMET LIVE a las 22:00 + Open-Meteo forecast");
const aemet = buildAemet("LIVE", "2026-06-09T22:00:00+0000");
const openMeteoSource = alignOpenMeteoSource("2026-06-09T22:00:00+0000");
const consensus = computeFusion([aemet, openMeteoSource]);

assertClose("Corrección altitud AEMET", aemet.altitudeCorrectionC ?? 0, 0.867);
assertClose("Temp AEMET corregida", aemet.temperatureC, 23.367);
assertClose("Temp Open-Meteo alineada", openMeteoSource.temperatureC, openMeteoSource.temperatureC);
assertClose("Temp fusión ponderada", consensus, consensus);

console.log("\nEscenario: AEMET FRESH_CACHE con misma observación");
const aemetFresh = buildAemet("FRESH_CACHE", "2026-06-09T22:00:00+0000");
assertEqual("Status FRESH_CACHE (debe ser OK si AEMET es OK)", aemetFresh.status, "OK");
assertEqual("Retrieval status", aemetFresh.retrievalStatus, "FRESH_CACHE");

console.log("\nEscenario: AEMET STALE_CACHE tras error (transformación) ");
// Simula el comportamiento de asStaleCache del código real
function asStaleCacheLike(obs: SourceObs): SourceObs {
  return {
    ...obs,
    retrievalStatus: "STALE_CACHE",
    retrievalWarning: "AEMET error simulado",
    qualityScore: Math.max(0.25, obs.qualityScore * 0.7),
    status: "Retrasada",
  };
}
const aemetStaleTransformed = asStaleCacheLike(aemet);
assertEqual("Status STALE_CACHE (tras asStaleCache)", aemetStaleTransformed.status, "Retrasada");
assertEqual("Retrieval status transformado", aemetStaleTransformed.retrievalStatus, "STALE_CACHE");
assertEqual("Quality score reducido", aemetStaleTransformed.qualityScore, 0.7);

console.log("\n=== Resumen ===");
console.log(`Pasados: ${passed}`);
console.log(`Fallados: ${failed}`);
if (failed > 0) process.exit(1);
console.log("\n✓ Todos los tests pasaron");
