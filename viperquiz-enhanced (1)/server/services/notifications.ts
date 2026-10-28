import { and, desc, eq } from "drizzle-orm";
import { getDb, getUserByOpenId } from "../db";
import { ENV } from "../_core/env";
import { InsertNotification, notifications } from "../../drizzle/schema";

export async function createNotification(input: InsertNotification) {
  const db = await getDb();
  if (!db) return null;
  const [created] = await db.insert(notifications).values(input).$returningId();
  return created;
}

export async function createOwnerNotification(input: Omit<InsertNotification, "userId">) {
  const owner = await getUserByOpenId(ENV.ownerOpenId);
  if (!owner) return null;
  return createNotification({ ...input, userId: owner.id });
}

export async function listNotifications(userId: number, limit = 30) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(limit);
}

export async function countUnreadNotifications(userId: number) {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.isRead, 0)));
  return rows.length;
}

export async function markNotificationRead(userId: number, notificationId: number) {
  const db = await getDb();
  if (!db) return false;
  const result = await db.update(notifications).set({ isRead: 1 }).where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)));
  const affectedRows = (result as any)?.affectedRows ?? (result as any)?.[0]?.affectedRows ?? 0;
  return affectedRows > 0;
}

export async function markAllNotificationsRead(userId: number) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.update(notifications).set({ isRead: 1 }).where(and(eq(notifications.userId, userId), eq(notifications.isRead, 0)));
  return (result as any)?.affectedRows ?? (result as any)?.[0]?.affectedRows ?? 0;
}
