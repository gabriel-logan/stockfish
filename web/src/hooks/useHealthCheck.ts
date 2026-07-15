import { useEffect, useState } from "react";

export type HealthStatus = "checking" | "connected" | "disconnected";

interface HealthClient {
  get: (url: string, config: { timeout: number }) => Promise<unknown>;
}

export function useHealthCheck(
  client: HealthClient,
  intervalMs = 30000,
): HealthStatus {
  const [status, setStatus] = useState<HealthStatus>("checking");

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        await client.get("/health", { timeout: 5000 });

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
  }, [client, intervalMs]);

  return status;
}
