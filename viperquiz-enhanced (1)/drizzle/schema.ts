import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Quiz Questions Table
export const questions = mysqlTable("questions", {
  id: int("id").autoincrement().primaryKey(),
  category: varchar("category", { length: 100 }).notNull(),
  question: text("question").notNull(),
  optionA: text("optionA").notNull(),
  optionB: text("optionB").notNull(),
  optionC: text("optionC").notNull(),
  optionD: text("optionD").notNull(),
  correctAnswer: varchar("correctAnswer", { length: 1 }).notNull(), // A, B, C, or D
  difficulty: varchar("difficulty", { length: 20 }).default("medium"), // easy, medium, hard
  source: varchar("source", { length: 50 }).default("ai"), // ai or manual
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Question = typeof questions.$inferSelect;
export type InsertQuestion = typeof questions.$inferInsert;

// Game Sessions Table
export const gameSessions = mysqlTable("gameSessions", {
  id: int("id").autoincrement().primaryKey(),
  sessionCode: varchar("sessionCode", { length: 50 }).notNull().unique(),
  category: varchar("category", { length: 100 }).notNull(),
  playerCount: int("playerCount").notNull(),
  status: mysqlEnum("status", ["active", "completed", "abandoned"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export type GameSession = typeof gameSessions.$inferSelect;
export type InsertGameSession = typeof gameSessions.$inferInsert;

// Question Usage History (to prevent repetition across game rooms)
export const questionUsageHistory = mysqlTable("questionUsageHistory", {
  id: int("id").autoincrement().primaryKey(),
  roomCode: varchar("roomCode", { length: 50 }).notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  questionId: int("questionId"),
  questionText: text("questionText").notNull(), // Store question text for matching across rooms
  usedAt: timestamp("usedAt").defaultNow().notNull(),
});

export type QuestionUsageHistory = typeof questionUsageHistory.$inferSelect;
export type InsertQuestionUsageHistory = typeof questionUsageHistory.$inferInsert;

// User Scores Table
export const userScores = mysqlTable("userScores", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  sessionId: int("sessionId").notNull(),
  playerName: varchar("playerName", { length: 100 }).notNull(),
  score: int("score").default(0).notNull(),
  correctAnswers: int("correctAnswers").default(0).notNull(),
  totalQuestions: int("totalQuestions").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type UserScore = typeof userScores.$inferSelect;
export type InsertUserScore = typeof userScores.$inferInsert;


// Custom Categories Table (user-created via AI)
export const customCategories = mysqlTable("customCategories", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  creatorId: int("creatorId").notNull(),
  status: mysqlEnum("status", ["pending", "active", "archived"]).default("pending").notNull(),
  questionCount: int("questionCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CustomCategory = typeof customCategories.$inferSelect;
export type InsertCustomCategory = typeof customCategories.$inferInsert;

// AI-Generated Questions Table
export const aiGeneratedQuestions = mysqlTable("aiGeneratedQuestions", {
  id: int("id").autoincrement().primaryKey(),
  categoryId: int("categoryId").notNull(),
  question: text("question").notNull(),
  optionA: text("optionA").notNull(),
  optionB: text("optionB").notNull(),
  optionC: text("optionC").notNull(),
  optionD: text("optionD").notNull(),
  correctAnswer: varchar("correctAnswer", { length: 1 }).notNull(), // A, B, C, or D
  difficulty: varchar("difficulty", { length: 20 }).default("medium").notNull(), // easy, medium, hard
  explanation: text("explanation"), // Optional explanation for the answer
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AIGeneratedQuestion = typeof aiGeneratedQuestions.$inferSelect;
export type InsertAIGeneratedQuestion = typeof aiGeneratedQuestions.$inferInsert;

// Friends Table
export const friends = mysqlTable("friends", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  friendId: int("friendId").notNull(),
  status: mysqlEnum("status", ["pending", "accepted", "blocked"]).default("accepted").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Friend = typeof friends.$inferSelect;
export type InsertFriend = typeof friends.$inferInsert;

// Friend Requests Table
export const friendRequests = mysqlTable("friendRequests", {
  id: int("id").autoincrement().primaryKey(),
  senderId: int("senderId").notNull(),
  receiverId: int("receiverId").notNull(),
  status: mysqlEnum("status", ["pending", "accepted", "rejected"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  respondedAt: timestamp("respondedAt"),
});

export type FriendRequest = typeof friendRequests.$inferSelect;
export type InsertFriendRequest = typeof friendRequests.$inferInsert;

// Player Statistics Table
export const playerStats = mysqlTable("playerStats", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  totalGames: int("totalGames").default(0).notNull(),
  totalWins: int("totalWins").default(0).notNull(),
  totalLosses: int("totalLosses").default(0).notNull(),
  totalScore: int("totalScore").default(0).notNull(),
  averageScore: int("averageScore").default(0).notNull(),
  bestScore: int("bestScore").default(0).notNull(),
  totalCorrectAnswers: int("totalCorrectAnswers").default(0).notNull(),
  totalAnswered: int("totalAnswered").default(0).notNull(),
  accuracy: int("accuracy").default(0).notNull(),
  winStreak: int("winStreak").default(0).notNull(),
  longestWinStreak: int("longestWinStreak").default(0).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PlayerStats = typeof playerStats.$inferSelect;
export type InsertPlayerStats = typeof playerStats.$inferInsert;

// Match History Table
export const matchHistory = mysqlTable("matchHistory", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull(),
  player1Id: int("player1Id").notNull(),
  player2Id: int("player2Id").notNull(),
  player1Score: int("player1Score").notNull(),
  player2Score: int("player2Score").notNull(),
  winnerId: int("winnerId"),
  category: varchar("category", { length: 100 }).notNull(),
  playedAt: timestamp("playedAt").defaultNow().notNull(),
});

export type MatchHistory = typeof matchHistory.$inferSelect;
export type InsertMatchHistory = typeof matchHistory.$inferInsert;

// Game Room Chat Messages Table
export const gameRoomMessages = mysqlTable("gameRoomMessages", {
  id: int("id").autoincrement().primaryKey(),
  roomCode: varchar("roomCode", { length: 50 }).notNull(),
  playerId: varchar("playerId", { length: 100 }).notNull(),
  playerName: varchar("playerName", { length: 100 }).notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type GameRoomMessage = typeof gameRoomMessages.$inferSelect;
export type InsertGameRoomMessage = typeof gameRoomMessages.$inferInsert;

// Message Reactions Table
export const messageReactions = mysqlTable("messageReactions", {
  id: int("id").autoincrement().primaryKey(),
  messageId: int("messageId").notNull(),
  playerId: varchar("playerId", { length: 100 }).notNull(),
  playerName: varchar("playerName", { length: 100 }).notNull(),
  emoji: varchar("emoji", { length: 10 }).notNull(), // 👍, 😂, 🔥, ❤️
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MessageReaction = typeof messageReactions.$inferSelect;
export type InsertMessageReaction = typeof messageReactions.$inferInsert;

// Typing Status Table
export const typingStatus = mysqlTable("typingStatus", {
  id: int("id").autoincrement().primaryKey(),
  roomCode: varchar("roomCode", { length: 50 }).notNull(),
  playerId: varchar("playerId", { length: 100 }).notNull(),
  playerName: varchar("playerName", { length: 100 }).notNull(),
  isTyping: int("isTyping").default(0).notNull(), // 0 = not typing, 1 = typing
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TypingStatus = typeof typingStatus.$inferSelect;
export type InsertTypingStatus = typeof typingStatus.$inferInsert;

// Player Answers Table (tracks each player's answer for each question)
export const playerAnswers = mysqlTable("playerAnswers", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull(),
  playerId: varchar("playerId", { length: 100 }).notNull(),
  playerName: varchar("playerName", { length: 100 }).notNull(),
  questionId: int("questionId").notNull(),
  selectedAnswer: varchar("selectedAnswer", { length: 1 }).notNull(), // A, B, C, or D
  isCorrect: int("isCorrect").default(0).notNull(), // 0 = incorrect, 1 = correct
  timeSpent: int("timeSpent").default(0).notNull(), // time in seconds
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PlayerAnswer = typeof playerAnswers.$inferSelect;
export type InsertPlayerAnswer = typeof playerAnswers.$inferInsert;


// Notifications Table
export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  type: mysqlEnum("type", ["friend_join", "room_invite", "game_start", "game_end", "achievement"]).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  message: text("message").notNull(),
  data: text("data"), // JSON string with additional data (roomCode, playerId, etc.)
  isRead: int("isRead").default(0).notNull(), // 0 = unread, 1 = read
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

// Room Invitations Table
export const roomInvitations = mysqlTable("roomInvitations", {
  id: int("id").autoincrement().primaryKey(),
  roomCode: varchar("roomCode", { length: 50 }).notNull(),
  invitedUserId: int("invitedUserId").notNull(),
  invitedByUserId: int("invitedByUserId").notNull(),
  invitedByName: varchar("invitedByName", { length: 100 }).notNull(),
  status: mysqlEnum("status", ["pending", "accepted", "rejected"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  respondedAt: timestamp("respondedAt"),
});
export type RoomInvitation = typeof roomInvitations.$inferSelect;
export type InsertRoomInvitation = typeof roomInvitations.$inferInsert;

// Player-submitted quality reports for AI-generated questions.
export const questionReports = mysqlTable("questionReports", {
  id: int("id").autoincrement().primaryKey(),
  roomCode: varchar("roomCode", { length: 50 }).notNull(),
  questionId: int("questionId").notNull(),
  questionText: text("questionText").notNull(),
  playerId: varchar("playerId", { length: 100 }).notNull(),
  playerName: varchar("playerName", { length: 100 }).notNull(),
  reason: mysqlEnum("reason", ["incorrect", "unclear", "inappropriate", "other"]).notNull(),
  details: text("details"),
  status: mysqlEnum("status", ["pending", "reviewed", "dismissed"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type QuestionReport = typeof questionReports.$inferSelect;
export type InsertQuestionReport = typeof questionReports.$inferInsert;


// ============================================
// MONITORING & AUTO-REPAIR SYSTEM TABLES
// ============================================

// Game Room Health Monitoring Table
export const roomHealthMetrics = mysqlTable("roomHealthMetrics", {
  id: int("id").autoincrement().primaryKey(),
  roomCode: varchar("roomCode", { length: 50 }).notNull(),
  status: mysqlEnum("status", ["healthy", "warning", "critical", "crashed"]).default("healthy").notNull(),
  playerCount: int("playerCount").default(0).notNull(),
  avgResponseTime: int("avgResponseTime").default(0).notNull(), // milliseconds
  errorCount: int("errorCount").default(0).notNull(),
  lastHealthCheck: timestamp("lastHealthCheck").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type RoomHealthMetrics = typeof roomHealthMetrics.$inferSelect;
export type InsertRoomHealthMetrics = typeof roomHealthMetrics.$inferInsert;

// System Issues & Bugs Detection Table
export const systemIssues = mysqlTable("systemIssues", {
  id: int("id").autoincrement().primaryKey(),
  issueType: mysqlEnum("issueType", ["question_skip", "sync_error", "crash", "timeout", "memory_leak", "api_error", "database_error", "other"]).notNull(),
  severity: mysqlEnum("severity", ["low", "medium", "high", "critical"]).notNull(),
  roomCode: varchar("roomCode", { length: 50 }),
  description: text("description").notNull(),
  stackTrace: text("stackTrace"),
  status: mysqlEnum("status", ["detected", "investigating", "fixed", "ignored"]).default("detected").notNull(),
  autoRepairAttempted: int("autoRepairAttempted").default(0).notNull(),
  autoRepairSuccess: int("autoRepairSuccess").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  resolvedAt: timestamp("resolvedAt"),
});
export type SystemIssue = typeof systemIssues.$inferSelect;
export type InsertSystemIssue = typeof systemIssues.$inferInsert;

// System Alerts & Notifications Table
export const systemAlerts = mysqlTable("systemAlerts", {
  id: int("id").autoincrement().primaryKey(),
  issueId: int("issueId").notNull(),
  alertType: mysqlEnum("alertType", ["auto_repair_triggered", "manual_intervention_needed", "deployment_started", "deployment_completed", "deployment_failed"]).notNull(),
  message: text("message").notNull(),
  actionTaken: text("actionTaken"),
  creditsUsed: int("creditsUsed").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type SystemAlert = typeof systemAlerts.$inferSelect;
export type InsertSystemAlert = typeof systemAlerts.$inferInsert;

// Auto-Repair Procedures Log Table
export const autoRepairLog = mysqlTable("autoRepairLog", {
  id: int("id").autoincrement().primaryKey(),
  issueId: int("issueId").notNull(),
  repairType: mysqlEnum("repairType", ["restart_room", "clear_cache", "reset_player_state", "reconnect_database", "rollback_code", "restart_server", "manual_fix"]).notNull(),
  repairDetails: text("repairDetails"),
  success: int("success").default(0).notNull(), // 0 = failed, 1 = success
  executionTime: int("executionTime").default(0).notNull(), // milliseconds
  creditsSpent: int("creditsSpent").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type AutoRepairLog = typeof autoRepairLog.$inferSelect;
export type InsertAutoRepairLog = typeof autoRepairLog.$inferInsert;

// Deployment History Table
export const deploymentHistory = mysqlTable("deploymentHistory", {
  id: int("id").autoincrement().primaryKey(),
  deploymentId: varchar("deploymentId", { length: 100 }).notNull().unique(),
  version: varchar("version", { length: 50 }).notNull(),
  deploymentType: mysqlEnum("deploymentType", ["auto_repair", "manual_fix", "feature_update", "security_patch"]).notNull(),
  status: mysqlEnum("status", ["pending", "in_progress", "completed", "failed", "rolled_back"]).default("pending").notNull(),
  changesApplied: text("changesApplied"),
  creditsUsed: int("creditsUsed").default(0).notNull(),
  deployedBy: varchar("deployedBy", { length: 100 }).default("system").notNull(),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  errorMessage: text("errorMessage"),
});
export type DeploymentHistory = typeof deploymentHistory.$inferSelect;
export type InsertDeploymentHistory = typeof deploymentHistory.$inferInsert;

// System Credits & Usage Table
export const systemCredits = mysqlTable("systemCredits", {
  id: int("id").autoincrement().primaryKey(),
  totalCredits: int("totalCredits").default(1000).notNull(), // Starting credits
  usedCredits: int("usedCredits").default(0).notNull(),
  remainingCredits: int("remainingCredits").default(1000).notNull(),
  creditCostPerRepair: int("creditCostPerRepair").default(10).notNull(),
  creditCostPerDeployment: int("creditCostPerDeployment").default(50).notNull(),
  lastRefillAt: timestamp("lastRefillAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SystemCredits = typeof systemCredits.$inferSelect;
export type InsertSystemCredits = typeof systemCredits.$inferInsert;

// Admin Dashboard Metrics Table
export const dashboardMetrics = mysqlTable("dashboardMetrics", {
  id: int("id").autoincrement().primaryKey(),
  activeRooms: int("activeRooms").default(0).notNull(),
  totalPlayers: int("totalPlayers").default(0).notNull(),
  issuesDetected: int("issuesDetected").default(0).notNull(),
  issuesFixed: int("issuesFixed").default(0).notNull(),
  avgSystemHealth: int("avgSystemHealth").default(100).notNull(), // 0-100 percentage
  uptime: int("uptime").default(0).notNull(), // percentage
  lastUpdate: timestamp("lastUpdate").defaultNow().notNull(),
});
export type DashboardMetrics = typeof dashboardMetrics.$inferSelect;
export type InsertDashboardMetrics = typeof dashboardMetrics.$inferInsert;


// Paid-entry prize pool for a single room round.
export const gamePrizePools = mysqlTable("gamePrizePools", {
  id: int("id").autoincrement().primaryKey(),
  roomCode: varchar("roomCode", { length: 50 }).notNull(),
  roundId: varchar("roundId", { length: 64 }).notNull().unique(),
  currency: varchar("currency", { length: 3 }).default("KES").notNull(),
  entryFeeMinor: int("entryFeeMinor").default(1000).notNull(),
  developerRatePercent: int("developerRatePercent").default(10).notNull(),
  firstRatePercent: int("firstRatePercent").default(45).notNull(),
  secondRatePercent: int("secondRatePercent").default(27).notNull(),
  thirdRatePercent: int("thirdRatePercent").default(18).notNull(),
  participantCount: int("participantCount").default(0).notNull(),
  grossPoolMinor: int("grossPoolMinor").default(0).notNull(),
  developerAllocationMinor: int("developerAllocationMinor").default(0).notNull(),
  winnerAllocationMinor: int("winnerAllocationMinor").default(0).notNull(),
  providerFeesMinor: int("providerFeesMinor").default(0).notNull(),
  status: mysqlEnum("status", ["open", "funded", "payout_pending", "paid", "cancelled", "failed"]).default("open").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  settledAt: timestamp("settledAt"),
});
export type GamePrizePool = typeof gamePrizePools.$inferSelect;
export type InsertGamePrizePool = typeof gamePrizePools.$inferInsert;

// One immutable payment attempt/confirmation per player and round.
export const gamePayments = mysqlTable("gamePayments", {
  id: int("id").autoincrement().primaryKey(),
  poolId: int("poolId").notNull(),
  roomCode: varchar("roomCode", { length: 50 }).notNull(),
  roundId: varchar("roundId", { length: 64 }).notNull(),
  playerId: varchar("playerId", { length: 100 }).notNull(),
  playerName: varchar("playerName", { length: 100 }).notNull(),
  walletPhone: varchar("walletPhone", { length: 20 }),
  provider: varchar("provider", { length: 30 }).default("daraja_mpesa").notNull(),
  amountMinor: int("amountMinor").default(1000).notNull(),
  currency: varchar("currency", { length: 3 }).default("KES").notNull(),
  providerTransactionId: varchar("providerTransactionId", { length: 150 }),
  providerRequestId: varchar("providerRequestId", { length: 150 }),
  idempotencyKey: varchar("idempotencyKey", { length: 150 }).notNull().unique(),
  status: mysqlEnum("status", ["pending", "paid", "failed", "refunded"]).default("pending").notNull(),
  failureReason: text("failureReason"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  paidAt: timestamp("paidAt"),
});
export type GamePayment = typeof gamePayments.$inferSelect;
export type InsertGamePayment = typeof gamePayments.$inferInsert;

// Payout ledger entries, including the developer allocation.
export const gamePayouts = mysqlTable("gamePayouts", {
  id: int("id").autoincrement().primaryKey(),
  poolId: int("poolId").notNull(),
  roomCode: varchar("roomCode", { length: 50 }).notNull(),
  roundId: varchar("roundId", { length: 64 }).notNull(),
  recipientType: mysqlEnum("recipientType", ["developer", "first", "second", "third"]).notNull(),
  playerId: varchar("playerId", { length: 100 }),
  recipientPhone: varchar("recipientPhone", { length: 20 }).notNull(),
  rank: int("rank"),
  grossAmountMinor: int("grossAmountMinor").notNull(),
  providerFeesMinor: int("providerFeesMinor").default(0).notNull(),
  netAmountMinor: int("netAmountMinor").notNull(),
  provider: varchar("provider", { length: 30 }).default("daraja_mpesa").notNull(),
  providerTransactionId: varchar("providerTransactionId", { length: 150 }),
  idempotencyKey: varchar("idempotencyKey", { length: 150 }).notNull().unique(),
  status: mysqlEnum("status", ["pending", "processing", "completed", "failed", "cancelled"]).default("pending").notNull(),
  failureReason: text("failureReason"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  completedAt: timestamp("completedAt"),
});
export type GamePayout = typeof gamePayouts.$inferSelect;
export type InsertGamePayout = typeof gamePayouts.$inferInsert;
