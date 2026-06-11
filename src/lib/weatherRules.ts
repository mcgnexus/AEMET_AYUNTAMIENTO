import type { CurrentWeather, WeatherAlert, HourlyWeather } from "@/types/weather";

export function calculateModelConfidence(current: CurrentWeather) {
  let confidence = 58;
  if (current.weatherCode >= 80) confidence -= 8;
  if (current.windGustKmh >= 40) confidence -= 3;
  if (current.precipitationMm > 0) confidence -= 5;
  return Math.max(40, confidence);
}

export type StormHour = {
  time: string;
  probability: number;
  isThunderstorm: boolean;
};

export type ImminentAlert = {
  emoji: string;
  title: string;
  timeRange: string;
  intensity: string;
  probability: number;
  severity: "aviso" | "peligro";
};

export function detectStormHours(hourly: HourlyWeather): StormHour[] {
  return hourly.time
    .map((t, i) => ({
      time: t.slice(11, 16),
      probability: hourly.precipitationProbabilityPct[i],
      code: hourly.weatherCode[i],
      precip: hourly.precipitationMm[i],
      windGust: hourly.windSpeedKmh[i],
    }))
    .filter(h => h.code >= 95 || h.probability >= 40 || h.precip >= 3 || h.windGust >= 50)
    .map(h => ({
      time: h.time,
      probability: h.probability,
      isThunderstorm: h.code >= 95,
    }));
}

export function findImminentAlert(hourly: HourlyWeather): ImminentAlert | null {
  const now = new Date();
  const currentHour = now.getHours();

  const upcoming = hourly.time
    .map((t, i) => {
      const hour = parseInt(t.slice(11, 13), 10);
      return {
        hour,
        time: t.slice(11, 16),
        code: hourly.weatherCode[i],
        precip: hourly.precipitationMm[i],
        prob: hourly.precipitationProbabilityPct[i],
        wind: hourly.windSpeedKmh[i],
      };
    })
    .filter(h => h.hour >= currentHour)
    .slice(0, 12);

  if (upcoming.length === 0) return null;

  let best: ImminentAlert | null = null;
  let bestScore = 0;

  for (const h of upcoming) {
    let score = 0;
    let emoji = "";
    let title = "";
    let intensity = "";
    let severity: "aviso" | "peligro" = "aviso";

    if (h.code >= 95) {
      score = 100;
      emoji = "⛈️";
      title = "Tormenta eléctrica";
      intensity = h.prob >= 70 ? "Fuerte" : "Moderada";
      severity = h.prob >= 70 ? "peligro" : "aviso";
    } else if (h.prob >= 60 && h.code >= 80) {
      score = 85;
      emoji = "️";
      title = "Tormenta";
      intensity = h.prob >= 80 ? "Fuerte" : "Moderada";
      severity = h.prob >= 80 ? "peligro" : "aviso";
    } else if (h.prob >= 50 && h.precip >= 3) {
      score = 75;
      emoji = "🌧️";
      title = "Lluvia intensa";
      intensity = h.precip >= 8 ? "Muy fuerte" : "Fuerte";
      severity = h.precip >= 8 ? "peligro" : "aviso";
    } else if (h.prob >= 40 && h.precip >= 1) {
      score = 60;
      emoji = "️";
      title = "Lluvia";
      intensity = "Moderada";
    } else if (h.wind >= 50) {
      score = 55;
      emoji = "💨";
      title = "Viento fuerte";
      intensity = h.wind >= 70 ? "Muy fuerte" : "Fuerte";
      severity = h.wind >= 70 ? "peligro" : "aviso";
    } else if (h.prob >= 30 && h.precip > 0) {
      score = 40;
      emoji = "🌦️";
      title = "Chubascos";
      intensity = "Débil";
    } else {
      continue;
    }

    const timeBonus = h.hour === currentHour ? 20 : h.hour === currentHour + 1 ? 10 : 0;
    score += timeBonus;

    if (score > bestScore) {
      bestScore = score;
      const nextHour = upcoming.find(u => u.hour > h.hour);
      best = {
        emoji,
        title,
        timeRange: nextHour ? `${h.time}–${nextHour.time}` : `${h.time}`,
        intensity,
        probability: h.prob,
        severity,
      };
    }
  }

  return best;
}

export function buildAlerts(current: CurrentWeather): WeatherAlert[] {
  const alerts: WeatherAlert[] = [];

  if (current.temperatureC <= 2) {
    alerts.push({
      type: "helada",
      level: current.temperatureC <= 0 ? "peligro" : "aviso",
      title: current.temperatureC <= 0 ? "Riesgo de helada" : "Temperatura próxima a helada",
      message: "Protege cultivos sensibles y revisa zonas bajas antes del amanecer.",
    });
  }
  if (current.temperatureC >= 32) {
    alerts.push({
      type: "calor",
      level: current.temperatureC >= 36 ? "peligro" : "aviso",
      title: "Calor elevado",
      message: "Evita labores intensas en las horas centrales y revisa el riego.",
    });
  }
  if (current.windGustKmh >= 40) {
    alerts.push({
      type: "viento",
      level: current.windGustKmh >= 60 ? "peligro" : "aviso",
      title: "Rachas de viento",
      message: "Evita tratamientos fitosanitarios y asegura elementos ligeros.",
    });
  }
  if (current.humidityPct <= 30 && current.et0Mm >= 0.15) {
    alerts.push({
      type: "sequedad",
      level: current.humidityPct <= 20 ? "peligro" : "aviso",
      title: "Ambiente seco",
      message: "Vigila cultivos sensibles: humedad baja y evapotranspiración activa.",
    });
  }

  return alerts;
}

export function weatherLabel(code: number) {
  if (code === 0) return "Cielo despejado";
  if (code <= 3) return "Nubes y claros";
  if (code <= 48) return "Niebla";
  if (code <= 67) return "Lluvia";
  if (code <= 77) return "Nieve";
  if (code <= 82) return "Chubascos";
  return "Tormenta probable";
}
