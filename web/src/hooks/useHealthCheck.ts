import { useEffect, useState } from "react";
import axios from "axios";

import { BaseUrlAPI } from "../constants";

export type HealthStatus = "checking" | "connected" | "disconnected";

export function useHealthCheck(intervalMs = 30000) {
  const [status, setStatus] = useState<HealthStatus>("checking");

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        await axios.get(`${BaseUrlAPI}/health`, { timeout: 5000 });
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
