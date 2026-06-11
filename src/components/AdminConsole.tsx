"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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
};

const number = (value: unknown, digits = 1) =>
  typeof value === "number" ? value.toLocaleString("es-ES", { maximumFractionDigits: digits }) : "—";

function Panel({ title, eyebrow, children }: { title: string; eyebrow: string; children: React.ReactNode }) {
  return <section className="card p-5 sm:p-6"><span className="eyebrow">{eyebrow}</span><h2 className="mb-5 mt-1 text-xl font-extrabold tracking-[-.04em]">{title}</h2>{children}</section>;
}

function Status({ value }: { value: string }) {
  const style = value === "OK" ? "bg-[#e6f2e7] text-[#176b55]" : value === "DEGRADED" ? "bg-[#fff1df] text-[#a65f28]" : "bg-[#fff1ef] text-[#a9423b]";
  return <span className={`rounded-full px-2 py-1 text-[9px] font-extrabold ${style}`}>{value}</span>;
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

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Panel eyebrow="Algoritmo" title="Cómo llega a sus conclusiones">
          <div className="space-y-3">{Object.entries(data.algorithm).map(([section, values])=><details className="rounded-2xl border border-[#176b55]/10 bg-[#faf9f4] p-4" key={section} open><summary className="cursor-pointer text-sm font-extrabold">{section}</summary><dl className="mt-3 space-y-2">{Object.entries(values).map(([key,value])=><div key={key}><dt className="text-[10px] font-bold uppercase text-[#668078]">{key}</dt><dd className="text-xs leading-5">{value}</dd></div>)}</dl></details>)}</div>
        </Panel>
        <Panel eyebrow="Calibración" title="Tolerancias aprendidas">
          <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-xs"><thead><tr className="text-[9px] uppercase text-[#668078]"><th className="pb-3">Variable</th><th>MAE histórico</th><th>Tolerancia</th><th>AEMET</th><th>RIA</th><th>Peso histórico</th></tr></thead><tbody className="divide-y divide-[#dfe6df]">{Object.entries(data.metrics.confidenceCalibration).map(([variable, metric])=><tr key={variable}><td className="py-3 font-extrabold">{variable}</td><td>{number(metric.historicalMae,2)}</td><td>{number(metric.tolerance,2)}</td><td>{metric.aemetSampleCount}</td><td>{metric.riaSampleCount}</td><td>{number(metric.historicalWeight*100)}%</td></tr>)}</tbody></table></div>
        </Panel>
      </div>

      <Panel eyebrow="Satélite y microclima" title="Perfiles geográficos activos">
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">{data.profiles.map(profile=><article className="rounded-2xl border border-[#176b55]/10 bg-[#faf9f4] p-4" key={profile.locationId}><div className="flex items-start"><div><strong>{profile.name}</strong><div className="text-[10px] font-bold text-[#668078]">{profile.version} · {profile.microclimate.initialClass}</div></div><span className="ml-auto text-xs font-extrabold">{number(profile.terrain.centerElevationM)} m</span></div><div className="mt-3 grid grid-cols-3 gap-2 text-center">{Object.entries(profile.satelliteCoverage?.radii ?? {}).map(([radius, coverage])=><div className="rounded-xl bg-white p-2" key={radius}><strong className="text-xs">{radius}</strong><div className="mt-1 text-[10px] text-[#668078]">Veg. {number(coverage.vegetationPct)}%</div><div className="text-[10px] text-[#668078]">Densa {number(coverage.denseVegetationPct)}%</div><div className="text-[10px] text-[#39788d]">Agua {number(coverage.waterDetectedPct)}%</div></div>)}</div><dl className="mt-3 grid grid-cols-2 gap-2 text-[10px]"><div><dt className="text-[#668078]">Rango relieve</dt><dd className="font-bold">{number(profile.terrain.elevationRangeM)} m</dd></div><div><dt className="text-[#668078]">Agua cercana</dt><dd className="font-bold">{number(profile.environment.nearestWaterKm,2)} km</dd></div></dl></article>)}</div>
      </Panel>

      {data.comarca && <Panel eyebrow="Estimación comarcal" title={`Ancla AEMET ${data.comarca.anchorDate} · Tendencia RIA ${data.comarca.trendAgeDays ?? "?"} días`}>
        <p className="mb-4 text-xs text-[#668078]">{data.comarca.methodology}</p><div className="overflow-x-auto"><table className="w-full min-w-[780px] text-left text-xs"><thead><tr className="text-[9px] uppercase text-[#668078]"><th className="pb-3">Localidad</th><th>Confianza</th><th>Distancia AEMET</th><th>Temperatura</th><th>Humedad</th><th>Viento</th><th>ET0</th></tr></thead><tbody className="divide-y divide-[#dfe6df]">{data.comarca.estimates.map(estimate=><tr key={estimate.id}><td className="py-3 font-extrabold">{estimate.name}</td><td>{estimate.confidencePct}%</td><td>{number(estimate.distanceFromAemetKm)} km</td><td>{number(estimate.values.temperatureC)} °C</td><td>{number(estimate.values.humidityPct)}%</td><td>{number(estimate.values.windSpeedKmh)} km/h</td><td>{number(estimate.values.et0Mm,2)} mm</td></tr>)}</tbody></table></div>
      </Panel>}

      <Panel eyebrow="Auditoría" title="Datos técnicos completos">
        <details><summary className="cursor-pointer text-sm font-extrabold">Mostrar JSON completo de la conclusión actual</summary><pre className="mt-4 max-h-[500px] overflow-auto rounded-2xl bg-[#173f36] p-4 text-[10px] leading-5 text-[#dce8d9]">{JSON.stringify(data, null, 2)}</pre></details>
      </Panel>

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
        <p className="mt-3 text-[10px] text-[#668078]">Estas URLs también funcionan en la página principal: <code className="rounded bg-[#edf4ec] px-1.5 py-0.5 text-[9px]">/?skin=ayto</code></p>
      </Panel>

      <footer className="py-6 text-[10px] font-bold uppercase tracking-widest text-[#668078]">Generado {new Date(data.generatedAt).toLocaleString("es-ES")}</footer>
    </main>
  );
}
