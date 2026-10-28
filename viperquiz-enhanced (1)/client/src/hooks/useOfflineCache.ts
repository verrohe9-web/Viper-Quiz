import { useCallback, useEffect, useState } from "react";

export interface CachedGameData {
  roomCode: string;
  playerId: string;
  playerName: string;
  category: string;
  questions: Array<{
    id: string;
    question: string;
    options: string[];
    correctAnswer: string;
  }>;
  currentQuestionIndex: number;
  answers: Record<number, string>; // questionIndex -> selectedAnswer
  score: number;
  startTime: number;
  endTime?: number;
  isOffline: boolean;
  lastSyncTime: number;
  pendingSync: Array<{
    type: "answer" | "message";
    data: unknown;
    timestamp: number;
  }>;
}

interface OfflineCacheOptions {
  maxCacheSize?: number; // max cache size in MB (default: 50)
  autoSync?: boolean; // auto-sync when online (default: true)
}

/**
 * Hook for managing offline game data caching
 * Features:
 * - Cache game questions and answers locally
 * - Track pending changes for sync
 * - Detect online/offline status
 * - Auto-sync when connection restored
 */
export function useOfflineCache(options: OfflineCacheOptions = {}) {
  const { maxCacheSize = 50, autoSync = true } = options;

  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [cachedGames, setCachedGames] = useState<Map<string, CachedGameData>>(new Map());
  const [syncQueue, setSyncQueue] = useState<Array<{ gameId: string; data: unknown }>>(
    []
  );

  // Detect online/offline status
  useEffect(() => {
    const handleOnline = () => {
      console.log("Connection restored - going online");
      setIsOnline(true);
    };

    const handleOffline = () => {
      console.log("Connection lost - going offline");
      setIsOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Save game data to cache
  const saveGameData = useCallback((gameData: CachedGameData) => {
    try {
      const key = `game_${gameData.roomCode}`;
      const dataStr = JSON.stringify(gameData);
      const sizeInMB = new Blob([dataStr]).size / (1024 * 1024);

      if (sizeInMB > maxCacheSize) {
        console.warn(`Game data exceeds cache limit (${sizeInMB.toFixed(2)}MB)`);
        return false;
      }

      localStorage.setItem(key, dataStr);
      setCachedGames((prev) => new Map(prev).set(gameData.roomCode, gameData));
      console.log(`Game data cached: ${gameData.roomCode}`);
      return true;
    } catch (error) {
      console.error("Failed to cache game data:", error);
      return false;
    }
  }, [maxCacheSize]);

  // Load game data from cache
  const loadGameData = useCallback((roomCode: string): CachedGameData | null => {
    try {
      const key = `game_${roomCode}`;
      const data = localStorage.getItem(key);

      if (!data) return null;

      const gameData = JSON.parse(data) as CachedGameData;
      setCachedGames((prev) => new Map(prev).set(roomCode, gameData));
      console.log(`Game data loaded from cache: ${roomCode}`);
      return gameData;
    } catch (error) {
      console.error("Failed to load game data:", error);
      return null;
    }
  }, []);

  // Add answer to sync queue
  const queueAnswer = useCallback(
    (roomCode: string, questionIndex: number, answer: string) => {
      setSyncQueue((prev) => [
        ...prev,
        {
          gameId: roomCode,
          data: { questionIndex, answer, timestamp: Date.now() },
        },
      ]);
    },
    []
  );

  // Get pending changes for a game
  const getPendingChanges = useCallback(
    (roomCode: string) => {
      return syncQueue.filter((item) => item.gameId === roomCode);
    },
    [syncQueue]
  );

  // Clear sync queue after successful sync
  const clearSyncQueue = useCallback((roomCode: string) => {
    setSyncQueue((prev) => prev.filter((item) => item.gameId !== roomCode));
  }, []);

  // Clear all cached data
  const clearCache = useCallback((roomCode?: string) => {
    try {
      if (roomCode) {
        localStorage.removeItem(`game_${roomCode}`);
        setCachedGames((prev) => {
          const newMap = new Map(prev);
          newMap.delete(roomCode);
          return newMap;
        });
        console.log(`Cache cleared for room: ${roomCode}`);
      } else {
        // Clear all game caches
        const keys = Object.keys(localStorage).filter((k) => k.startsWith("game_"));
        keys.forEach((k) => localStorage.removeItem(k));
        setCachedGames(new Map());
        console.log("All game caches cleared");
      }
    } catch (error) {
      console.error("Failed to clear cache:", error);
    }
  }, []);

  // Get cache statistics
  const getCacheStats = useCallback(() => {
    let totalSize = 0;
    let gameCount = 0;

    const keys = Object.keys(localStorage).filter((k) => k.startsWith("game_"));
    keys.forEach((k) => {
      const data = localStorage.getItem(k);
      if (data) {
        totalSize += new Blob([data]).size;
        gameCount++;
      }
    });

    return {
      totalSize: (totalSize / (1024 * 1024)).toFixed(2),
      gameCount,
      maxSize: maxCacheSize,
      pendingSyncCount: syncQueue.length,
    };
  }, [maxCacheSize, syncQueue.length]);

  return {
    isOnline,
    cachedGames,
    syncQueue,
    saveGameData,
    loadGameData,
    queueAnswer,
    getPendingChanges,
    clearSyncQueue,
    clearCache,
    getCacheStats,
  };
}
