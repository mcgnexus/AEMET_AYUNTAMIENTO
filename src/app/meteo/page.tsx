"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";
import { Line, Bar } from "react-chartjs-2";
import type {
  WeatherPayload,
  AgriculturalData,
  LivestockData,
  FrostRisk,
} from "@/types/weather";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Filler,
  Tooltip,
  Legend,
);

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

function shortTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function shortDay(iso: string): string {
  try {
    return new Intl.DateTimeFormat("es-ES", {
      weekday: "short",
      day: "numeric",
    }).format(new Date(`${iso}T12:00`));
  } catch {
    return iso;
  }
}

function stressColor(level: string): string {
  switch (level) {
    case "peligroso":
      return "text-red-700 bg-red-100";
    case "severo":
      return "text-orange-700 bg-orange-100";
    case "moderado":
      return "text-yellow-700 bg-yellow-100";
    case "leve":
      return "text-blue-700 bg-blue-100";
    default:
      return "text-green-700 bg-green-100";
  }
}

function frostColor(p: string): string {
  switch (p) {
    case "muy_alta":
      return "text-red-700 bg-red-50 border-red-300";
    case "alta":
      return "text-orange-700 bg-orange-50 border-orange-300";
    case "media":
      return "text-yellow-700 bg-yellow-50 border-yellow-300";
    default:
      return "text-slate-600 bg-slate-50 border-slate-200";
  }
}

function AlertBanner({ alerts }: { alerts: WeatherPayload["alerts"] }) {
  if (alerts.length === 0) return null;
  const official = alerts.filter((a) => a.type === "aemet_oficial");
  const other = alerts.filter((a) => a.type !== "aemet_oficial");

  return (
    <div className="space-y-2">
      {official.map((a, i) => (
        <div
          key={`off-${i}`}
          className={`rounded-lg border p-3 ${
            a.level === "severo"
              ? "border-red-400 bg-red-50 text-red-800"
              : a.level === "peligro"
                ? "border-orange-400 bg-orange-50 text-orange-800"
                : "border-yellow-400 bg-yellow-50 text-yellow-800"
          }`}
        >
          <p className="text-sm font-bold">{a.title}</p>
          <p className="mt-1 text-xs">{a.message}</p>
        </div>
      ))}
      {other.map((a, i) => (
        <div
          key={`oth-${i}`}
          className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700"
        >
          <span className="font-semibold">{a.title}</span> — {a.message}
        </div>
      ))}
    </div>
  );
}

