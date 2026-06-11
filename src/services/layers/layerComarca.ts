import { fetchRiaDaily, getLatestRiaRecord } from "./riaClient";
import { fetchOpenMeteoArchive, indexArchiveByDate } from "./openMeteoArchiveClient";
import { loadAemetState } from "./aemetState";
import { applyAltitudeCorrection } from "./altitudeCorrection";
import type { SourceObservation } from "@/types/weather";
import type { ComarcaEstimationPayload, ComarcaEstimate, LayerComarca, LayerComarcaOptions } from "./layerComarca.types";

const places = [
  { id: "puebla-don-fadrique", name: "Puebla de Don Fadrique", latitude: 37.8758, longitude: -2.3817 },
  { id: "huescar", name: "Huéscar", latitude: 37.811, longitude: -2.5412 },
  { id: "castril", name: "Castril", latitude: 37.7956, longitude: -2.7807 },
  { id: "galera", name: "Galera", latitude: 37.7425, longitude: -2.5519 },
  { id: "orce", name: "Orce", latitude: 37.7211, longitude: -2.4775 },
  { id: "castillejar", name: "Castilléjar", latitude: 37.7147, longitude: -2.6406 },
] as const;

const AEMET_HUESCAR = { latitude: 37.8082, longitude: -2.543 };

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function haversineKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const radius = 6371;
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = toRadians(b.latitude - a.latitude);
  const longitudeDelta = toRadians(b.longitude - a.longitude);
  const latitudeA = toRadians(a.latitude);
  const latitudeB = toRadians(b.latitude);
  const h = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}

type TrendCorrection = {
  temperatureC: number;
  humidityPct: number;
  precipitationMm: number;
  windSpeedKmh: number;
  windGustKmh: number;
  solarRadiationMjM2: number;
  et0Mm: number;
};

function computeTrendCorrection(
  riaObserved: { tempMedia: number; humedadMedia: number; precipitacion: number; velViento: number; velVientoMax: number; radiacion: number; et0: number },
  omModeled: { temperatureC: number; humidityPct: number; precipitationMm: number; windSpeedKmh: number; windGustKmh: number; solarRadiationMjM2?: number; et0Mm?: number },
): TrendCorrection {
  const omRad = omModeled.solarRadiationMjM2 ?? 0;
  const omEt0 = omModeled.et0Mm ?? 0;
  return {
    temperatureC: riaObserved.tempMedia - omModeled.temperatureC,
    humidityPct: riaObserved.humedadMedia - omModeled.humidityPct,
    precipitationMm: riaObserved.precipitacion - omModeled.precipitationMm,
    windSpeedKmh: (riaObserved.velViento * 3.6) - omModeled.windSpeedKmh,
    windGustKmh: (riaObserved.velVientoMax * 3.6) - omModeled.windGustKmh,
    solarRadiationMjM2: riaObserved.radiacion - omRad,
    et0Mm: riaObserved.et0 - omEt0,
  };
}

function applyTrendCorrection(
  anchorValue: number,
  spatialDelta: number,
  trendCorrection: number,
  trendAgeDays: number | null,
): number {
  const maxTrendWeight = 0.6;
  const decayPerDay = 0.08;
  const trendWeight = trendAgeDays == null
    ? 0
    : maxTrendWeight * Math.max(0, 1 - trendAgeDays * decayPerDay);
  return anchorValue + spatialDelta + trendCorrection * trendWeight;
}

