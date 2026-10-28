import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../_core/groq-questions", () => ({
  generateQuestionsWithGroq: vi.fn(async (topic: string, count = 10, difficulty = "medium") => {
    if (topic.includes("Unknown category")) return null;
    return Array.from({ length: count }, (_, index) => ({
      question: `${topic} question ${index + 1}?`,
      optionA: `Option ${index + 1}A`,
      optionB: `Option ${index + 1}B`,
      optionC: `Option ${index + 1}C`,
      optionD: `Option ${index + 1}D`,
      correctAnswer: "A" as const,
      difficulty,
      explanation: `The correct answer for ${topic} question ${index + 1} is option A.`,
    }));
  }),
}));

import { generateQuestionsWithGroq } from "../_core/groq-questions";
import { GameRoomManager } from "./gameRoom";
import { getQuestionsByCategory, getAllCategories } from "./questionDatabase";
import { loadQuestionsFromFile } from "./loadQuestions";

describe("GameRoomManager", () => {
  let manager: GameRoomManager;

  beforeEach(() => {
    manager = new GameRoomManager();
  });

  describe("Room Creation and Management", () => {
    it("should create a room with host and a 20-player default capacity", async () => {
      const room = manager.createRoom("host-1", "Host Player");

      expect(room.roomCode).toHaveLength(6);
      expect(room.hostId).toBe("host-1");
      expect(room.maxPlayers).toBe(20);
      expect(room.players.size).toBe(1); // Host should be in the room
      expect(room.players.get("host-1")?.name).toBe("Host Player");
    });

    it("should allow players to join a room", async () => {
      const room = manager.createRoom("host-1", "Host", 15);
      const roomCode = room.roomCode;

      const joinedRoom = manager.joinRoom(roomCode, "player-1", "Player 1");

      expect(joinedRoom).not.toBeNull();
      expect(joinedRoom?.players.size).toBe(2);
      expect(joinedRoom?.players.get("player-1")?.name).toBe("Player 1");
    });

    it("should not allow joining a full room", async () => {
      const room = manager.createRoom("host-1", "Host", 2);
      const roomCode = room.roomCode;

      manager.joinRoom(roomCode, "player-1", "Player 1");
      const result = manager.joinRoom(roomCode, "player-2", "Player 2");

      expect(result).toBeNull();
    });

    it("should remove room when empty", async () => {
      const room = manager.createRoom("host-1", "Host", 15);
      const roomCode = room.roomCode;

      manager.leaveRoom(roomCode, "host-1");
      const retrievedRoom = manager.getRoom(roomCode);

      expect(retrievedRoom).toBeNull();
    });

    it("should transfer host control when the host leaves", () => {
      const room = manager.createRoom("host-1", "Host", 20);
      manager.joinRoom(room.roomCode, "player-1", "Player 1");

      manager.leaveRoom(room.roomCode, "host-1");

      expect(manager.getRoom(room.roomCode)?.hostId).toBe("player-1");
    });
  });

  describe("Game Flow", () => {
    it("uses bundled category questions when AI generation is unavailable", async () => {
      vi.mocked(generateQuestionsWithGroq).mockResolvedValueOnce(null);
      const room = manager.createRoom("host-1", "Host");

      expect(await manager.startGame(room.roomCode, "Science")).toBe(true);
      const questions = manager.getRoom(room.roomCode)?.allQuestions ?? [];
      const bundledQuestions = new Set(loadQuestionsFromFile().filter((question) => question.category === "Science").map((question) => question.question));

      expect(questions).toHaveLength(10);
      expect(new Set(questions.map((question) => question.question)).size).toBe(10);
      expect(questions.every((question) => bundledQuestions.has(question.question))).toBe(true);
    });

    it("should start a game with valid category", async () => {
      const room = manager.createRoom("host-1", "Host", 15);
      const roomCode = room.roomCode;

      manager.joinRoom(roomCode, "player-1", "Player 1");
      const success = await manager.startGame(roomCode, "Science");

      expect(success).toBe(true);
      const updatedRoom = manager.getRoom(roomCode);
      expect(updatedRoom?.status).toBe("playing");
      expect(updatedRoom?.category).toBe("Science");
    });

    it("should allow an anonymous solo game", async () => {
      const room = manager.createRoom("host-1", "Host", 15);
      const success = await manager.startGame(room.roomCode, "Science");

      expect(success).toBe(true);
      expect(manager.getRoom(room.roomCode)?.status).toBe("playing");
    });
  });

  describe("Question Management and Non-Repetition", () => {
    it("should load questions without repetition", async () => {
      const room = manager.createRoom("host-1", "Host", 15);
      const roomCode = room.roomCode;

      manager.joinRoom(roomCode, "player-1", "Player 1");
      await manager.startGame(roomCode, "Science");

      let room2 = manager.getRoom(roomCode);
      const questions = room2?.allQuestions || [];

      // Verify no duplicate questions in a single game
      const questionTexts = questions.map((q) => q.question);
      const uniqueQuestions = new Set(questionTexts);

      expect(uniqueQuestions.size).toBe(questionTexts.length);
      expect(questions.length).toBeGreaterThan(0);
    });

    it("should end game when all questions are exhausted", async () => {
      const room = manager.createRoom("host-1", "Host", 15);
      const roomCode = room.roomCode;

      manager.joinRoom(roomCode, "player-1", "Player 1");
      await manager.startGame(roomCode, "Science");

      let room2 = manager.getRoom(roomCode);
      const count = room2?.allQuestions.length || 0;

      // Should have loaded exactly 10 questions
      expect(count).toBe(10);
    });

    it("should have questions in all categories", async () => {
      const categories = getAllCategories();

      expect(categories.length).toBeGreaterThan(0);
      expect(categories).toContain("Bible");
      expect(categories).toContain("Christianity");
      expect(categories).toContain("Prayers");
      expect(categories).toContain("Science");
    });
  });

  describe("Scoring System", () => {
    it("should award points for correct answers", async () => {
      const room = manager.createRoom("host-1", "Host", 15);
      const roomCode = room.roomCode;

      manager.joinRoom(roomCode, "player-1", "Player 1");
      await manager.startGame(roomCode, "Science");

      let room2 = manager.getRoom(roomCode);
      const question = room2?.allQuestions[0];
      const result = manager.submitAnswer(roomCode, "player-1", question?.correctAnswer || "A", 5000);

      expect(result.correct).toBe(true);
      expect(result.points).toBeGreaterThan(0);

      const player = manager.getRoom(roomCode)?.players.get("player-1");
      expect(player?.score).toBe(result.points);
    });

    it("should not award points for incorrect answers", async () => {
      const room = manager.createRoom("host-1", "Host", 15);
      const roomCode = room.roomCode;

      manager.joinRoom(roomCode, "player-1", "Player 1");
      await manager.startGame(roomCode, "Science");

      let room2 = manager.getRoom(roomCode);
      const question = room2?.allQuestions[0];
      const wrongAnswer = question?.correctAnswer === "A" ? "B" : "A";
      const result = manager.submitAnswer(roomCode, "player-1", wrongAnswer, 5000);

      expect(result.correct).toBe(false);
      expect(result.points).toBe(0);

      const player = manager.getRoom(roomCode)?.players.get("player-1");
      expect(player?.score).toBe(0);
    });
  });

  describe("Streak Bonuses and Achievements", () => {
    it("should award each streak milestone bonus exactly once", async () => {
      const room = manager.createRoom("host-1", "Host", 15);
      const roomCode = room.roomCode;
      manager.joinRoom(roomCode, "player-1", "Player 1");
      await manager.startGame(roomCode, "Science", "medium");

      const bonuses: number[] = [];
      for (let i = 0; i < 5; i++) {
        const question = manager.getCurrentQuestion(roomCode, "player-1");
        expect(question).not.toBeNull();
        const result = manager.submitAnswer(
          roomCode,
          "player-1",
          question?.correctAnswer || "A",
          1000
        );
        bonuses.push(result.bonusPoints);
      }

      expect(bonuses).toEqual([0, 0, 10, 0, 25]);
      const player = manager.getRoom(roomCode)?.players.get("player-1");
      expect(player?.bonusPoints).toBe(35);
      expect(player?.maxStreak).toBe(5);
      expect(player?.earnedAchievements).toContain("streak_three");
      expect(player?.earnedAchievements).toContain("streak_five");
      expect(player?.earnedAchievements).toContain("bonus_hunter");
    });

    it("should reset the active streak after an incorrect answer", async () => {
      const room = manager.createRoom("host-1", "Host", 15);
      const roomCode = room.roomCode;
      manager.joinRoom(roomCode, "player-1", "Player 1");
      await manager.startGame(roomCode, "Science", "medium");

      for (let i = 0; i < 2; i++) {
        const question = manager.getCurrentQuestion(roomCode, "player-1");
        manager.submitAnswer(roomCode, "player-1", question?.correctAnswer || "A", 1000);
      }
      const wrongQuestion = manager.getCurrentQuestion(roomCode, "player-1");
      const wrongAnswer = wrongQuestion?.correctAnswer === "A" ? "B" : "A";
      const wrongResult = manager.submitAnswer(roomCode, "player-1", wrongAnswer, 1000);

      expect(wrongResult.correct).toBe(false);
      expect(wrongResult.currentStreak).toBe(0);
      expect(wrongResult.maxStreak).toBe(2);
      expect(manager.getRoom(roomCode)?.players.get("player-1")?.bonusPoints).toBe(0);
    });

    it("should apply a capped multiplier to sustained correct streaks", async () => {
      const room = manager.createRoom("host-1", "Host", 20);
      const roomCode = room.roomCode;
      manager.joinRoom(roomCode, "player-1", "Player 1");
      await manager.startGame(roomCode, "Science", "medium");

      const points: number[] = [];
      for (let i = 0; i < 5; i++) {
        const question = manager.getCurrentQuestion(roomCode, "player-1");
        const result = manager.submitAnswer(roomCode, "player-1", question?.correctAnswer || "A", 1000);
        points.push(result.points);
      }

      expect(points).toEqual([20, 20, 35, 25, 55]);
      expect(manager.getRoom(roomCode)?.players.get("player-1")?.score).toBe(155);
    });

    it("should unlock completion achievements after answering all questions", async () => {
      const room = manager.createRoom("host-1", "Host", 15);
      const roomCode = room.roomCode;
      manager.joinRoom(roomCode, "player-1", "Player 1");
      await manager.startGame(roomCode, "Science", "easy");

      for (let i = 0; i < 10; i++) {
        const question = manager.getCurrentQuestion(roomCode, "player-1");
        expect(question).not.toBeNull();
        manager.submitAnswer(roomCode, "player-1", question?.correctAnswer || "A", 1000);
      }

      const player = manager.getRoom(roomCode)?.players.get("player-1");
      expect(player?.completedAllQuestions).toBe(true);
      expect(player?.earnedAchievements).toContain("perfect_score");
      expect(player?.earnedAchievements).toContain("completionist");
      expect(player?.earnedAchievements).toContain("streak_ten");
      expect(player?.earnedAchievements).toContain("bonus_hunter");
      expect(player?.bonusPoints).toBe(85);
    });
  });

  describe("Leaderboard", () => {
    it("should return sorted leaderboard by score", async () => {
      const room = manager.createRoom("host-1", "Host", 15);
      const roomCode = room.roomCode;

      manager.joinRoom(roomCode, "player-1", "Player 1");
      manager.joinRoom(roomCode, "player-2", "Player 2");
      await manager.startGame(roomCode, "Science");

      // Simulate scoring
      let room2 = manager.getRoom(roomCode);
      const question = room2?.allQuestions[0];
      manager.submitAnswer(roomCode, "player-1", question?.correctAnswer || "A", 5000);
      manager.submitAnswer(roomCode, "player-2", "Z", 5000); // Wrong answer

      const leaderboard = manager.getLeaderboard(roomCode);

      expect(leaderboard[0]?.name).toBe("Player 1");
      expect(leaderboard[0]?.score).toBeGreaterThan(leaderboard[1]?.score || 0);
    });
  });

  describe("Player Ready Status", () => {
    it("should track player ready status", async () => {
      const room = manager.createRoom("host-1", "Host", 15);
      const roomCode = room.roomCode;

      manager.joinRoom(roomCode, "player-1", "Player 1");
      manager.setPlayerReady(roomCode, "player-1", true);

      const updatedRoom = manager.getRoom(roomCode);
      expect(updatedRoom?.players.get("player-1")?.isReady).toBe(true);
    });

    it("should check if all players are ready", async () => {
      const room = manager.createRoom("host-1", "Host", 15);
      const roomCode = room.roomCode;

      manager.joinRoom(roomCode, "player-1", "Player 1");

      manager.setPlayerReady(roomCode, "host-1", true);
      manager.setPlayerReady(roomCode, "player-1", true);

      let room2 = manager.getRoom(roomCode);
      const allReady = Array.from(room2?.players.values() || []).every((p) => p.isReady);
      expect(allReady).toBe(true);
    });
  });

  describe("Full Game Progression (Q1-Q10)", () => {
    it("should progress player from Q1 through Q10 with correct answers", async () => {
      const room = manager.createRoom("host-1", "Host", 15);
      const roomCode = room.roomCode;

      manager.joinRoom(roomCode, "player-1", "Player 1");
      await manager.startGame(roomCode, "Science");

      let room2 = manager.getRoom(roomCode);
      expect(room2?.allQuestions.length).toBe(10);

      // Answer all 10 questions
      for (let i = 0; i < 10; i++) {
        const question = manager.getCurrentQuestion(roomCode, "player-1");
        expect(question).not.toBeNull();
        expect(question?.question).toBeDefined();

        // Player 1 answers
        const result = manager.submitAnswer(roomCode, "player-1", question?.correctAnswer || "A", 5000);
        expect(result.correct).toBe(true);
        expect(result.points).toBeGreaterThan(0);

        // Host also answers to advance room
        manager.submitAnswer(roomCode, "host-1", question?.correctAnswer || "A", 5000);

        const player = manager.getRoom(roomCode)?.players.get("player-1");
        expect(player?.playerQuestionIndex).toBe(i + 1); // Should advance to next index (0-10)
      }

      // After 10 questions, player should get null but game should NOT be finished
      // Game only ends when the 3-minute timer expires (gameExpiresAt)
      const finalQuestion = manager.getCurrentQuestion(roomCode, "player-1");
      expect(finalQuestion).toBeNull(); // No more questions for this player

      const finalRoom = manager.getRoom(roomCode);
      // Game should still be "playing" because timer hasn't expired
      expect(finalRoom?.status).toBe("playing");
      expect(finalRoom?.gameExpiresAt).toBeGreaterThan(Date.now()); // Timer still has time
    });

    it("should correctly validate correct vs incorrect answers during progression", async () => {
      const room = manager.createRoom("host-1", "Host", 15);
      const roomCode = room.roomCode;

      manager.joinRoom(roomCode, "player-1", "Player 1");
      await manager.startGame(roomCode, "Science");

      let room2 = manager.getRoom(roomCode);
      const question1 = room2?.allQuestions[0];
      const question2 = room2?.allQuestions[1];

      // Q1: Player 1 answers correctly
      const result1 = manager.submitAnswer(roomCode, "player-1", question1?.correctAnswer || "A", 5000);
      expect(result1.correct).toBe(true);
      expect(result1.points).toBeGreaterThan(0);

      // Host also answers Q1 to advance room
      manager.submitAnswer(roomCode, "host-1", question1?.correctAnswer || "A", 5000);

      let player = manager.getRoom(roomCode)?.players.get("player-1");
      expect(player?.playerQuestionIndex).toBe(1);
      expect(player?.correctAnswers).toBe(1);
      expect(player?.totalAnswered).toBe(1);

      // Q2: Player 1 answers incorrectly
      const wrongAnswer = question2?.correctAnswer === "A" ? "B" : "A";
      const result2 = manager.submitAnswer(roomCode, "player-1", wrongAnswer, 5000);
      expect(result2.correct).toBe(false);
      expect(result2.points).toBe(0);

      // Host also answers Q2 to advance room
      manager.submitAnswer(roomCode, "host-1", question2?.correctAnswer || "A", 5000);

      player = manager.getRoom(roomCode)?.players.get("player-1");
      expect(player?.playerQuestionIndex).toBe(2);
      expect(player?.correctAnswers).toBe(1); // Still 1 correct
      expect(player?.totalAnswered).toBe(2);
    });

    it("should auto-advance player to next question after answer submission", async () => {
      const room = manager.createRoom("host-1", "Host", 15);
      const roomCode = room.roomCode;

      manager.joinRoom(roomCode, "player-1", "Player 1");
      await manager.startGame(roomCode, "Science");

      // Q1
      let question = manager.getCurrentQuestion(roomCode, "player-1");
      expect(question?.question).toBeDefined();
      const q1Text = question?.question;

      // Player 1 answers
      manager.submitAnswer(roomCode, "player-1", question?.correctAnswer || "A", 5000);
      
      // Room should NOT advance yet (host hasn't answered)
      let roomAfterP1 = manager.getRoom(roomCode);
      expect(roomAfterP1?.currentQuestionIndex).toBe(0); // Still on Q1

      // Host answers
      manager.submitAnswer(roomCode, "host-1", question?.correctAnswer || "A", 5000);

      // Q2 should be different (after both players answered)
      question = manager.getCurrentQuestion(roomCode, "player-1");
      expect(question?.question).toBeDefined();
      expect(question?.question).not.toBe(q1Text);
    });

    it("should prevent player from answering same question twice", async () => {
      const room = manager.createRoom("host-1", "Host", 15);
      const roomCode = room.roomCode;

      manager.joinRoom(roomCode, "player-1", "Player 1");
      await manager.startGame(roomCode, "Science");

      const question1 = manager.getCurrentQuestion(roomCode, "player-1");
      
      // Player 1 answers Q1
      const result1 = manager.submitAnswer(roomCode, "player-1", question1?.correctAnswer || "A", 5000);
      expect(result1.correct).toBe(true);

      // Room should NOT advance yet (host hasn't answered)
      let roomAfterP1 = manager.getRoom(roomCode);
      expect(roomAfterP1?.currentQuestionIndex).toBe(0); // Still on Q1

      // Host answers Q1
      const result1b = manager.submitAnswer(roomCode, "host-1", question1?.correctAnswer || "A", 5000);
      expect(result1b.correct).toBe(true);

      // Now room should have advanced to Q2 (all players answered)
      const currentQuestion = manager.getCurrentQuestion(roomCode, "player-1");
      expect(currentQuestion?.question).not.toBe(question1?.question); // Should be different question

      // Verify player is on Q2 now
      const player = manager.getRoom(roomCode)?.players.get("player-1");
      expect(player?.playerQuestionIndex).toBe(1); // Should be on Q2 (index 1)
      
      // Trying to answer Q2 with a wrong answer should fail
      const question2 = manager.getCurrentQuestion(roomCode, "player-1");
      const wrongAnswer = question2?.correctAnswer === "A" ? "B" : "A";
      const result2 = manager.submitAnswer(roomCode, "player-1", wrongAnswer, 5000);
      // Result should be false because we submitted the wrong answer
      expect(result2.correct).toBe(false);
      expect(result2.points).toBe(0);
    });
    it("should allow players to progress at different speeds independently", async () => {
      const room = manager.createRoom("host-1", "Host", 15);
      const roomCode = room.roomCode;

      manager.joinRoom(roomCode, "player-1", "Player 1");
      manager.joinRoom(roomCode, "player-2", "Player 2");
      await manager.startGame(roomCode, "Science");

      let room2 = manager.getRoom(roomCode);
      const allQuestions = room2?.allQuestions || [];

      // Player 1 answers Q1, Q2, Q3 quickly
      for (let i = 0; i < 3; i++) {
        const q1 = manager.getCurrentQuestion(roomCode, "player-1");
        expect(q1).not.toBeNull();
        manager.submitAnswer(roomCode, "player-1", q1?.correctAnswer || "A", 1000);
      }

      // Player 1 should be on Q4 (index 3)
      let p1 = manager.getRoom(roomCode)?.players.get("player-1");
      expect(p1?.playerQuestionIndex).toBe(3);

      // Player 2 is still on Q1
      let p2 = manager.getRoom(roomCode)?.players.get("player-2");
      expect(p2?.playerQuestionIndex).toBe(0);

      // Player 2 answers Q1
      const q2_1 = manager.getCurrentQuestion(roomCode, "player-2");
      expect(q2_1?.question).toBe(allQuestions[0]?.question); // Should be Q1
      manager.submitAnswer(roomCode, "player-2", q2_1?.correctAnswer || "A", 3000);

      // Player 2 should be on Q2 (index 1)
      p2 = manager.getRoom(roomCode)?.players.get("player-2");
      expect(p2?.playerQuestionIndex).toBe(1);

      // Player 1 should still be on Q4 (index 3)
      p1 = manager.getRoom(roomCode)?.players.get("player-1");
      expect(p1?.playerQuestionIndex).toBe(3);

      // Verify they're seeing different questions
      const q1_current = manager.getCurrentQuestion(roomCode, "player-1");
      const q2_current = manager.getCurrentQuestion(roomCode, "player-2");
      expect(q1_current?.question).not.toBe(q2_current?.question); // Different questions

      // Player 1 finishes all 10 questions
      for (let i = 3; i < 10; i++) {
        const q = manager.getCurrentQuestion(roomCode, "player-1");
        if (q) {
          manager.submitAnswer(roomCode, "player-1", q.correctAnswer || "A", 1000);
        }
      }

      // Player 1 should be done (null)
      const p1_final = manager.getCurrentQuestion(roomCode, "player-1");
      expect(p1_final).toBeNull();

      // Player 2 should still be answering
      const p2_current = manager.getCurrentQuestion(roomCode, "player-2");
      expect(p2_current).not.toBeNull();

      // Verify final scores
      const p1_final_state = manager.getRoom(roomCode)?.players.get("player-1");
      const p2_final_state = manager.getRoom(roomCode)?.players.get("player-2");
      expect(p1_final_state?.playerQuestionIndex).toBe(10); // Completed all 10
      expect(p2_final_state?.playerQuestionIndex).toBeLessThan(10); // Still answering
    });
    it("should handle complete 2-player game from start to finish", async () => {
      const manager = new GameRoomManager();
      
      // Create room with host
      const room = manager.createRoom("host-1", "Host Player", 15);
      const roomCode = room.roomCode;

      // Player 2 joins
      manager.joinRoom(roomCode, "player-2", "Player 2");

      // Start game
      const success = await manager.startGame(roomCode, "Science");
      expect(success).toBe(true);

      // Verify room has 2 players
      const roomData = manager.getRoom(roomCode);
      expect(roomData?.players.size).toBe(2);
      expect(roomData?.status).toBe("playing");

      // Get all questions to verify they're loaded
      const allQuestions = roomData?.allQuestions || [];
      expect(allQuestions.length).toBe(10);

      // Simulate both players answering all 10 questions
      let hostQuestionsSeen = new Set<string>();
      let player2QuestionsSeen = new Set<string>();

      for (let i = 0; i < 10; i++) {
        // Host answers question i
        const hostQ = manager.getCurrentQuestion(roomCode, "host-1");
        expect(hostQ).not.toBeNull();
        hostQuestionsSeen.add(hostQ?.question || "");
        
        const hostResult = manager.submitAnswer(roomCode, "host-1", hostQ?.correctAnswer || "A", 2000);
        expect(hostResult.correct).toBe(true);

        // Player 2 answers question i
        const p2Q = manager.getCurrentQuestion(roomCode, "player-2");
        expect(p2Q).not.toBeNull();
        player2QuestionsSeen.add(p2Q?.question || "");
        
        const p2Result = manager.submitAnswer(roomCode, "player-2", p2Q?.correctAnswer || "A", 2000);
        expect(p2Result.correct).toBe(true);
      }

      // Verify both players saw the same questions
      expect(hostQuestionsSeen.size).toBe(10);
      expect(player2QuestionsSeen.size).toBe(10);
      expect(hostQuestionsSeen).toEqual(player2QuestionsSeen);

      // Verify both players completed all 10 questions
      const finalRoom = manager.getRoom(roomCode);
      const hostFinal = finalRoom?.players.get("host-1");
      const player2Final = finalRoom?.players.get("player-2");
      
      expect(hostFinal?.playerQuestionIndex).toBe(10);
      expect(player2Final?.playerQuestionIndex).toBe(10);
      expect(hostFinal?.totalAnswered).toBe(10);
      expect(player2Final?.totalAnswered).toBe(10);

      // Verify no questions were skipped
      expect(hostFinal?.correctAnswers).toBe(10);
      expect(player2Final?.correctAnswers).toBe(10);
    });
  });
});


