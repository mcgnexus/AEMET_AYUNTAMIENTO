import {
  persistComarcaEstimation,
  persistConsensus,
  persistExternalCalibration,
} from "@/lib/weatherStore";
import { getComarcaEstimates } from "@/services/layers/layerComarca";
import { getRiaCalibrationSamples } from "@/services/calibration/riaCalibration";
import { getFusedHuescarWeather } from "@/services/weatherService";

export async function captureCurrentWeather(full = false) {
  const weather = await getFusedHuescarWeather();
  await persistConsensus(weather);
  if (full) {
    const riaSamples = await getRiaCalibrationSamples().catch(() => []);
    await persistExternalCalibration(riaSamples);
    const comarcaEstimation = await getComarcaEstimates().catch(() => null);
    if (comarcaEstimation) await persistComarcaEstimation(comarcaEstimation);
  }
  return weather;
}