export async function getComarcaEstimates(options: LayerComarcaOptions = {}): Promise<ComarcaEstimationPayload> {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 45);
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);

  const aemetState = await loadAemetState();
  let anchorAemet: SourceObservation | null = aemetState.observation ?? null;
  if (anchorAemet && anchorAemet.elevationM != null) {
    anchorAemet = applyAltitudeCorrection(anchorAemet, 953);
  }
  const anchorAemetTemperature = anchorAemet?.temperatureC ?? null;
  const anchorAemetHumidity = anchorAemet?.humidityPct ?? null;
  const anchorAemetWind = anchorAemet?.windSpeedKmh ?? null;
  const anchorAemetWindGust = anchorAemet?.windGustKmh ?? null;
  const anchorAemetPrecip = anchorAemet?.precipitationMm ?? null;

  const [riaRecords, archiveMaps] = await Promise.all([
    fetchRiaDaily(startStr, endStr, { signal: options.signal }),
    Promise.all(
      places.map((place) =>
        fetchOpenMeteoArchive({
          latitude: place.latitude,
          longitude: place.longitude,
          startDate: startStr,
          endDate: endStr,
          signal: options.signal,
        }).then((raw) => indexArchiveByDate(raw)),
      ),
    ),
  ]);

  const ria = getLatestRiaRecord(riaRecords);
  const riaAgeDays = Math.max(0, Math.floor((Date.now() - Date.parse(`${ria.fecha}T12:00:00Z`)) / 86_400_000));
  const anchorPlace = places[0];
  const anchorMap = archiveMaps[0];
  const riaArchivedDay = anchorMap.get(ria.fecha) ?? {
    date: ria.fecha,
    temperatureC: NaN,
    humidityPct: NaN,
    precipitationMm: NaN,
    windSpeedKmh: NaN,
    windGustKmh: NaN,
    solarRadiationMjM2: NaN,
    et0Mm: NaN,
  };
  const trend = computeTrendCorrection(ria, riaArchivedDay);

  const estimates = places.map((place, index): ComarcaEstimate => {
    const modelToday = archiveMaps[index].get(endStr);
    const modelAnchorToday = anchorMap.get(endStr);
    const modelRiaDay = archiveMaps[index].get(ria.fecha);
    const modelAnchorRiaDay = anchorMap.get(ria.fecha);

    const spatialDeltaTemp = (modelToday && modelAnchorToday)
      ? modelToday.temperatureC - modelAnchorToday.temperatureC
      : (modelRiaDay && modelAnchorRiaDay)
        ? modelRiaDay.temperatureC - modelAnchorRiaDay.temperatureC
        : 0;

    const spatialDeltaHumidity = (modelToday && modelAnchorToday)
      ? modelToday.humidityPct - modelAnchorToday.humidityPct
      : (modelRiaDay && modelAnchorRiaDay)
        ? modelRiaDay.humidityPct - modelAnchorRiaDay.humidityPct
        : 0;

    const spatialDeltaWind = (modelToday && modelAnchorToday)
      ? modelToday.windSpeedKmh - modelAnchorToday.windSpeedKmh
      : (modelRiaDay && modelAnchorRiaDay)
        ? modelRiaDay.windSpeedKmh - modelAnchorRiaDay.windSpeedKmh
        : 0;

    const spatialDeltaGust = (modelToday && modelAnchorToday)
      ? modelToday.windGustKmh - modelAnchorToday.windGustKmh
      : (modelRiaDay && modelAnchorRiaDay)
        ? modelRiaDay.windGustKmh - modelAnchorRiaDay.windGustKmh
        : 0;

    const distanceFromAemetKm = haversineKm(AEMET_HUESCAR, place);

    const hasAnchor = anchorAemetTemperature != null;
    const tempEstimate = hasAnchor
      ? applyTrendCorrection(anchorAemetTemperature!, spatialDeltaTemp, trend.temperatureC, riaAgeDays)
      : ria.tempMedia + spatialDeltaTemp;

    const humidityEstimate = anchorAemetHumidity != null
      ? clamp(applyTrendCorrection(anchorAemetHumidity!, spatialDeltaHumidity, trend.humidityPct, riaAgeDays), 0, 100)
      : clamp(ria.humedadMedia + spatialDeltaHumidity, 0, 100);

    const windEstimate = anchorAemetWind != null
      ? Math.max(0, applyTrendCorrection(anchorAemetWind!, spatialDeltaWind, trend.windSpeedKmh, riaAgeDays))
      : Math.max(0, ria.velViento * 3.6 + spatialDeltaWind);

    const gustEstimate = anchorAemetWindGust != null
      ? Math.max(0, applyTrendCorrection(anchorAemetWindGust!, spatialDeltaGust, trend.windGustKmh, riaAgeDays))
      : Math.max(0, ria.velVientoMax * 3.6 + spatialDeltaGust);

    const precipEstimate = anchorAemetPrecip != null
      ? Math.max(0, anchorAemetPrecip! + spatialDeltaPrecip(archiveMaps, index, anchorMap, ria) + trend.precipitationMm * (riaAgeDays != null ? Math.max(0, 0.6 - riaAgeDays * 0.08) : 0))
      : Math.max(0, ria.precipitacion + spatialDeltaPrecip(archiveMaps, index, anchorMap, ria));

    const solarEstimate = modelToday?.solarRadiationMjM2 ?? modelRiaDay?.solarRadiationMjM2 ?? 0;
    const et0Estimate = modelToday?.et0Mm ?? modelRiaDay?.et0Mm ?? 0;

    const anchorAgeHours = anchorAemet ? Math.round((Date.now() - Date.parse(anchorAemet.time)) / 3_600_000) : null;
    const confidenceFromAnchor = anchorAemet ? Math.max(0.4, 1 - (anchorAgeHours ?? 3) * 0.02) : 0.35;
    const confidenceFromTrend = Math.max(0, 0.4 - riaAgeDays * 0.06);
    const distanceFactor = Math.max(0, 1 - distanceFromAemetKm * 0.03);
    const confidencePct = Math.round(clamp(
      (confidenceFromAnchor + confidenceFromTrend) * distanceFactor * 100,
      30,
      92,
    ));

    return {
      id: place.id,
      name: place.name,
      latitude: place.latitude,
      longitude: place.longitude,
      elevationM: modelToday?.temperatureC != null ? 0 : 0,
      distanceFromAemetKm: Math.round(distanceFromAemetKm * 10) / 10,
      confidencePct,
      values: {
        temperatureC: round(tempEstimate),
        humidityPct: round(humidityEstimate),
        precipitationMm: round(precipEstimate, 2),
        windSpeedKmh: round(windEstimate),
        windGustKmh: round(gustEstimate),
        solarRadiationMjM2: round(solarEstimate, 2),
        et0Mm: round(et0Estimate, 2),
      },
    };
  });

  return {
    anchorSource: "AEMET_5051X",
    trendSource: "RIA_PUEBLA_GR02",
    anchorDate: anchorAemet?.time ?? end.toISOString(),
    trendDate: ria.fecha,
    trendAgeDays: riaAgeDays,
    generatedAt: new Date().toISOString(),
    methodology: anchorAemetTemperature != null
      ? "Ancla AEMET en tiempo real + corrección de tendencia RIA (observación agrícola con ~5 días de retraso) + diferencia espacial modelizada."
      : "Sin ancla AEMET disponible; estimación basada en observación RIA reciente + diferencia espacial modelizada (mayor incertidumbre).",
    estimates,
  };
}