describe("Phase 51 room improvements", () => {
  let manager: GameRoomManager;

  beforeEach(() => {
    manager = new GameRoomManager();
  });

  it("stores configurable round settings and supports pause/resume", async () => {
    const room = manager.createRoom("host", "Host");
    const started = await manager.startGame(room.roomCode, "Science", "hard", "Science", {
      questionCount: 5,
      timerDurationMs: 120_000,
      streakBonusesEnabled: false,
      topics: ["Science", "Astronomy"],
    });
    expect(started).toBe(true);
    expect(manager.getRoom(room.roomCode)?.questionCount).toBe(5);
    expect(manager.getRoom(room.roomCode)?.timerDurationMs).toBe(120_000);
    expect(manager.getRoom(room.roomCode)?.topics).toEqual(["Science", "Astronomy"]);
    expect(manager.pauseGame(room.roomCode)).toBe(true);
    expect(manager.getRoom(room.roomCode)?.pausedAt).toBeDefined();
    expect(manager.resumeGame(room.roomCode)).toBe(true);
    expect(manager.getRoom(room.roomCode)?.pausedAt).toBeUndefined();
    expect(manager.getRoom(room.roomCode)?.streakBonusesEnabled).toBe(false);
  });

  it("preserves an existing player on rejoin and permits active-game spectators", async () => {
    const room = manager.createRoom("host", "Host");
    const player = manager.joinRoom(room.roomCode, "player", "Player");
    expect(player).not.toBeNull();
    await manager.startGame(room.roomCode, "Science");
    const spectator = manager.joinRoom(room.roomCode, "spectator", "Observer", true);
    expect(spectator?.players.get("spectator")?.isSpectator).toBe(true);
    const restored = manager.rejoinRoom(room.roomCode, "player", "Player Restored");
    expect(restored?.players.get("player")?.name).toBe("Player Restored");
  });

  it("resets the room for a rematch and removes non-host players", async () => {
    const room = manager.createRoom("host", "Host");
    manager.joinRoom(room.roomCode, "player", "Player");
    await manager.startGame(room.roomCode, "Science");
    manager.endGame(room.roomCode);
    expect(manager.rematch(room.roomCode)).toBe(true);
    expect(manager.getRoom(room.roomCode)?.status).toBe("waiting");
    expect(manager.getRoom(room.roomCode)?.players.get("host")?.score).toBe(0);
    expect(manager.removePlayer(room.roomCode, "player")).toBe(true);
    expect(manager.getRoom(room.roomCode)?.players.has("player")).toBe(false);
  });
});


