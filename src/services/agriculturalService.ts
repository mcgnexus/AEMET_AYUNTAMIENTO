import type { HourlyWeather, DailyWeather } from "@/types/weather";

export type AgriculturalData = {
  et0AccumulatedWeekMm: number;
  et0AccumulatedMonthMm: number;
  et0DailyMm: number[];
  precipitationAccumulatedWeekMm: number;
  precipitationAccumulatedMonthMm: number;
  growingDegreeDays: number[];
  gddAccumulated: number;
  chillHours: number;
  chillHoursPartial: number[];
  frostRisk48h: FrostRisk[];
  heatStressDays: number;
  fieldWorkability: FieldWorkability[];
};

export type FrostRisk = {
  date: string;
  minTempC: number;
  probability: "baja" | "media" | "alta" | "muy_alta";
  hoursBelow0: number;
};

export type FieldWorkability = {
  date: string;
  workable: boolean;
  reason: string;
};

const BASE_TEMP_GDD = 10;
const BASE_TEMP_CHILL = 7;

export function calculateAgriculturalData(
  hourly: HourlyWeather,
  daily: DailyWeather,
): AgriculturalData {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  const et0Daily = daily.et0Mm.length > 0 ? daily.et0Mm : [];
  const et0Week = et0Daily.slice(0, 7).reduce((s, v) => s + (v || 0), 0);
  const et0Month = et0Daily.reduce((s, v) => s + (v || 0), 0);

  const precipDaily = daily.precipitationSumMm.length > 0 ? daily.precipitationSumMm : [];
  const precipWeek = precipDaily.slice(0, 7).reduce((s, v) => s + (v || 0), 0);
  const precipMonth = precipDaily.reduce((s, v) => s + (v || 0), 0);

  const gdd = daily.time.map((_, i) => {
    const tMax = daily.temperatureMaxC[i] ?? 0;
    const tMin = daily.temperatureMinC[i] ?? 0;
    const avg = (tMax + tMin) / 2;
    return Math.max(0, avg - BASE_TEMP_GDD);
  });
  const gddAccumulated = gdd.reduce((s, v) => s + v, 0);

  const chillPartial: number[] = [];
  let totalChill = 0;
  const hoursPerDay = 24;
  const daysWithHourly = Math.min(
    hourly.time.length,
    daily.time.length * hoursPerDay
  );

  for (let dayIdx = 0; dayIdx < daily.time.length; dayIdx++) {
    let dayChill = 0;
    for (let h = 0; h < hoursPerDay; h++) {
      const hourIdx = dayIdx * hoursPerDay + h;
      if (hourIdx < hourly.temperatureC.length) {
        const t = hourly.temperatureC[hourIdx];
        if (t != null && t >= -2 && t <= BASE_TEMP_CHILL) {
          dayChill++;
          totalChill++;
        }
      }
    }
    chillPartial.push(dayChill);
  }

  const frostRisk: FrostRisk[] = daily.time.slice(0, 2).map((date, i) => {
    const tMin = daily.temperatureMinC[i] ?? 20;
    let hoursBelow = 0;
    for (let h = 0; h < hoursPerDay; h++) {
      const hourIdx = i * hoursPerDay + h;
      if (hourIdx < hourly.temperatureC.length) {
        const t = hourly.temperatureC[hourIdx];
        if (t != null && t < 0) hoursBelow++;
      }
    }

    let probability: FrostRisk["probability"] = "baja";
    if (tMin < -4) probability = "muy_alta";
    else if (tMin < -1) probability = "alta";
    else if (tMin < 2) probability = "media";

    return { date, minTempC: tMin, probability, hoursBelow0: hoursBelow };
  });

  const heatStressDays = daily.temperatureMaxC.filter(
    (t) => t != null && t > 35
  ).length;

  const fieldWorkability: FieldWorkability[] = daily.time.map((date, i) => {
    const precip = precipDaily[i] ?? 0;
    const gusts = daily.windGustKmh[i] ?? 0;
    const tMin = daily.temperatureMinC[i] ?? 0;

    if (tMin < -5) return { date, workable: false, reason: "Helada severa" };
    if (precip > 15) return { date, workable: false, reason: "Lluvia abundante" };
    if (gusts > 70) return { date, workable: false, reason: "Viento fuerte" };
    if (precip > 5 && precip <= 15)
      return { date, workable: false, reason: "Lluvia moderada" };
    if (gusts > 50)
      return { date, workable: false, reason: "Rachas de viento" };
    return { date, workable: true, reason: "Condiciones adecuadas" };
  });

  return {
    et0AccumulatedWeekMm: Math.round(et0Week * 10) / 10,
    et0AccumulatedMonthMm: Math.round(et0Month * 10) / 10,
    et0DailyMm: et0Daily.map((v) => Math.round((v || 0) * 10) / 10),
    precipitationAccumulatedWeekMm: Math.round(precipWeek * 10) / 10,
    precipitationAccumulatedMonthMm: Math.round(precipMonth * 10) / 10,
    growingDegreeDays: gdd.map((v) => Math.round(v * 10) / 10),
    gddAccumulated: Math.round(gddAccumulated * 10) / 10,
    chillHours: totalChill,
    chillHoursPartial: chillPartial,
    frostRisk48h: frostRisk,
    heatStressDays,
    fieldWorkability,
  };
}
