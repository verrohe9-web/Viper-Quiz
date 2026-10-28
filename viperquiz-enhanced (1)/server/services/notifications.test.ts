import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDb } = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("../db", () => ({ getDb, getUserByOpenId: vi.fn() }));

import { countUnreadNotifications, createNotification, listNotifications, markAllNotificationsRead, markNotificationRead } from "./notifications";

describe("notifications service", () => {
  beforeEach(() => getDb.mockReset());

  it("creates a notification with the supplied recipient and content", async () => {
    const returningId = vi.fn().mockResolvedValue([{ id: 7 }]);
    getDb.mockResolvedValue({ insert: vi.fn(() => ({ values: vi.fn(() => ({ $returningId: returningId })) })) });
    await expect(createNotification({ userId: 42, type: "game_start", title: "Ready", message: "The room is starting." })).resolves.toEqual({ id: 7 });
  });

  it("returns an empty list and zero unread count when the database is unavailable", async () => {
    getDb.mockResolvedValue(null);
    await expect(listNotifications(42)).resolves.toEqual([]);
    await expect(countUnreadNotifications(42)).resolves.toBe(0);
    await expect(markNotificationRead(42, 7)).resolves.toBe(false);
    await expect(markAllNotificationsRead(42)).resolves.toBe(0);
  });

  it("marks only notifications belonging to the authenticated user", async () => {
    const where = vi.fn().mockResolvedValue({ affectedRows: 1 });
    const update = vi.fn(() => ({ set: vi.fn(() => ({ where })) }));
    getDb.mockResolvedValue({ update });
    await expect(markNotificationRead(42, 7)).resolves.toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
    expect(where).toHaveBeenCalledTimes(1);
  });
});
