import { useEffect, useState } from "react";

import apiInstance from "../lib/apiInstance";

export type ApiHealthStatus = "checking" | "connected" | "disconnected";

export function useApiHealthCheck(intervalMs = 30000) {
  const [status, setStatus] = useState<ApiHealthStatus>("checking");

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        await apiInstance.get("/health", { timeout: 5000 });
        if (!cancelled) {
          setStatus("connected");
        }
      } catch {
        if (!cancelled) {
          setStatus("disconnected");
        }
      }
    };

    check();
    const id = setInterval(check, intervalMs);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [intervalMs]);

  return status;
}
