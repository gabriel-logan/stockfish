import { useEffect, useState } from "react";

import engineApi from "../lib/engineInstance";

export type EngineHealthStatus = "checking" | "connected" | "disconnected";

export function useEngineHealthCheck(intervalMs = 30000) {
  const [status, setStatus] = useState<EngineHealthStatus>("checking");

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        await engineApi.get("/health", { timeout: 5000 });
        if (!cancelled) setStatus("connected");
      } catch {
        if (!cancelled) setStatus("disconnected");
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
