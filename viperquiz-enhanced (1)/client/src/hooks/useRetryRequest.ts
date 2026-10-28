import { useCallback } from "react";

interface RetryOptions {
  maxRetries?: number; // max retry attempts (default: 5)
  initialDelay?: number; // initial delay in ms (default: 1000)
  maxDelay?: number; // max delay in ms (default: 30000)
  backoffMultiplier?: number; // exponential backoff multiplier (default: 2)
  onRetry?: (attempt: number, delay: number) => void; // callback on retry
}

/**
 * Hook for retrying failed requests with exponential backoff
 * Features:
 * - Exponential backoff strategy
 * - Configurable max retries and delays
 * - Automatic retry on network failures
 * - Callback hooks for monitoring
 */
export function useRetryRequest(options: RetryOptions = {}) {
  const {
    maxRetries = 5,
    initialDelay = 1000,
    maxDelay = 30000,
    backoffMultiplier = 2,
    onRetry,
  } = options;

  /**
   * Execute a request with automatic retry on failure
   */
  const executeWithRetry = useCallback(
    async <T,>(
      fn: () => Promise<T>,
      errorMessage?: string
    ): Promise<T> => {
      let lastError: Error | null = null;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          return await fn();
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));

          if (attempt < maxRetries) {
            // Calculate exponential backoff delay
            const delay = Math.min(
              initialDelay * Math.pow(backoffMultiplier, attempt),
              maxDelay
            );

            console.warn(
              `Request failed (attempt ${attempt + 1}/${maxRetries + 1}), ` +
              `retrying in ${delay}ms: ${errorMessage || lastError.message}`
            );

            onRetry?.(attempt + 1, delay);

            // Wait before retrying
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }

      // All retries exhausted
      throw new Error(
        `Request failed after ${maxRetries + 1} attempts: ${lastError?.message || "Unknown error"}`
      );
    },
    [maxRetries, initialDelay, maxDelay, backoffMultiplier, onRetry]
  );

  /**
   * Execute multiple requests in parallel with retry
   */
  const executeMultipleWithRetry = useCallback(
    async <T,>(
      requests: Array<{ fn: () => Promise<T>; name?: string }>
    ): Promise<T[]> => {
      return Promise.all(
        requests.map((req) =>
          executeWithRetry(req.fn, req.name)
        )
      );
    },
    [executeWithRetry]
  );

  return {
    executeWithRetry,
    executeMultipleWithRetry,
  };
}