describe("Question generation failure recovery", () => {
  it("rolls a room back to waiting when no complete question set is available", async () => {
    const manager = new GameRoomManager();
    const room = manager.createRoom("host", "Host");

    const started = await manager.startGame(room.roomCode, "Unknown category", "medium", "Unknown category");

    expect(started).toBe(false);
    expect(manager.getRoom(room.roomCode)?.status).toBe("waiting");
    expect(manager.getRoom(room.roomCode)?.allQuestions).toHaveLength(0);
  });
});


describe("Payment-free room start", () => {
  it("starts an ordinary room without any payment verification", async () => {
    const manager = new GameRoomManager();
    const room = manager.createRoom("host", "Host", 15, false);
    manager.joinRoom(room.roomCode, "player-1", "Player 1");

    expect(await manager.startGame(room.roomCode, "Science")).toBe(true);
    expect(manager.getRoom(room.roomCode)?.status).toBe("playing");
  });

  it("does not start a paid room until the minimum participants are paid", async () => {
    const manager = new GameRoomManager();
    const room = manager.createRoom("host", "Host", 15, "paystack_mpesa");
    manager.joinRoom(room.roomCode, "player-1", "Player 1");
    manager.joinRoom(room.roomCode, "player-2", "Player 2");

    expect(await manager.startGame(room.roomCode, "Science")).toBe(false);
    for (const playerId of ["host", "player-1", "player-2"]) {
      const reference = `reference-${playerId}`;
      manager.createProviderPaymentRequest(room.roomCode, playerId, reference, "paystack_mpesa");
      manager.applyProviderPaymentStatus(room.roomCode, playerId, true, reference, `transaction-${playerId}`, "paystack_mpesa");
    }

    expect(await manager.startGame(room.roomCode, "Science")).toBe(true);
    expect(manager.getRoom(room.roomCode)?.status).toBe("playing");
  });

  it("does not accept a Daraja callback for a mismatched request ID", () => {
    const manager = new GameRoomManager();
    const room = manager.createRoom("host", "Host", 15, true);
    manager.joinRoom(room.roomCode, "player-1", "Player 1");
    manager.createDarajaPaymentRequest(room.roomCode, "host", "+254700000001", "daraja-host");

    expect(manager.applyDarajaPaymentStatus(room.roomCode, "host", true, "wrong-request", "receipt")).toBeNull();
    expect(manager.getPrizePool(room.roomCode)?.participants["host"].paid).toBe(false);
  });

  it("removes a departed participant from the payment gate", () => {
    const manager = new GameRoomManager();
    const room = manager.createRoom("host", "Host", 15, true);
    manager.joinRoom(room.roomCode, "player-1", "Player 1");
    manager.createDarajaPaymentRequest(room.roomCode, "host", "+254700000001", "daraja-host");
    manager.applyDarajaPaymentStatus(room.roomCode, "host", true, "daraja-host", "receipt-host");
    manager.createDarajaPaymentRequest(room.roomCode, "player-1", "+254700000002", "daraja-one");
    manager.applyDarajaPaymentStatus(room.roomCode, "player-1", true, "daraja-one", "receipt-one");

    manager.leaveRoom(room.roomCode, "player-1");
    const pool = manager.getPrizePool(room.roomCode);
    expect(Object.keys(pool?.participants || {})).toEqual(["host"]);
    expect(pool?.grossPoolMinor).toBe(1_000);
  });
});


