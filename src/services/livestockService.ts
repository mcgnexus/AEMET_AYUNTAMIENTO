export type LivestockData = {
  thiCurrent: number;
  thiHourly: ThiHourly[];
  stressLevel: StressLevel;
  stressLabel: string;
  recommendation: string;
  cattleAffected: CattleAffected;
};

export type ThiHourly = {
  time: string;
  thi: number;
  stress: StressLevel;
};

export type StressLevel = "ninguno" | "leve" | "moderado" | "severo" | "peligroso";

export type CattleAffected = {
  dairy: boolean;
  beef: boolean;
  sheep: boolean;
};

function calculateTHI(tempC: number, humidityPct: number): number {
  const rh = humidityPct / 100;
  const e = (rh * 0.611) * Math.exp((17.5 * tempC) / (241 + tempC));
  return tempC + 0.36 * e + 41.2;
}

function getStressLevel(thi: number): StressLevel {
  if (thi < 68) return "ninguno";
  if (thi < 72) return "leve";
  if (thi < 80) return "moderado";
  if (thi < 90) return "severo";
  return "peligroso";
}

function getStressLabel(level: StressLevel): string {
  switch (level) {
    case "ninguno": return "Sin estrés térmico";
    case "leve": return "Estrés térmico leve";
    case "moderado": return "Estrés térmico moderado";
    case "severo": return "Estrés térmico severo";
    case "peligroso": return "Peligro: estrés térmico extremo";
  }
}

function getRecommendation(level: StressLevel): string {
  switch (level) {
    case "ninguno": return "Condiciones óptimas para el ganado.";
    case "leve": return "Proporcionar sombra y agua abundante.";
    case "moderado": return "Incrementar ventilación, ofrecer agua fresca frecuentemente. Reducir actividad en horas centrales.";
    case "severo": return "Evitar manejo del ganado. Sistemas de refrigeración (aspersión). Movimiento solo en primeras/últimas horas del día.";
    case "peligroso": return "ALERTA: No manejar ganado. Refrigeración obligatoria. Vigilar signos de agotamiento. Consultar veterinario si hay síntomas.";
  }
}

export function calculateLivestockData(
  hourly: { time: string[]; temperatureC: number[]; humidityPct?: number[] },
  currentTempC: number,
  currentHumidityPct: number,
): LivestockData {
  const thiCurrent = calculateTHI(currentTempC, currentHumidityPct);
  const stressLevel = getStressLevel(thiCurrent);
  const cattleAffected: CattleAffected = {
    dairy: thiCurrent >= 68,
    beef: thiCurrent >= 72,
    sheep: thiCurrent >= 80,
  };

  const thiHourly: ThiHourly[] = [];
  const hoursCount = Math.min(hourly.time.length, 48);
  for (let i = 0; i < hoursCount; i++) {
    const t = hourly.temperatureC[i];
    const h = hourly.humidityPct?.[i] ?? currentHumidityPct;
    if (t == null) continue;
    const thi = calculateTHI(t, h);
    thiHourly.push({ time: hourly.time[i], thi: Math.round(thi * 10) / 10, stress: getStressLevel(thi) });
  }

  return {
    thiCurrent: Math.round(thiCurrent * 10) / 10,
    thiHourly,
    stressLevel,
    stressLabel: getStressLabel(stressLevel),
    recommendation: getRecommendation(stressLevel),
    cattleAffected,
  };
}
