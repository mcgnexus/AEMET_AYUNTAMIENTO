import { useEffect, useState } from "react";
import type { ComarcaEstimationPayload } from "@/services/layers/layerComarca.types";

export function ComarcaSection({ variant = "neutral" }: { variant?: "neutral" | "ayto" }) {
  const [data, setData] = useState<ComarcaEstimationPayload | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/weather/comarca")
      .then(async (r) => { if (!r.ok) throw new Error((await r.json()).error); return r.json(); })
      .then((d) => setData(d))
      .catch((e) => setError(e.message));
  }, []);

  if (error) return null;
  if (!data) return null;

  const isAyto = variant === "ayto";
  const baseCard = isAyto
    ? "bg-[#1B3668]/10 border-[#1B3668]/20"
    : "bg-slate-50 border-slate-200";
  const textMain = isAyto ? "text-[#1B3668]" : "text-slate-700";
  const textMuted = isAyto ? "text-[#1B3668]/60" : "text-slate-400";
  const textAccent = isAyto ? "text-[#C9A84C]" : "text-slate-500";

  const badgeColor = (age: number | null) => {
    if (age == null) return "bg-red-100 text-red-700";
    if (age <= 2) return isAyto ? "bg-emerald-100 text-emerald-700" : "bg-emerald-100 text-emerald-700";
    if (age <= 5) return isAyto ? "bg-amber-100 text-amber-700" : "bg-amber-100 text-amber-700";
    return "bg-red-100 text-red-700";
  };

  const ageLabel = data.trendAgeDays != null ? `${data.trendAgeDays}d` : "?";

  return (
    <div className="mt-4 border-t border-dashed pt-4">
      <div className="mb-2 flex items-center justify-between">
        <p className={`text-[10px] font-bold uppercase tracking-wider ${textMuted}`}>
          Estimación comarcal
        </p>
        <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${badgeColor(data.trendAgeDays)}`}>
          RIA {ageLabel}
        </span>
      </div>
      <p className={`text-[9px] ${textMuted} mb-1.5`}>
        Ancla: AEMET Huéscar · Tendencia: RIA Puebla
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        {data.estimates.map((e) => (
          <div
            key={e.id}
            className={`rounded-md border p-1.5 ${baseCard}`}
            title={`Confianza: ${e.confidencePct}% · Distancia AEMET: ${e.distanceFromAemetKm} km`}
          >
            <p className={`text-[10px] font-bold leading-tight ${textMain}`}>{e.name}</p>
            <div className="mt-0.5 flex items-baseline gap-1">
              <span className={`text-sm font-extrabold ${textAccent}`}>
                {e.values.temperatureC.toFixed(1)}°
              </span>
              <span className={`text-[9px] ${textMuted}`}>
                {e.values.humidityPct}%HR
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}