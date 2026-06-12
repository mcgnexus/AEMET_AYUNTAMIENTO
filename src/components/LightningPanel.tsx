"use client";

import type { LightningData } from "@/types/weather";

function levelColors(level: LightningData["level"]): { bg: string; border: string; text: string; icon: string } {
  switch (level) {
    case "peligro":
      return { bg: "bg-red-50", border: "border-red-300", text: "text-red-700", icon: "⚡" };
    case "alerta":
      return { bg: "bg-orange-50", border: "border-orange-300", text: "text-orange-700", icon: "⚡" };
    case "precaucion":
      return { bg: "bg-yellow-50", border: "border-yellow-300", text: "text-yellow-700", icon: "⚡" };
    default:
      return { bg: "bg-slate-50", border: "border-slate-200", text: "text-slate-600", icon: "⚡" };
  }
}

export function LightningPanel({ data }: { data?: LightningData | null }) {
  if (!data) return null;
  if (data.source === "unavailable") return null;
  if (data.strikeCount === 0 && data.level === "info") return null;

  const { bg, border, text, icon } = levelColors(data.level);
  const isActive = data.level === "peligro" || data.level === "alerta";

  return (
    <div className={`mx-4 mb-2 rounded-lg border px-3 py-2 ${bg} ${border} ${text} transition-colors`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className={`text-base ${isActive ? "animate-pulse" : ""}`}>{icon}</span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider">
              {isActive ? "Rayos Activos" : "Rayos Detectados"}
            </p>
            <p className="text-[9px] leading-tight opacity-80">
              {data.message}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold">
            {data.strikeCount} rayo{data.strikeCount !== 1 ? "s" : ""}
          </p>
          {data.nearestStrikeKm != null && (
            <p className="text-[9px] opacity-70">
              {data.nearestStrikeKm.toFixed(1)} km
            </p>
          )}
        </div>
      </div>
      <p className="mt-1 text-[7px] opacity-40">
        Fuente: Blitzortung.org — {new Date(data.lastCheckedAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
      </p>
    </div>
  );
}
