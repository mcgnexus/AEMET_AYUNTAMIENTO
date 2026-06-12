"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type LightningData = {
  active: boolean;
  level: string;
  nearestStrikeKm: number | null;
  strikeCount: number;
  strikes: Array<{ lat: number; lon: number; time: string; distanceKm: number }>;
  lastCheckedAt: string;
  source: string;
  message: string;
};

type AemetWarning = {
  type: string;
  level: string;
  title: string;
  message: string;
};

type AgriculturalData = {
  et0AccumulatedWeekMm: number;
  et0AccumulatedMonthMm: number;
  precipitationAccumulatedWeekMm: number;
  precipitationAccumulatedMonthMm: number;
  gddAccumulated: number;
  chillHours: number;
  heatStressDays: number;
  frostRisk48h: Array<{ date: string; minTempC: number; probability: string; hoursBelow0: number }>;
  fieldWorkability: Array<{ date: string; workable: boolean; reason: string }>;
};

type LivestockData = {
  thiCurrent: number;
  stressLevel: string;
  stressLabel: string;
  recommendation: string;
  cattleAffected: { dairy: boolean; beef: boolean; sheep: boolean };
  thiHourly: Array<{ time: string; thi: number; stress: string }>;
};

type Overview = {
  generatedAt: string;
  weather: {
    confidencePct: number;
    confidenceExplanation: string;
    current: Record<string, number | string>;
    sources: Array<Record<string, unknown>>;
    sourceHealth: Array<{ source: string; status: string; message: string; lastError?: string }>;
  };
  metrics: {
    snapshotCount: number;
    pendingForecastMeasurements: number;
    simultaneousMetrics: Array<Record<string, unknown>>;
    externalCalibrationMetrics: Array<Record<string, unknown>>;
    confidenceCalibration: Record<string, {
      historicalMae: number;
      sampleCount: number;
      aemetSampleCount: number;
      riaSampleCount: number;
      tolerance: number;
      historicalWeight: number;
    }>;
  };
  profiles: Array<{
    locationId: string;
    name: string;
    version: string;
    terrain: Record<string, number>;
    environment: Record<string, number | null>;
    microclimate: { initialClass: string; notes: string[] };
    satelliteCoverage?: {
      radii: Record<string, {
        vegetationPct: number;
        denseVegetationPct: number;
        waterDetectedPct: number;
        cloudPct: number;
        validIntervals: number;
        resolutionM: number;
      }>;
    };
  }>;
  comarca: {
    anchorSource: string;
    trendSource: string;
    anchorDate: string;
    trendDate: string | null;
    trendAgeDays: number | null;
    methodology: string;
    estimates: Array<{
      id: string;
      name: string;
      confidencePct: number;
      distanceFromAemetKm: number;
      values: Record<string, number>;
    }>;
  } | null;
  algorithm: Record<string, Record<string, string>>;
  configuration: Record<string, boolean>;
  lightning: LightningData | null;
  aemetWarnings: AemetWarning[];
  agricultural: AgriculturalData | null;
  livestock: LivestockData | null;
};

const num = (value: unknown, digits = 1) =>
  typeof value === "number" ? value.toLocaleString("es-ES", { maximumFractionDigits: digits }) : "—";

function Panel({ title, eyebrow, children }: { title: string; eyebrow: string; children: React.ReactNode }) {
  return <section className="card p-5 sm:p-6"><span className="eyebrow">{eyebrow}</span><h2 className="mb-5 mt-1 text-xl font-extrabold tracking-[-.04em]">{title}</h2>{children}</section>;
}

function Status({ value }: { value: string }) {
  const style = value === "OK" ? "bg-[#e6f2e7] text-[#176b55]" : value === "DEGRADED" ? "bg-[#fff1df] text-[#a65f28]" : "bg-[#fff1ef] text-[#a9423b]";
  return <span className={`rounded-full px-2 py-1 text-[9px] font-extrabold ${style}`}>{value}</span>;
}

