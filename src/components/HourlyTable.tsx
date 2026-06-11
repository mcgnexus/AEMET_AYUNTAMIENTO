"use client";

import type { HourlyWeather } from "@/types/weather";

const fmt = (v: number | undefined | null, d = 0) => {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toLocaleString("es-ES", { maximumFractionDigits: d });
};

function weatherEmoji(code: number | undefined | null): string {
  if (code == null) return "🌦️";
  if (code === 0) return "☀️";
  if (code <= 3) return "⛅";
  if (code <= 48) return "🌫️";
  if (code <= 55) return "🌧️";
  if (code <= 57) return "🌨️";
  if (code <= 65) return "🌧️";
  if (code <= 67) return "🌨️";
  if (code <= 75) return "❄️";
  if (code <= 77) return "❄️";
  if (code <= 82) return "🌧️";
  if (code <= 86) return "🌧️";
  if (code <= 99) return "⛈️";
  return "🌦️";
}

type HourlyTableProps = {
  hourly: HourlyWeather;
  variant?: "neutral" | "ayto";
};

export function HourlyTable({ hourly, variant = "neutral" }: HourlyTableProps) {
  const isAyto = variant === "ayto";
  const textMain = isAyto ? "text-[#1B3668]" : "text-slate-700";
  const textMuted = isAyto ? "text-[#1B3668]/50" : "text-slate-400";
  const textSmall = isAyto ? "text-[#1B3668]/60" : "text-slate-500";
  const rowBg = isAyto ? "odd:bg-[#fafaf5] even:bg-white" : "odd:bg-slate-50/50 even:bg-white";
  const borderColor = isAyto ? "border-[#e8e4d8]" : "border-slate-100";

  if (!hourly || !hourly.time || hourly.time.length === 0) {
    return (
      <div className="w-full">
        <p className={`text-[9px] font-bold uppercase tracking-wider ${textMuted}`}>Previsión por horas</p>
        <p className={`mt-1 text-[10px] ${textSmall}`}>No hay datos horarios disponibles</p>
      </div>
    );
  }

  const hours = hourly.time.map((t, i) => ({
    time: t.slice(11, 16),
    temp: hourly.temperatureC[i],
    precip: hourly.precipitationMm[i],
    precipProb: hourly.precipitationProbabilityPct[i],
    code: hourly.weatherCode[i],
    wind: hourly.windSpeedKmh[i],
  }));

  const maxPrecip = Math.max(...hours.map(h => h.precip), 0.1);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <p className={`text-[9px] font-bold uppercase tracking-wider ${textMuted}`}>
          Previsión por horas
        </p>
        <p className={`text-[10px] font-medium ${textMuted}`}>
          {fmt(Math.min(...hours.map(h => h.temp)))}° / {fmt(Math.max(...hours.map(h => h.temp)))}°
        </p>
      </div>

      <div className={`rounded-lg border ${borderColor} overflow-hidden`}>
        {/* Header */}
        <div className={`grid grid-cols-5 gap-1 px-2 py-1.5 text-[8px] font-bold uppercase tracking-wider ${textMuted} ${isAyto ? "bg-[#fafaf5]" : "bg-slate-50"}`}>
          <span>Hora</span>
          <span className="text-center">Estado</span>
          <span className="text-center">Temp</span>
          <span className="text-center"></span>
          <span className="text-center">Viento</span>
        </div>

        {/* Rows */}
        <div className="max-h-[280px] overflow-y-auto">
          {hours.map((h, i) => (
            <div
              key={i}
              className={`grid grid-cols-5 gap-1 px-2 py-1.5 text-[10px] border-t ${borderColor} ${rowBg} ${h.precip > 0 ? (isAyto ? "bg-[#dbeafe]/30" : "bg-sky-50/50") : ""}`}
            >
              <span className={`font-medium ${textMain}`}>{h.time}</span>
              <span className="text-center text-sm">{weatherEmoji(h.code)}</span>
              <span className={`text-center font-semibold ${textMain}`}>{fmt(h.temp, 1)}°</span>
              <span className="text-center">
                {h.precip > 0 ? (
                  <span className="text-sky-600 font-medium">{fmt(h.precip, 1)}<span className="text-[8px]">mm</span></span>
                ) : h.precipProb > 20 ? (
                  <span className={textSmall}>{h.precipProb}%</span>
                ) : (
                  <span className={textSmall}>—</span>
                )}
              </span>
              <span className={`text-center ${textSmall}`}>{fmt(h.wind)}<span className="text-[8px]">km/h</span></span>
            </div>
          ))}
        </div>
      </div>

      {maxPrecip > 0.05 && (
        <p className={`mt-1 text-[9px] ${textSmall}`}>
          🌧️ Precipitación máx: {fmt(maxPrecip, 1)} mm/h
        </p>
      )}
    </div>
  );
}