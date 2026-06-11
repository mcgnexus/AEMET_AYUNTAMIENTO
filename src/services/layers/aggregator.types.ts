import type { LayerObservation } from "./layerObservation.types";
import type { LayerComarca } from "./layerComarca.types";
import type { LayerGeographic } from "./layerGeographic.types";
import type { ConfidenceCalibration } from "@/lib/weatherStore";

export type LayerAvailability = {
  observation: "ok" | "degraded" | "unavailable";
  comarca: "ok" | "degraded" | "unavailable";
  geographic: "ok" | "degraded" | "unavailable";
  calibration: "ok" | "degraded" | "unavailable";
};

export type AggregatedWeather = {
  generatedAt: string;
  availability: LayerAvailability;
  warnings: string[];
  observation: LayerObservation;
  comarca: LayerComarca | null;
  geographic: LayerGeographic | null;
  calibration: ConfidenceCalibration | null;
};

export type AggregatorOptions = {
  observationTimeoutMs?: number;
  comarcaTimeoutMs?: number;
  geographicTimeoutMs?: number;
  calibrationTimeoutMs?: number;
  forceRefresh?: boolean;
};
