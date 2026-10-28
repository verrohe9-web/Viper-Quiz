import { describe, expect, it } from "vitest";
import { GameRoomManager } from "./gameRoom";

describe("GameRoomManager integrity signals", () => {
  it("flags a player after a screenshot signal", () => {
    const manager = new GameRoomManager();
    const room = manager.createRoom("player-1", "Player One");

    const result = manager.reportIntegrityEvent(room.roomCode, "player-1", "screenshot_attempt", Date.now());

    expect(result.accepted).toBe(true);
    expect(result.suspicious).toBe(true);
    expect(manager.getRoom(room.roomCode)?.players.get("player-1")?.suspiciousSession).toBe(true);
  });

  it("flags repeated app switches and suppresses immediate duplicates", () => {
    const manager = new GameRoomManager();
    const room = manager.createRoom("player-1", "Player One");

    const first = manager.reportIntegrityEvent(room.roomCode, "player-1", "app_background", Date.now());
    const duplicate = manager.reportIntegrityEvent(room.roomCode, "player-1", "app_background", Date.now());
    const second = manager.reportIntegrityEvent(room.roomCode, "player-1", "app_inactive", Date.now());
    const third = manager.reportIntegrityEvent(room.roomCode, "player-1", "app_background", Date.now());

    expect(first.accepted).toBe(true);
    expect(duplicate.accepted).toBe(false);
    expect(second.accepted).toBe(true);
    expect(third.accepted).toBe(true);
    expect(third.suspicious).toBe(true);
  });
});
