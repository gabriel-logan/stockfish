import apiInstance from "../lib/apiInstance";
import { type HealthStatus, useHealthCheck } from "./useHealthCheck";

export type ApiHealthStatus = HealthStatus;

export function useApiHealthCheck(intervalMs = 30000): ApiHealthStatus {
  return useHealthCheck(apiInstance, intervalMs);
}
