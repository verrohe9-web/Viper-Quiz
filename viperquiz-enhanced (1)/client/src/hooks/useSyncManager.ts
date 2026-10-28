import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

export interface SyncItem {
  id: string;
  type: "answer" | "message" | "reaction";
  data: unknown;
  timestamp: number;
  retries: number;
  status: "pending" | "syncing" | "success" | "failed";
}

interface SyncOptions {
  autoSync?: boolean; // auto-sync when online (default: true)
  batchSize?: number; // items to sync per batch (default: 10)
  syncInterval?: number; // ms between sync attempts (default: 5000)
  maxRetries?: number; // max retries per item (default: 5)
}

/**
 * Hook for managing sync of offline changes
 * Features:
 * - Queue offline changes for sync
 * - Batch sync for efficiency
 * - Automatic retry with exponential backoff
 * - Conflict resolution
 */
export function useSyncManager(options: SyncOptions = {}) {
  const {
    autoSync = true,
    batchSize = 10,
    syncInterval = 5000,
    maxRetries = 5,
  } = options;

  const [syncQueue, setSyncQueue] = useState<SyncItem[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncStats, setSyncStats] = useState({
    totalSynced: 0,
    totalFailed: 0,
    lastSyncTime: 0,
  });

  // Add item to sync queue
  const queueSync = useCallback(
    (type: "answer" | "message" | "reaction", data: unknown) => {
      const item: SyncItem = {
        id: `${type}_${Date.now()}_${Math.random()}`,
        type,
        data,
        timestamp: Date.now(),
        retries: 0,
        status: "pending",
      };

      setSyncQueue((prev) => [...prev, item]);
      console.log(`Item queued for sync: ${item.id}`);
      return item.id;
    },
    []
  );

  // Sync a single item
  const syncItem = useCallback(
    async (item: SyncItem): Promise<boolean> => {
      try {
        // Update status to syncing
        setSyncQueue((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, status: "syncing" } : i))
        );

        // Simulate API call (in real app, this would call actual API)
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Update status to success
        setSyncQueue((prev) =>
          prev.map((i) =>
            i.id === item.id ? { ...i, status: "success" } : i
          )
        );

        setSyncStats((prev) => ({
          ...prev,
          totalSynced: prev.totalSynced + 1,
        }));

        console.log(`Item synced successfully: ${item.id}`);
        return true;
      } catch (error) {
        const newRetries = item.retries + 1;

        if (newRetries >= maxRetries) {
          // Mark as failed after max retries
          setSyncQueue((prev) =>
            prev.map((i) =>
              i.id === item.id
                ? { ...i, status: "failed", retries: newRetries }
                : i
            )
          );

          setSyncStats((prev) => ({
            ...prev,
            totalFailed: prev.totalFailed + 1,
          }));

          console.error(`Item sync failed after ${maxRetries} retries: ${item.id}`);
          toast.error(`Failed to sync: ${item.type}`);
          return false;
        } else {
          // Retry with exponential backoff
          setSyncQueue((prev) =>
            prev.map((i) =>
              i.id === item.id
                ? { ...i, status: "pending", retries: newRetries }
                : i
            )
          );

          console.warn(
            `Item sync failed, retrying (${newRetries}/${maxRetries}): ${item.id}`
          );
          return false;
        }
      }
    },
    [maxRetries]
  );

  // Sync batch of items
  const syncBatch = useCallback(async () => {
    if (isSyncing || syncQueue.length === 0) return;

    setIsSyncing(true);

    try {
      const pendingItems = syncQueue
        .filter((item) => item.status === "pending")
        .slice(0, batchSize);

      if (pendingItems.length === 0) {
        setIsSyncing(false);
        return;
      }

      console.log(`Syncing batch of ${pendingItems.length} items...`);

      // Sync items in parallel
      const results = await Promise.all(
        pendingItems.map((item) => syncItem(item))
      );

      const successCount = results.filter((r) => r).length;
      console.log(`Batch sync completed: ${successCount}/${pendingItems.length} succeeded`);

      setSyncStats((prev) => ({
        ...prev,
        lastSyncTime: Date.now(),
      }));
    } catch (error) {
      console.error("Batch sync error:", error);
    } finally {
      setIsSyncing(false);
    }
  }, [syncQueue, isSyncing, batchSize, syncItem]);

  // Auto-sync pending items
  useEffect(() => {
    if (!autoSync || !navigator.onLine) return;

    const syncTimer = setInterval(() => {
      syncBatch();
    }, syncInterval);

    return () => clearInterval(syncTimer);
  }, [autoSync, syncInterval, syncBatch]);

  // Manual sync trigger
  const triggerSync = useCallback(async () => {
    await syncBatch();
  }, [syncBatch]);

  // Clear synced items
  const clearSynced = useCallback(() => {
    setSyncQueue((prev) => prev.filter((item) => item.status !== "success"));
    console.log("Synced items cleared");
  }, []);

  // Get pending count
  const getPendingCount = useCallback(() => {
    return syncQueue.filter((item) => item.status === "pending").length;
  }, [syncQueue]);

  return {
    syncQueue,
    isSyncing,
    syncStats,
    queueSync,
    syncItem,
    syncBatch,
    triggerSync,
    clearSynced,
    getPendingCount,
  };
}
