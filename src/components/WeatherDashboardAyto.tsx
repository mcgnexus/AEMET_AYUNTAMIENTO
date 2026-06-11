"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { weatherLabel, detectStormHours, findImminentAlert } from "@/lib/weatherRules";
import type { WeatherPayload } from "@/types/weather";
import { HourlyTable } from "./HourlyTable";
import { WeatherStationPanel } from "./WeatherStationPanel";

const fmt = (v: number | undefined | null, d = 0) => {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toLocaleString("es-ES", { maximumFractionDigits: d });
};
const day = (t: string) =>
  new Intl.DateTimeFormat("es-ES", { weekday: "short" }).format(new Date(`${t}T12:00`));

function alertEmoji(type: string): string {
  switch (type) {
    case "helada": return "❄️";
    case "calor": return "🔥";
    case "viento": return "💨";
    case "sequedad": return "🏜️";
    default: return "⚠️";
  }
}

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

function Icon({ name, className = "" }: { name: string; className?: string }) {
  const paths: Record<string, React.ReactNode> = {
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></>,
    wind: <><path d="M3 8h10a3 3 0 1 0-3-3" /><path d="M3 12h15a3 3 0 1 1-3 3" /><path d="M3 16h7" /></>,
    drop: <path d="M12 3s6 6.2 6 11a6 6 0 0 1-12 0c0-4.8 6-11 6-11Z" />,
    rain: <><path d="M7 16a4 4 0 1 1 1-7.9A5 5 0 0 1 18 9a3.5 3.5 0 0 1-.5 7H7Z" /><path d="m9 19-1 2m5-2-1 2m5-2-1 2" /></>,
    cloud: <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />,
  };
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

function windDirection(deg: number | undefined | null) {
  if (deg == null || Number.isNaN(deg)) return "—";
  const dirs = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
  return dirs[Math.round(deg / 45) % 8];
}

export function WeatherDashboardAyto() {
  const [data, setData] = useState<WeatherPayload | null>(null);
  const [error, setError] = useState("");
  const [showHourly, setShowHourly] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(() => {
    fetch("/api/weather/current", { cache: "no-store" })
      .then(async r => { if (!r.ok) throw new Error((await r.json()).error); return r.json(); })
      .then(d => { sessionStorage.setItem("meteo_ayto", JSON.stringify(d)); setData(d); setError(""); })
      .catch(e => setError(e.message));
  }, []);

  useEffect(() => {
    const cached = sessionStorage.getItem("meteo_ayto");
    if (cached) {
      try {
        const p = JSON.parse(cached) as WeatherPayload;
        if (Date.now() - Date.parse(p.fetchedAt) < 120_000) { setData(p); }
      } catch { /* ignore */ }
    }
    fetchData();
    timerRef.current = setInterval(fetchData, 180_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchData]);

  if (error) {
    return (
      <div className="w-full max-w-[420px] rounded border border-[#e0ddd0] bg-white p-5">
        <p className="text-xs font-bold uppercase tracking-wider text-[#1B3668]">Meteo Huéscar</p>
        <p className="mt-3 text-sm text-[#666]">{error}</p>
        <div className="mt-4 border-t border-[#e8e4d8] pt-3">
          <WeatherStationPanel />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="w-full max-w-[420px] overflow-hidden rounded border border-[#e0ddd0] bg-white">
        <div className="flex items-center justify-center p-8">
          <div className="text-center">
            <div className="mx-auto mb-3 h-3 w-3 animate-pulse rounded-full bg-[#C9A84C]" />
            <p className="text-xs font-bold uppercase tracking-wider text-[#1B3668]">Cargando datos</p>
          </div>
        </div>
        <div className="border-t border-[#e8e4d8] px-4 py-3">
          <WeatherStationPanel />
        </div>
      </div>
    );
  }

  const c = data.current;
  const isDegraded = data.source !== "FUSED" || data.confidencePct < 50 || data.sources.length === 0;
  const isNoData = c.temperatureC === 0 && c.humidityPct === 0 && data.sources.length === 0;
  
  if (!c || isNoData) {
    return (
      <div className="w-full max-w-[420px] overflow-hidden rounded border border-[#e0ddd0] bg-white">
        <div className="p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-[#1B3668]">Meteo Huéscar</p>
          <p className="mt-3 text-sm text-[#666]">
            {isNoData ? "Datos meteorológicos no disponibles temporalmente" : "Datos meteorológicos no disponibles"}
          </p>
          {data.confidenceExplanation && data.confidenceExplanation !== "Error al obtener datos meteorológicos" && (
            <p className="mt-1 text-[10px] text-[#888]">{data.confidenceExplanation}</p>
          )}
        </div>
        <div className="border-t border-[#e8e4d8] px-4 py-3">
          <WeatherStationPanel aemetCurrent={data.current} />
        </div>
      </div>
    );
  }
  const code = c.weatherCode ?? 0;
  const isRain = code >= 51 && code <= 82;
  const isCloudy = code >= 2 && code <= 48;
  const weatherIcon = isRain ? "rain" : isCloudy ? "cloud" : "sun";
  const hasAlerts = data.alerts.length > 0;
  const alertSeverity = hasAlerts ? Math.max(...data.alerts.map(a => a.level === "severo" ? 3 : a.level === "peligro" ? 2 : 1)) : 0;
  const aemetSource = data.sources.find(s => s.source === "AEMET");
  const aemetAge = aemetSource ? aemetSource.dataAgeMinutes : null;
  const sourceOk = aemetSource?.status === "OK";
  const localDate = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  const hasDaily = data.daily && data.daily.time && data.daily.time.length > 0;
  const todayIdx = hasDaily ? data.daily.time.findIndex(t => t === localDate) : -1;
  const todayStr = hasDaily ? (todayIdx >= 0 ? data.daily.time[todayIdx] : data.daily.time[0]) : "";
  const todayLabel = todayStr ? new Date(`${todayStr}T12:00`).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "short" }) : "Hoy";
  const futureDaysStart = Math.max(1, todayIdx + 1);
  const hasHourly = data.hourly && data.hourly.time && data.hourly.time.length > 0;
  const imminentAlert = hasHourly ? findImminentAlert(data.hourly) : null;
  const showAlertIcon = imminentAlert && imminentAlert.severity === "peligro";

  return (
    <div className="w-full max-w-[420px] overflow-hidden rounded border border-[#e0ddd0] bg-white shadow-sm">
      {/* Header band */}
      <div className="bg-[#1B3668] px-4 py-2.5 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded bg-[#C9A84C] text-white">
              <Icon name="sun" className="h-3.5 w-3.5" />
            </div>
            <div>
              <p className="text-[12px] font-bold tracking-tight">Meteo Huéscar</p>
              <p className="text-[8px] font-medium uppercase tracking-[0.15em] text-[#d4d9e6]">Observatorio municipal</p>
            </div>
          </div>
          <span className={`inline-block h-2 w-2 rounded-full ${sourceOk ? "bg-[#6fcf97]" : "bg-[#C9A84C]"}`} />
        </div>
      </div>

      {/* Degraded banner */}
      {isDegraded && (
        <div className="mx-4 mt-2 rounded-md border border-[#C9A84C]/30 bg-[#fafaf5] px-3 py-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px]">⚠️</span>
            <p className="text-[9px] font-medium text-[#1B3668]/80">
              {data.source === "OPEN_METEO" ? "Solo modelo Open-Meteo — sin observación oficial" : "Datos con confianza reducida"}
            </p>
          </div>
        </div>
      )}

      {/* Temperature hero */}
      <div className="border-b border-[#e8e4d8] px-4 pt-5 pb-3">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-start gap-1">
              <span className="text-[4.5rem] font-light leading-none tracking-[-0.08em] text-[#1B3668]">
                {fmt(c.temperatureC, 1)}
              </span>
              <span className="mt-2 text-lg font-medium text-[#C9A84C]">°C</span>
            </div>
            <p className="mt-0.5 text-sm font-medium text-[#666]">{weatherLabel(code)}</p>
          </div>
          {showAlertIcon ? (
            <div className="mt-1 text-right">
              <span className="text-3xl leading-none">{imminentAlert!.emoji}</span>
              <p className="mt-1 text-[10px] font-bold text-red-700">{imminentAlert!.title}</p>
              <p className="text-[9px] text-red-600">{imminentAlert!.timeRange} · {imminentAlert!.intensity}</p>
              <p className="text-[9px] text-red-500">{imminentAlert!.probability}% prob.</p>
            </div>
          ) : (
            <div className="mt-1 text-[#C9A84C]">
              <Icon name={weatherIcon} className="h-10 w-10" />
            </div>
          )}
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 border-b border-[#e8e4d8]">
        {[
          { label: "Humedad", value: `${fmt(c.humidityPct)}%` },
          { label: `Viento ${windDirection(c.windDirectionDeg)}`, value: `${fmt(c.windSpeedKmh)} km/h` },
          { label: "Precipitación", value: `${fmt(c.precipitationMm, 1)} mm` },
        ].map(m => (
          <div key={m.label} className="border-r border-[#e8e4d8] px-3 py-2.5 text-center last:border-r-0">
            <p className="text-sm font-bold text-[#1B3668]">{m.value}</p>
            <p className="text-[8px] font-bold uppercase tracking-[0.1em] text-[#888]">{m.label}</p>
          </div>
        ))}
      </div>

      {/* Alerts */}
      {hasAlerts && (
        <div className={`mx-4 my-3 rounded px-3 py-2 text-center text-[10px] font-bold uppercase tracking-[0.05em] ${alertSeverity >= 2 ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>
          {data.alerts.map(a => a.title).join(" · ")}
        </div>
      )}

      {/* Storm alert - prominent */}
      {hasHourly && (() => {
        const storms = detectStormHours(data.hourly);
        if (storms.length === 0) return null;
        const maxProb = Math.max(...storms.map(s => s.probability));
        const hasThunder = storms.some(s => s.isThunderstorm);
        const stormHours = storms.map(s => s.time).join(", ");
        return (
          <div className="mx-4 mb-3 rounded border border-purple-300 bg-purple-50 px-3 py-2.5">
            <div className="flex items-start gap-2">
              <span className="text-xl leading-none">{hasThunder ? "⛈️" : "🌧️"}</span>
              <div className="flex-1 text-left">
                <p className="text-[11px] font-bold text-purple-900">
                  {hasThunder ? "Posibilidad de tormenta" : "Precipitación probable"}
                </p>
                <p className="text-[10px] text-purple-700">
                  Horas: {stormHours} · Probabilidad máx: {maxProb}%
                </p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Today card - click to expand hourly */}
      <button
        type="button"
        onClick={() => setShowHourly(!showHourly)}
        className="mx-4 mb-1 flex w-[calc(100%-2rem)] items-center justify-between rounded border border-[#e8e4d8] bg-[#fafaf5] px-3 py-2 text-left transition-colors hover:border-[#d4d0c0]"
      >
        <div className="flex items-center gap-2">
          <span className="text-base leading-none">{weatherEmoji(code)}</span>
          <div>
            <p className="text-[10px] font-bold text-[#1B3668]">{todayLabel}</p>
            <p className="text-[9px] text-[#888]">
              {hasDaily ? `${fmt(data.daily.temperatureMaxC[todayIdx])}° / ${fmt(data.daily.temperatureMinC[todayIdx])}°` : "—"}
            </p>
          </div>
          {hasAlerts && (
            <span className="ml-1 flex gap-0.5">
              {data.alerts.map(a => (
                <span key={a.type} title={a.title} className="text-sm leading-none">
                  {alertEmoji(a.type)}
                </span>
              ))}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasDaily && data.daily.precipitationProbabilityPct[todayIdx] > 10 && (
            <span className="text-[9px] font-medium text-[#3b82f6]">
              {weatherEmoji(51)} {data.daily.precipitationProbabilityPct[todayIdx]}%
            </span>
          )}
          <span className={`text-[10px] text-[#888] transition-transform duration-200 ${showHourly ? "rotate-180" : ""}`}>▼</span>
        </div>
      </button>

      {/* Expandable hourly detail */}
      {showHourly && (
        <div className="mx-4 mb-2">
          <HourlyTable hourly={data.hourly} variant="ayto" />
        </div>
      )}

      {/* Future days forecast */}
      {hasDaily && (
        <div className="mx-4 mb-3 mt-2 grid grid-cols-6 gap-1 rounded border border-[#e8e4d8] bg-[#fafaf5] p-2">
          {data.daily.time.slice(futureDaysStart, futureDaysStart + 6).map((d, idx) => {
            const i = futureDaysStart + idx;
            return (
              <div key={d} className="text-center">
                <p className="text-[8px] font-bold uppercase text-[#888]">{day(d)}</p>
                <p className="mt-0.5 text-sm leading-none">{weatherEmoji(data.daily.weatherCode[i])}</p>
                <p className={`mt-0.5 text-[11px] font-bold ${data.daily.precipitationProbabilityPct[i] > 40 ? "text-[#3b82f6]" : "text-[#1B3668]"}`}>
                  {fmt(data.daily.temperatureMaxC[i])}°
                </p>
                <p className="text-[8px] text-[#aaa]">{fmt(data.daily.temperatureMinC[i])}°</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Stations Section */}
      <div className="border-t border-[#e8e4d8] px-4 py-3">
        <WeatherStationPanel aemetCurrent={data.current} />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-[#e8e4d8] bg-[#fafaf5] px-4 py-2">
        <p className="text-[7px] font-bold uppercase tracking-[0.1em] text-[#888]">AEMET + Open-Meteo</p>
        <p className="text-[7px] text-[#aaa]">
          {new Date(data.fetchedAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>

      {/* Admin link */}
      <Link href="/admin" className="block border-t border-[#e8e4d8] py-1.5 text-center text-[8px] font-bold uppercase tracking-[0.15em] text-[#C9A84C] transition-colors hover:text-[#b89730]">
        Consola técnica →
      </Link>
    </div>
  );
}