import type { CalibratedVariable } from "@/lib/weatherStore";
import { fetchRiaDaily } from "@/services/layers/riaClient";
import { fetchOpenMeteoArchive, indexArchiveByDate } from "@/services/layers/openMeteoArchiveClient";

const PUEBLA_DON_FADRIQUE = { latitude: 37.8758, longitude: -2.3817 };

export type ExternalCalibrationSample = {
  source: "RIA";
  date: string;
  values: Partial<Record<CalibratedVariable, { observed: number; predicted: number }>>;
};

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function getRiaCalibrationSamples(): Promise<ExternalCalibrationSample[]> {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 29);
  const startDate = dateOnly(start);
  const endDate = dateOnly(end);

  const [riaRecords, archive] = await Promise.all([
    fetchRiaDaily(startDate, endDate),
    fetchOpenMeteoArchive({
      latitude: PUEBLA_DON_FADRIQUE.latitude,
      longitude: PUEBLA_DON_FADRIQUE.longitude,
      startDate,
      endDate,
      variables: [
        "temperature_2m_mean",
        "relative_humidity_2m_mean",
        "precipitation_sum",
        "wind_speed_10m_mean",
        "wind_gusts_10m_max",
      ],
    }).then((raw) => indexArchiveByDate(raw)),
  ]);

  return riaRecords.flatMap((record) => {
    const model = archive.get(record.fecha);
    if (!model) return [];
    const sample: ExternalCalibrationSample = {
      source: "RIA" as const,
      date: record.fecha,
      values: {
        temperatureC: {
          observed: record.tempMedia,
          predicted: model.temperatureC,
        },
        humidityPct: {
          observed: record.humedadMedia,
          predicted: model.humidityPct,
        },
        precipitationMm: {
          observed: record.precipitacion,
          predicted: model.precipitationMm,
        },
        windSpeedKmh: {
          observed: record.velViento * 3.6,
          predicted: model.windSpeedKmh,
        },
        windGustKmh: {
          observed: record.velVientoMax * 3.6,
          predicted: model.windGustKmh,
        },
      },
    };
    return [sample];
  });
}

export { dateOnly };
