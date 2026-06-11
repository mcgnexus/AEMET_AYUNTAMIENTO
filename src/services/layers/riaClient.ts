const RIA_ENDPOINT =
  "https://www.juntadeandalucia.es/agriculturaypesca/ifapa/riaws/datosdiarios/18/2";

export type RiaDailyRecord = {
  fecha: string;
  tempMedia: number;
  humedadMedia: number;
  precipitacion: number;
  velViento: number;
  velVientoMax: number;
  radiacion: number;
  et0: number;
};

export type RiaRaw = {
  fecha: string;
  tempMedia: number;
  humedadMedia: number;
  precipitacion: number;
  velViento: number;
  velVientoMax: number;
};

export async function fetchRiaDaily(
  startDate: string,
  endDate: string,
  options?: { signal?: AbortSignal },
): Promise<RiaDailyRecord[]> {
  const response = await fetch(
    `${RIA_ENDPOINT}/${startDate}/${endDate}/true`,
    {
      cache: "no-store",
      signal: options?.signal ?? AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) throw new Error(`RIA respondió ${response.status}`);
  const records = (await response.json()) as RiaDailyRecord[];
  return records;
}

export function getLatestRiaRecord(records: RiaDailyRecord[]): RiaDailyRecord {
  const latest = records.sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
  if (!latest) throw new Error("RIA no devolvió jornadas cerradas");
  return latest;
}

export function getRiaRecordForDate(records: RiaDailyRecord[], date: string): RiaDailyRecord | null {
  return records.find((r) => r.fecha === date) ?? null;
}
