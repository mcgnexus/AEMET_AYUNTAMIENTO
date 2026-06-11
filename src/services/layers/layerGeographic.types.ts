import type { GeographicProfile } from "@/services/geographicProfileService";
import type { LayerMetadata } from "./layerObservation.types";

export type LayerGeographic = {
  meta: LayerMetadata;
  satelliteLastUpdate: string | null;
  satellitePeriodFrom: string | null;
  satellitePeriodTo: string | null;
  profiles: GeographicProfile[];
  fallback: {
    used: boolean;
    reason: string | null;
  };
};
