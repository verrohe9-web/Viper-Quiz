import { useCallback, useEffect, useState } from "react";

export interface PlayerSession {
  sessionId: string;
  playerId: string;
  playerName: string;
  roomCode: string;
  joinedAt: number;
  lastHeartbeat: number;
  isActive: boolean;
  connectionAttempts: number;
}

interface SessionOptions {
  heartbeatInterval?: number; // ms between heartbeats (default: 10000)
  sessionTimeout?: number; // ms before session expires (default: 60000)
  maxReconnectAttempts?: number; // max reconnection attempts (default: 10)
}

/**
 * Hook for managing player sessions and reconnection
 * Features:
 * - Track player session state
 * - Heartbeat monitoring for connection health
 * - Automatic reconnection on disconnect
 * - Session recovery with state preservation
 */
export function usePlayerSession(options: SessionOptions = {}) {
  const {
    heartbeatInterval = 10000,
    sessionTimeout = 60000,
    maxReconnectAttempts = 10,
  } = options;

  const [session, setSession] = useState<PlayerSession | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [reconnectAttempts, setReconnectAttempts] = useState<number>(0);
  const [lastHeartbeatTime, setLastHeartbeatTime] = useState<number>(Date.now());

  // Create a new session
  const createSession = useCallback(
    (playerId: string, playerName: string, roomCode: string) => {
      const sessionId = `${playerId}_${roomCode}_${Date.now()}`;
      const newSession: PlayerSession = {
        sessionId,
        playerId,
        playerName,
        roomCode,
        joinedAt: Date.now(),
        lastHeartbeat: Date.now(),
        isActive: true,
        connectionAttempts: 0,
      };

      setSession(newSession);
      localStorage.setItem(`session_${roomCode}`, JSON.stringify(newSession));
      console.log(`Session created: ${sessionId}`);
      return newSession;
    },
    []
  );

  // Load session from storage
  const loadSession = useCallback((roomCode: string): PlayerSession | null => {
    try {
      const data = localStorage.getItem(`session_${roomCode}`);
      if (!data) return null;

      const session = JSON.parse(data) as PlayerSession;
      const age = Date.now() - session.lastHeartbeat;

      // Check if session is still valid
      if (age > sessionTimeout) {
        console.log(`Session expired: ${session.sessionId}`);
        localStorage.removeItem(`session_${roomCode}`);
        return null;
      }

      setSession(session);
      console.log(`Session recovered: ${session.sessionId}`);
      return session;
    } catch (error) {
      console.error("Failed to load session:", error);
      return null;
    }
  }, [sessionTimeout]);

  // Send heartbeat to keep session alive
  const sendHeartbeat = useCallback(() => {
    if (!session) return;

    const updatedSession: PlayerSession = {
      ...session,
      lastHeartbeat: Date.now(),
      connectionAttempts: 0, // Reset attempts on successful heartbeat
    };

    setSession(updatedSession);
    setLastHeartbeatTime(Date.now());
    setIsConnected(true);
    setReconnectAttempts(0);

    localStorage.setItem(
      `session_${session.roomCode}`,
      JSON.stringify(updatedSession)
    );
  }, [session]);

  // Detect disconnection
  const detectDisconnection = useCallback(() => {
    if (!session) return;

    const timeSinceLastHeartbeat = Date.now() - lastHeartbeatTime;

    if (timeSinceLastHeartbeat > heartbeatInterval * 2) {
      setIsConnected(false);
      console.warn("Disconnection detected, attempting reconnection...");
    }
  }, [session, lastHeartbeatTime, heartbeatInterval]);

  // Attempt reconnection
  const attemptReconnection = useCallback(async () => {
    if (!session || reconnectAttempts >= maxReconnectAttempts) {
      if (reconnectAttempts >= maxReconnectAttempts) {
        console.error("Max reconnection attempts reached");
      }
      return false;
    }

    try {
      setReconnectAttempts((prev) => prev + 1);
      console.log(
        `Reconnection attempt ${reconnectAttempts + 1}/${maxReconnectAttempts}`
      );

      // Simulate reconnection (in real app, this would call API)
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
      await new Promise((resolve) => setTimeout(resolve, delay));

      sendHeartbeat();
      return true;
    } catch (error) {
      console.error("Reconnection failed:", error);
      return false;
    }
  }, [session, reconnectAttempts, maxReconnectAttempts, sendHeartbeat]);

  // Heartbeat monitoring
  useEffect(() => {
    if (!session) return;

    const heartbeatTimer = setInterval(() => {
      detectDisconnection();
    }, heartbeatInterval);

    return () => clearInterval(heartbeatTimer);
  }, [session, heartbeatInterval, detectDisconnection]);

  // Auto-reconnection
  useEffect(() => {
    if (!isConnected && session) {
      const reconnectTimer = setTimeout(() => {
        attemptReconnection();
      }, 5000);

      return () => clearTimeout(reconnectTimer);
    }
  }, [isConnected, session, attemptReconnection]);

  // Cleanup on unmount
  const endSession = useCallback(() => {
    if (session) {
      localStorage.removeItem(`session_${session.roomCode}`);
      setSession(null);
      console.log(`Session ended: ${session.sessionId}`);
    }
  }, [session]);

  return {
    session,
    isConnected,
    reconnectAttempts,
    createSession,
    loadSession,
    sendHeartbeat,
    attemptReconnection,
    endSession,
  };
}
