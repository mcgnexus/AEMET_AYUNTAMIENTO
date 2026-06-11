import type { CalibratedVariable, ConfidenceCalibration } from "@/lib/weatherStore";
import type { LayerMetadata } from "./layerObservation.types";

export type LayerCalibration = {
  meta: LayerMetadata;
  variables: CalibratedVariable[];
  tolerances: ConfidenceCalibration;
  provenance: {
    aemetSampleCount: number;
    riaSampleCount: number;
    effectiveRiaSamples: number;
    periodDays: number;
  };
  weighting: {
    riaEffectiveRatio: (riaCount: number) => number;
  };
};
