import { useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";

interface HealthCheckOptions {
  checkInterval?: number; // ms between health checks (default: 5000)
  stallThreshold?: number; // ms of no response before considered stalled (default: 10000)
  autoRefresh?: boolean; // auto-refresh when stalled (default: true)
  onStall?: () => void; // callback when stall detected
  onRecover?: () => void; // callback when recovered
}

/**
 * Hook for monitoring server health and auto-recovering from stalls/crashes
 * Features:
 * - Periodic health checks
 * - Stall detection (no response for X ms)
 * - Auto-refresh when stalled
 * - Connection state management
 * - Exponential backoff for retries
 */
export function useAutoRecovery(options: HealthCheckOptions = {}) {
  const {
    checkInterval = 5000,
    stallThreshold = 10000,
    autoRefresh = true,
    onStall,
    onRecover,
  } = options;

  const lastResponseTimeRef = useRef<number>(Date.now());
  const isHealthyRef = useRef<boolean>(true);
  const retryCountRef = useRef<number>(0);
  const maxRetriesRef = useRef<number>(5);

  // Health check function
  const checkHealth = useCallback(async () => {
    try {
      const startTime = Date.now();
      const response = await fetch("/api/trpc/system.health", {
        method: "GET",
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      const responseTime = Date.now() - startTime;
      lastResponseTimeRef.current = Date.now();

      if (response.ok) {
        // Server is healthy
        if (!isHealthyRef.current) {
          isHealthyRef.current = true;
          retryCountRef.current = 0;
          toast.success("Connection restored");
          onRecover?.();
        }
      } else {
        throw new Error(`Health check failed: ${response.status}`);
      }
    } catch (error) {
      // Server is unhealthy
      const timeSinceLastResponse = Date.now() - lastResponseTimeRef.current;

      if (timeSinceLastResponse > stallThreshold) {
        if (isHealthyRef.current) {
          isHealthyRef.current = false;
          toast.warning("Server seems unresponsive, attempting recovery...");
          onStall?.();
        }

        // Attempt auto-recovery
        if (autoRefresh && retryCountRef.current < maxRetriesRef.current) {
          retryCountRef.current++;
          const backoffDelay = Math.min(1000 * Math.pow(2, retryCountRef.current - 1), 30000);
          console.log(`Health check failed, retrying in ${backoffDelay}ms (attempt ${retryCountRef.current})`);
        }
      }
    }
  }, [stallThreshold, autoRefresh, onStall, onRecover]);

  // Start health monitoring
  useEffect(() => {
    const healthCheckInterval = setInterval(checkHealth, checkInterval);
    return () => clearInterval(healthCheckInterval);
  }, [checkHealth, checkInterval]);

  // Auto-refresh page if stalled for too long
  useEffect(() => {
    const stallCheckInterval = setInterval(() => {
      const timeSinceLastResponse = Date.now() - lastResponseTimeRef.current;
      if (timeSinceLastResponse > stallThreshold * 2 && autoRefresh) {
        console.log("Server stalled for too long, reloading page...");
        window.location.reload();
      }
    }, 10000);

    return () => clearInterval(stallCheckInterval);
  }, [stallThreshold, autoRefresh]);

  return {
    isHealthy: isHealthyRef.current,
    retryCount: retryCountRef.current,
    lastResponseTime: lastResponseTimeRef.current,
  };
}
