import { useQuery } from "@tanstack/react-query";

import apiInstance from "../lib/apiInstance";
import engineApi from "../lib/engineInstance";

export function useApiHealthQuery(intervalMs = 30000) {
  return useQuery({
    queryKey: ["health", "api"],
    queryFn: async () => {
      await apiInstance.get("/health", { timeout: 5000 });

      return "connected" as const;
    },
    refetchInterval: intervalMs,
    retry: false,
  });
}

export function useEngineHealthQuery(intervalMs = 30000) {
  return useQuery({
    queryKey: ["health", "engine"],
    queryFn: async () => {
      await engineApi.get("/health", { timeout: 5000 });

      return "connected" as const;
    },
    refetchInterval: intervalMs,
    retry: false,
  });
}
