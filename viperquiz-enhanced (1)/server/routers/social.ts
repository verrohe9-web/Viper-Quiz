import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  removeFriend,
  getFriendsList,
  getPendingFriendRequests,
  initializePlayerStats,
  getPlayerStats,
  updatePlayerStats,
  getHeadToHeadStats,
  getPlayerMatchHistory,
} from "../services/social";

export const socialRouter = router({
  // Friend Management
  sendFriendRequest: protectedProcedure
    .input(z.object({ receiverId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await sendFriendRequest(ctx.user.id, input.receiverId);
      return { success: true, message: "Friend request sent" };
    }),

  acceptFriendRequest: protectedProcedure
    .input(z.object({ requestId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await acceptFriendRequest(input.requestId);
      return { success: true, message: "Friend request accepted" };
    }),

  rejectFriendRequest: protectedProcedure
    .input(z.object({ requestId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await rejectFriendRequest(input.requestId);
      return { success: true, message: "Friend request rejected" };
    }),

  removeFriend: protectedProcedure
    .input(z.object({ friendId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await removeFriend(ctx.user.id, input.friendId);
      return { success: true, message: "Friend removed" };
    }),

  getFriendsList: protectedProcedure
    .query(async ({ ctx }) => {
      return await getFriendsList(ctx.user.id);
    }),

  getPendingRequests: protectedProcedure
    .query(async ({ ctx }) => {
      return await getPendingFriendRequests(ctx.user.id);
    }),

  // Player Statistics
  getPlayerStats: protectedProcedure
    .query(async ({ ctx }) => {
      let stats = await getPlayerStats(ctx.user.id);
      if (!stats) {
        await initializePlayerStats(ctx.user.id);
        stats = await getPlayerStats(ctx.user.id);
      }
      return stats;
    }),

  updatePlayerStats: protectedProcedure
    .input(z.object({
      totalGames: z.number().optional(),
      totalWins: z.number().optional(),
      totalLosses: z.number().optional(),
      totalScore: z.number().optional(),
      bestScore: z.number().optional(),
      totalCorrectAnswers: z.number().optional(),
      totalAnswered: z.number().optional(),
      accuracy: z.number().optional(),
      winStreak: z.number().optional(),
      longestWinStreak: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await updatePlayerStats(ctx.user.id, input);
      return { success: true, message: "Stats updated" };
    }),

  // Match History
  getHeadToHeadStats: protectedProcedure
    .input(z.object({ opponentId: z.number() }))
    .query(async ({ ctx, input }) => {
      return await getHeadToHeadStats(ctx.user.id, input.opponentId);
    }),

  getMatchHistory: protectedProcedure
    .query(async ({ ctx }) => {
      return await getPlayerMatchHistory(ctx.user.id, 20);
    }),
});
