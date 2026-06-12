"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { weatherLabel, detectStormHours, findImminentAlert } from "@/lib/weatherRules";
import type { WeatherPayload } from "@/types/weather";
import { HourlyTable } from "./HourlyTable";
import { WeatherStationPanel } from "./WeatherStationPanel";
import { LightningPanel } from "./LightningPanel";

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

export function WeatherDashboard() {
  const [data, setData] = useState<WeatherPayload | null>(null);
  const [error, setError] = useState("");
  const [showHourly, setShowHourly] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(() => {
    fetch("/api/weather/current", { cache: "no-store" })
      .then(async r => { if (!r.ok) throw new Error((await r.json()).error); return r.json(); })
      .then(d => { sessionStorage.setItem("meteo_widget", JSON.stringify(d)); setData(d); setError(""); })
      .catch(e => setError(e.message));
  }, []);

  useEffect(() => {
    const cached = sessionStorage.getItem("meteo_widget");
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
      <div className="w-full max-w-[420px] rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Meteo Huéscar</p>
        <p className="mt-3 text-sm text-slate-500">{error}</p>
        <div className="mt-4 border-t border-slate-100 pt-3">
          <WeatherStationPanel />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="w-full max-w-[420px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-center p-8">
          <div className="text-center">
            <div className="mx-auto mb-3 h-3 w-3 animate-pulse rounded-full bg-slate-300" />
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Cargando datos</p>
          </div>
        </div>
        <div className="border-t border-slate-100 px-4 py-3">
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
      <div className="w-full max-w-[420px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Meteo Huéscar</p>
          <p className="mt-3 text-sm text-slate-500">
            {isNoData ? "Datos meteorológicos no disponibles temporalmente" : "Datos meteorológicos no disponibles"}
          </p>
          {data.confidenceExplanation && data.confidenceExplanation !== "Error al obtener datos meteorológicos" && (
            <p className="mt-1 text-[10px] text-slate-400">{data.confidenceExplanation}</p>
          )}
        </div>
        <div className="border-t border-slate-100 px-4 py-3">
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
    <div className="w-full max-w-[420px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow duration-300 hover:shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-800 text-white">
            <Icon name="sun" className="h-3.5 w-3.5" />
          </div>
          <div>
            <p className="text-[11px] font-bold tracking-tight text-slate-800">Meteo Huéscar</p>
            <p className="text-[9px] font-medium uppercase tracking-wider text-slate-400">Observatorio comarcal</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${sourceOk ? "bg-emerald-500" : "bg-amber-400"}`} />
          <span className="text-[9px] font-medium text-slate-400">
            {aemetAge != null ? (aemetAge < 60 ? `hace ${aemetAge} min` : `hace ${Math.floor(aemetAge / 60)}h`) : "—"}
          </span>
          <a href="/admin" className="rounded-md border border-slate-200 px-2 py-0.5 text-[9px] font-medium text-slate-400 transition-colors hover:border-slate-300 hover:text-slate-600">
            Admin
          </a>
        </div>
      </div>

      {/* Degraded banner */}
      {isDegraded && (
        <div className="mx-4 mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px]">⚠️</span>
            <p className="text-[9px] font-medium text-amber-800">
              {data.source === "OPEN_METEO" ? "Solo modelo Open-Meteo — sin observación oficial" : "Datos con confianza reducida"}
            </p>
          </div>
        </div>
      )}

      {/* Temperature + Weather */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-baseline gap-1">
              <span className="text-[3.2rem] font-extralight leading-none tracking-[-0.06em] text-slate-800">
                {fmt(c.temperatureC, 1)}
              </span>
              <span className="text-xl font-light text-slate-400">°C</span>
            </div>
            <p className="mt-2 text-[14px] font-medium leading-none text-slate-500">{weatherLabel(code)}</p>
          </div>
          {showAlertIcon ? (
            <div className="text-right">
              <span className="text-3xl leading-none">{imminentAlert!.emoji}</span>
              <p className="mt-1 text-[10px] font-bold text-red-700">{imminentAlert!.title}</p>
              <p className="text-[9px] text-red-600">{imminentAlert!.timeRange} · {imminentAlert!.intensity}</p>
              <p className="text-[9px] text-red-500">{imminentAlert!.probability}% prob.</p>
            </div>
          ) : (
            <div className="text-slate-300">
              <Icon name={weatherIcon} className="h-16 w-16" />
            </div>
          )}
        </div>
      </div>

      {/* Metrics row */}
      <div className="mx-4 mb-3 grid grid-cols-3 gap-2 rounded-lg bg-slate-50 px-3 py-3">
        <div className="text-center">
          <p className="text-sm font-semibold leading-none text-slate-700">{fmt(c.humidityPct)}%</p>
          <p className="mt-1 text-[8px] font-semibold uppercase tracking-[0.12em] text-slate-400">Humedad</p>
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold leading-none text-slate-700">{fmt(c.windSpeedKmh)} <span className="text-[9px] font-normal text-slate-400">km/h</span></p>
          <p className="mt-1 text-[8px] font-semibold uppercase tracking-[0.12em] text-slate-400">Viento {windDirection(c.windDirectionDeg)}</p>
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold leading-none text-slate-700">{fmt(c.precipitationMm, 1)} <span className="text-[9px] font-normal text-slate-400">mm</span></p>
          <p className="mt-1 text-[8px] font-semibold uppercase tracking-[0.12em] text-slate-400">Precipitación</p>
        </div>
      </div>

      {/* Alerts */}
      {hasAlerts && (
        <div className={`mx-4 mb-3 rounded-lg border px-3 py-2 ${alertSeverity >= 2 ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {data.alerts.map(a => (
              <span key={a.type} className="flex items-center gap-1.5 text-[10px] font-medium">
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${a.level === "peligro" || a.level === "severo" ? "bg-red-500" : "bg-amber-500"}`} />
                {a.title}
              </span>
            ))}
          </div>
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
          <div className="mx-4 mb-3 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2.5">
            <div className="flex items-start gap-2">
              <span className="text-xl leading-none">{hasThunder ? "⛈️" : "🌧️"}</span>
              <div className="flex-1">
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
        className="mx-4 mb-2 flex w-[calc(100%-2rem)] items-center justify-between rounded-lg border border-slate-100 bg-slate-50/60 px-3.5 py-2.5 text-left transition-colors hover:border-slate-200 hover:bg-slate-50"
      >
        <div className="flex items-center gap-2">
          <span className="text-2xl leading-none">{weatherEmoji(code)}</span>
          <div>
            <p className="text-[10px] font-bold text-slate-700">{todayLabel}</p>
            <p className="text-[9px] text-slate-400">
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
            <span className="text-[9px] font-medium text-sky-600">
              {weatherEmoji(51)} {data.daily.precipitationProbabilityPct[todayIdx]}%
            </span>
          )}
          <span className={`text-[10px] text-slate-400 transition-transform duration-200 ${showHourly ? "rotate-180" : ""}`}>▼</span>
        </div>
      </button>

      {/* Expandable hourly detail */}
      {showHourly && (
        <div className="mx-4 mb-2">
          <HourlyTable hourly={data.hourly} variant="neutral" />
        </div>
      )}

      {/* Future days forecast */}
      {hasDaily && (
        <div className="mx-4 mb-3 grid grid-cols-6 gap-1.5 rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-2.5">
          {data.daily.time.slice(futureDaysStart, futureDaysStart + 6).map((d, idx) => {
            const i = futureDaysStart + idx;
            return (
              <div key={d} className="flex min-w-0 flex-col items-center text-center">
                <p className="text-[8px] font-bold uppercase tracking-wide text-slate-400">{day(d)}</p>
                <p className="mt-1 text-2xl leading-none">{weatherEmoji(data.daily.weatherCode[i])}</p>
                <p className={`mt-1 text-[12px] font-semibold leading-none ${data.daily.precipitationProbabilityPct[i] > 40 ? "text-sky-600" : "text-slate-700"}`}>
                  {fmt(data.daily.temperatureMaxC[i])}°
                </p>
                <p className="mt-0.5 text-[8px] font-medium leading-none text-slate-400">{fmt(data.daily.temperatureMinC[i])}°</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Lightning Section */}
      {"lightning" in data && (
        <div className="mx-4 mb-2">
          <LightningPanel data={(data as Record<string, unknown>).lightning as import("@/types/weather").LightningData} />
        </div>
      )}

      {/* Stations Section */}
      <div className="border-t border-slate-100 px-4 py-3">
        <WeatherStationPanel aemetCurrent={data.current} />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2">
        <p className="text-[8px] font-medium uppercase tracking-wider text-slate-400">
          AEMET + Open-Meteo
        </p>
        <p className="text-[8px] text-slate-400">
          {new Date(data.fetchedAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
    </div>
  );
}
