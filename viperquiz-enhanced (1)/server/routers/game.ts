import { z } from "zod";
import { randomBytes } from "node:crypto";
import { adminProcedure, publicProcedure, router } from "../_core/trpc";
import { gameRoomManager } from "../services/gameRoom";
import { markQuestionsAsUsed } from "../services/questionDeduplication";
import { notifyOwner } from "../_core/notification";
import { darajaPaymentAdapter, DARAJA_ADAPTER_DISABLED_MESSAGE } from "../services/darajaPaymentAdapter";
import { paystackPaymentAdapter, PAYSTACK_ADAPTER_DISABLED_MESSAGE } from "../services/paystackPaymentAdapter";
import { createOwnerNotification } from "../services/notifications";
import {
  allParticipantsPaid,
  PRIZE_POOL_POLICY,
  refreshPoolAmounts,
} from "../services/prizePool";

export const gameRouter = router({
  // Create a new game room
  paystackAvailability: publicProcedure.query(() => ({ enabled: paystackPaymentAdapter.isConfigured })),

  createRoom: publicProcedure
    .input(z.object({ playerName: z.string(), playerId: z.string(), paymentProvider: z.enum(["free", "paystack_mpesa"]).optional() }))
    .mutation(async ({ input }) => {
      const paymentProvider = input.paymentProvider ?? "free";
      if (paymentProvider === "paystack_mpesa" && !paystackPaymentAdapter.isConfigured) {
        throw new Error(PAYSTACK_ADAPTER_DISABLED_MESSAGE);
      }
      const room = gameRoomManager.createRoom(input.playerId, input.playerName, 20, paymentProvider);

      // Create the durable pool header when the database is available. Room play remains
      // usable if the ledger is temporarily unavailable; Daraja reconciliation will report it.
      try {
        const { getDb } = await import("../db");
        const { gamePrizePools } = await import("../../drizzle/schema");
        const db = await getDb();
        if (db) {
          await db.insert(gamePrizePools).values({
            roomCode: room.roomCode,
            roundId: room.prizePool.roundId,
            currency: room.prizePool.currency,
            entryFeeMinor: room.prizePool.entryFeeMinor,
            developerRatePercent: PRIZE_POOL_POLICY.developerRatePercent,
            firstRatePercent: PRIZE_POOL_POLICY.winnerRatesByRank[1],
            secondRatePercent: PRIZE_POOL_POLICY.winnerRatesByRank[2],
            thirdRatePercent: PRIZE_POOL_POLICY.winnerRatesByRank[3],
            status: "open",
          });
        }
      } catch (error) {
        console.warn("[Daraja] Could not create durable prize-pool header", error);
      }
      
      // Send notification to owner
      await notifyOwner({
        title: "🎮 New Game Room Created",
        content: `${input.playerName} created a new quiz room (Code: ${room.roomCode}). Waiting for players to join...`,
      }).catch(() => {}); // Silently fail if notification service is unavailable
      await createOwnerNotification({ type: "room_invite", title: "New game room created", message: `${input.playerName} created room ${room.roomCode}.`, data: JSON.stringify({ roomCode: room.roomCode }) }).catch(() => {});
      
      return {
        roomCode: room.roomCode,
        hostId: room.hostId,
        paymentMode: paymentProvider,
        entryFeeMinor: room.prizePool.enabled ? room.prizePool.entryFeeMinor : 0,
      };
    }),

  // Join an existing game room
  joinRoom: publicProcedure
    .input(z.object({ roomCode: z.string(), playerName: z.string(), playerId: z.string(), spectator: z.boolean().optional() }))
    .query(({ input }) => {
      const room = gameRoomManager.joinRoom(input.roomCode, input.playerId, input.playerName, input.spectator);
      if (!room) {
        return {
          success: false,
          message: "Room not found or full",
        };
      }
      
      // Send notification when player joins
      notifyOwner({
        title: "👥 Player Joined Game",
        content: `${input.playerName} joined room ${input.roomCode}. Total players: ${room.players.size}`,
      }).catch(() => {}); // Silently fail if notification service is unavailable
      createOwnerNotification({ type: "friend_join", title: "Player joined a room", message: `${input.playerName} joined room ${input.roomCode}.`, data: JSON.stringify({ roomCode: input.roomCode, playerId: input.playerId }) }).catch(() => {});

      return {
        success: true,
        room: {
          roomCode: room.roomCode,
          hostId: room.hostId,
          status: room.status,
          playerCount: Array.from(room.players.values()).filter((player) => !player.isSpectator).length,
          spectatorCount: Array.from(room.players.values()).filter((player) => player.isSpectator).length,
          maxPlayers: room.maxPlayers,
        },
      };
    }),

  // Get room details
  getRoom: publicProcedure
    .input(z.object({ roomCode: z.string(), playerId: z.string().optional() }))
    .query(({ input }) => {
      const room = gameRoomManager.getRoom(input.roomCode);
      if (!room) {
        return null;
      }

      const currentQuestion = gameRoomManager.getCurrentQuestion(input.roomCode, input.playerId);
      const prizePool = gameRoomManager.getPrizePool(input.roomCode);
      const isHost = input.playerId === room.hostId;

      return {
        roomCode: room.roomCode,
        hostId: room.hostId,
        category: room.category,
        customTopic: room.customTopic,
        topics: room.topics || [],
        status: room.status,
        playerCount: Array.from(room.players.values()).filter((player) => !player.isSpectator).length,
        spectatorCount: Array.from(room.players.values()).filter((player) => player.isSpectator).length,
        maxPlayers: room.maxPlayers,
          questionScriptLocked: gameRoomManager.isQuestionScriptLocked(input.roomCode),
          questionScriptHash: room.status === "playing" ? room.questionScriptHash : undefined,
          currentQuestionIndex: input.playerId ? (room.players.get(input.playerId)?.playerQuestionIndex ?? room.currentQuestionIndex) : room.currentQuestionIndex,
          questionCount: room.questionCount,
          timerDurationMs: room.timerDurationMs,
          streakBonusesEnabled: room.streakBonusesEnabled,
          isPaused: Boolean(room.pausedAt),
          paymentMode: room.paymentProvider,
          prizePool: prizePool ? {
            roundId: prizePool.roundId,
            enabled: prizePool.enabled,
            status: prizePool.status,
            entryFeeMinor: prizePool.entryFeeMinor,
            currency: prizePool.currency,
            minimumParticipantCount: prizePool.minimumParticipantCount,
            collectionPhone: prizePool.collectionPhone,
            developerPhone: isHost ? prizePool.developerPhone : undefined,
            participantCount: Object.keys(prizePool.participants).length,
            paidParticipantCount: Object.values(prizePool.participants).filter((participant) => participant.paid).length,
            grossPoolMinor: prizePool.grossPoolMinor,
            developerAllocationMinor: prizePool.developerAllocationMinor,
            developerNetMinor: prizePool.developerNetMinor,
            winnerAllocationMinor: prizePool.winnerAllocationMinor,
            allParticipantsPaid: allParticipantsPaid(prizePool),
            participants: Object.values(prizePool.participants).map((participant) => ({
              playerId: participant.playerId,
              playerName: participant.playerName,
              paid: participant.paid,
              paymentStatus: participant.paymentStatus,
              walletPhone: isHost ? participant.walletPhone : undefined,
              providerTransactionId: isHost || participant.playerId === input.playerId ? participant.providerTransactionId : undefined,
              providerRequestId: isHost || participant.playerId === input.playerId ? participant.providerRequestId : undefined,
            })),
          } : null,
          players: Array.from(room.players.values()).map((p) => ({
          id: p.id,
          name: p.name,
          score: p.score,
          isReady: p.isReady,
          correctAnswers: p.correctAnswers,
          totalAnswered: p.totalAnswered,
          currentStreak: p.currentStreak || 0,
          maxStreak: p.maxStreak || 0,
          bonusPoints: p.bonusPoints || 0,
          playerQuestionIndex: p.playerQuestionIndex,
          isSpectator: Boolean(p.isSpectator),
              lastSeenAt: p.lastSeenAt,
              suspiciousSession: Boolean(p.suspiciousSession),
              integrityEventCount: p.integrityEvents.length,
        })),
        currentQuestion: currentQuestion
          ? {
              id: currentQuestion.id,
              question: currentQuestion.question,
              optionA: currentQuestion.optionA,
              optionB: currentQuestion.optionB,
              optionC: currentQuestion.optionC,
              optionD: currentQuestion.optionD,
              difficulty: currentQuestion.difficulty,
              explanation: currentQuestion.explanation,
            }
          : null,
      };
    }),

  // Report client integrity events (app switch, screenshot attempt)
  reportIntegrityEvent: publicProcedure
    .input(z.object({
      roomCode: z.string(),
      playerId: z.string(),
      eventType: z.enum(["app_background", "app_inactive", "screenshot_attempt", "suspicious_timing"]),
      timestamp: z.number(),
    }))
    .mutation(({ input }) => gameRoomManager.reportIntegrityEvent(input.roomCode, input.playerId, input.eventType, input.timestamp)),

  // Get time remaining in the game
  getTimeRemaining: publicProcedure
    .input(z.object({ roomCode: z.string() }))
    .query(({ input }) => {
      const timeRemaining = gameRoomManager.getTimeRemaining(input.roomCode);
      const room = gameRoomManager.getRoom(input.roomCode);

      return {
        timeRemaining: Math.max(0, timeRemaining),
        isGameOver: room?.status === "finished",
      };
    }),

  // Daraja STK Push boundary. It remains disabled until callback URL and merchant configuration are supplied.
  requestDarajaPayment: publicProcedure
    .input(z.object({ roomCode: z.string(), playerId: z.string(), phoneNumber: z.string().regex(/^(?:254|0)7\\d{8}$/, "Enter a valid Kenyan M-Pesa number.") }))
    .mutation(async ({ input }) => {
      const room = gameRoomManager.getRoom(input.roomCode);
      const participant = room?.prizePool?.participants[input.playerId];
      if (!room || !participant || room.status !== "waiting" || !room.prizePool.enabled || participant.paid) {
        return { success: false, status: "rejected" as const, message: "Daraja payments are available only for unpaid participants in a waiting prize-pool room." };
      }
      const idempotencyKey = `daraja-payment:${room.prizePool.roundId}:${input.playerId}`;
      const result = await darajaPaymentAdapter.initiate({
        roomCode: input.roomCode,
        roundId: room.prizePool.roundId,
        playerId: input.playerId,
        phoneNumber: input.phoneNumber.trim(),
        amountMinor: room.prizePool.entryFeeMinor,
        currency: room.prizePool.currency,
        idempotencyKey,
      });
      if (!result.enabled) return { success: false, status: result.status, message: DARAJA_ADAPTER_DISABLED_MESSAGE };
      const updatedPool = gameRoomManager.createDarajaPaymentRequest(input.roomCode, input.playerId, input.phoneNumber, result.providerRequestId);
      if (!updatedPool) return { success: false, status: "rejected" as const, message: "The Daraja request no longer matches the room participant." };
      try {
        const { getDb } = await import("../db");
        const { gamePayments, gamePrizePools } = await import("../../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const db = await getDb();
        if (db) {
          const [poolRow] = await db.select({ id: gamePrizePools.id }).from(gamePrizePools).where(eq(gamePrizePools.roundId, updatedPool.roundId)).limit(1);
          if (poolRow) {
            const values = { poolId: poolRow.id, roomCode: input.roomCode, roundId: updatedPool.roundId, playerId: input.playerId, playerName: participant.playerName, walletPhone: input.phoneNumber.trim(), provider: "daraja_mpesa", amountMinor: updatedPool.entryFeeMinor, currency: updatedPool.currency, providerRequestId: result.providerRequestId, idempotencyKey, status: "pending" as const };
            const [existing] = await db.select().from(gamePayments).where(eq(gamePayments.idempotencyKey, idempotencyKey)).limit(1);
            if (existing) await db.update(gamePayments).set(values).where(eq(gamePayments.idempotencyKey, idempotencyKey));
            else await db.insert(gamePayments).values(values);
          }
        }
      } catch (error) {
        console.warn("[Daraja] Provider request persistence failed", error);
      }
      return { success: true, status: result.status, providerRequestId: result.providerRequestId, checkoutRequestId: result.checkoutRequestId, message: "M-Pesa payment prompt initiated; approve it on your phone and wait for confirmation." };
    }),

  initializePaystackPayment: publicProcedure
    .input(z.object({
      roomCode: z.string(),
      playerId: z.string(),
      email: z.string().email(),
      phoneNumber: z.string().regex(/^(?:254|0)7\d{8}$/).optional(),
    }))
    .mutation(async ({ input }) => {
      const room = gameRoomManager.getRoom(input.roomCode);
      const participant = room?.prizePool?.participants[input.playerId];
      if (!room || room.paymentProvider !== "paystack_mpesa" || !participant || room.status !== "waiting" || participant.paid) {
        return { success: false as const, message: "Paystack checkout is available only for unpaid players in a Paystack room." };
      }

      const reference = `vq_${randomBytes(16).toString("hex")}`;
      const idempotencyKey = `paystack:${room.prizePool.roundId}:${input.playerId}:${reference}`;
      const { getDb } = await import("../db");
      const { gamePayments, gamePrizePools } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) return { success: false as const, message: "Payment storage is unavailable; no payment was started." };
      const [poolRow] = await db.select({ id: gamePrizePools.id }).from(gamePrizePools).where(eq(gamePrizePools.roundId, room.prizePool.roundId)).limit(1);
      if (!poolRow) return { success: false as const, message: "The room payment record is unavailable; no payment was started." };

      const phoneNumber = input.phoneNumber ?? "";
      const values = {
        poolId: poolRow.id,
        roomCode: input.roomCode,
        roundId: room.prizePool.roundId,
        playerId: input.playerId,
        playerName: participant.playerName,
        walletPhone: phoneNumber || null,
        provider: "paystack",
        amountMinor: room.prizePool.entryFeeMinor,
        currency: room.prizePool.currency,
        providerRequestId: reference,
        idempotencyKey,
        status: "pending" as const,
      };
      await db.insert(gamePayments).values(values);
      const updatedPool = gameRoomManager.createProviderPaymentRequest(
        input.roomCode,
        input.playerId,
        reference,
        "paystack_mpesa",
        phoneNumber || undefined,
      );
      if (!updatedPool) {
        await db.update(gamePayments).set({ status: "failed", failureReason: "Room participant changed before checkout." }).where(eq(gamePayments.providerRequestId, reference));
        return { success: false as const, message: "The room participant changed; no payment was started." };
      }

      try {
        const result = await paystackPaymentAdapter.initialize({
          roomCode: input.roomCode,
          roundId: room.prizePool.roundId,
          playerId: input.playerId,
          email: input.email,
          phoneNumber,
          amountMinor: room.prizePool.entryFeeMinor,
          currency: room.prizePool.currency,
          reference,
        });
        if (!result.enabled) {
          await db.update(gamePayments).set({ status: "failed", failureReason: result.message }).where(eq(gamePayments.providerRequestId, reference));
          return { success: false as const, message: PAYSTACK_ADAPTER_DISABLED_MESSAGE };
        }
        return { success: true as const, authorizationUrl: result.authorizationUrl, reference: result.reference };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Paystack checkout initialization failed.";
        await db.update(gamePayments).set({ status: "failed", failureReason: message }).where(eq(gamePayments.providerRequestId, reference));
        gameRoomManager.applyDarajaPaymentStatus(input.roomCode, input.playerId, false, reference);
        return { success: false as const, message };
      }
    }),

  verifyPaystackPayment: publicProcedure
    .input(z.object({ roomCode: z.string(), playerId: z.string(), reference: z.string().regex(/^vq_[a-f0-9]{32}$/) }))
    .mutation(async ({ input }) => {
      const room = gameRoomManager.getRoom(input.roomCode);
      const participant = room?.prizePool?.participants[input.playerId];
      if (
        !room ||
        room.paymentProvider !== "paystack_mpesa" ||
        room.status !== "waiting" ||
        !participant ||
        participant.providerRequestId !== input.reference
      ) {
        return { success: false as const, status: "rejected" as const, message: "This Paystack reference does not match your current room payment." };
      }

      const { getDb } = await import("../db");
      const { gamePayments } = await import("../../drizzle/schema");
      const { and, eq } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) return { success: false as const, status: "unavailable" as const, message: "Payment storage is unavailable." };
      const [payment] = await db.select().from(gamePayments).where(and(
        eq(gamePayments.providerRequestId, input.reference),
        eq(gamePayments.provider, "paystack"),
        eq(gamePayments.roomCode, input.roomCode),
        eq(gamePayments.playerId, input.playerId),
        eq(gamePayments.roundId, room.prizePool.roundId),
      )).limit(1);
      if (!payment) return { success: false as const, status: "rejected" as const, message: "Payment attempt was not found." };
      if (payment.status === "paid") return { success: true as const, status: "success" as const };

      const verification = await paystackPaymentAdapter.verify(input.reference, {
        amountMinor: payment.amountMinor,
        currency: payment.currency,
      });
      if (verification.status === "pending") {
        return { success: false as const, status: "pending" as const, message: "Paystack has not confirmed this payment yet." };
      }

      if (verification.status === "failed") {
        await db.update(gamePayments).set({ status: "failed", failureReason: "Paystack reported an unsuccessful transaction." }).where(eq(gamePayments.id, payment.id));
        gameRoomManager.applyProviderPaymentStatus(input.roomCode, input.playerId, false, input.reference, undefined, "paystack_mpesa");
        return { success: false as const, status: "failed" as const, message: "Paystack reported that this payment did not complete." };
      }

      await db.update(gamePayments).set({
        status: "paid",
        providerTransactionId: verification.providerTransactionId ?? null,
        paidAt: new Date(),
        failureReason: null,
      }).where(eq(gamePayments.id, payment.id));
      const updatedPool = gameRoomManager.applyProviderPaymentStatus(
        input.roomCode,
        input.playerId,
        true,
        input.reference,
        verification.providerTransactionId,
        "paystack_mpesa",
      );
      if (!updatedPool) return { success: false as const, status: "rejected" as const, message: "The room payment state changed before verification completed." };
      return { success: true as const, status: "success" as const };
    }),

  verifyDarajaPaymentsBatch: publicProcedure
    .input(z.object({
      roomCode: z.string(),
      hostId: z.string(),
      playerIds: z.array(z.string()).min(1).max(15),
      transactionRefs: z.record(z.string(), z.string().max(150)).optional(),
    }))
    .mutation(({ input }) => {
      const pool = gameRoomManager.verifyDarajaPaymentsBatch(input.roomCode, input.hostId, input.playerIds, input.transactionRefs || {});
      if (!pool) return { success: false, message: "Select unpaid participants with submitted M-Pesa numbers; only the host can verify them." };
      return { success: true, paidParticipantCount: Object.values(pool.participants).filter((participant) => participant.paid).length, allParticipantsPaid: allParticipantsPaid(pool) };
    }),

  getManualPayoutPreview: publicProcedure
    .input(z.object({ roomCode: z.string(), playerId: z.string() }))
    .query(({ input }) => {
      const room = gameRoomManager.getRoom(input.roomCode);
      if (!room || room.hostId !== input.playerId) return { success: false, payouts: [], message: "Only the host can view payout details." };
      const allocations = gameRoomManager.getManualPayoutPreview(input.roomCode) || [];
      return {
        success: true,
        payouts: allocations.map((allocation) => ({
          id: `${allocation.recipientType}:${allocation.playerId || "developer"}`,
          recipientType: allocation.recipientType,
          playerId: allocation.playerId,
          playerName: allocation.playerName,
          rank: allocation.rank,
          expectedGrossAmountMinor: allocation.grossAmountMinor,
          expectedProviderFeesMinor: allocation.providerFeesMinor,
          expectedNetAmountMinor: allocation.netAmountMinor,
          suggestedPhone: allocation.recipientPhone || undefined,
        })),
      };
    }),

  getManualPayouts: publicProcedure
    .input(z.object({ roomCode: z.string(), playerId: z.string() }))
    .query(async ({ input }) => {
      const room = gameRoomManager.getRoom(input.roomCode);
      if (!room || room.hostId !== input.playerId) return { success: false, payouts: [], message: "Only the host can view payout records." };
      try {
        const { getDb } = await import("../db");
        const { gamePayouts } = await import("../../drizzle/schema");
        const { eq, desc } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) return { success: false, payouts: [], message: "Database not available." };
        const payouts = await db.select().from(gamePayouts).where(eq(gamePayouts.roundId, room.prizePool.roundId)).orderBy(desc(gamePayouts.createdAt));
        return { success: true, payouts };
      } catch (error) {
        console.error("[Daraja] Failed to fetch payout records", error);
        return { success: false, payouts: [], message: "Could not load payout records." };
      }
    }),

  getManualReconciliation: publicProcedure
    .input(z.object({ roomCode: z.string(), playerId: z.string() }))
    .query(async ({ input }) => {
      const room = gameRoomManager.getRoom(input.roomCode);
      if (!room || room.hostId !== input.playerId) return { success: false, csv: "", payments: [], payouts: [], message: "Only the host can export reconciliation data." };
      try {
        const { getDb } = await import("../db");
        const { gamePayments, gamePayouts } = await import("../../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) return { success: false, csv: "", payments: [], payouts: [], message: "Database not available." };
        const payments = await db.select().from(gamePayments).where(eq(gamePayments.roundId, room.prizePool.roundId));
        const payouts = await db.select().from(gamePayouts).where(eq(gamePayouts.roundId, room.prizePool.roundId));
        const csvCell = (value: unknown) => `"${String(value ?? "").replaceAll("\"", "\"\"")}"`;
        const rows = [
          ["record_type", "round_id", "player_id", "player_name", "recipient_type", "phone", "status", "amount_minor", "provider_fees_minor", "net_amount_minor", "provider_transaction_id", "idempotency_key", "created_at"],
          ...payments.map((payment) => ["entry", payment.roundId, payment.playerId, payment.playerName, "", payment.walletPhone, payment.status, payment.amountMinor, "", "", payment.providerTransactionId, payment.idempotencyKey, payment.createdAt]),
          ...payouts.map((payout) => ["payout", payout.roundId, payout.playerId, "", payout.recipientType, payout.recipientPhone, payout.status, payout.grossAmountMinor, payout.providerFeesMinor, payout.netAmountMinor, payout.providerTransactionId, payout.idempotencyKey, payout.createdAt]),
        ];
        return { success: true, csv: rows.map((row) => row.map(csvCell).join(",")).join("\\n"), payments, payouts };
      } catch (error) {
        console.error("[Daraja] Failed to build reconciliation export", error);
        return { success: false, csv: "", payments: [], payouts: [], message: "Could not build reconciliation export." };
      }
    }),

  recordManualPayout: publicProcedure
    .input(z.object({
      roomCode: z.string(),
      hostId: z.string(),
      recipientType: z.enum(["developer", "first", "second", "third"]),
      playerId: z.string().optional(),
      recipientPhone: z.string().regex(/^\+2547\d{8}$/).optional(),
      grossAmountMinor: z.number().int().positive(),
      providerFeesMinor: z.number().int().min(0).default(0),
      providerTransactionId: z.string().min(2).max(150),
    }))
    .mutation(async ({ input }) => {
      const room = gameRoomManager.getRoom(input.roomCode);
      if (!room || room.hostId !== input.hostId || room.status !== "finished") {
        return { success: false, message: "Payouts can only be recorded by the host after the game ends." };
      }
      const allocations = gameRoomManager.getManualPayoutPreview(input.roomCode) || [];
      const allocation = allocations.find((candidate) => candidate.recipientType === input.recipientType && candidate.playerId === input.playerId);
      if (!allocation) return { success: false, message: "This recipient is not an eligible paid participant for the round." };
      if (input.grossAmountMinor !== allocation.grossAmountMinor) {
        return { success: false, message: `Gross payout must be ${allocation.grossAmountMinor} minor units for this allocation.` };
      }
      const providerFeesMinor = input.recipientType === "developer"
        ? Math.min(input.providerFeesMinor, input.grossAmountMinor)
        : 0;
      const recipientPhone = input.recipientType === "developer" ? room.prizePool.developerPhone : input.recipientPhone;
      if (!recipientPhone) return { success: false, message: "Enter a valid +2547XXXXXXXX recipient phone for the winner." };
      const idempotencyKey = `manual-payout:${room.prizePool.roundId}:${input.recipientType}:${input.playerId || "developer"}`;

      try {
        const { getDb } = await import("../db");
        const { gamePayouts, gamePrizePools } = await import("../../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) return { success: false, message: "Database not available; payout was not recorded." };
        const [poolRow] = await db.select({ id: gamePrizePools.id }).from(gamePrizePools).where(eq(gamePrizePools.roundId, room.prizePool.roundId)).limit(1);
        if (!poolRow) return { success: false, message: "The durable prize pool was not found." };
        const [existing] = await db.select({ id: gamePayouts.id }).from(gamePayouts).where(eq(gamePayouts.idempotencyKey, idempotencyKey)).limit(1);
        if (existing) return { success: false, message: "This payout has already been recorded." };
        await db.insert(gamePayouts).values({
          poolId: poolRow.id,
          roomCode: input.roomCode,
          roundId: room.prizePool.roundId,
          recipientType: input.recipientType,
          playerId: input.playerId || null,
          recipientPhone,
          rank: allocation.rank || null,
          grossAmountMinor: allocation.grossAmountMinor,
          providerFeesMinor,
          netAmountMinor: allocation.grossAmountMinor - providerFeesMinor,
          provider: "daraja_mpesa",
          providerTransactionId: input.providerTransactionId.trim(),
          idempotencyKey,
          status: "completed",
          completedAt: new Date(),
        });
        if (input.recipientType === "developer") {
          room.prizePool.providerFeesMinor = providerFeesMinor;
          room.prizePool = refreshPoolAmounts(room.prizePool);
        }
        gameRoomManager.recordManualPayout(input.roomCode, input.hostId, idempotencyKey);
        const recorded = await db.select({ idempotencyKey: gamePayouts.idempotencyKey }).from(gamePayouts).where(eq(gamePayouts.roundId, room.prizePool.roundId));
        const expectedKeys = allocations.map((candidate) => `manual-payout:${room.prizePool.roundId}:${candidate.recipientType}:${candidate.playerId || "developer"}`);
        const settled = expectedKeys.every((key) => recorded.some((row) => row.idempotencyKey === key));
        await db.update(gamePrizePools).set({
          providerFeesMinor: room.prizePool.providerFeesMinor,
          developerAllocationMinor: room.prizePool.developerAllocationMinor,
          winnerAllocationMinor: room.prizePool.winnerAllocationMinor,
          status: settled ? "paid" : "payout_pending",
          settledAt: settled ? new Date() : null,
        }).where(eq(gamePrizePools.roundId, room.prizePool.roundId));
        return { success: true, settled, idempotencyKey };
      } catch (error) {
        console.error("[Daraja] Failed to record payout", error);
        return { success: false, message: "Could not record the payout. No automatic transfer was attempted." };
      }
    }),

  // Set player ready status
  setPlayerReady: publicProcedure
    .input(z.object({ roomCode: z.string(), playerId: z.string(), isReady: z.boolean() }))
    .mutation(async ({ input }) => {
      gameRoomManager.setPlayerReady(input.roomCode, input.playerId, input.isReady);
      return { success: true };
    }),

  // Start the game
  startGame: publicProcedure
    .input(z.object({ 
      roomCode: z.string(), 
      category: z.string(), 
      playerId: z.string(), 
      categoryId: z.number().optional(),
      difficulty: z.enum(["easy", "medium", "hard"]).optional(),
      customTopic: z.string().optional(),
      questionCount: z.number().int().min(5).max(20).optional(),
      timerDurationSeconds: z.number().int().min(30).max(1800).optional(),
      streakBonusesEnabled: z.boolean().optional(),
      topics: z.array(z.string().min(2).max(120)).max(5).optional()
    }))
    .mutation(async ({ input }) => {
      const room = gameRoomManager.getRoom(input.roomCode);

      // Check if player is host
      if (room?.hostId !== input.playerId) {
        return {
          success: false,
          message: "Only the host can start the game",
        };
      }

      if (room.paymentProvider !== "free") {
        const participants = Object.values(room.prizePool.participants);
        if (participants.length < room.prizePool.minimumParticipantCount || !allParticipantsPaid(room.prizePool)) {
          return { success: false, message: "Every participating player must have a verified payment before the game can start." };
        }
      }

      const topicList = [input.customTopic || input.category, ...(input.topics || [])].map((topic) => topic.trim()).filter(Boolean);
      if (!topicList.length || topicList.some((topic) => topic.length < 2 || topic.length > 120) || /^(anything|everything|random|whatever)$/i.test(topicList[0])) {
        return { success: false, message: "Please provide a specific topic between 2 and 120 characters." };
      }

      // Set categoryId before starting game so loadAllQuestions can use it
      if (room && input.categoryId) {
        room.categoryId = input.categoryId;
      }


      // Start game and load questions (must await to ensure questions are loaded)
      const success = await gameRoomManager.startGame(input.roomCode, input.category, input.difficulty, input.customTopic, {
        questionCount: input.questionCount,
        timerDurationMs: input.timerDurationSeconds ? input.timerDurationSeconds * 1000 : undefined,
        streakBonusesEnabled: input.streakBonusesEnabled,
        topics: input.topics,
      });

      if (!success) {
        return {
          success: false,
          message: "Groq could not generate a complete question set. Check that the configured Groq model is enabled for this project and try again.",
        };
      }
      
      // Send notification when game starts
      const topic = input.customTopic || input.category;
      const playerCount = room?.players.size || 1;
      await notifyOwner({
        title: "🚀 Game Started!",
        content: `Quiz game started with ${playerCount} player(s) on topic: "${topic}" (Difficulty: ${input.difficulty || 'medium'})`,
      }).catch(() => {});
      await createOwnerNotification({ type: "game_start", title: "Game started", message: `Quiz started on ${topic} with ${playerCount} player(s).`, data: JSON.stringify({ roomCode: input.roomCode, topic }) }).catch(() => {});

      return {
        success: true,
        message: "Game started",
      };
    }),

  // Host and player controls
  pauseGame: publicProcedure.input(z.object({ roomCode: z.string(), playerId: z.string() })).mutation(({ input }) => {
    const room = gameRoomManager.getRoom(input.roomCode);
    if (room?.hostId !== input.playerId) return { success: false, message: "Only the host can pause the game" };
    return { success: gameRoomManager.pauseGame(input.roomCode) };
  }),
  resumeGame: publicProcedure.input(z.object({ roomCode: z.string(), playerId: z.string() })).mutation(({ input }) => {
    const room = gameRoomManager.getRoom(input.roomCode);
    if (room?.hostId !== input.playerId) return { success: false, message: "Only the host can resume the game" };
    return { success: gameRoomManager.resumeGame(input.roomCode) };
  }),
  restartGame: publicProcedure.input(z.object({ roomCode: z.string(), playerId: z.string() })).mutation(({ input }) => {
    const room = gameRoomManager.getRoom(input.roomCode);
    if (room?.hostId !== input.playerId) return { success: false, message: "Only the host can restart the game" };
    return { success: gameRoomManager.restartGame(input.roomCode) };
  }),
  rematch: publicProcedure.input(z.object({ roomCode: z.string(), playerId: z.string() })).mutation(({ input }) => {
    const room = gameRoomManager.getRoom(input.roomCode);
    if (room?.hostId !== input.playerId) return { success: false, message: "Only the host can start a rematch" };
    return { success: gameRoomManager.rematch(input.roomCode) };
  }),
  rejoinRoom: publicProcedure.input(z.object({ roomCode: z.string(), playerId: z.string(), playerName: z.string().min(1), spectator: z.boolean().optional() })).mutation(({ input }) => {
    const room = gameRoomManager.rejoinRoom(input.roomCode, input.playerId, input.playerName, input.spectator);
    return { success: Boolean(room), status: room?.status ?? "missing" };
  }),
  heartbeat: publicProcedure.input(z.object({ roomCode: z.string(), playerId: z.string() })).mutation(({ input }) => ({ success: gameRoomManager.touchPlayer(input.roomCode, input.playerId) })),
  setSpectator: publicProcedure.input(z.object({ roomCode: z.string(), playerId: z.string(), isSpectator: z.boolean() })).mutation(({ input }) => ({ success: gameRoomManager.setSpectator(input.roomCode, input.playerId, input.isSpectator) })),
  removePlayer: publicProcedure.input(z.object({ roomCode: z.string(), hostId: z.string(), playerId: z.string() })).mutation(({ input }) => {
    const room = gameRoomManager.getRoom(input.roomCode);
    if (room?.hostId !== input.hostId) return { success: false, message: "Only the host can remove players" };
    return { success: gameRoomManager.removePlayer(input.roomCode, input.playerId) };
  }),

  // Submit an answer
  submitAnswer: publicProcedure
    .input(
      z.object({
        roomCode: z.string(),
        playerId: z.string(),
        answer: z.string(),
        timeSpent: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      // Check if game time has expired
      const timeRemaining = gameRoomManager.getTimeRemaining(input.roomCode);
      if (timeRemaining <= 0) {
        return {
          correct: false,
          points: 0,
          correctAnswer: "",
          error: "Game time has expired",
        };
      }

      const roomBeforeAnswer = gameRoomManager.getRoom(input.roomCode);
      const questionBeforeAnswer = roomBeforeAnswer?.allQuestions[roomBeforeAnswer.players.get(input.playerId)?.playerQuestionIndex ?? -1];
      const result = gameRoomManager.submitAnswer(
        input.roomCode,
        input.playerId,
        input.answer,
        input.timeSpent
      );

      if (!result) {
        return {
          correct: false,
          points: 0,
          correctAnswer: "",
        };
      }

      return {
        correct: result.correct,
        points: result.points,
        bonusPoints: result.bonusPoints,
        bonusReason: result.bonusReason,
        correctAnswer: result.correctAnswer,
        currentStreak: result.currentStreak,
        maxStreak: result.maxStreak,
        streakMultiplier: result.streakMultiplier,
        newlyUnlockedAchievements: result.newlyUnlockedAchievements,
        explanation: questionBeforeAnswer?.explanation,
      };
    }),

  // Skip current question
  skipQuestion: publicProcedure
    .input(z.object({ roomCode: z.string(), playerId: z.string() }))
    .mutation(async ({ input }) => {
      const success = gameRoomManager.skipQuestion(input.roomCode, input.playerId);
      return { success };
    }),

  // Get skipped questions for a player
  getSkippedQuestions: publicProcedure
    .input(z.object({ roomCode: z.string(), playerId: z.string() }))
    .query(({ input }) => {
      const skipped = gameRoomManager.getSkippedQuestions(input.roomCode, input.playerId);
      return { skipped };
    }),

  // Check if player has completed all questions
  hasCompletedAllQuestions: publicProcedure
    .input(z.object({ roomCode: z.string(), playerId: z.string() }))
    .query(({ input }) => {
      const completed = gameRoomManager.hasCompletedAllQuestions(input.roomCode, input.playerId);
      return { completed };
    }),

  // Advance to next question
  advanceToNextQuestion: publicProcedure
    .input(z.object({ roomCode: z.string(), playerId: z.string() }))
    .mutation(async ({ input }) => {
      const room = gameRoomManager.getRoom(input.roomCode);

      // Check if player is host
      if (room?.hostId !== input.playerId) {
        return {
          success: false,
          message: "Only the host can advance questions",
        };
      }

      gameRoomManager.advanceToNextQuestion(input.roomCode);

      return {
        success: true,
        currentQuestionIndex: room?.currentQuestionIndex || 0,
      };
    }),

  // Check if all players have answered
  haveAllPlayersAnswered: publicProcedure
    .input(z.object({ roomCode: z.string() }))
    .query(({ input }) => {
      const allAnswered = gameRoomManager.haveAllPlayersAnswered(input.roomCode);
      return { allAnswered };
    }),

  // Get leaderboard
  getLeaderboard: publicProcedure
    .input(z.object({ roomCode: z.string() }))
    .query(({ input }) => {
      const leaderboard = gameRoomManager.getLeaderboard(input.roomCode);

      return {
        leaderboard: leaderboard.map((p: any, idx: number) => ({
          rank: idx + 1,
          name: p.name,
          score: p.score,
          correctAnswers: p.correctAnswers,
          totalAnswered: p.totalAnswered,
          accuracy:
            p.totalAnswered > 0
              ? Math.round((p.correctAnswers / p.totalAnswered) * 100)
              : 0,
          maxStreak: p.maxStreak || 0,
          bonusPoints: p.bonusPoints || 0,
          completionTime: p.completedAt,
          earnedAchievements: p.earnedAchievements || [],
        })),
      };
    }),

  // Finish the game
  finishGame: publicProcedure
    .input(z.object({ roomCode: z.string(), playerId: z.string().optional() }))
    .mutation(async ({ input }) => {
      const room = gameRoomManager.getRoom(input.roomCode);
      
      // End the game and set status to finished
      gameRoomManager.endGame(input.roomCode);
      
      const leaderboard = gameRoomManager.getLeaderboard(input.roomCode);

      // Mark all questions from this game as used to prevent repetition
      if (room) {
        const questionTexts = room.allQuestions.map((q) => q.question);
        markQuestionsAsUsed(room.category, questionTexts);
        console.log(
          `[GameRouter] Marked ${questionTexts.length} questions as used for category: ${room.category}`
        );
        
        // Send notification when game finishes
        const winner = leaderboard[0];
        const topic = room.customTopic || room.category;
        await notifyOwner({
          title: "🏆 Game Finished!",
          content: `Quiz game on "${topic}" completed with ${leaderboard.length} player(s). Winner: ${winner?.name || 'N/A'} with ${winner?.score || 0} points!`,
        }).catch(() => {});
        await createOwnerNotification({ type: "game_end", title: "Game finished", message: `Quiz on ${topic} finished. Winner: ${winner?.name || "N/A"}.`, data: JSON.stringify({ roomCode: input.roomCode, topic, winner: winner?.name }) }).catch(() => {});
      }

      return {
        status: "finished",
        leaderboard: leaderboard.map((p: any, idx: number) => ({
          rank: idx + 1,
          name: p.name,
          score: p.score,
          correctAnswers: p.correctAnswers,
          totalAnswered: p.totalAnswered,
          accuracy:
            p.totalAnswered > 0
              ? Math.round((p.correctAnswers / p.totalAnswered) * 100)
              : 0,
          maxStreak: p.maxStreak || 0,
          bonusPoints: p.bonusPoints || 0,
          completionTime: p.completedAt,
          earnedAchievements: p.earnedAchievements || [],
        })),
      };
    }),

  reportQuestion: publicProcedure
    .input(z.object({
      roomCode: z.string(),
      playerId: z.string(),
      playerName: z.string().min(1),
      questionId: z.number().int(),
      questionText: z.string().min(1),
      reason: z.enum(["incorrect", "unclear", "inappropriate", "other"]),
      details: z.string().max(500).optional(),
    }))
    .mutation(async ({ input }) => {
      const room = gameRoomManager.getRoom(input.roomCode);
      if (!room || !room.players.has(input.playerId)) return { success: false, message: "Player is not in this room" };
      const { getDb } = await import("../db");
      const { questionReports } = await import("../../drizzle/schema");
      const db = await getDb();
      if (!db) return { success: false, message: "Database not available" };
      await db.insert(questionReports).values(input);
      return { success: true };
    }),

  // Leave the game room
  leaveRoom: publicProcedure
    .input(z.object({ roomCode: z.string(), playerId: z.string() }))
    .mutation(async ({ input }) => {
      gameRoomManager.leaveRoom(input.roomCode, input.playerId);
      return { success: true };
    }),

  // Send a chat message in the game room
  sendMessage: publicProcedure
    .input(z.object({ roomCode: z.string(), playerId: z.string(), playerName: z.string(), message: z.string() }))
    .mutation(async ({ input }) => {
      const { getDb } = await import("../db");
      const { gameRoomMessages } = await import("../../drizzle/schema");
      const db = await getDb();
      
      if (!db) {
        return { success: false, error: "Database not available" };
      }
      
      try {
        await db.insert(gameRoomMessages).values({
          roomCode: input.roomCode,
          playerId: input.playerId,
          playerName: input.playerName,
          message: input.message,
        });
        
        return { success: true };
      } catch (error) {
        console.error("Failed to send message:", error);
        return { success: false, error: "Failed to send message" };
      }
    }),

  // Get chat messages for a game room


  // Add reaction to a message
  addReaction: publicProcedure
    .input(z.object({ messageId: z.number(), playerId: z.string(), playerName: z.string(), emoji: z.string() }))
    .mutation(async ({ input }) => {
      const { getDb } = await import("../db");
      const { messageReactions } = await import("../../drizzle/schema");
      const db = await getDb();
      
      if (!db) {
        return { success: false, error: "Database not available" };
      }
      
      try {
        await db.insert(messageReactions).values({
          messageId: input.messageId,
          playerId: input.playerId,
          playerName: input.playerName,
          emoji: input.emoji,
        });
        
        return { success: true };
      } catch (error) {
        console.error("Failed to add reaction:", error);
        return { success: false, error: "Failed to add reaction" };
      }
    }),

  // Get reactions for a message
  getReactions: publicProcedure
    .input(z.object({ messageId: z.number() }))
    .query(async ({ input }) => {
      const { getDb } = await import("../db");
      const { messageReactions } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      
      if (!db) {
        return { success: false, reactions: [] };
      }
      
      try {
        const reactions = await db
          .select()
          .from(messageReactions)
          .where(eq(messageReactions.messageId, input.messageId));
        
        return { success: true, reactions };
      } catch (error) {
        console.error("Failed to fetch reactions:", error);
        return { success: false, reactions: [] };
      }
    }),

  // Update typing status
  setTypingStatus: publicProcedure
    .input(z.object({ roomCode: z.string(), playerId: z.string(), playerName: z.string(), isTyping: z.boolean() }))
    .mutation(async ({ input }) => {
      const { getDb } = await import("../db");
      const { typingStatus } = await import("../../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      const db = await getDb();
      
      if (!db) {
        return { success: false, error: "Database not available" };
      }
      
      try {
        // Check if record exists
        const existing = await db
          .select()
          .from(typingStatus)
          .where(and(eq(typingStatus.roomCode, input.roomCode), eq(typingStatus.playerId, input.playerId)))
          .limit(1);
        
        if (existing.length > 0) {
          // Update existing record
          await db
            .update(typingStatus)
            .set({ isTyping: input.isTyping ? 1 : 0 })
            .where(and(eq(typingStatus.roomCode, input.roomCode), eq(typingStatus.playerId, input.playerId)));
        } else {
          // Insert new record
          await db.insert(typingStatus).values({
            roomCode: input.roomCode,
            playerId: input.playerId,
            playerName: input.playerName,
            isTyping: input.isTyping ? 1 : 0,
          });
        }
        
        return { success: true };
      } catch (error) {
        console.error("Failed to update typing status:", error);
        return { success: false, error: "Failed to update typing status" };
      }
    }),

  // Get typing status for a room
  getTypingStatus: publicProcedure
    .input(z.object({ roomCode: z.string() }))
    .query(async ({ input }) => {
      const { getDb } = await import("../db");
      const { typingStatus } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      
      if (!db) {
        return { success: false, typingPlayers: [] };
      }
      
      try {
        const typing = await db
          .select()
          .from(typingStatus)
          .where(eq(typingStatus.roomCode, input.roomCode));
        
        const typingPlayers = typing
          .filter(t => t.isTyping === 1)
          .map(t => ({ playerId: t.playerId, playerName: t.playerName }));
        
        return { success: true, typingPlayers };
      } catch (error) {
        console.error("Failed to fetch typing status:", error);
        return { success: false, typingPlayers: [] };
      }
    }),


  getMessages: publicProcedure
    .input(z.object({ roomCode: z.string(), limit: z.number().default(50) }))
    .query(async ({ input }) => {
      const { getDb } = await import("../db");
      const { gameRoomMessages } = await import("../../drizzle/schema");
      const { eq, desc } = await import("drizzle-orm");
      const db = await getDb();
      
      if (!db) {
        return { success: false, messages: [], error: "Database not available" };
      }
      
      try {
        const messages = await db
          .select()
          .from(gameRoomMessages)
          .where(eq(gameRoomMessages.roomCode, input.roomCode))
          .orderBy(desc(gameRoomMessages.createdAt))
          .limit(input.limit);
        
        return {
          success: true,
          messages: messages.reverse(), // Reverse to show oldest first
        };
      } catch (error) {
        console.error("Failed to fetch messages:", error);
        return { success: false, messages: [], error: "Failed to fetch messages" };
      }
    }),



  // Generate PDF report of all games
  generateGamesPDF: publicProcedure
    .query(async () => {
      const { getDb } = await import("../db");
      const { gameSessions, playerAnswers, questions } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      
      if (!db) {
        return { success: false, error: "Database not available", pdfUrl: null };
      }
      
      try {
        // Fetch all completed sessions
        const sessions = await db
          .select()
          .from(gameSessions)
          .where(eq(gameSessions.status, "completed"));
        
        if (sessions.length === 0) {
          return { success: false, error: "No completed games found", pdfUrl: null };
        }
        
        // Fetch all player answers
        const allAnswers = await db.select().from(playerAnswers);
        
        // Fetch all questions
        const allQuestions = await db.select().from(questions);
        
        // Generate PDF content
        let pdfContent = "# ViperQuiz Game History Report\n\n";
        pdfContent += `Generated on: ${new Date().toLocaleString()}\n\n`;
        pdfContent += `Total Games Played: ${sessions.length}\n\n`;
        
        for (const session of sessions) {
          pdfContent += `## Game ${session.id}: ${session.category}\n`;
          pdfContent += `Date: ${new Date(session.createdAt).toLocaleString()}\n`;
          pdfContent += `Status: ${session.status}\n`;
          pdfContent += `Players: ${session.playerCount}\n\n`;
          
          // Get answers for this session
          const sessionAnswers = allAnswers.filter(a => a.sessionId === session.id);
          const sessionQuestions = allQuestions;
          
          // Group answers by player
          const playerAnswersMap: Record<string, any[]> = {};
          sessionAnswers.forEach(answer => {
            if (!playerAnswersMap[answer.playerName]) {
              playerAnswersMap[answer.playerName] = [];
            }
            playerAnswersMap[answer.playerName].push(answer);
          });
          
          // Display questions and answers
          pdfContent += "### Questions and Answers\n\n";
          for (const question of sessionQuestions.slice(0, 10)) {
            pdfContent += `**Q${question.id}: ${question.question}**\n`;
            pdfContent += `A) ${question.optionA}\n`;
            pdfContent += `B) ${question.optionB}\n`;
            pdfContent += `C) ${question.optionC}\n`;
            pdfContent += `D) ${question.optionD}\n`;
            pdfContent += `**Correct Answer: ${question.correctAnswer}**\n\n`;
            
            // Show player answers for this question
            for (const [playerName, answers] of Object.entries(playerAnswersMap)) {
              const playerAnswer = answers.find(a => a.questionId === question.id);
              if (playerAnswer) {
                const status = playerAnswer.isCorrect ? "✓" : "✗";
                pdfContent += `${playerName}: ${playerAnswer.selectedAnswer} ${status}\n`;
              }
            }
            pdfContent += "\n";
          }
          
          // Player scores
          pdfContent += "### Player Scores\n\n";
          for (const [playerName, answers] of Object.entries(playerAnswersMap)) {
            const correctCount = answers.filter(a => a.isCorrect === 1).length;
            pdfContent += `${playerName}: ${correctCount}/${answers.length} correct\n`;
          }
          
          pdfContent += "\n---\n\n";
        }
        
        // Return markdown content that can be converted to PDF
        return { success: true, pdfContent, pdfUrl: null };
      } catch (error) {
        console.error("Failed to generate PDF:", error);
        return { success: false, error: "Failed to generate PDF", pdfUrl: null };
      }
    }),

});
