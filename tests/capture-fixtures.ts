// Captura fixtures reales de los endpoints externos para tests unitarios
import { writeFileSync, mkdirSync } from "node:fs";

const HUESCAR_LAT = 37.811;
const HUESCAR_LON = -2.5412;
const PUEBLA_LAT = 37.8758;
const PUEBLA_LON = -2.3817;
const RIA_ENDPOINT = "https://www.juntadeandalucia.es/agriculturaypesca/ifapa/riaws/datosdiarios/18/2";

mkdirSync("tests/fixtures", { recursive: true });

async function capture(name: string, url: string, headers: Record<string, string> = {}) {
  try {
    const r = await fetch(url, { headers: { "user-agent": "MeteoHuescar/1.0 (tests)", ...headers } });
    if (!r.ok) {
      writeFileSync(`tests/fixtures/${name}.error.txt`, `HTTP ${r.status} ${r.statusText}\n${await r.text().catch(() => "")}`);
      console.log(`✗ ${name} → ${r.status}`);
      return;
    }
    const data = await r.json();
    writeFileSync(`tests/fixtures/${name}.json`, JSON.stringify(data, null, 2));
    console.log(`✓ ${name} (${(JSON.stringify(data).length / 1024).toFixed(1)} KB)`);
  } catch (err) {
    writeFileSync(`tests/fixtures/${name}.error.txt`, `FETCH ERROR: ${err}`);
    console.log(`✗ ${name} → ${(err as Error).message}`);
  }
}

async function main() {
  const today = new Date();
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - 30);
  const startStr = start.toISOString().slice(0, 10);
  const endStr = today.toISOString().slice(0, 10);

  await capture(
    "openmeteo-forecast-huescar",
    `https://api.open-meteo.com/v1/forecast?latitude=${HUESCAR_LAT}&longitude=${HUESCAR_LON}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,shortwave_radiation,et0_fao_evapotranspiration&hourly=temperature_2m,relative_humidity_2m,precipitation,precipitation_probability,wind_speed_10m,wind_gusts_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_gusts_10m_max,et0_fao_evapotranspiration&forecast_days=7&past_days=1&timezone=Europe/Madrid`,
  );

  await capture(
    "openmeteo-archive-puebla",
    `https://archive-api.open-meteo.com/v1/archive?latitude=${PUEBLA_LAT}&longitude=${PUEBLA_LON}&start_date=${startStr}&end_date=${endStr}&daily=temperature_2m_mean,relative_humidity_2m_mean,precipitation_sum,wind_speed_10m_mean,wind_gusts_10m_max&wind_speed_unit=kmh&timezone=Europe/Madrid`,
  );

  await capture(
    "ria-puebla-30d",
    `${RIA_ENDPOINT}/${startStr}/${endStr}/true`,
  );

  console.log("\nFixtures guardadas en tests/fixtures/");
}

main().catch((e) => { console.error(e); process.exit(1); });
