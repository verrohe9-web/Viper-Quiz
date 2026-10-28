import { useEffect, useCallback } from "react";

interface PersistenceOptions {
  key: string; // localStorage key
  version?: number; // schema version for migrations
  autoSave?: boolean; // auto-save on changes (default: true)
  saveInterval?: number; // ms between auto-saves (default: 5000)
}

/**
 * Hook for persisting state to localStorage and recovering from crashes
 * Features:
 * - Automatic state persistence
 * - Crash recovery on page reload
 * - Schema versioning for migrations
 * - Automatic cleanup of stale data
 */
export function useStatePersistence<T>(
  state: T,
  options: PersistenceOptions
) {
  const {
    key,
    version = 1,
    autoSave = true,
    saveInterval = 5000,
  } = options;

  // Save state to localStorage
  const saveState = useCallback(() => {
    try {
      const data = {
        version,
        timestamp: Date.now(),
        data: state,
      };
      localStorage.setItem(key, JSON.stringify(data));
      console.log(`State persisted to localStorage: ${key}`);
    } catch (error) {
      console.error("Failed to persist state:", error);
    }
  }, [state, key, version]);

  // Load state from localStorage
  const loadState = useCallback((): T | null => {
    try {
      const item = localStorage.getItem(key);
      if (!item) return null;

      const data = JSON.parse(item);
      if (data.version !== version) {
        console.warn(`State version mismatch: expected ${version}, got ${data.version}`);
        return null;
      }

      // Check if state is stale (older than 24 hours)
      if (Date.now() - data.timestamp > 24 * 60 * 60 * 1000) {
        localStorage.removeItem(key);
        return null;
      }

      console.log(`State restored from localStorage: ${key}`);
      return data.data;
    } catch (error) {
      console.error("Failed to load state:", error);
      return null;
    }
  }, [key, version]);

  // Clear persisted state
  const clearState = useCallback(() => {
    try {
      localStorage.removeItem(key);
      console.log(`State cleared from localStorage: ${key}`);
    } catch (error) {
      console.error("Failed to clear state:", error);
    }
  }, [key]);

  // Auto-save state
  useEffect(() => {
    if (!autoSave) return;

    const interval = setInterval(saveState, saveInterval);
    return () => clearInterval(interval);
  }, [autoSave, saveState, saveInterval]);

  // Save state before page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      saveState();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [saveState]);

  return {
    saveState,
    loadState,
    clearState,
  };
}
