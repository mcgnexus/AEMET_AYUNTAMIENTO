import { WeatherDashboard } from "@/components/WeatherDashboard";
import { WeatherDashboardAyto } from "@/components/WeatherDashboardAyto";

export default async function WidgetPage({
  searchParams,
}: {
  searchParams: Promise<{ skin?: string }>;
}) {
  const { skin } = await searchParams;

  return (
    <div className="flex w-full items-start justify-center">
      {skin === "ayto" ? <WeatherDashboardAyto /> : <WeatherDashboard />}
    </div>
  );
}