function Badge({ value, label }: { value: boolean; label: string }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-extrabold ${value ? "bg-[#e6f2e7] text-[#176b55]" : "bg-[#f4f0e8] text-[#668078]"}`}>{label}</span>;
}

function SeverityBadge({ level }: { level: string }) {
  const colors = level === "severo" ? "bg-red-100 text-red-700" : level === "peligro" ? "bg-orange-100 text-orange-700" : "bg-yellow-100 text-yellow-700";
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[8px] font-extrabold uppercase ${colors}`}>{level === "severo" ? "Rojo" : level === "peligro" ? "Naranja" : "Amarillo"}</span>;
}

function LightningSection({ data }: { data: LightningData | null }) {
  if (!data) return null;
  const isActive = data.level === "peligro" || data.level === "alerta";
  const levelColor = data.level === "peligro" ? "text-red-600" : data.level === "alerta" ? "text-orange-600" : data.level === "precaucion" ? "text-yellow-600" : "text-[#668078]";
  const statusLabel = data.source === "unavailable" ? "No disponible" : isActive ? "ACTIVO" : "Inactivo";

  return (
    <Panel eyebrow="Detección de rayos" title="Blitzortung — Actividad eléctrica">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-[#173f36] p-4 text-white">
          <span className="text-[10px] uppercase opacity-60">Estado</span>
          <div className={`mt-1 text-xl font-extrabold ${isActive ? "text-red-300 animate-pulse" : ""}`}>{statusLabel}</div>
        </div>
        <div className="rounded-2xl bg-[#f4f0e8] p-4">
          <span className="text-[10px] uppercase text-[#668078]">Rayos detectados</span>
          <div className="mt-1 text-3xl font-extrabold">{data.strikeCount}</div>
        </div>
        <div className="rounded-2xl bg-[#f4f0e8] p-4">
          <span className="text-[10px] uppercase text-[#668078]">Rayo más cercano</span>
          <div className={`mt-1 text-3xl font-extrabold ${levelColor}`}>{data.nearestStrikeKm != null ? `${num(data.nearestStrikeKm, 1)} km` : "—"}</div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold uppercase text-[#668078]">Nivel:</span>
        <span className={`rounded-full px-2.5 py-0.5 text-[9px] font-extrabold ${levelColor} bg-[#edf4ec]`}>{data.level}</span>
      </div>
      <p className="mt-2 text-xs text-[#668078]">{data.message}</p>
      <p className="mt-1 text-[9px] text-[#668078]/60">Fuente: {data.source} · Última consulta: {new Date(data.lastCheckedAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</p>
      {data.strikes.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-extrabold">Ver {data.strikes.length} impacto{data.strikes.length !== 1 ? "s" : ""}</summary>
          <div className="mt-2 max-h-40 overflow-auto rounded-xl bg-[#173f36] p-3 text-[9px] leading-5 text-[#dce8d9]">
            {data.strikes.map((s, i) => (
              <div key={i} className="flex justify-between">
                <span>{s.distanceKm.toFixed(1)} km · ({s.lat.toFixed(3)}, {s.lon.toFixed(3)})</span>
                <span>{new Date(s.time).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </Panel>
  );
}

function AemetWarningsSection({ warnings }: { warnings: AemetWarning[] }) {
  return (
    <Panel eyebrow="Avisos oficiales" title={`AEMET Meteoalerta — ${warnings.length} aviso${warnings.length !== 1 ? "s" : ""} activo${warnings.length !== 1 ? "s" : ""}`}>
      {warnings.length === 0 ? (
        <div className="rounded-2xl bg-[#edf4ec] p-5 text-center">
          <p className="text-sm font-bold text-[#176b55]">Sin avisos activos</p>
          <p className="mt-1 text-[10px] text-[#668078]">No hay avisos oficiales de AEMET para la zona de Huéscar</p>
        </div>
      ) : (
        <div className="space-y-2">
          {warnings.map((w, i) => (
            <div key={i} className="rounded-2xl border border-[#176b55]/10 bg-[#faf9f4] p-4">
              <div className="flex items-center gap-2">
                <SeverityBadge level={w.level} />
                <strong className="text-sm">{w.title}</strong>
              </div>
              <p className="mt-2 text-xs leading-5 text-[#668078]">{w.message}</p>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function AgriculturalSection({ data }: { data: AgriculturalData | null }) {
  if (!data) {
    return (
      <Panel eyebrow="Índices agrícolas" title="Datos agrícolas">
        <p className="text-sm text-[#668078]">No hay datos suficientes para calcular índices agrícolas</p>
      </Panel>
    );
  }

  return (
    <Panel eyebrow="Índices agrícolas" title="TecRural — Dashboard agrícola">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl bg-[#173f36] p-4 text-white">
          <span className="text-[10px] uppercase opacity-60">ET0 semanal</span>
          <div className="text-2xl font-extrabold">{num(data.et0AccumulatedWeekMm, 1)} <span className="text-sm font-normal opacity-60">mm</span></div>
        </div>
        <div className="rounded-2xl bg-[#173f36] p-4 text-white">
          <span className="text-[10px] uppercase opacity-60">ET0 mensual</span>
          <div className="text-2xl font-extrabold">{num(data.et0AccumulatedMonthMm, 1)} <span className="text-sm font-normal opacity-60">mm</span></div>
        </div>
        <div className="rounded-2xl bg-[#f4f0e8] p-4">
          <span className="text-[10px] uppercase text-[#668078]">Lluvia semanal</span>
          <div className="text-2xl font-extrabold text-[#39788d]">{num(data.precipitationAccumulatedWeekMm, 1)} <span className="text-sm font-normal text-[#668078]">mm</span></div>
        </div>
        <div className="rounded-2xl bg-[#f4f0e8] p-4">
          <span className="text-[10px] uppercase text-[#668078]">Balance hídrico</span>
          <div className={`text-2xl font-extrabold ${data.precipitationAccumulatedWeekMm - data.et0AccumulatedWeekMm >= 0 ? "text-[#39788d]" : "text-[#a9423b]"}`}>
            {num(data.precipitationAccumulatedWeekMm - data.et0AccumulatedWeekMm, 1)} <span className="text-sm font-normal text-[#668078]">mm</span>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl bg-[#edf4ec] p-3">
          <span className="text-[10px] uppercase text-[#668078]">Grados-día (GDD)</span>
          <div className="mt-1 text-lg font-extrabold">{num(data.gddAccumulated, 1)}</div>
        </div>
        <div className="rounded-xl bg-[#edf4ec] p-3">
          <span className="text-[10px] uppercase text-[#668078]">Horas de frío (0-7°C)</span>
          <div className="mt-1 text-lg font-extrabold">{data.chillHours} <span className="text-sm font-normal text-[#668078]">h</span></div>
        </div>
        <div className="rounded-xl bg-[#edf4ec] p-3">
          <span className="text-[10px] uppercase text-[#668078]">Días estrés &gt;35°C</span>
          <div className="mt-1 text-lg font-extrabold">{data.heatStressDays}</div>
        </div>
        <div className="rounded-xl bg-[#edf4ec] p-3">
          <span className="text-[10px] uppercase text-[#668078]">Lluvia mensual</span>
          <div className="mt-1 text-lg font-extrabold">{num(data.precipitationAccumulatedMonthMm, 1)} <span className="text-sm font-normal text-[#668078]">mm</span></div>
        </div>
      </div>

      {data.frostRisk48h.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 text-xs font-extrabold">Riesgo de helada (48h)</h3>
          <div className="space-y-1.5">
            {data.frostRisk48h.map((f) => (
              <div key={f.date} className={`flex items-center justify-between rounded-xl border p-3 ${f.probability === "muy_alta" ? "border-red-200 bg-red-50" : f.probability === "alta" ? "border-orange-200 bg-orange-50" : f.probability === "media" ? "border-yellow-200 bg-yellow-50" : "border-[#dfe6df] bg-[#faf9f4]"}`}>
                <div className="flex items-center gap-3">
                  <strong className="text-xs">{f.date}</strong>
                  <span className="text-xs text-[#668078]">Mín: {num(f.minTempC)}°C</span>
                </div>
                <div className="flex items-center gap-2">
                  {f.hoursBelow0 > 0 && <span className="text-[10px] text-[#39788d]">{f.hoursBelow0}h &lt;0°C</span>}
                  <SeverityBadge level={f.probability === "muy_alta" ? "severo" : f.probability === "alta" ? "peligro" : f.probability === "media" ? "aviso" : "info"} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.fieldWorkability.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 text-xs font-extrabold">Trabajabilidad del campo</h3>
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
            {data.fieldWorkability.slice(0, 7).map((fw) => (
              <div key={fw.date} className={`rounded-xl border p-2.5 ${fw.workable ? "border-[#176b55]/20 bg-[#edf4ec]" : "border-red-200 bg-red-50"}`}>
                <div className="flex items-center justify-between">
                  <strong className="text-[10px]">{fw.date}</strong>
                  <Badge value={fw.workable} label={fw.workable ? "Labrable" : "No labrable"} />
                </div>
                <p className="mt-1 text-[9px] text-[#668078]">{fw.reason}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}

function LivestockSection({ data }: { data: LivestockData | null }) {
  if (!data) {
    return (
      <Panel eyebrow="Índice ganadero" title="THI — Estrés térmico">
        <p className="text-sm text-[#668078]">No hay datos suficientes para calcular el índice ganadero</p>
      </Panel>
    );
  }

  const stressColor = data.stressLevel === "peligroso" ? "text-red-600" : data.stressLevel === "severo" ? "text-orange-600" : data.stressLevel === "moderado" ? "text-yellow-600" : data.stressLevel === "leve" ? "text-blue-600" : "text-[#176b55]";
  const stressBg = data.stressLevel === "peligroso" ? "bg-red-50 border-red-200" : data.stressLevel === "severo" ? "bg-orange-50 border-orange-200" : data.stressLevel === "moderado" ? "bg-yellow-50 border-yellow-200" : "bg-[#edf4ec] border-[#176b55]/10";

  return (
    <Panel eyebrow="Índice ganadero" title={`THI — ${data.stressLabel}`}>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-[#173f36] p-4 text-white">
          <span className="text-[10px] uppercase opacity-60">THI actual</span>
          <div className={`text-3xl font-extrabold ${data.stressLevel !== "ninguno" ? "text-red-300" : ""}`}>{num(data.thiCurrent, 1)}</div>
        </div>
        <div className="rounded-2xl bg-[#f4f0e8] p-4">
          <span className="text-[10px] uppercase text-[#668078]">Nivel de estrés</span>
          <div className={`mt-1 text-lg font-extrabold ${stressColor}`}>{data.stressLabel}</div>
        </div>
        <div className={`rounded-2xl border p-4 ${stressBg}`}>
          <span className="text-[10px] uppercase text-[#668078]">Ganado afectado</span>
          <div className="mt-2 flex flex-col gap-1">
            <Badge value={data.cattleAffected.dairy} label={data.cattleAffected.dairy ? "Vacuno lechero" : "Lechero OK"} />
            <Badge value={data.cattleAffected.beef} label={data.cattleAffected.beef ? "Vacuno carne" : "Carne OK"} />
            <Badge value={data.cattleAffected.sheep} label={data.cattleAffected.sheep ? "Ovino/Caprino" : "Ovino OK"} />
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-[#176b55]/10 bg-[#faf9f4] p-3">
        <span className="text-[10px] font-bold uppercase text-[#668078]">Recomendación</span>
        <p className="mt-1 text-xs leading-5">{data.recommendation}</p>
      </div>

      {data.thiHourly.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-extrabold">Ver evolución horaria del THI ({data.thiHourly.length} horas)</summary>
          <div className="mt-2 max-h-48 overflow-auto rounded-xl bg-[#173f36] p-3 text-[9px] leading-5 text-[#dce8d9]">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[8px] uppercase opacity-60">
                  <th className="pb-1">Hora</th>
                  <th>THI</th>
                  <th>Estrés</th>
                </tr>
              </thead>
              <tbody>
                {data.thiHourly.map((h, i) => (
                  <tr key={i} className={h.stress !== "ninguno" ? "text-yellow-200" : ""}>
                    <td>{new Date(h.time).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</td>
                    <td>{num(h.thi, 1)}</td>
                    <td>{h.stress}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </Panel>
  );
}

export function AdminConsole() {
  const router = useRouter();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    const response = await fetch("/api/admin/overview", { cache: "no-store" });
    if (response.status === 401) {
      router.push("/admin/login");
      return;
    }
    if (!response.ok) {
      setError((await response.json()).error ?? "No se pudo cargar la consola");
      return;
    }
    setData(await response.json());
  }

  useEffect(() => { load(); }, []);

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  if (error) return <main className="p-6"><div className="card mx-auto max-w-xl p-7"><h1 className="text-xl font-extrabold">Error de consola</h1><p className="mt-3 text-sm text-[#a9423b]">{error}</p><button onClick={load} className="mt-5 rounded-xl bg-[#176b55] px-4 py-2 text-xs font-bold text-white">Reintentar</button></div></main>;
  if (!data) return <main className="grid min-h-screen place-items-center"><p className="eyebrow">Cargando consola técnica...</p></main>;

  return (
    <main className="mx-auto max-w-[1700px] px-4 pb-12 sm:px-7">
      <header className="flex flex-wrap items-center gap-4 py-6">
        <div><span className="eyebrow">Administración</span><h1 className="text-2xl font-extrabold tracking-[-.05em]">Consola técnica Meteo Huéscar</h1></div>
        <div className="ml-auto flex flex-wrap gap-2"><button onClick={load} className="rounded-xl border border-[#176b55]/20 bg-white px-4 py-2 text-xs font-bold">Actualizar</button><button onClick={async () => { await fetch("/api/admin/force-refresh", { method: "POST" }); load(); }} className="rounded-xl border border-amber-500/30 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100">Forzar actualización</button><button onClick={logout} className="rounded-xl bg-[#173f36] px-4 py-2 text-xs font-bold text-white">Cerrar sesión</button></div>
      </header>

      {/* Row 1: Confianza + Estado */}
      <div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
        <Panel eyebrow="Conclusión actual" title={`Confianza del consenso: ${data.weather.confidencePct}%`}>
          <p className="text-sm leading-6 text-[#668078]">{data.weather.confidenceExplanation}</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">{data.weather.sourceHealth.map(source=><div className="rounded-2xl bg-[#f4f0e8] p-4" key={source.source}><div className="flex items-center"><strong>{source.source}</strong><span className="ml-auto"><Status value={source.status}/></span></div><p className="mt-2 text-xs text-[#668078]">{source.message}</p>{source.lastError && <p className="mt-2 text-[10px] font-bold text-[#a9423b]">{source.lastError}</p>}</div>)}</div>
        </Panel>
        <Panel eyebrow="Estado del sistema" title="Configuración y acumulación">
          <div className="grid grid-cols-2 gap-3">{Object.entries(data.configuration).map(([key,value])=><div className="rounded-xl bg-[#edf4ec] p-3" key={key}><div className="text-[10px] font-bold text-[#668078]">{key}</div><strong className={value ? "text-[#176b55]" : "text-[#a9423b]"}>{value ? "Configurado" : "Pendiente"}</strong></div>)}</div>
          <div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl bg-[#173f36] p-4 text-white"><span className="text-[10px] uppercase opacity-60">Snapshots</span><div className="text-3xl font-extrabold">{data.metrics.snapshotCount}</div></div><div className="rounded-xl bg-[#173f36] p-4 text-white"><span className="text-[10px] uppercase opacity-60">Predicciones pendientes</span><div className="text-3xl font-extrabold">{data.metrics.pendingForecastMeasurements}</div></div></div>
        </Panel>
      </div>

      {/* Row 2: Rayos + Avisos AEMET */}
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <LightningSection data={data.lightning} />
        <AemetWarningsSection warnings={data.aemetWarnings} />
      </div>

      {/* Row 3: Agrícola + Ganadero */}
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <AgriculturalSection data={data.agricultural} />
        <LivestockSection data={data.livestock} />
      </div>

      {/* Row 4: Algoritmo + Calibración */}
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Panel eyebrow="Algoritmo" title="Cómo llega a sus conclusiones">
          <div className="space-y-3">{Object.entries(data.algorithm).map(([section, values])=><details className="rounded-2xl border border-[#176b55]/10 bg-[#faf9f4] p-4" key={section} open><summary className="cursor-pointer text-sm font-extrabold">{section}</summary><dl className="mt-3 space-y-2">{Object.entries(values).map(([key,value])=><div key={key}><dt className="text-[10px] font-bold uppercase text-[#668078]">{key}</dt><dd className="text-xs leading-5">{value}</dd></div>)}</dl></details>)}</div>
        </Panel>
        <Panel eyebrow="Calibración" title="Tolerancias aprendidas">
          <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-xs"><thead><tr className="text-[9px] uppercase text-[#668078]"><th className="pb-3">Variable</th><th>MAE histórico</th><th>Tolerancia</th><th>AEMET</th><th>RIA</th><th>Peso histórico</th></tr></thead><tbody className="divide-y divide-[#dfe6df]">{Object.entries(data.metrics.confidenceCalibration).map(([variable, metric])=><tr key={variable}><td className="py-3 font-extrabold">{variable}</td><td>{num(metric.historicalMae,2)}</td><td>{num(metric.tolerance,2)}</td><td>{metric.aemetSampleCount}</td><td>{metric.riaSampleCount}</td><td>{num(metric.historicalWeight*100)}%</td></tr>)}</tbody></table></div>
        </Panel>
      </div>

      {/* Row 5: Perfiles geográficos */}
      <Panel eyebrow="Satélite y microclima" title="Perfiles geográficos activos">
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">{data.profiles.map(profile=><article className="rounded-2xl border border-[#176b55]/10 bg-[#faf9f4] p-4" key={profile.locationId}><div className="flex items-start"><div><strong>{profile.name}</strong><div className="text-[10px] font-bold text-[#668078]">{profile.version} · {profile.microclimate.initialClass}</div></div><span className="ml-auto text-xs font-extrabold">{num(profile.terrain.centerElevationM)} m</span></div><div className="mt-3 grid grid-cols-3 gap-2 text-center">{Object.entries(profile.satelliteCoverage?.radii ?? {}).map(([radius, coverage])=><div className="rounded-xl bg-white p-2" key={radius}><strong className="text-xs">{radius}</strong><div className="mt-1 text-[10px] text-[#668078]">Veg. {num(coverage.vegetationPct)}%</div><div className="text-[10px] text-[#668078]">Densa {num(coverage.denseVegetationPct)}%</div><div className="text-[10px] text-[#39788d]">Agua {num(coverage.waterDetectedPct)}%</div></div>)}</div><dl className="mt-3 grid grid-cols-2 gap-2 text-[10px]"><div><dt className="text-[#668078]">Rango relieve</dt><dd className="font-bold">{num(profile.terrain.elevationRangeM)} m</dd></div><div><dt className="text-[#668078]">Agua cercana</dt><dd className="font-bold">{num(profile.environment.nearestWaterKm,2)} km</dd></div></dl></article>)}</div>
      </Panel>

      {/* Row 6: Comarca */}
      {data.comarca && <Panel eyebrow="Estimación comarcal" title={`Ancla AEMET ${data.comarca.anchorDate} · Tendencia RIA ${data.comarca.trendAgeDays ?? "?"} días`}>
        <p className="mb-4 text-xs text-[#668078]">{data.comarca.methodology}</p><div className="overflow-x-auto"><table className="w-full min-w-[780px] text-left text-xs"><thead><tr className="text-[9px] uppercase text-[#668078]"><th className="pb-3">Localidad</th><th>Confianza</th><th>Distancia AEMET</th><th>Temperatura</th><th>Humedad</th><th>Viento</th><th>ET0</th></tr></thead><tbody className="divide-y divide-[#dfe6df]">{data.comarca.estimates.map(estimate=><tr key={estimate.id}><td className="py-3 font-extrabold">{estimate.name}</td><td>{estimate.confidencePct}%</td><td>{num(estimate.distanceFromAemetKm)} km</td><td>{num(estimate.values.temperatureC)} °C</td><td>{num(estimate.values.humidityPct)}%</td><td>{num(estimate.values.windSpeedKmh)} km/h</td><td>{num(estimate.values.et0Mm,2)} mm</td></tr>)}</tbody></table></div>
      </Panel>}

      {/* Row 7: Widget + Auditoría */}
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Panel eyebrow="Widget público" title="Variantes para incrustar">
          <div className="grid gap-4 md:grid-cols-2">
            <a href="/widget" target="_blank" className="block rounded-2xl border border-[#176b55]/10 bg-[#faf9f4] p-4 transition-colors hover:border-[#176b55]/30">
              <span className="inline-block rounded-full bg-[#176b55]/10 px-2.5 py-0.5 text-[9px] font-extrabold uppercase text-[#176b55]">Neutro</span>
              <p className="mt-2 text-sm font-extrabold">Widget estándar</p>
              <p className="mt-1 text-[10px] text-[#668078]">Diseño neutro, slate, encaja en cualquier web.</p>
              <code className="mt-2 block rounded-lg bg-[#173f36] p-2 text-[9px] text-[#dce8d9] break-all">{'<iframe src="https://meteo-huescar.vercel.app/widget" width="420" height="500" style="border:none"></iframe>'}</code>
            </a>
            <a href="/widget?skin=ayto" target="_blank" className="block rounded-2xl border border-[#1B3668]/10 bg-[#f5f5f0] p-4 transition-colors hover:border-[#1B3668]/30">
              <span className="inline-block rounded-full bg-[#1B3668]/10 px-2.5 py-0.5 text-[9px] font-extrabold uppercase text-[#1B3668]">Ayuntamiento</span>
              <p className="mt-2 text-sm font-extrabold text-[#1B3668]">Estilo institucional</p>
              <p className="mt-1 text-[10px] text-[#666]">Paleta del Ayuntamiento de Huéscar: azul marino y dorado.</p>
              <code className="mt-2 block rounded-lg bg-[#1B3668] p-2 text-[9px] text-[#d4d9e6] break-all">{'<iframe src="https://meteo-huescar.vercel.app/widget?skin=ayto" width="420" height="500" style="border:none"></iframe>'}</code>
            </a>
          </div>
          <div className="mt-3 rounded-xl border border-[#176b55]/10 bg-[#faf9f4] p-3">
            <a href="/meteo" target="_blank" className="flex items-center gap-2">
              <span className="inline-block rounded-full bg-[#176b55]/10 px-2.5 py-0.5 text-[9px] font-extrabold uppercase text-[#176b55]">Dashboard</span>
              <strong className="text-sm">Página /meteo</strong>
              <span className="ml-auto text-[10px] text-[#668078]">Abrir →</span>
            </a>
            <p className="mt-1 text-[10px] text-[#668078]">Dashboard completo con gráficos, datos agrícolas, ganaderos, rayos y avisos AEMET.</p>
          </div>
          <p className="mt-3 text-[10px] text-[#668078]">Estas URLs también funcionan en la página principal: <code className="rounded bg-[#edf4ec] px-1.5 py-0.5 text-[9px]">/?skin=ayto</code></p>
        </Panel>

        <Panel eyebrow="Auditoría" title="Datos técnicos completos">
          <details><summary className="cursor-pointer text-sm font-extrabold">Mostrar JSON completo de la conclusión actual</summary><pre className="mt-4 max-h-[500px] overflow-auto rounded-2xl bg-[#173f36] p-4 text-[10px] leading-5 text-[#dce8d9]">{JSON.stringify(data, null, 2)}</pre></details>
        </Panel>
      </div>

      <footer className="py-6 text-[10px] font-bold uppercase tracking-widest text-[#668078]">Generado {new Date(data.generatedAt).toLocaleString("es-ES")}</footer>
    </main>
  );
}
