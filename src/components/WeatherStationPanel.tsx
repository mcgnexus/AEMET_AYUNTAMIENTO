"use client";

import { useCallback, useEffect, useState } from "react";
import type { WeatherPayload } from "@/types/weather";
import type { StationData, StationAlert, StationComparison } from "@/services/stationService";

function fmt(v: number | undefined | null, d = 0) {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toLocaleString("es-ES", { maximumFractionDigits: d });
}

function AlertBadge({ alert }: { alert: StationAlert }) {
  const colors =
    alert.level === "peligro"
      ? "border-red-200 bg-red-50 text-red-800"
      : "border-amber-200 bg-amber-50 text-amber-800";
  const icons: Record<string, string> = {
    frost: "❄️",
    drought: "🏜️",
    low_battery: "🔋",
    weak_signal: "📡",
    high_temp: "🔥",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[9px] font-semibold ${colors}`}>
      <span>{icons[alert.type] ?? "⚠️"}</span>
      {alert.title}
    </span>
  );
}

function ComparisonRow({ comp }: { comp: StationComparison }) {
  const diffAbs = Math.abs(comp.diff);
  const isWarning = diffAbs > 2;
  const sign = comp.diff > 0 ? "+" : "";
  return (
    <div className="flex items-center justify-between text-[10px]">
      <span className="text-slate-500">{comp.metric}</span>
      <div className="flex items-center gap-2">
        <span className="font-semibold text-slate-700">
          {fmt(comp.stationValue, 1)}{comp.unit}
        </span>
        <span className="text-slate-400">vs</span>
        <span className="font-medium text-slate-600">
          {fmt(comp.aemetValue, 1)}{comp.unit}
        </span>
        <span className={`font-bold ${isWarning ? "text-amber-600" : "text-slate-400"}`}>
          {sign}{fmt(comp.diff, 1)}
        </span>
      </div>
    </div>
  );
}

function StationCard({ station }: { station: StationData }) {
  const r = station.reading;
  const measuredAt = new Date(r.measuredAt);
  const hasReading = measuredAt.getTime() > 0;
  const isStale = station.ageMinutes > 30;
  const isVeryStale = station.ageMinutes > 120;

  if (!hasReading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex items-center gap-2">
          <span className="text-sm">📡</span>
          <div>
            <p className="text-[11px] font-bold text-slate-700">{station.name}</p>
            <p className="text-[9px] text-slate-400">{station.locationName}</p>
          </div>
        </div>
        <p className="mt-2 text-[10px] text-slate-400">Sin datos recientes</p>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border p-3 ${
      station.alerts.some(a => a.level === "peligro")
        ? "border-red-200 bg-red-50/50"
        : station.alerts.length > 0
        ? "border-amber-200 bg-amber-50/30"
        : "border-slate-200 bg-white"
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm">📡</span>
          <div>
            <p className="text-[11px] font-bold text-slate-700">{station.name}</p>
            <p className="text-[9px] text-slate-400">{station.locationName} · {station.crop}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${
            isVeryStale ? "bg-red-400" : isStale ? "bg-amber-400" : "bg-emerald-500"
          }`} />
          <span className="text-[8px] text-slate-400">
            {station.ageMinutes < 60
              ? `hace ${station.ageMinutes} min`
              : station.ageMinutes < 1440
              ? `hace ${Math.floor(station.ageMinutes / 60)}h`
              : `hace ${Math.floor(station.ageMinutes / 1440)}d`}
          </span>
        </div>
      </div>

      {/* Alerts */}
      {station.alerts.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {station.alerts.map((a, i) => (
            <AlertBadge key={i} alert={a} />
          ))}
        </div>
      )}

      {/* Main metrics */}
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        <div className="rounded-md bg-slate-50 px-2 py-1.5 text-center">
          <p className="text-[13px] font-bold leading-none text-slate-700">
            {fmt(r.airTempC, 1)}°
          </p>
          <p className="mt-0.5 text-[7px] font-semibold uppercase tracking-wider text-slate-400">Temp</p>
        </div>
        <div className="rounded-md bg-slate-50 px-2 py-1.5 text-center">
          <p className="text-[13px] font-bold leading-none text-slate-700">
            {fmt(r.airHumidityPct)}%
          </p>
          <p className="mt-0.5 text-[7px] font-semibold uppercase tracking-wider text-slate-400">Humedad</p>
        </div>
        <div className="rounded-md bg-slate-50 px-2 py-1.5 text-center">
          <p className="text-[13px] font-bold leading-none text-slate-700">
            {fmt(r.pressureHpa, 0)}
          </p>
          <p className="mt-0.5 text-[7px] font-semibold uppercase tracking-wider text-slate-400">hPa</p>
        </div>
      </div>

      {/* Secondary metrics */}
      <div className="mt-1.5 grid grid-cols-3 gap-1.5">
        {r.leafTempC != null && (
          <div className="rounded-md bg-sky-50 px-2 py-1 text-center">
            <p className="text-[11px] font-semibold text-sky-700">{fmt(r.leafTempC, 1)}°</p>
            <p className="text-[7px] font-medium uppercase text-sky-400">Hoja</p>
          </div>
        )}
        {r.soilMoisturePct != null && (
          <div className="rounded-md bg-amber-50 px-2 py-1 text-center">
            <p className="text-[11px] font-semibold text-amber-700">{fmt(r.soilMoisturePct, 0)}%</p>
            <p className="text-[7px] font-medium uppercase text-amber-400">Suelo</p>
          </div>
        )}
        <div className="rounded-md bg-slate-50 px-2 py-1 text-center">
          <p className="text-[11px] font-semibold text-slate-600">
            {r.batteryV != null ? `${fmt(r.batteryV, 2)}V` : "—"}
          </p>
          <p className="text-[7px] font-medium uppercase text-slate-400">Bat.</p>
        </div>
      </div>

      {/* Comparison with AEMET */}
      {station.comparison.length > 0 && (
        <div className="mt-2 rounded-md border border-slate-100 bg-slate-50/60 px-2 py-1.5">
          <p className="mb-1 text-[8px] font-bold uppercase tracking-wider text-slate-400">
            vs AEMET
          </p>
          <div className="space-y-0.5">
            {station.comparison.map((c, i) => (
              <ComparisonRow key={i} comp={c} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface WeatherStationPanelProps {
  aemetCurrent?: WeatherPayload["current"] | null;
}

export function WeatherStationPanel({ aemetCurrent = null }: WeatherStationPanelProps) {
  const [stations, setStations] = useState<StationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchStations = useCallback(() => {
    fetch("/api/weather/stations", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error);
        return r.json();
      })
      .then((d) => {
        setStations(d.stations);
        setLoading(false);
        setError("");
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchStations();
    const timer = setInterval(fetchStations, 180_000);
    return () => clearInterval(timer);
  }, [fetchStations]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-2">
        <div className="text-center">
          <div className="mx-auto mb-1 h-2 w-2 animate-pulse rounded-full bg-slate-300" />
          <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
            Cargando estaciones
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm">📡</span>
          <p className="text-[11px] font-bold text-slate-700">Estaciones</p>
        </div>
        <p className="mt-1 text-[9px] text-slate-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Compact Header */}
      <div className="flex items-center gap-2">
        <span className="text-sm">📡</span>
        <div className="flex items-baseline gap-1">
          <p className="text-[11px] font-bold text-slate-700">Estaciones Propias</p>
          <p className="text-[9px] text-slate-400">
            ({stations.length} activo{stations.length !== 1 ? "s" : ""})
          </p>
        </div>
      </div>

      {/* Station cards */}
      {stations.map((s) => (
        <StationCard key={s.nodeCode} station={s} />
      ))}
    </div>
  );
}
