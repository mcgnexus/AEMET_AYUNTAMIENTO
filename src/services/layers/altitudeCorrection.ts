import type { SourceObservation } from "@/types/weather";

export const TEMPERATURE_LAPSE_RATE_C_PER_M = 0.006;

export type AltitudeCorrectionInput = {
  temperatureC: number;
  elevationM?: number;
  rawTemperatureC?: number;
  altitudeCorrectionC?: number;
};

export function applyAltitudeCorrection<T extends AltitudeCorrectionInput>(
  source: T,
  targetElevationM: number,
): T {
  if (source.elevationM == null) return source;
  const rawTemperatureC = source.rawTemperatureC ?? source.temperatureC;
  const altitudeCorrectionC =
    (source.elevationM - targetElevationM) * TEMPERATURE_LAPSE_RATE_C_PER_M;
  return {
    ...source,
    rawTemperatureC,
    altitudeCorrectionC,
    temperatureC: rawTemperatureC + altitudeCorrectionC,
  };
}

export function correctAemetTemperatureForHuescar(
  aemet: SourceObservation,
  huescarElevationM: number,
): SourceObservation {
  return applyAltitudeCorrection(aemet, huescarElevationM);
}