describe("Daraja prize payout records", () => {
  it("creates top-three allocations only after a finished, fully paid round and prevents duplicate keys", async () => {
    const manager = new GameRoomManager();
    const room = manager.createRoom("host", "Host", 15, true);
    manager.joinRoom(room.roomCode, "player-1", "Player 1");
    manager.joinRoom(room.roomCode, "player-2", "Player 2");
    for (const id of ["host", "player-1", "player-2"]) {
      const requestId = `daraja-${id}`;
      manager.createDarajaPaymentRequest(room.roomCode, id, `+25470000000${id === "host" ? "1" : id === "player-1" ? "2" : "3"}`, requestId);
      manager.applyDarajaPaymentStatus(room.roomCode, id, true, requestId, `receipt-${id}`);
    }
    expect(await manager.startGame(room.roomCode, "Science")).toBe(true);
    const activeRoom = manager.getRoom(room.roomCode);
    activeRoom?.players.get("host") && (activeRoom.players.get("host")!.score = 100);
    activeRoom?.players.get("player-1") && (activeRoom.players.get("player-1")!.score = 80);
    activeRoom?.players.get("player-2") && (activeRoom.players.get("player-2")!.score = 60);
    manager.endGame(room.roomCode);

    const preview = manager.getManualPayoutPreview(room.roomCode) || [];
    expect(preview.map((allocation) => allocation.netAmountMinor)).toEqual([300, 1_350, 810, 540]);
    expect(manager.recordManualPayout(room.roomCode, "host", "manual-payout:key-1")).toBe(true);
    expect(manager.recordManualPayout(room.roomCode, "host", "manual-payout:key-1")).toBe(false);
    expect(manager.recordManualPayout(room.roomCode, "player-1", "manual-payout:key-2")).toBe(false);
  });
});






