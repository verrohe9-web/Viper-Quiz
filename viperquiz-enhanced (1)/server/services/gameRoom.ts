import { createHash } from "node:crypto";
import { generateQuestionsWithGroq, type GeneratedQuestion } from "../_core/groq-questions";
import { loadQuestionsFromFile } from "./loadQuestions";
import { checkAchievements, type GameStats } from "./achievements";
import {
  markQuestionsAsUsed,
  isQuestionRecentlyUsed,
  getRecentlyUsedQuestions,
} from "./questionDeduplication";
import {
  calculatePayoutAllocations,
  createPrizePool,
  DEFAULT_DEVELOPER_PAYOUT_PHONE,
  refreshPoolAmounts,
  type PaymentStatus,
  type PayoutAllocation,
  type PrizePoolState,
} from "./prizePool";

const DEFAULT_QUESTION_COUNT = 10;
const GAME_TIME_LIMIT = 5 * 60 * 1000; // default duration for backwards compatibility

function validateQuestionSet(questions: GeneratedQuestion[] | null, count: number): questions is GeneratedQuestion[] {
  if (!questions || questions.length !== count) return false;
  const seen = new Set<string>();
  return questions.every((question) => {
    const values = [question.optionA, question.optionB, question.optionC, question.optionD].map((value) => String(value || "").trim());
    const key = String(question.question || "").trim().toLowerCase();
    if (!key || seen.has(key) || values.some((value) => !value) || new Set(values).size !== 4) return false;
    if (!["A", "B", "C", "D"].includes(question.correctAnswer)) return false;
    seen.add(key);
    return true;
  });
}

function getBundledQuestions(topic: string, count: number, difficulty?: "easy" | "medium" | "hard"): GeneratedQuestion[] | null {
  const category = loadQuestionsFromFile().filter((question) => question.category.toLowerCase() === topic.trim().toLowerCase());
  const matchingDifficulty = difficulty ? category.filter((question) => question.difficulty === difficulty) : category;
  const pool = matchingDifficulty.length >= count ? matchingDifficulty : category;
  if (pool.length < count) return null;

  for (let index = pool.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }

  return pool.slice(0, count).map(({ question, optionA, optionB, optionC, optionD, correctAnswer, difficulty: questionDifficulty }) => ({
    question,
    optionA,
    optionB,
    optionC,
    optionD,
    correctAnswer,
    difficulty: questionDifficulty,
  }));
}

export type IntegrityEventType = "app_background" | "app_inactive" | "screenshot_attempt" | "suspicious_timing";

export interface IntegrityEvent {
  type: IntegrityEventType;
  timestamp: number;
}

export interface Player {
  id: string;
  name: string;
  score: number;
  correctAnswers: number;
  totalAnswered: number;
  isReady: boolean;
  lastAnswerTime?: number;
  hasAnsweredCurrentQuestion?: boolean;
  answers: Map<number, string>; // Maps question index to answer (A, B, C, D)
  earnedAchievements: string[]; // Achievement IDs earned in this game
  playerQuestionIndex: number; // Each player's current question (0-9)
  skippedQuestions: Set<number>; // Tracks which questions (0-9) were skipped
  completedAllQuestions: boolean; // True when all 10 questions answered (including retries)
  currentStreak: number; // Consecutive correct answers
  maxStreak: number; // Highest streak achieved in this game
  streakBonusesAwarded: Set<number>; // Milestones already paid in this game
  bonusPoints: number; // Total bonus points earned in this game
  completedAt?: number; // Timestamp when the player answered the final question
  isSpectator?: boolean;
  lastSeenAt?: number;
  walletPhone?: string;
  integrityEvents: IntegrityEvent[];
  suspiciousSession: boolean;
}

export interface GameRoom {
  roomCode: string;
  hostId: string;
  paymentProvider: "free" | "daraja_mpesa" | "paystack_mpesa";
  category: string;
  categoryId?: number; // For custom AI categories
  difficulty?: "easy" | "medium" | "hard"; // Game difficulty level
  customTopic?: string; // Custom topic for AI-generated questions
  topics?: string[];
  questionCount: number;
  timerDurationMs: number;
  streakBonusesEnabled: boolean;
  pausedAt?: number;
  maxPlayers: number;
  players: Map<string, Player>;
  status: "waiting" | "playing" | "finished";
  currentQuestionIndex: number; // 0-9 for the 10 questions
  allQuestions: Question[]; // All 10 questions for this game (loaded at start)
  questionScriptHash?: string;
  questionScriptLockedAt?: number;
  questionGenerationInProgress?: boolean;
  createdAt: Date;
  startedAt?: Date;
  endedAt?: Date;
  gameStartTime?: number; // Server-side timer start (milliseconds)
  gameExpiresAt?: number; // When 3 minutes is up (milliseconds)
  prizePool: PrizePoolState;
  manualPayoutKeys: Set<string>;
}

