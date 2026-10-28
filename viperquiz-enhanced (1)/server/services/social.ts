import { getDb } from "../db";
import { friends, friendRequests, playerStats, matchHistory } from "../../drizzle/schema";
import { eq, and, or, desc } from "drizzle-orm";

// Friend Management Functions
export async function sendFriendRequest(senderId: number, receiverId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.insert(friendRequests).values({
    senderId,
    receiverId,
    status: "pending",
  });
}

export async function acceptFriendRequest(requestId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const request = await db.select().from(friendRequests).where(eq(friendRequests.id, requestId)).limit(1);
  if (request.length === 0) throw new Error("Friend request not found");

  // Add to friends table
  await db.insert(friends).values({
    userId: request[0].senderId,
    friendId: request[0].receiverId,
    status: "accepted",
  });

  // Update request status
  return await db.update(friendRequests)
    .set({ status: "accepted", respondedAt: new Date() })
    .where(eq(friendRequests.id, requestId));
}

export async function rejectFriendRequest(requestId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.update(friendRequests)
    .set({ status: "rejected", respondedAt: new Date() })
    .where(eq(friendRequests.id, requestId));
}

export async function removeFriend(userId: number, friendId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.delete(friends)
    .where(and(
      eq(friends.userId, userId),
      eq(friends.friendId, friendId)
    ));
}

export async function getFriendsList(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.select().from(friends)
    .where(and(
      eq(friends.userId, userId),
      eq(friends.status, "accepted")
    ));
}

export async function getPendingFriendRequests(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.select().from(friendRequests)
    .where(and(
      eq(friendRequests.receiverId, userId),
      eq(friendRequests.status, "pending")
    ));
}

// Player Statistics Functions
export async function initializePlayerStats(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.insert(playerStats).values({
    userId,
    totalGames: 0,
    totalWins: 0,
    totalLosses: 0,
    totalScore: 0,
    averageScore: 0,
    bestScore: 0,
    totalCorrectAnswers: 0,
    totalAnswered: 0,
    accuracy: 0,
    winStreak: 0,
    longestWinStreak: 0,
  });
}

export async function getPlayerStats(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(playerStats)
    .where(eq(playerStats.userId, userId))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updatePlayerStats(userId: number, stats: {
  totalGames?: number;
  totalWins?: number;
  totalLosses?: number;
  totalScore?: number;
  bestScore?: number;
  totalCorrectAnswers?: number;
  totalAnswered?: number;
  accuracy?: number;
  winStreak?: number;
  longestWinStreak?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.update(playerStats)
    .set(stats)
    .where(eq(playerStats.userId, userId));
}

// Match History Functions
export async function recordMatch(
  sessionId: number,
  player1Id: number,
  player2Id: number,
  player1Score: number,
  player2Score: number,
  category: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const winnerId =
    player1Score > player2Score
      ? player1Id
      : player2Score > player1Score
        ? player2Id
        : null;

  return await db.insert(matchHistory).values({
    sessionId,
    player1Id,
    player2Id,
    player1Score,
    player2Score,
    winnerId,
    category,
  });
}

export async function getHeadToHeadStats(player1Id: number, player2Id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.select().from(matchHistory)
    .where(and(
      eq(matchHistory.player1Id, player1Id),
      eq(matchHistory.player2Id, player2Id)
    ));
}

export async function getPlayerMatchHistory(userId: number, limit: number = 10) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.select().from(matchHistory)
    .where(or(
      eq(matchHistory.player1Id, userId),
      eq(matchHistory.player2Id, userId)
    ))
    .orderBy(desc(matchHistory.playedAt))
    .limit(limit);
}