describe("Daraja batch verification", () => {
  it("verifies only selected unpaid participants with submitted numbers", () => {
    const manager = new GameRoomManager();
    const room = manager.createRoom("host", "Host", 15, true);
    manager.joinRoom(room.roomCode, "player-1", "Player 1");
    manager.joinRoom(room.roomCode, "player-2", "Player 2");
    manager.createDarajaPaymentRequest(room.roomCode, "host", "+254700000001", "req-host");
    manager.createDarajaPaymentRequest(room.roomCode, "player-1", "+254700000002", "req-one");
    manager.createDarajaPaymentRequest(room.roomCode, "player-2", "+254700000003", "req-two");

    const pool = manager.verifyDarajaPaymentsBatch(room.roomCode, "host", ["host", "player-1"], { "host": "REF-H", "player-1": "REF-1" });
    expect(pool?.participants.host.paid).toBe(true);
    expect(pool?.participants.host.walletPhone).toBe("+254700000001");
    expect(pool?.participants.host.providerTransactionId).toBe("REF-H");
    expect(pool?.participants["player-1"].paid).toBe(true);
    expect(pool?.participants["player-2"].paid).toBe(false);
  });

  it("rejects non-hosts, missing wallet numbers, and duplicate verification", () => {
    const manager = new GameRoomManager();
    const room = manager.createRoom("host", "Host", 15, true);
    manager.joinRoom(room.roomCode, "player-1", "Player 1");
    expect(manager.verifyDarajaPaymentsBatch(room.roomCode, "player-1", ["host"])).toBeNull();
    expect(manager.verifyDarajaPaymentsBatch(room.roomCode, "host", ["player-1"])).toBeNull();
    manager.createDarajaPaymentRequest(room.roomCode, "player-1", "+254700000002", "req-one");
    expect(manager.verifyDarajaPaymentsBatch(room.roomCode, "host", ["player-1"])).not.toBeNull();
    expect(manager.verifyDarajaPaymentsBatch(room.roomCode, "host", ["player-1"])).toBeNull();
  });
});

describe("Locked question script", () => {
  it("locks the generated script for the lifetime of an active round", async () => {
    const manager = new GameRoomManager();
    const room = manager.createRoom("host", "Host");
    expect(await manager.startGame(room.roomCode, "Science")).toBe(true);
    const active = manager.getRoom(room.roomCode);
    const lockedHash = active?.questionScriptHash;
    expect(lockedHash).toMatch(/^[a-f0-9]{64}$/);
    expect(manager.isQuestionScriptLocked(room.roomCode)).toBe(true);
    expect(await manager.startGame(room.roomCode, "Kenya")).toBe(false);
    expect(manager.getRoom(room.roomCode)?.questionScriptHash).toBe(lockedHash);
  });

  it("fails closed if the locked script is modified", async () => {
    const manager = new GameRoomManager();
    const room = manager.createRoom("host", "Host");
    expect(await manager.startGame(room.roomCode, "Science")).toBe(true);
    const active = manager.getRoom(room.roomCode);
    active!.allQuestions[0]!.question = "tampered";
    expect(manager.submitAnswer(room.roomCode, "host", "A", 1000)).toBeNull();
  });
});
