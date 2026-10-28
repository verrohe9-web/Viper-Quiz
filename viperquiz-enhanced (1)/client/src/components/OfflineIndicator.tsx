import { useEffect, useState } from "react";
import { Wifi, WifiOff, RotateCw } from "lucide-react";
import { toast } from "sonner";

interface OfflineIndicatorProps {
  isOnline: boolean;
  isReconnecting?: boolean;
  reconnectAttempts?: number;
  maxReconnectAttempts?: number;
  pendingSyncCount?: number;
}

export function OfflineIndicator({
  isOnline,
  isReconnecting = false,
  reconnectAttempts = 0,
  maxReconnectAttempts = 10,
  pendingSyncCount = 0,
}: OfflineIndicatorProps) {
  const [showBanner, setShowBanner] = useState(!isOnline);

  useEffect(() => {
    setShowBanner(!isOnline);
  }, [isOnline]);

  if (isOnline && !isReconnecting && pendingSyncCount === 0) {
    return null;
  }

  const getStatusMessage = () => {
    if (isReconnecting) {
      return `Reconnecting... (${reconnectAttempts}/${maxReconnectAttempts})`;
    }
    if (!isOnline) {
      return "You are offline - changes will be synced when online";
    }
    if (pendingSyncCount > 0) {
      return `Syncing ${pendingSyncCount} pending change${pendingSyncCount > 1 ? "s" : ""}...`;
    }
    return "Connection restored";
  };

  const getStatusColor = () => {
    if (isReconnecting) return "bg-yellow-500";
    if (!isOnline) return "bg-red-500";
    if (pendingSyncCount > 0) return "bg-blue-500";
    return "bg-green-500";
  };

  const getIcon = () => {
    if (isReconnecting) {
      return <RotateCw className="w-4 h-4 animate-spin" />;
    }
    if (!isOnline) {
      return <WifiOff className="w-4 h-4" />;
    }
    return <Wifi className="w-4 h-4" />;
  };

  return (
    <>
      {/* Top Banner */}
      {showBanner && (
        <div
          className={`fixed top-0 left-0 right-0 ${getStatusColor()} text-white px-4 py-3 text-center text-sm z-50 animate-pulse flex items-center justify-center gap-2`}
        >
          {getIcon()}
          <span>{getStatusMessage()}</span>
        </div>
      )}

      {/* Bottom Right Status Dot */}
      <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2">
        {/* Status Indicator */}
        <div
          className={`w-3 h-3 rounded-full ${getStatusColor()} shadow-lg ${
            isReconnecting ? "animate-spin" : "animate-pulse"
          }`}
          title={getStatusMessage()}
        />

        {/* Pending Sync Badge */}
        {pendingSyncCount > 0 && (
          <div className="bg-blue-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center shadow-lg">
            {pendingSyncCount > 9 ? "9+" : pendingSyncCount}
          </div>
        )}
      </div>

      {/* Floating Toast for Reconnection */}
      {isReconnecting && reconnectAttempts > 0 && (
        <div className="fixed bottom-20 right-4 z-40 bg-yellow-500 text-white px-4 py-2 rounded-lg shadow-lg text-sm">
          Attempting to reconnect...
        </div>
      )}
    </>
  );
}
