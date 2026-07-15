import engineApi from "../lib/engineInstance";
import { type HealthStatus, useHealthCheck } from "./useHealthCheck";

export type EngineHealthStatus = HealthStatus;

export function useEngineHealthCheck(intervalMs = 30000): EngineHealthStatus {
  return useHealthCheck(engineApi, intervalMs);
}
