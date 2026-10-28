import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RotateCw, AlertCircle, CheckCircle } from "lucide-react";

interface ReconnectionDialogProps {
  isOpen: boolean;
  isReconnecting: boolean;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
  lastError?: string;
  onRetry: () => void;
  onCancel: () => void;
}

export function ReconnectionDialog({
  isOpen,
  isReconnecting,
  reconnectAttempts,
  maxReconnectAttempts,
  lastError,
  onRetry,
  onCancel,
}: ReconnectionDialogProps) {
  const isMaxAttemptsReached = reconnectAttempts >= maxReconnectAttempts;
  const progressPercent = (reconnectAttempts / maxReconnectAttempts) * 100;

  return (
    <Dialog open={isOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isReconnecting ? (
              <>
                <RotateCw className="w-5 h-5 animate-spin text-blue-500" />
                Reconnecting to Game
              </>
            ) : isMaxAttemptsReached ? (
              <>
                <AlertCircle className="w-5 h-5 text-red-500" />
                Connection Failed
              </>
            ) : (
              <>
                <CheckCircle className="w-5 h-5 text-green-500" />
                Reconnected
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {isReconnecting
              ? "Attempting to restore your connection and game session..."
              : isMaxAttemptsReached
              ? "Unable to reconnect after multiple attempts."
              : "Your connection has been restored. You can now continue playing."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Progress Bar */}
          {isReconnecting && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Attempt {reconnectAttempts} of {maxReconnectAttempts}</span>
                <span>{Math.round(progressPercent)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          {/* Error Message */}
          {lastError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              <p className="font-semibold">Error:</p>
              <p>{lastError}</p>
            </div>
          )}

          {/* Status Message */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
            {isReconnecting ? (
              <p>Your game session is being restored. Please wait...</p>
            ) : isMaxAttemptsReached ? (
              <p>
                Your connection could not be restored. Please check your internet connection and try again.
              </p>
            ) : (
              <p>You can now continue playing from where you left off.</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end">
            {isMaxAttemptsReached && (
              <>
                <Button variant="outline" onClick={onCancel}>
                  Exit Game
                </Button>
                <Button onClick={onRetry} className="gap-2">
                  <RotateCw className="w-4 h-4" />
                  Try Again
                </Button>
              </>
            )}
            {!isReconnecting && !isMaxAttemptsReached && (
              <Button onClick={onCancel} className="w-full">
                Continue Playing
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