function CurrentCard({ data }: { data: WeatherPayload }) {
  const c = data.current;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Meteo Huéscar
          </p>
          <p className="mt-1 text-4xl font-bold text-slate-800">
            {fmt(c.temperatureC)}°C
          </p>
          <p className="text-sm text-slate-500">
            Sensación {fmt(c.apparentTemperatureC)}°C
          </p>
        </div>
        <div className="text-center">
          <p className="text-5xl">{weatherEmoji(c.weatherCode)}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-4 gap-3 text-center">
        {[
          { label: "Humedad", value: `${fmt(c.humidityPct)}%` },
          { label: "Viento", value: `${fmt(c.windSpeedKmh)} km/h` },
          { label: "Precip.", value: `${fmt(c.precipitationMm)} mm` },
          { label: "Racha", value: `${fmt(c.windGustKmh)} km/h` },
        ].map((m) => (
          <div key={m.label}>
            <p className="text-lg font-semibold text-slate-700">{m.value}</p>
            <p className="text-[10px] uppercase tracking-wider text-slate-400">
              {m.label}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2">
        <span className="text-[10px] text-slate-400">
          Fuente: {data.source} · {data.confidencePct}% confianza
        </span>
        <span className="text-[10px] text-slate-400">
          {new Date(data.fetchedAt).toLocaleTimeString("es-ES", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
    </div>
  );
}

function ForecastSection({ data }: { data: WeatherPayload }) {
  const d = data.daily;
  if (!d.time.length) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
        Previsión 7 días
      </h3>
      <div className="mt-3 grid grid-cols-7 gap-1 text-center">
        {d.time.map((t, i) => (
          <div key={t} className="flex flex-col items-center">
            <p className="text-[9px] font-bold uppercase text-slate-400">
              {shortDay(t)}
            </p>
            <p className="mt-1 text-xl">{weatherEmoji(d.weatherCode[i])}</p>
            <p className="text-xs font-semibold text-slate-700">
              {fmt(d.temperatureMaxC[i])}°
            </p>
            <p className="text-[9px] text-slate-400">
              {fmt(d.temperatureMinC[i])}°
            </p>
            {d.precipitationProbabilityPct[i] > 10 && (
              <p className="text-[8px] text-sky-600">
                💧 {d.precipitationProbabilityPct[i]}%
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function TempChart({ data }: { data: WeatherPayload }) {
  const h = data.hourly;
  if (!h.time.length) return null;

  const chartData = {
    labels: h.time.map(shortTime),
    datasets: [
      {
        label: "Temperatura (°C)",
        data: h.temperatureC,
        borderColor: "#ef4444",
        backgroundColor: "rgba(239,68,68,0.1)",
        fill: true,
        tension: 0.3,
        pointRadius: 0,
      },
      {
        label: "Precipitación (mm)",
        data: h.precipitationMm,
        borderColor: "#3b82f6",
        backgroundColor: "rgba(59,130,246,0.2)",
        fill: true,
        tension: 0.3,
        pointRadius: 0,
      },
    ],
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
        Temperatura y precipitación (próximas horas)
      </h3>
      <div className="mt-3 h-48">
        <Line
          data={chartData}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              x: { display: true, ticks: { maxTicksLimit: 8, font: { size: 9 } } },
              y: { display: true },
            },
            plugins: { legend: { labels: { font: { size: 10 } } } },
          }}
        />
      </div>
    </div>
  );
}

function AgriculturalSection({ agri }: { agri?: AgriculturalData }) {
  if (!agri) return null;

  return (
    <div className="rounded-xl border border-green-200 bg-green-50/50 p-4 shadow-sm">
      <h3 className="text-xs font-bold uppercase tracking-wider text-green-700">
        Datos Agrícolas
      </h3>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          {
            label: "ET0 semanal",
            value: `${fmt(agri.et0AccumulatedWeekMm, 1)} mm`,
          },
          {
            label: "ET0 mensual",
            value: `${fmt(agri.et0AccumulatedMonthMm, 1)} mm`,
          },
          {
            label: "Lluvia semanal",
            value: `${fmt(agri.precipitationAccumulatedWeekMm, 1)} mm`,
          },
          {
            label: "Lluvia mensual",
            value: `${fmt(agri.precipitationAccumulatedMonthMm, 1)} mm`,
          },
          {
            label: "Grados-día (GDD)",
            value: `${fmt(agri.gddAccumulated, 1)}`,
          },
          {
            label: "Horas de frío",
            value: `${agri.chillHours} h`,
          },
          {
            label: "Días estrés >35°C",
            value: `${agri.heatStressDays}`,
          },
          {
            label: "Balance hídrico",
            value: `${fmt(agri.precipitationAccumulatedWeekMm - agri.et0AccumulatedWeekMm, 1)} mm`,
          },
        ].map((m) => (
          <div
            key={m.label}
            className="rounded-lg border border-green-100 bg-white p-2 text-center"
          >
            <p className="text-sm font-semibold text-green-800">{m.value}</p>
            <p className="text-[9px] uppercase tracking-wider text-green-600">
              {m.label}
            </p>
          </div>
        ))}
      </div>

      {agri.frostRisk48h.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] font-bold uppercase text-green-700">
            Riesgo de helada (48h)
          </p>
          <div className="mt-1 space-y-1">
            {agri.frostRisk48h.map((f: FrostRisk) => (
              <div
                key={f.date}
                className={`flex items-center justify-between rounded border px-2 py-1 text-xs ${frostColor(f.probability)}`}
              >
                <span>{f.date}</span>
                <span>
                  Mín: {fmt(f.minTempC)}°C · {f.probability.replace("_", " ")}
                  {f.hoursBelow0 > 0 && ` · ${f.hoursBelow0}h <0°C`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {agri.fieldWorkability.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] font-bold uppercase text-green-700">
            Trabajabilidad del campo
          </p>
          <div className="mt-1 grid grid-cols-4 gap-1">
            {agri.fieldWorkability.slice(0, 7).map((fw) => (
              <div
                key={fw.date}
                className={`rounded border px-1 py-1 text-center text-[9px] ${
                  fw.workable
                    ? "border-green-200 bg-green-50 text-green-700"
                    : "border-red-200 bg-red-50 text-red-700"
                }`}
              >
                <p className="font-bold">{shortDay(fw.date)}</p>
                <p>{fw.reason}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LivestockSection({ live }: { live?: LivestockData }) {
  if (!live) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 shadow-sm">
      <h3 className="text-xs font-bold uppercase tracking-wider text-amber-700">
        Índice Ganadero (THI)
      </h3>

      <div
        className={`mt-2 inline-block rounded-lg px-3 py-1.5 text-sm font-bold ${stressColor(live.stressLevel)}`}
      >
        THI: {fmt(live.thiCurrent, 1)} — {live.stressLabel}
      </div>

      <p className="mt-2 text-xs text-amber-800">{live.recommendation}</p>

      <div className="mt-2 flex gap-3 text-[10px]">
        <span className={live.cattleAffected.dairy ? "text-red-600 font-bold" : "text-slate-400"}>
          Vacuno lechero
        </span>
        <span className={live.cattleAffected.beef ? "text-orange-600 font-bold" : "text-slate-400"}>
          Vacuno carne
        </span>
        <span className={live.cattleAffected.sheep ? "text-red-600 font-bold" : "text-slate-400"}>
          Ovino/Caprino
        </span>
      </div>

      {live.thiHourly.length > 0 && (
        <div className="mt-3 h-32">
          <Line
            data={{
              labels: live.thiHourly.map((h) => shortTime(h.time)),
              datasets: [
                {
                  label: "THI",
                  data: live.thiHourly.map((h) => h.thi),
                  borderColor: "#d97706",
                  backgroundColor: "rgba(217,119,6,0.1)",
                  fill: true,
                  tension: 0.3,
                  pointRadius: 0,
                },
              ],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              scales: {
                x: { ticks: { maxTicksLimit: 8, font: { size: 8 } } },
                y: {
                  min: 40,
                  max: 100,
                  ticks: { font: { size: 8 } },
                },
              },
              plugins: { legend: { display: false } },
            }}
          />
        </div>
      )}
    </div>
  );
}

function LightningSection({ data }: { data: WeatherPayload }) {
  const l = (data as Record<string, unknown>).lightning as
    | import("@/types/weather").LightningData
    | undefined;
  if (!l || l.source === "unavailable") return null;

  const colors =
    l.level === "peligro"
      ? "border-red-300 bg-red-50 text-red-700"
      : l.level === "alerta"
        ? "border-orange-300 bg-orange-50 text-orange-700"
        : l.level === "precaucion"
          ? "border-yellow-300 bg-yellow-50 text-yellow-700"
          : "border-slate-200 bg-slate-50 text-slate-600";

  return (
    <div className={`rounded-xl border p-3 ${colors}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold">⚡ Rayos</p>
          <p className="text-[10px]">{l.message}</p>
        </div>
        <div className="text-right text-xs">
          <p className="font-semibold">
            {l.strikeCount} rayo{l.strikeCount !== 1 ? "s" : ""}
          </p>
          {l.nearestStrikeKm != null && (
            <p className="text-[10px] opacity-70">
              {l.nearestStrikeKm.toFixed(1)} km
            </p>
          )}
        </div>
      </div>
      <p className="mt-1 text-[8px] opacity-40">
        Blitzortung.org ·{" "}
        {new Date(l.lastCheckedAt).toLocaleTimeString("es-ES", {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </p>
    </div>
  );
}

export default function MeteoPage() {
  const [data, setData] = useState<WeatherPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/weather/current");
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const payload = (await res.json()) as WeatherPayload;
      setData(payload);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 180_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (error && !data) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-3xl p-6 text-center">
        <div className="mx-auto mb-3 h-3 w-3 animate-pulse rounded-full bg-slate-300" />
        <p className="text-xs text-slate-400">Cargando datos...</p>
      </div>
    );
  }

  const agri = (data as Record<string, unknown>).agricultural as
    | AgriculturalData
    | undefined;
  const live = (data as Record<string, unknown>).livestock as
    | LivestockData
    | undefined;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">
            Observatorio Meteorológico de Huéscar
          </h1>
          <p className="text-xs text-slate-400">
            Datos en tiempo real · AEMET + Open-Meteo + Estaciones TecRural
          </p>
        </div>
        <p className="text-[10px] text-slate-400">
          {new Date(data.fetchedAt).toLocaleTimeString("es-ES", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>

      <AlertBanner alerts={data.alerts} />
      <CurrentCard data={data} />
      <LightningSection data={data} />
      <TempChart data={data} />
      <ForecastSection data={data} />
      <AgriculturalSection agri={agri} />
      <LivestockSection live={live} />

      <div className="text-center text-[9px] text-slate-400">
        Meteo Huéscar · AEMET + Open-Meteo + Blitzortung · TecRural
      </div>
    </div>
  );
}
