import { getComarcaEstimates } from "@/services/layers/layerComarca";

async function main() {
  try {
    const result = await getComarcaEstimates();
    console.log("Comarca OK");
    console.log("Anchor date:", result.anchorDate);
    console.log("Trend source:", result.trendSource, "age:", result.trendAgeDays, "days");
    console.log("Estimates count:", result.estimates.length);
    console.log("First:", result.estimates[0]?.name, result.estimates[0]?.values.temperatureC);
  } catch (error) {
    console.error("Comarca error:", error);
    process.exit(1);
  }
}

main();