function fingerprintQuestionScript(questions: Question[]): string {
  const canonical = questions.map(({ id, category, question, optionA, optionB, optionC, optionD, correctAnswer, difficulty, explanation }) => ({
    id, category, question, optionA, optionB, optionC, optionD, correctAnswer, difficulty, explanation: explanation || "",
  }));
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export class GameRoomManager {
  private rooms: Map<string, GameRoom> = new Map();
  private playerToRoom: Map<string, string> = new Map(); // Maps player ID to room code

  createRoom(hostId: string, hostName: string, maxPlayers: number = 20, paymentProvider: "free" | "daraja_mpesa" | "paystack_mpesa" | boolean = "free"): GameRoom {
    const resolvedPaymentProvider = typeof paymentProvider === "boolean"
      ? paymentProvider ? "daraja_mpesa" : "free"
      : paymentProvider;
    const roomCode = this.generateRoomCode();
    const roundId = `${roomCode}-${Date.now()}`;
    const room: GameRoom = {
      roomCode,
      hostId,
      paymentProvider: resolvedPaymentProvider,
      category: "",
      questionCount: DEFAULT_QUESTION_COUNT,
      timerDurationMs: 5 * 60 * 1000,
      streakBonusesEnabled: true,
      maxPlayers,
      players: new Map(),
      status: "waiting",
      currentQuestionIndex: 0,
      allQuestions: [],
      questionScriptHash: undefined,
      questionScriptLockedAt: undefined,
      questionGenerationInProgress: false,
      createdAt: new Date(),
      prizePool: createPrizePool(roundId, DEFAULT_DEVELOPER_PAYOUT_PHONE, resolvedPaymentProvider !== "free"),
      manualPayoutKeys: new Set(),
    };

    // Add host to the room
    const hostPlayer: Player = {
      id: hostId,
      name: hostName,
      score: 0,
      correctAnswers: 0,
      totalAnswered: 0,
      isReady: false,
      hasAnsweredCurrentQuestion: false,
      answers: new Map(),
      earnedAchievements: [],
      playerQuestionIndex: 0,
      skippedQuestions: new Set(),
      completedAllQuestions: false,
      currentStreak: 0,
      maxStreak: 0,
      streakBonusesAwarded: new Set(),
      bonusPoints: 0,
      completedAt: undefined,
      isSpectator: false,
      lastSeenAt: Date.now(),
      integrityEvents: [],
      suspiciousSession: false,
    };
    room.players.set(hostId, hostPlayer);
    this.playerToRoom.set(hostId, roomCode);
    this.syncPrizeParticipants(room);

    this.rooms.set(roomCode, room);
    return room;
  }

  joinRoom(roomCode: string, playerId: string, playerName: string, spectator = false): GameRoom | null {
    const room = this.rooms.get(roomCode);
    if (!room) return null;

    const activePlayerCount = Array.from(room.players.values()).filter((player) => !player.isSpectator).length;
    if (activePlayerCount >= room.maxPlayers && !spectator) return null;
    if (room.status !== "waiting" && !spectator) return null;

    const player: Player = {
      id: playerId,
      name: playerName,
      score: 0,
      correctAnswers: 0,
      totalAnswered: 0,
      isReady: false,
      hasAnsweredCurrentQuestion: false,
      answers: new Map(),
      earnedAchievements: [],
      playerQuestionIndex: 0,
      skippedQuestions: new Set(),
      completedAllQuestions: false,
      currentStreak: 0,
      maxStreak: 0,
      streakBonusesAwarded: new Set(),
      bonusPoints: 0,
      completedAt: undefined,
      isSpectator: spectator,
      lastSeenAt: Date.now(),
      integrityEvents: [],
      suspiciousSession: false,
    };
    room.players.set(playerId, player);
    this.playerToRoom.set(playerId, roomCode);
    this.syncPrizeParticipants(room);

    return room;
  }

  leaveRoom(roomCode: string, playerId: string): void {
    const room = this.rooms.get(roomCode);
    if (!room) return;

    room.players.delete(playerId);
    this.playerToRoom.delete(playerId);
    if (room.hostId === playerId) {
      const nextHost = Array.from(room.players.values()).find((player) => !player.isSpectator);
      if (nextHost) nextHost.isReady = false;
      if (nextHost) room.hostId = nextHost.id;
    }
    this.syncPrizeParticipants(room);

    if (room.players.size === 0) {
      this.rooms.delete(roomCode);
    }
  }

  getRoom(roomCode: string): GameRoom | null {
    const room = this.rooms.get(roomCode) || null;
    if (room) this.syncPrizeParticipants(room);
    return room;
  }

  getPrizePool(roomCode: string): PrizePoolState | null {
    const room = this.rooms.get(roomCode);
    if (!room) return null;
    this.syncPrizeParticipants(room);
    return room.prizePool;
  }

  createProviderPaymentRequest(
    roomCode: string,
    playerId: string,
    providerRequestId: string,
    paymentProvider: "daraja_mpesa" | "paystack_mpesa",
    phoneNumber?: string,
  ): PrizePoolState | null {
    const room = this.rooms.get(roomCode);
    const player = room?.players.get(playerId);
    if (!room || room.paymentProvider !== paymentProvider || room.status !== "waiting" || !room.prizePool.enabled || !player || player.isSpectator) return null;
    this.syncPrizeParticipants(room);
    const participant = room.prizePool.participants[playerId];
    if (!participant || participant.paid) return null;
    if (phoneNumber) participant.walletPhone = phoneNumber.trim();
    participant.providerRequestId = providerRequestId.trim();
    participant.paid = false;
    participant.paymentStatus = "pending";
    participant.providerTransactionId = undefined;
    this.syncPrizeParticipants(room);
    return room.prizePool;
  }

  createDarajaPaymentRequest(roomCode: string, playerId: string, phoneNumber: string, providerRequestId: string): PrizePoolState | null {
    return this.createProviderPaymentRequest(roomCode, playerId, providerRequestId, "daraja_mpesa", phoneNumber);
  }

  applyProviderPaymentStatus(
    roomCode: string,
    playerId: string,
    paid: boolean,
    providerRequestId: string,
    providerTransactionId: string | undefined,
    paymentProvider: "daraja_mpesa" | "paystack_mpesa",
  ): PrizePoolState | null {
    const room = this.rooms.get(roomCode);
    const player = room?.players.get(playerId);
    if (!room || room.paymentProvider !== paymentProvider || room.status !== "waiting" || !room.prizePool.enabled || !player || player.isSpectator) return null;
    this.syncPrizeParticipants(room);
    const participant = room.prizePool.participants[playerId];
    if (!participant || (providerRequestId && participant.providerRequestId !== providerRequestId)) return null;
    participant.paid = paid;
    participant.paymentStatus = paid ? "paid" : "failed";
    if (providerTransactionId !== undefined) participant.providerTransactionId = providerTransactionId.trim() || undefined;
    this.syncPrizeParticipants(room);
    return room.prizePool;
  }

  applyDarajaPaymentStatus(roomCode: string, playerId: string, paid: boolean, providerRequestId?: string, providerTransactionId?: string): PrizePoolState | null {
    const room = this.rooms.get(roomCode);
    if (!room) return null;
    return this.applyProviderPaymentStatus(
      roomCode,
      playerId,
      paid,
      providerRequestId ?? room.prizePool.participants[playerId]?.providerRequestId ?? "",
      providerTransactionId,
      "daraja_mpesa",
    );
  }

  verifyDarajaPaymentsBatch(roomCode: string, hostId: string, playerIds: string[], transactionRefs: Record<string, string> = {}): PrizePoolState | null {
    const room = this.rooms.get(roomCode);
    if (!room || room.hostId !== hostId || room.status !== "waiting" || !room.prizePool.enabled) return null;
    this.syncPrizeParticipants(room);
    const uniqueIds = Array.from(new Set(playerIds));
    if (!uniqueIds.length || uniqueIds.length > room.players.size) return null;
    for (const playerId of uniqueIds) {
      const player = room.players.get(playerId);
      const participant = room.prizePool.participants[playerId];
      if (!player || player.isSpectator || !participant || !participant.walletPhone || participant.paid) return null;
    }
    for (const playerId of uniqueIds) {
      const participant = room.prizePool.participants[playerId];
      participant.paid = true;
      participant.paymentStatus = "paid";
      const reference = transactionRefs[playerId]?.trim();
      if (reference) participant.providerTransactionId = reference;
    }
    this.syncPrizeParticipants(room);
    return room.prizePool;
  }

  getManualPayoutPreview(roomCode: string): PayoutAllocation[] | null {
    const room = this.rooms.get(roomCode);
    if (!room) return null;
    this.syncPrizeParticipants(room);
    const leaderboard = this.getLeaderboard(roomCode);
    let previousKey = "";
    let previousRank = 0;
    const rankedPlayers = leaderboard.map((player, index) => {
      const completionKey = player.completedAt ?? "unfinished";
      const key = `${player.score}:${player.correctAnswers}:${completionKey}`;
      const rank = index > 0 && key === previousKey ? previousRank : index + 1;
      previousKey = key;
      previousRank = rank;
      return {
        playerId: player.id,
        playerName: player.name,
        rank,
        walletPhone: room.prizePool.participants[player.id]?.walletPhone,
      };
    });
    return calculatePayoutAllocations(room.prizePool, rankedPlayers);
  }

  recordManualPayout(roomCode: string, hostId: string, idempotencyKey: string): boolean {
    const room = this.rooms.get(roomCode);
    if (!room || room.hostId !== hostId || room.status !== "finished") return false;
    if (room.manualPayoutKeys.has(idempotencyKey)) return false;
    room.manualPayoutKeys.add(idempotencyKey);
    return true;
  }

  hasManualPayout(roomCode: string, idempotencyKey: string): boolean {
    return Boolean(this.rooms.get(roomCode)?.manualPayoutKeys.has(idempotencyKey));
  }

  private syncPrizeParticipants(room: GameRoom): void {
    const activePlayers = Array.from(room.players.values()).filter((player) => !player.isSpectator);
    const previous = room.prizePool?.participants || {};
    const participants: PrizePoolState["participants"] = {};
    for (const player of activePlayers) {
      const existing = previous[player.id];
      participants[player.id] = {
        playerId: player.id,
        playerName: player.name,
        walletPhone: player.walletPhone || existing?.walletPhone,
        paid: existing?.paid ?? false,
        paymentStatus: existing?.paymentStatus ?? "pending",
        providerTransactionId: existing?.providerTransactionId,
        providerRequestId: existing?.providerRequestId,
      };
    }
    room.prizePool.participants = participants;
    room.prizePool = refreshPoolAmounts(room.prizePool);
  }

  setPlayerReady(roomCode: string, playerId: string, isReady: boolean): void {
    const room = this.rooms.get(roomCode);
    const player = room?.players.get(playerId);

    if (player) {
      player.isReady = isReady;
    }
  }

  async startGame(roomCode: string, category: string, difficulty?: "easy" | "medium" | "hard", customTopic?: string, settings?: { questionCount?: number; timerDurationMs?: number; streakBonusesEnabled?: boolean; topics?: string[] }): Promise<boolean> {
    const room = this.rooms.get(roomCode);
    if (!room) return false;
    if (room.status !== "waiting" || room.questionGenerationInProgress) return false;
    if (room.players.size < 1) return false; // Anonymous solo games are supported

    if (room.paymentProvider !== "free") {
      this.syncPrizeParticipants(room);
      const participants = Object.values(room.prizePool.participants);
      if (participants.length < room.prizePool.minimumParticipantCount || !participants.every((participant) => participant.paid)) {
        return false;
      }
    }

    room.questionGenerationInProgress = true;
    this.syncPrizeParticipants(room);

    room.category = category;
    room.difficulty = difficulty;
    room.customTopic = customTopic;
    room.topics = settings?.topics?.filter(Boolean);
    room.questionCount = Math.min(20, Math.max(5, settings?.questionCount ?? room.questionCount));
    room.timerDurationMs = Math.min(30 * 60 * 1000, Math.max(30 * 1000, settings?.timerDurationMs ?? room.timerDurationMs));
    room.streakBonusesEnabled = settings?.streakBonusesEnabled ?? room.streakBonusesEnabled;
    // Load the complete question set before exposing the playing state.
    const loaded = await this.loadAllQuestions(roomCode);
    if (!loaded || room.allQuestions.length !== room.questionCount) {
      room.allQuestions = [];
      room.questionScriptHash = undefined;
      room.questionScriptLockedAt = undefined;
      room.questionGenerationInProgress = false;
      return false;
    }
    room.questionScriptHash = fingerprintQuestionScript(room.allQuestions);
    room.questionScriptLockedAt = Date.now();
    room.status = "playing";
    room.gameStartTime = Date.now();
    room.gameExpiresAt = room.gameStartTime + room.timerDurationMs;
    room.startedAt = new Date();
    room.questionGenerationInProgress = false;
    return true;
  }

  async loadAllQuestions(roomCode: string): Promise<boolean> {
    const room = this.rooms.get(roomCode);
    if (!room) return false;

    const generationTopic = room.topics?.length ? room.topics.join(", ") : (room.customTopic || room.category);
    console.log(`[GameRoom] Groq-only generation for room ${roomCode}, topic: ${generationTopic}, model: ${process.env.GROQ_MODEL || "(not configured)"}`);

    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Groq question generation timed out")), 120_000)
      );
      let generatedQuestions: GeneratedQuestion[] | null = null;
      try {
        generatedQuestions = await Promise.race([
          generateQuestionsWithGroq(generationTopic, room.questionCount, room.difficulty),
          timeout,
        ]) as GeneratedQuestion[] | null;
      } catch (error) {
        console.warn(`[GameRoom] AI generation unavailable for ${generationTopic}:`, error instanceof Error ? error.message : error);
      }

      if (!validateQuestionSet(generatedQuestions, room.questionCount)) {
        generatedQuestions = getBundledQuestions(generationTopic, room.questionCount, room.difficulty);
        if (generatedQuestions) console.log(`[GameRoom] Using bundled questions for ${generationTopic}`);
      }

      if (!validateQuestionSet(generatedQuestions, room.questionCount)) {
        console.error(`[GameRoom] No complete question set is available for ${generationTopic}`);
        return false;
      }

      room.allQuestions = generatedQuestions.map((q, idx) => ({
        id: idx + 1,
        category: room.category,
        question: q.question,
        optionA: q.optionA,
        optionB: q.optionB,
        optionC: q.optionC,
        optionD: q.optionD,
        correctAnswer: q.correctAnswer,
        difficulty: q.difficulty || "medium",
        explanation: q.explanation,
      }));
      markQuestionsAsUsed(room.category, room.allQuestions.map((q) => q.question));
      console.log(`[GameRoom] ✓ SUCCESS: Groq generated ${room.questionCount} questions for ${generationTopic}`);
      return true;
    } catch (error) {
      console.error(`[GameRoom] Groq-only question generation failed:`, error instanceof Error ? error.message : error);
      return false;
    }
  }

  getCurrentQuestion(roomCode: string, playerId?: string): Question | null {
    const room = this.rooms.get(roomCode);
    if (!room) return null;

    if (!playerId) return null;

    const player = room.players.get(playerId);
    if (player?.isSpectator) return null;
    if (!player) return null;

    // If player has completed all 10 questions, check for skipped questions
    if (player.playerQuestionIndex >= room.questionCount) {
      // Find first unanswered (skipped) question
      for (let i = 0; i < room.questionCount; i++) {
        const answer = player.answers.get(i);
        if (!answer || answer === "") {
          // Return the skipped question for retry
          return room.allQuestions[i] || null;
        }
      }
      // All questions answered
      player.completedAllQuestions = true;
      return null;
    }

    // Return current question
    return room.allQuestions[player.playerQuestionIndex] || null;
  }

  submitAnswer(
    roomCode: string,
    playerId: string,
    answer: string,
    timeSpent: number = 0
  ): {
    correct: boolean;
    correctAnswer: string;
    points: number;
    currentStreak: number;
    maxStreak: number;
    bonusPoints: number;
    streakMultiplier: number;
    bonusReason?: string;
    newlyUnlockedAchievements: string[];
  } | null {
    const room = this.rooms.get(roomCode);
    const player = room?.players.get(playerId);

    if (!room || !player || player.isSpectator || room.allQuestions.length === 0 || room.status !== "playing" || room.pausedAt || !this.isQuestionScriptIntact(room)) {
      return null;
    }

    const currentQuestion = room.allQuestions[player.playerQuestionIndex];
    if (!currentQuestion) {
      return null;
    }

    // Check if player already answered this question
    if (player.answers.has(player.playerQuestionIndex)) {
      return null; // Prevent duplicate answers
    }

    // Store the answer
    player.answers.set(player.playerQuestionIndex, answer);
    player.totalAnswered += 1;

    // Check if answer is correct
    const isCorrect = answer === currentQuestion.correctAnswer;
    let points = 0;
    let bonusPoints = 0;
    let bonusReason: string | undefined;
    let streakMultiplier = 1;

    if (isCorrect) {
      player.correctAnswers += 1;
      // Update streak
      player.currentStreak += 1;
      if (player.currentStreak > player.maxStreak) {
        player.maxStreak = player.currentStreak;
      }
      // Award base points based on difficulty
      const difficultyMultiplier: Record<string, number> = {
        easy: 10,
        medium: 20,
        hard: 30,
      };
      points = difficultyMultiplier[currentQuestion.difficulty] || 10;

      // Reward sustained accuracy without allowing runaway scores. The multiplier
      // applies to base difficulty points only; milestone bonuses remain additive.
      streakMultiplier = player.currentStreak >= 10 ? 2 : player.currentStreak >= 7 ? 1.75 : player.currentStreak >= 5 ? 1.5 : player.currentStreak >= 3 ? 1.25 : 1;
      points = Math.round(points * streakMultiplier);

      // Pay each streak milestone at most once per game.
      const streakBonuses: Record<number, number> = room.streakBonusesEnabled ? { 3: 10, 5: 25, 10: 50 } : {};
      const milestone = Object.keys(streakBonuses)
        .map(Number)
        .filter((value) => value === player.currentStreak)[0];
      if (milestone && !player.streakBonusesAwarded.has(milestone)) {
        bonusPoints = streakBonuses[milestone];
        player.streakBonusesAwarded.add(milestone);
        player.bonusPoints += bonusPoints;
        bonusReason = `${milestone}-answer streak bonus`;
      }

      points += bonusPoints;
      player.score += points;
    } else {
      // Reset streak on wrong answer
      player.currentStreak = 0;
    }

    // Automatically advance to next question
    player.playerQuestionIndex += 1;

    // Mark completion as soon as all ten questions have real answers.
    const hasAnsweredEveryQuestion = Array.from({ length: room.questionCount }, (_, index) =>
      player.answers.get(index)
    ).every((value) => Boolean(value));
    if (hasAnsweredEveryQuestion && !player.completedAt) {
      player.completedAt = Date.now();
      player.completedAllQuestions = true;
    }

    const newlyUnlockedAchievements = this.awardAchievements(room, player);

    return {
      correct: isCorrect,
      correctAnswer: currentQuestion.correctAnswer,
      points,
      currentStreak: player.currentStreak,
      maxStreak: player.maxStreak,
      bonusPoints,
      streakMultiplier,
      bonusReason,
      newlyUnlockedAchievements,
    };
  }

  nextQuestion(roomCode: string, playerId: string): boolean {
    const room = this.rooms.get(roomCode);
    const player = room?.players.get(playerId);

    if (!room || !player) return false;

    // Move to next question
    player.playerQuestionIndex += 1;

    // Check if all questions have been answered
    if (player.playerQuestionIndex >= room.questionCount) {
      // Check if there are any skipped questions
      const skippedCount = room.questionCount - player.answers.size;
      if (skippedCount > 0) {
        // Find first skipped question
        for (let i = 0; i < room.questionCount; i++) {
          if (!player.answers.has(i)) {
            player.playerQuestionIndex = i;
            return true;
          }
        }
      }
      // All questions answered
      player.completedAllQuestions = true;
      return false;
    }

    return true;
  }

  getLeaderboard(roomCode: string): Player[] {
    const room = this.rooms.get(roomCode);
    if (!room) return [];

    const players = Array.from(room.players.values()).filter((player) => !player.isSpectator);

    // Sort by score, accuracy, then fastest completion time for ties.
    const leaderboard = players.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      if (b.correctAnswers !== a.correctAnswers) {
        return b.correctAnswers - a.correctAnswers;
      }
      if (a.completedAt && b.completedAt) {
        return a.completedAt - b.completedAt;
      }
      if (a.completedAt) return -1;
      if (b.completedAt) return 1;
      return 0;
    });

    leaderboard.forEach((player) => this.awardAchievements(room, player));
    return leaderboard;
  }

  private awardAchievements(room: GameRoom, player: Player): string[] {
    const players = Array.from(room.players.values()).filter((player) => !player.isSpectator).sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.correctAnswers !== a.correctAnswers) return b.correctAnswers - a.correctAnswers;
      if (a.completedAt && b.completedAt) return a.completedAt - b.completedAt;
      if (a.completedAt) return -1;
      if (b.completedAt) return 1;
      return 0;
    });
    const playerRank = players.indexOf(player) + 1;
    const gameStart = room.gameStartTime ?? room.startedAt?.getTime() ?? Date.now();
    const endTime = player.completedAt ?? room.endedAt?.getTime() ?? Date.now();
    const questionsAnswered = Array.from(player.answers.values()).filter(Boolean).length;
    const stats: GameStats = {
      score: player.score,
      correctAnswers: player.correctAnswers,
      totalAnswered: player.totalAnswered,
      timeSpentSeconds: Math.max(0, (endTime - gameStart) / 1000),
      category: room.customTopic || room.category,
      playerRank,
      totalPlayers: players.length,
      questionsAnswered,
      maxStreak: player.maxStreak,
      bonusPoints: player.bonusPoints,
    };
    const earned = checkAchievements(stats);
    const newlyUnlocked = earned.filter((id) => !player.earnedAchievements.includes(id));
    if (newlyUnlocked.length > 0) {
      player.earnedAchievements.push(...newlyUnlocked);
    }
    return newlyUnlocked;
  }


  endGame(roomCode: string): void {
    const room = this.rooms.get(roomCode);
    if (!room) return;

    room.status = "finished";
    room.endedAt = new Date();
  }

  pauseGame(roomCode: string): boolean {
    const room = this.rooms.get(roomCode);
    if (!room || room.status !== "playing" || room.pausedAt) return false;
    room.pausedAt = Date.now();
    return true;
  }

  resumeGame(roomCode: string): boolean {
    const room = this.rooms.get(roomCode);
    if (!room || room.status !== "playing" || !room.pausedAt) return false;
    if (room.gameExpiresAt) room.gameExpiresAt += Date.now() - room.pausedAt;
    room.pausedAt = undefined;
    return true;
  }

  restartGame(roomCode: string): boolean {
    const room = this.rooms.get(roomCode);
    if (!room) return false;
    room.status = "waiting";
    room.currentQuestionIndex = 0;
    room.allQuestions = [];
    room.questionScriptHash = undefined;
    room.questionScriptLockedAt = undefined;
    room.questionGenerationInProgress = false;
    room.startedAt = undefined;
    room.endedAt = undefined;
    room.gameStartTime = undefined;
    room.gameExpiresAt = undefined;
    room.pausedAt = undefined;
    room.manualPayoutKeys.clear();
    room.prizePool = createPrizePool(`${room.roomCode}-${Date.now()}`, room.prizePool.developerPhone, room.prizePool.enabled);
    room.players.forEach((player) => {
      player.score = 0; player.correctAnswers = 0; player.totalAnswered = 0;
      player.isReady = false; player.answers.clear(); player.earnedAchievements = [];
      player.playerQuestionIndex = 0; player.skippedQuestions.clear();
      player.completedAllQuestions = false; player.currentStreak = 0; player.maxStreak = 0;
      player.streakBonusesAwarded.clear(); player.bonusPoints = 0; player.completedAt = undefined;
    });
    return true;
  }

  isQuestionScriptLocked(roomCode: string): boolean {
    const room = this.rooms.get(roomCode);
    return Boolean(room?.status === "playing" && room.questionScriptHash && room.questionScriptLockedAt);
  }

  private isQuestionScriptIntact(room: GameRoom): boolean {
    return Boolean(room.questionScriptHash && fingerprintQuestionScript(room.allQuestions) === room.questionScriptHash);
  }

  rematch(roomCode: string): boolean {
    const room = this.rooms.get(roomCode);
    return Boolean(room && room.status === "finished" && this.restartGame(roomCode));
  }

  setSpectator(roomCode: string, playerId: string, isSpectator: boolean): boolean {
    const room = this.rooms.get(roomCode);
    const player = room?.players.get(playerId);
    if (!room || !player || (room.status !== "waiting" && !isSpectator)) return false;
    player.isSpectator = isSpectator;
    player.isReady = false;
    this.syncPrizeParticipants(room);
    return true;
  }

  rejoinRoom(roomCode: string, playerId: string, playerName: string, spectator = false): GameRoom | null {
    const room = this.rooms.get(roomCode);
    if (!room) return null;
    const existing = room.players.get(playerId);
    if (existing) {
      existing.name = playerName || existing.name;
      existing.lastSeenAt = Date.now();
      existing.isSpectator = existing.isSpectator || spectator;
      this.playerToRoom.set(playerId, roomCode);
      return room;
    }
    return this.joinRoom(roomCode, playerId, playerName, spectator);
  }

  reportIntegrityEvent(roomCode: string, playerId: string, eventType: IntegrityEventType, clientTimestamp: number): { accepted: boolean; suspicious: boolean; eventCount: number; reason?: string } {
    const room = this.rooms.get(roomCode);
    const player = room?.players.get(playerId);
    if (!room || !player || player.isSpectator) return { accepted: false, suspicious: false, eventCount: 0, reason: "player_not_found" };

    const now = Date.now();
    player.integrityEvents = player.integrityEvents.filter((event) => now - event.timestamp < 10 * 60 * 1000);
    const lastEvent = player.integrityEvents[player.integrityEvents.length - 1];
    if (lastEvent && lastEvent.type === eventType && now - lastEvent.timestamp < 500) {
      return { accepted: false, suspicious: player.suspiciousSession, eventCount: player.integrityEvents.length, reason: "duplicate_event" };
    }
    if (player.integrityEvents.length >= 30) {
      player.suspiciousSession = true;
      return { accepted: false, suspicious: true, eventCount: player.integrityEvents.length, reason: "rate_limited" };
    }

    const timestamp = Number.isFinite(clientTimestamp) && Math.abs(now - clientTimestamp) <= 2 * 60 * 1000 ? clientTimestamp : now;
    player.integrityEvents.push({ type: eventType, timestamp });
    const appSwitches = player.integrityEvents.filter((event) => event.type === "app_background" || event.type === "app_inactive").length;
    const suspiciousTiming = player.integrityEvents.filter((event) => event.type === "suspicious_timing").length;
    if (eventType === "screenshot_attempt" || appSwitches >= 3 || suspiciousTiming >= 3) player.suspiciousSession = true;
    return { accepted: true, suspicious: player.suspiciousSession, eventCount: player.integrityEvents.length };
  }

  touchPlayer(roomCode: string, playerId: string): boolean {
    const player = this.rooms.get(roomCode)?.players.get(playerId);
    if (!player) return false;
    player.lastSeenAt = Date.now();
    return true;
  }

  removePlayer(roomCode: string, playerId: string): boolean {
    const room = this.rooms.get(roomCode);
    if (!room || playerId === room.hostId || !room.players.has(playerId)) return false;
    room.players.delete(playerId); this.playerToRoom.delete(playerId); this.syncPrizeParticipants(room); return true;
  }

  getTimeRemaining(roomCode: string): number {
    const room = this.rooms.get(roomCode);
    if (!room || !room.gameExpiresAt) return 0;

    const now = room.pausedAt ?? Date.now();
    const remaining = room.gameExpiresAt - now;
    return Math.max(0, remaining);
  }

  // Advance to next question (called when all players answered or time expired)
  advanceToNextQuestion(roomCode: string): void {
    const room = this.rooms.get(roomCode);
    if (!room) return;

    if (room.currentQuestionIndex < room.questionCount) {
      room.currentQuestionIndex++;
    }

    // Reset answered flag for all players
    room.players.forEach((player) => {
      player.hasAnsweredCurrentQuestion = false;
    });
  }

  // Check if all players have answered the current question
  haveAllPlayersAnswered(roomCode: string): boolean {
    const room = this.rooms.get(roomCode);
    if (!room) return false;

    // All players must have answered
    const players = Array.from(room.players.values()).filter((player) => !player.isSpectator);
    for (let i = 0; i < players.length; i++) {
      if (!players[i].hasAnsweredCurrentQuestion) {
        return false;
      }
    }

    return true;
  }

  // Skip current question and move to next
  skipQuestion(roomCode: string, playerId: string): boolean {
    const room = this.rooms.get(roomCode);
    const player = room?.players.get(playerId);

    if (!room || !player || player.isSpectator || room.status !== "playing" || room.pausedAt) return false;

    // Get current question index
    let questionIndex = player.playerQuestionIndex;
    if (player.playerQuestionIndex >= room.questionCount) {
      // In retry phase - find which skipped question this is
      for (let i = 0; i < room.questionCount; i++) {
        if (!player.answers.has(i)) {
          questionIndex = i;
          break;
        }
      }
    }

    // Mark question as skipped (store empty string as placeholder)
    player.answers.set(questionIndex, "");
    player.skippedQuestions.add(questionIndex);

    // Move to next question
    if (player.playerQuestionIndex < room.questionCount) {
      player.playerQuestionIndex++;
    }

    return true;
  }

  // Get skipped questions for a player
  getSkippedQuestions(roomCode: string, playerId: string): number[] {
    const room = this.rooms.get(roomCode);
    const player = room?.players.get(playerId);

    if (!room || !player) return [];

    return Array.from(player.skippedQuestions).sort((a, b) => a - b);
  }

  // Check if player has completed all questions (including skipped ones)
  hasCompletedAllQuestions(roomCode: string, playerId: string): boolean {
    const room = this.rooms.get(roomCode);
    const player = room?.players.get(playerId);

    if (!room || !player) return false;

    // Must have answered all 10 questions (not skipped)
    for (let i = 0; i < room.questionCount; i++) {
      const answer = player.answers.get(i);
      if (answer === undefined || answer === "") {
        return false; // Still skipped or unanswered
      }
    }

    return true;
  }

  private generateRoomCode(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }
}

// Question interface
export interface Question {
  id: number;
  category: string;
  question: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: "A" | "B" | "C" | "D";
  difficulty: "easy" | "medium" | "hard";
  explanation?: string;
}

// Singleton instance
export const gameRoomManager = new GameRoomManager();
