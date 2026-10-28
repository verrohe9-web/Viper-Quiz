import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { countUnreadNotifications, createNotification, listNotifications, markAllNotificationsRead, markNotificationRead } from "../services/notifications";

const notificationType = z.enum(["friend_join", "room_invite", "game_start", "game_end", "achievement"]);

export const notificationsRouter = router({
  list: protectedProcedure.input(z.object({ limit: z.number().int().min(1).max(50).default(30) }).optional()).query(({ ctx, input }) => listNotifications(ctx.user.id, input?.limit ?? 30)),
  unreadCount: protectedProcedure.query(({ ctx }) => countUnreadNotifications(ctx.user.id)),
  markRead: protectedProcedure.input(z.object({ notificationId: z.number().int().positive() })).mutation(({ ctx, input }) => markNotificationRead(ctx.user.id, input.notificationId)),
  markAllRead: protectedProcedure.mutation(({ ctx }) => markAllNotificationsRead(ctx.user.id)),
  createForUser: adminProcedure.input(z.object({ userId: z.number().int().positive(), type: notificationType, title: z.string().trim().min(1).max(200), message: z.string().trim().min(1).max(2000), data: z.record(z.string(), z.unknown()).optional() })).mutation(async ({ input }) => createNotification({ userId: input.userId, type: input.type, title: input.title, message: input.message, data: input.data ? JSON.stringify(input.data) : null })),
});
