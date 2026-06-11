import { WeatherDashboard } from "@/components/WeatherDashboard";
import { WeatherDashboardAyto } from "@/components/WeatherDashboardAyto";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ skin?: string }>;
}) {
  const { skin } = await searchParams;

  return (
    <div className="flex min-h-dvh items-start justify-center p-4 sm:items-center">
      {skin === "ayto" ? <WeatherDashboardAyto /> : <WeatherDashboard />}
    </div>
  );
}
