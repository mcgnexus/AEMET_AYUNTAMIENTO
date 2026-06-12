"use client";

import { useState } from "react";
import type { WeatherAlert, LightningData } from "@/types/weather";

function severityColor(level: WeatherAlert["level"]) {
  switch (level) {
    case "severo":
      return "bg-red-500";
    case "peligro":
      return "bg-orange-500";
    default:
      return "bg-yellow-400";
  }
}

function severityBorder(level: WeatherAlert["level"]) {
  switch (level) {
    case "severo":
      return "border-red-200 bg-red-50";
    case "peligro":
      return "border-orange-200 bg-orange-50";
    default:
      return "border-yellow-200 bg-yellow-50";
  }
}

function severityText(level: WeatherAlert["level"]) {
  switch (level) {
    case "severo":
      return "text-red-800";
    case "peligro":
      return "text-orange-800";
    default:
      return "text-yellow-800";
  }
}

function severityLabel(level: WeatherAlert["level"]) {
  switch (level) {
    case "severo":
      return "Rojo";
    case "peligro":
      return "Naranja";
    default:
      return "Amarillo";
  }
}

export function maxAlertSeverity(alerts: WeatherAlert[]): number {
  if (alerts.length === 0) return 0;
  return Math.max(
    ...alerts.map((a) =>
      a.level === "severo" ? 3 : a.level === "peligro" ? 2 : 1,
    ),
  );
}

export function AlertBadge({
  alerts,
  lightning,
}: {
  alerts: WeatherAlert[];
  lightning?: LightningData | null;
}) {
  if (alerts.length === 0 && (!lightning || lightning.level === "info"))
    return null;

  const severity = maxAlertSeverity(alerts);
  const isLightning =
    lightning &&
    lightning.active &&
    lightning.level !== "info" &&
    lightning.source === "blitzortung";

  const total = alerts.length + (isLightning ? 1 : 0);
  if (total === 0) return null;

  const badgeColor =
    severity >= 3
      ? "bg-red-500"
      : severity >= 2
        ? "bg-orange-500"
        : "bg-yellow-500";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white ${badgeColor}`}
    >
      {isLightning && <span className="text-[10px]">⚡</span>}
      {total}
    </span>
  );
}

export function AlertDropdown({
  alerts,
  lightning,
  variant = "neutral",
}: {
  alerts: WeatherAlert[];
  lightning?: LightningData | null;
  variant?: "neutral" | "ayto";
}) {
  const [open, setOpen] = useState(false);

  const isLightning =
    lightning &&
    lightning.active &&
    lightning.level !== "info" &&
    lightning.source === "blitzortung";
  const total = alerts.length + (isLightning ? 1 : 0);
  if (total === 0) return null;

  const severity = maxAlertSeverity(alerts);

  const borderColor =
    variant === "ayto"
      ? severity >= 2
        ? "border-red-200"
        : "border-amber-200"
      : severity >= 2
        ? "border-red-200"
        : "border-amber-200";
  const bgColor =
    variant === "ayto"
      ? severity >= 2
        ? "bg-red-50"
        : "bg-amber-50"
      : severity >= 2
        ? "bg-red-50"
        : "bg-amber-50";

  const headerText =
    variant === "ayto" ? "text-[#1B3668]" : "text-slate-700";
  const chevronColor = variant === "ayto" ? "text-[#888]" : "text-slate-400";

  return (
    <div className={`mx-4 mb-2 rounded-lg border ${borderColor} ${bgColor}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-3 py-2"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">
            {severity >= 3 ? "🔴" : severity >= 2 ? "🟠" : "🟡"}
          </span>
          <span className={`text-[10px] font-bold uppercase tracking-wider ${headerText}`}>
            {total === 1
              ? "1 aviso activo"
              : `${total} avisos activos`}
          </span>
        </div>
        <span
          className={`text-[10px] transition-transform duration-200 ${chevronColor} ${open ? "rotate-180" : ""}`}
        >
          ▼
        </span>
      </button>

      {open && (
        <div className="space-y-1.5 border-t border-black/5 px-3 py-2">
          {alerts.map((a, i) => (
            <div
              key={`${a.type}-${i}`}
              className={`rounded-md border px-2.5 py-2 ${severityBorder(a.level)}`}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${severityColor(a.level)}`}
                />
                <span
                  className={`text-[10px] font-bold ${severityText(a.level)}`}
                >
                  {a.title}
                </span>
                <span
                  className={`ml-auto rounded px-1 py-0.5 text-[8px] font-bold uppercase ${severityColor(a.level)} text-white`}
                >
                  {severityLabel(a.level)}
                </span>
              </div>
              <p className={`mt-1 text-[9px] leading-relaxed ${severityText(a.level)} opacity-80`}>
                {a.message}
              </p>
            </div>
          ))}

          {isLightning && (
            <div className="rounded-md border border-purple-200 bg-purple-50 px-2.5 py-2">
              <div className="flex items-center gap-1.5">
                <span className="animate-pulse text-sm">⚡</span>
                <span className="text-[10px] font-bold text-purple-900">
                  Tormenta cercana
                </span>
                {lightning!.nearestStrikeKm != null && (
                  <span className="ml-auto text-[9px] font-semibold text-purple-700">
                    {lightning!.nearestStrikeKm.toFixed(1)} km
                  </span>
                )}
              </div>
              <p className="mt-1 text-[9px] leading-relaxed text-purple-700">
                {lightning!.message}
              </p>
              {lightning!.strikeCount > 0 && (
                <p className="mt-0.5 text-[8px] text-purple-500">
                  {lightning!.strikeCount} rayo
                  {lightning!.strikeCount !== 1 ? "s" : ""} detectado
                  {lightning!.strikeCount !== 1 ? "s" : ""} — fuente:
                  Blitzortung.org
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