function spatialDeltaPrecip(
  archiveMaps: Map<string, { precipitationMm: number }>[],
  index: number,
  anchorMap: Map<string, { precipitationMm: number }>,
  ria: { fecha: string },
): number {
  const modelToday = archiveMaps[index].get(new Date().toISOString().slice(0, 10));
  const modelAnchorToday = anchorMap.get(new Date().toISOString().slice(0, 10));
  if (modelToday && modelAnchorToday && modelAnchorToday.precipitationMm >= 0.1) {
    return modelToday.precipitationMm - modelAnchorToday.precipitationMm;
  }
  const modelRiaDay = archiveMaps[index].get(ria.fecha);
  const modelAnchorRiaDay = anchorMap.get(ria.fecha);
  if (modelRiaDay && modelAnchorRiaDay && modelAnchorRiaDay.precipitationMm >= 0.1) {
    return modelRiaDay.precipitationMm - modelAnchorRiaDay.precipitationMm;
  }
  return 0;
}

export async function getComarcaLayer(options: LayerComarcaOptions = {}): Promise<LayerComarca> {
  const payload = await getComarcaEstimates(options);
  const ageDays = payload.trendAgeDays ?? 99;
  return {
    meta: {
      generatedAt: payload.generatedAt,
      status: ageDays <= 2 ? "OK" : ageDays <= 5 ? "DEGRADED" : "ERROR",
      warnings: ageDays > 2 ? [`Corrección RIA con ${ageDays} días de antigüedad; ancla AEMET en tiempo real.`] : [],
    },
    reference: {
      source: payload.trendSource,
      date: payload.trendDate ?? "",
      ageDays,
    },
    methodology: payload.methodology,
    estimates: payload.estimates,
    generatedAt: payload.generatedAt,
  };
}

export { places };
export { haversineKm, clamp, round };