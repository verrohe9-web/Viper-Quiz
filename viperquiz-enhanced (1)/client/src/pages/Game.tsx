import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Clock, Users, Pause, Play, RotateCcw, Flag, Eye, Accessibility, Volume2, WalletCards, ReceiptText, Share2, Trophy } from "lucide-react";
import { BadgeDisplay } from "@/components/BadgeDisplay";
import { GameChat } from "@/components/GameChat";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { ReconnectionDialog } from "@/components/ReconnectionDialog";
import { useOfflineCache } from "@/hooks/useOfflineCache";
import { usePlayerSession } from "@/hooks/usePlayerSession";
import { motion, AnimatePresence } from "framer-motion";
import { useSyncManager } from "@/hooks/useSyncManager";

const TOTAL_QUESTIONS = 10;

async function buildScorecardBlob({ roomCode, playerName, playerResult, leaderboard }: { roomCode: string; playerName: string; playerResult: any; leaderboard: any[] }) {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 630;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Share cards are not supported on this device.");

  const background = context.createLinearGradient(0, 0, 1200, 630);
  background.addColorStop(0, "#040817");
  background.addColorStop(0.55, "#0b1a3d");
  background.addColorStop(1, "#11104b");
  context.fillStyle = background;
  context.fillRect(0, 0, 1200, 630);
  const glow = context.createRadialGradient(930, 90, 10, 930, 90, 430);
  glow.addColorStop(0, "rgba(34,211,238,.34)");
  glow.addColorStop(1, "rgba(34,211,238,0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, 1200, 630);

  context.fillStyle = "#8be9ff";
  context.font = "700 24px Arial";
  context.fillText("VIPERQUIZ", 70, 78);
  context.fillStyle = "rgba(219,234,254,.68)";
  context.font = "500 16px Arial";
  context.fillText("QUIZ NETWORK  ·  FINAL RESULTS", 72, 108);

  context.fillStyle = "#ffffff";
  context.font = "700 54px Arial";
  context.fillText("Game complete", 70, 200);
  context.fillStyle = "#a5b4fc";
  context.font = "500 25px Arial";
  context.fillText(`${playerName} · Room ${roomCode}`, 74, 244);
  context.fillStyle = "#67e8f9";
  context.font = "700 70px Arial";
  context.fillText(playerResult ? `#${playerResult.rank}` : "—", 76, 370);
  context.fillStyle = "#ffffff";
  context.font = "700 32px Arial";
  context.fillText(playerResult ? `${playerResult.score} points` : "Scoreboard ready", 220, 354);
  context.fillStyle = "rgba(219,234,254,.72)";
  context.font = "500 20px Arial";
  context.fillText("Can you beat my score?", 220, 390);

  context.fillStyle = "rgba(255,255,255,.08)";
  context.roundRect(700, 155, 420, 340, 26);
  context.fill();
  context.fillStyle = "#8be9ff";
  context.font = "700 20px Arial";
  context.fillText("TOP FINISHERS", 740, 205);
  leaderboard.slice(0, 3).forEach((player, index) => {
    const y = 270 + index * 72;
    context.fillStyle = index === 0 ? "#fcd34d" : "#dbeafe";
    context.font = "700 24px Arial";
    context.fillText(`#${player.rank}`, 740, y);
    context.fillStyle = "#ffffff";
    context.font = "600 22px Arial";
    context.fillText(String(player.name).slice(0, 22), 820, y);
    context.fillStyle = "#a5b4fc";
    context.font = "500 18px Arial";
    context.fillText(`${player.score} pts`, 820, y + 27);
  });

  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not create the share card."))), "image/png", 0.95));
}

export default function Game() {
  const [match, params] = useRoute("/game/:roomCode");
  const [, setLocation] = useLocation();
  const roomCode = params?.roomCode as string;
  const playerName = localStorage.getItem("playerName") || "Guest player";

  const [gameState, setGameState] = useState<"loading" | "playing" | "finished">("loading");
  const [currentQuestion, setCurrentQuestion] = useState<any>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [correctAnswer, setCorrectAnswer] = useState<string | null>(null);
  const [answerExplanation, setAnswerExplanation] = useState<string | null>(null);
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState<boolean>(false);
  const [timeLeftMs, setTimeLeftMs] = useState<number>(5 * 60 * 1000); // 5 minutes
  const [players, setPlayers] = useState<any[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [fontScale, setFontScale] = useState<"normal" | "large" | "xlarge">("normal");
  const [highContrast, setHighContrast] = useState(false);
  const [showA11y, setShowA11y] = useState(false);
  const [reportReason, setReportReason] = useState<"incorrect" | "unclear" | "inappropriate" | "other">("unclear");
  const [reportDetails, setReportDetails] = useState("");
  const [isReporting, setIsReporting] = useState(false);
  const [sharePreviewOpen, setSharePreviewOpen] = useState(false);
  const [sharePreviewUrl, setSharePreviewUrl] = useState<string | null>(null);
  const [shareCardFile, setShareCardFile] = useState<File | null>(null);
  const [shareText, setShareText] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [isPreparingShare, setIsPreparingShare] = useState(false);
  const answerStartTimeRef = useRef<number>(Date.now());

  const playerId = localStorage.getItem("playerId") || "";
  const { data: roomData, refetch: refetchRoom } = trpc.game.getRoom.useQuery(
    { roomCode, playerId },
    { refetchInterval: 500 }
  );

  const { data: timeData } = trpc.game.getTimeRemaining.useQuery(
    { roomCode },
    { refetchInterval: 500 }
  );

  const submitAnswerMutation = trpc.game.submitAnswer.useMutation();
  const skipQuestionMutation = trpc.game.skipQuestion.useMutation();
  const rejoinMutation = trpc.game.rejoinRoom.useMutation();
  const finishGameMutation = trpc.game.finishGame.useMutation();
  const heartbeatMutation = trpc.game.heartbeat.useMutation();
  const pauseMutation = trpc.game.pauseGame.useMutation();
  const resumeMutation = trpc.game.resumeGame.useMutation();
  const restartMutation = trpc.game.restartGame.useMutation();
  const rematchMutation = trpc.game.rematch.useMutation();
  const removePlayerMutation = trpc.game.removePlayer.useMutation();
  const reportMutation = trpc.game.reportQuestion.useMutation();
  const recordManualPayoutMutation = trpc.game.recordManualPayout.useMutation();
  const { data: payoutPreview, refetch: refetchPayoutPreview } = trpc.game.getManualPayoutPreview.useQuery(
    { roomCode, playerId },
    { enabled: gameState === "finished" && roomData?.hostId === playerId && roomData?.paymentMode === "daraja_mpesa", refetchInterval: 2000 }
  );
  const { data: payoutRecords, refetch: refetchPayoutRecords } = trpc.game.getManualPayouts.useQuery(
    { roomCode, playerId },
    { enabled: gameState === "finished" && roomData?.hostId === playerId && roomData?.paymentMode === "daraja_mpesa", refetchInterval: 2000 }
  );
  const { data: reconciliation } = trpc.game.getManualReconciliation.useQuery(
    { roomCode, playerId },
    { enabled: gameState === "finished" && roomData?.hostId === playerId && roomData?.paymentMode === "daraja_mpesa", refetchInterval: 2000 }
  );
  const [payoutInputs, setPayoutInputs] = useState<Record<string, { phone: string; receipt: string; fees: string }>>({});
  const { data: completionData } = trpc.game.hasCompletedAllQuestions.useQuery(
    { roomCode, playerId },
    { refetchInterval: 500 }
  );
  const { data: skippedData } = trpc.game.getSkippedQuestions.useQuery(
    { roomCode, playerId },
    { refetchInterval: 500 }
  );

  const isSpectator = Boolean(roomData?.players?.find((player) => player.id === playerId)?.isSpectator);
  const hostIsCurrentPlayer = roomData?.hostId === playerId;
  const scaleClass = fontScale === "xlarge" ? "text-[115%]" : fontScale === "large" ? "text-[108%]" : "";

  const updatePayoutInput = (id: string, field: "phone" | "receipt" | "fees", value: string) => {
    setPayoutInputs((current) => {
      const existing = current[id] || { phone: "", receipt: "", fees: "0" };
      return { ...current, [id]: { ...existing, [field]: value } };
    });
  };

  const prepareShareCard = async () => {
    if (!leaderboard.length) {
      toast.error("The scoreboard is not ready to share yet.");
      return;
    }

    setIsPreparingShare(true);
    try {
      const playerResult = leaderboard.find((player) => player.id === playerId || player.playerId === playerId);
      const headline = playerResult
        ? `${playerName} finished #${playerResult.rank} with ${playerResult.score} points in ViperQuiz room ${roomCode}.`
        : `ViperQuiz room ${roomCode} has finished.`;
      const nextShareText = `${headline} Can you beat my score?`;
      const nextShareUrl = `${window.location.origin}/room/${roomCode}`;
      const cardBlob = await buildScorecardBlob({ roomCode, playerName, playerResult, leaderboard });
      const file = new File([cardBlob], `viperquiz-${roomCode}-results.png`, { type: "image/png" });
      if (sharePreviewUrl) URL.revokeObjectURL(sharePreviewUrl);
      setShareCardFile(file);
      setSharePreviewUrl(URL.createObjectURL(cardBlob));
      setShareText(nextShareText);
      setShareUrl(nextShareUrl);
      setSharePreviewOpen(true);
    } catch (error: any) {
      toast.error(error?.message || "Unable to create the share card.");
    } finally {
      setIsPreparingShare(false);
    }
  };

  const sharePreparedCard = async () => {
    if (!shareCardFile) return;
    try {
      if (navigator.share && navigator.canShare?.({ files: [shareCardFile] })) {
        await navigator.share({ title: "ViperQuiz results", text: shareText, url: shareUrl, files: [shareCardFile] });
        toast.success("Branded results card shared.");
        setSharePreviewOpen(false);
        return;
      }
      downloadPreparedCard();
    } catch (error: any) {
      if (error?.name !== "AbortError") toast.error(error?.message || "Unable to share results.");
    }
  };

  const downloadPreparedCard = async () => {
    if (!shareCardFile) return;
    const cardUrl = URL.createObjectURL(shareCardFile);
    const anchor = document.createElement("a");
    anchor.href = cardUrl;
    anchor.download = shareCardFile.name;
    anchor.click();
    URL.revokeObjectURL(cardUrl);
    try {
      await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
      toast.success("Share card downloaded and result text copied.");
    } catch {
      toast.success("Share card downloaded.");
    }
    setSharePreviewOpen(false);
  };

  const downloadReconciliation = () => {
    if (!reconciliation?.csv) {
      toast.error("Reconciliation data is not available yet.");
      return;
    }
    const blob = new Blob([reconciliation.csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `viperquiz-${roomCode}-manual-reconciliation.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("Reconciliation CSV downloaded.");
  };

  const handleRecordManualPayout = async (allocation: NonNullable<typeof payoutPreview>["payouts"][number]) => {
    const input = payoutInputs[allocation.id] || { phone: allocation.suggestedPhone || "", receipt: "", fees: "0" };
    if (!input.receipt.trim()) {
      toast.error("Enter the manual receipt or transaction reference before recording a payout.");
      return;
    }
    try {
      const result = await recordManualPayoutMutation.mutateAsync({
        roomCode,
        hostId: playerId,
        recipientType: allocation.recipientType,
        playerId: allocation.playerId,
        recipientPhone: allocation.recipientType === "developer" ? undefined : input.phone.trim(),
        grossAmountMinor: allocation.expectedGrossAmountMinor,
        providerFeesMinor: allocation.recipientType === "developer" ? Math.max(0, Number(input.fees) || 0) : 0,
        providerTransactionId: input.receipt.trim(),
      });
      if (!result.success) throw new Error(result.message || "Could not record payout");
      toast.success(result.settled ? "Payout recorded; this round is fully reconciled." : "Payout record saved.");
      await Promise.all([refetchPayoutPreview(), refetchPayoutRecords()]);
    } catch (error: any) {
      toast.error(error?.message || "Could not record payout");
    }
  };

  useEffect(() => {
    rejoinMutation.mutate({ roomCode, playerId, playerName });
    const interval = window.setInterval(() => heartbeatMutation.mutate({ roomCode, playerId }), 4000);
    return () => window.clearInterval(interval);
  }, [roomCode, playerId, playerName]);

  // Update time from server
  useEffect(() => {
    if (timeData) {
      setTimeLeftMs(timeData.timeRemaining);

      // Show scoreboard when time expires or game is over
      if ((timeData.timeRemaining <= 0 || timeData.isGameOver) && gameState === "playing") {
        handleGameTimeUp();
      }
    }
  }, [timeData, gameState]);

  const runHostAction = async (action: "pause" | "resume" | "restart") => {
    try {
      const input = { roomCode, playerId };
      if (action === "pause") await pauseMutation.mutateAsync(input);
      if (action === "resume") await resumeMutation.mutateAsync(input);
      if (action === "restart") await restartMutation.mutateAsync(input);
      toast.success(action === "pause" ? "Game paused" : action === "resume" ? "Game resumed" : "Round reset to the lobby");
      await refetchRoom();
      if (action === "restart") setLocation(`/room/${roomCode}`);
    } catch (error: any) {
      toast.error(error?.message || `Unable to ${action} the game`);
    }
  };

  const handleReportQuestion = async () => {
    if (!currentQuestion || isReporting) return;
    setIsReporting(true);
    try {
      const result = await reportMutation.mutateAsync({
        roomCode,
        playerId,
        playerName: players.find((player) => player.id === playerId)?.name || "Guest player",
        questionId: currentQuestion.id || 0,
        questionText: currentQuestion.question,
        reason: reportReason,
        details: reportDetails.trim() || undefined,
      });
      if (!result.success) throw new Error(result.message || "Report could not be saved");
      toast.success("Thanks — the question was sent for review.");
    } catch (error: any) {
      toast.error(error?.message || "Unable to report this question");
    } finally {
      setIsReporting(false);
    }
  };

  const handleRemovePlayer = async (targetPlayerId: string, targetName: string) => {
    try {
      const result = await removePlayerMutation.mutateAsync({ roomCode, hostId: playerId, playerId: targetPlayerId });
      if (!result.success) throw new Error(result.message || "Unable to remove player");
      toast.success(`${targetName} was removed from the room.`);
      await refetchRoom();
    } catch (error: any) {
      toast.error(error?.message || "Unable to remove player");
    }
  };

  const handleGameTimeUp = async () => {
    try {
      const result = await finishGameMutation.mutateAsync({
        roomCode,
      });
      setLeaderboard(result.leaderboard || []);
      // Only set gameState to finished AFTER leaderboard is loaded to prevent race condition
      setGameState("finished");
    } catch (error: any) {
      toast.error(error?.message || "Failed to finish game");
      setGameState("finished"); // Still show finished screen even if there's an error
    }
  };

  // Load initial question and update game state
  useEffect(() => {
    if (!match) {
      setLocation("/");
      return;
    }

    if (roomData) {
      if (roomData.status === "playing") {
        setGameState("playing");
        if (roomData.currentQuestion) {
          setCurrentQuestion(roomData.currentQuestion);
          answerStartTimeRef.current = Date.now();
        }
      } else if (roomData.status === "finished" && gameState !== "finished") {
        // Game has finished, fetch the final leaderboard
        finishGameMutation.mutateAsync({ roomCode }).then((result) => {
          setLeaderboard(result.leaderboard || []);
          setGameState("finished");
        }).catch((error) => {
          toast.error(error?.message || "Failed to load leaderboard");
          setGameState("finished");
        });
      }

      if (roomData.players) setPlayers(roomData.players);
    }
  }, [roomData, match, setLocation]);

  const handleAnswerSelect = async (answer: string) => {
    if (selectedAnswer || gameState !== "playing") return;

    setSelectedAnswer(answer);
    setIsAnswerSubmitted(true);
    const timeSpent = Date.now() - answerStartTimeRef.current;

    try {
      const playerId = localStorage.getItem("playerId") || "";
      const result = await submitAnswerMutation.mutateAsync({
        roomCode,
        answer,
        timeSpent,
        playerId,
      });

      // Show the correct answer
      if (result.correctAnswer) setCorrectAnswer(result.correctAnswer);
      if (result.explanation) setAnswerExplanation(result.explanation);

      if (result.correct) {
        // Show streak and bonus feedback immediately after a correct answer.
        let streakMessage = `Correct! +${result.points} points`;
        if (result.currentStreak && result.currentStreak >= 3) {
          const streakEmojis = ['🔥', '⚡', '✨', '🌟'];
          const emoji = streakEmojis[Math.min(result.currentStreak - 3, streakEmojis.length - 1)];
          streakMessage += ` ${emoji} ${result.currentStreak}-Streak!`;
        }
        if (result.streakMultiplier && result.streakMultiplier > 1) {
          streakMessage += ` ${result.streakMultiplier}× streak multiplier`;
        }
        if (result.bonusPoints && result.bonusPoints > 0) {
          streakMessage += ` +${result.bonusPoints} bonus`;
        }
        toast.success(streakMessage);
      } else {
        toast.error(`Incorrect! The correct answer is ${result.correctAnswer}.`);
      }

      if (result.newlyUnlockedAchievements && result.newlyUnlockedAchievements.length > 0) {
        result.newlyUnlockedAchievements.forEach((achievementId: string) => {
          toast.success(`🏅 Achievement unlocked: ${achievementId.replaceAll('_', ' ')}`);
        });
      }

      // Wait a bit before loading next question
      setTimeout(() => {
        setSelectedAnswer(null);
        setCorrectAnswer(null);
        setAnswerExplanation(null);
        setIsAnswerSubmitted(false);
        refetchRoom();
        answerStartTimeRef.current = Date.now();
      }, 2000);
    } catch (error: any) {
      toast.error(error?.message || "Failed to submit answer");
      setSelectedAnswer(null);
      setCorrectAnswer(null);
      setAnswerExplanation(null);
      setIsAnswerSubmitted(false);
    }
  };

  const handleSkipQuestion = async () => {
    if (selectedAnswer || gameState !== "playing") return;

    try {
      const playerId = localStorage.getItem("playerId") || "";
      await skipQuestionMutation.mutateAsync({
        roomCode,
        playerId,
      });

      toast.info("Question skipped! You'll answer it at the end.");

      // Load next question
      setTimeout(() => {
        refetchRoom();
        answerStartTimeRef.current = Date.now();
      }, 500);
    } catch (error: any) {
      toast.error(error?.message || "Failed to skip question");
    }
  };

  const formatKsh = (minor: number | undefined) => `KSh ${((minor || 0) / 100).toFixed(2)}`;

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  if (gameState === "loading") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
        <Card className="p-8">
          <p className="text-xl font-semibold">Loading game...</p>
        </Card>
      </div>
    );
  }

  if (gameState === "finished") {
    return (
      <div className={`min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 p-4 ${scaleClass} ${highContrast ? "contrast-125" : ""}`}>
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold text-white mb-8 text-center">Game Over!</h1>
          <Card className="p-8 mb-8">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-2xl font-bold">Final Leaderboard</h2>
              <Button type="button" onClick={prepareShareCard} disabled={isPreparingShare} variant="outline" className="border-blue-200 text-blue-700 hover:bg-blue-50">
                <Share2 className="mr-2 h-4 w-4" /> {isPreparingShare ? "Preparing card…" : "Share results"}
              </Button>
            </div>
            {leaderboard.length > 0 && <div className="mb-6 rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-cyan-50 p-5" role="region" aria-label="Top three finishers">
              <div className="mb-4 flex items-center gap-2 text-indigo-950"><Trophy className="h-5 w-5 text-amber-500" /><h3 className="font-bold">Top finishers</h3></div>
              <div className="grid gap-3 sm:grid-cols-3" role="list">{leaderboard.slice(0, 3).map((player) => <div key={`${player.id || player.playerId || player.name}-${player.rank}`} role="listitem" className={`rounded-xl border p-4 text-center ${player.rank === 1 ? "border-amber-200 bg-amber-50 shadow-md" : "border-indigo-100 bg-white/80"}`}><p className="text-xs font-bold uppercase tracking-[.16em] text-indigo-500">#{player.rank}</p><p className="mt-2 truncate font-bold text-gray-900">{player.name}</p><p className="mt-1 text-lg font-black text-indigo-700">{player.score} pts</p><p className="text-xs text-gray-500">{player.correctAnswers}/{player.totalAnswered} correct</p></div>)}</div>
            </div>}
            <div className="space-y-4">
              {leaderboard.map((player) => (
                <div key={player.rank} className="flex items-center justify-between p-4 bg-gray-100 rounded-lg">
                  <div className="flex items-center gap-4">
                    <Badge variant="outline" className="text-lg font-bold">
                      #{player.rank}
                    </Badge>
                    <div>
                      <p className="font-semibold">{player.name}</p>
                      <p className="text-sm text-gray-600">
                        {player.correctAnswers}/{player.totalAnswered} correct ({player.accuracy}%)
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <p className="text-2xl font-bold text-blue-600">{player.score} pts</p>
                    {player.bonusPoints && player.bonusPoints > 0 && (
                      <p className="text-xs font-semibold text-emerald-600">+{player.bonusPoints} streak bonus</p>
                    )}
                    {player.maxStreak && player.maxStreak > 0 && (
                      <p className="text-sm font-semibold text-orange-500">🔥 {player.maxStreak}-Streak</p>
                    )}
                    {player.earnedAchievements && player.earnedAchievements.length > 0 && (
                      <BadgeDisplay achievementIds={player.earnedAchievements} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
          {roomData?.paymentMode === "daraja_mpesa" && hostIsCurrentPlayer && <Card className="p-8 mb-8 border-amber-200 bg-amber-50"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><WalletCards className="mt-1 h-6 w-6 text-amber-700" /><div><h2 className="text-2xl font-bold text-amber-950">Safaricom payout desk</h2><p className="mt-1 text-sm text-amber-900">Record Safaricom-confirmed payouts after settlement. This app records an audit trail; it does not initiate transfers.</p></div></div><Button size="sm" variant="outline" onClick={downloadReconciliation} disabled={!reconciliation?.csv}><ReceiptText className="mr-2 h-4 w-4" />Download reconciliation CSV</Button></div>{payoutPreview?.payouts?.length ? <div className="mt-6 space-y-4">{payoutPreview.payouts.map((allocation) => { const recorded = payoutRecords?.payouts?.some((payout) => payout.idempotencyKey === `manual-payout:${roomData.prizePool?.roundId}:${allocation.recipientType}:${allocation.playerId || "developer"}`); const input = payoutInputs[allocation.id] || { phone: allocation.suggestedPhone || "", receipt: "", fees: "0" }; return <div key={allocation.id} className="rounded-xl border border-amber-200 bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold text-gray-900">{allocation.recipientType === "developer" ? "Developer allocation" : `${allocation.playerName} · ${allocation.recipientType} place`}</p><p className="text-sm text-gray-600">Gross {formatKsh(allocation.expectedGrossAmountMinor)}{allocation.recipientType === "developer" ? ` · Net after fees ${formatKsh(allocation.expectedNetAmountMinor)}` : ""}</p>{allocation.recipientType !== "developer" && <p className="mt-1 text-sm font-semibold text-emerald-700">Submitted M-Pesa payout number: {allocation.suggestedPhone || "Not submitted"}</p>}</div><Badge className={recorded ? "bg-green-600" : "bg-amber-500"}>{recorded ? "Recorded" : "Pending"}</Badge></div>{!recorded && <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">{allocation.recipientType !== "developer" ? <input aria-label={`${allocation.playerName || "Winner"} payout phone`} value={input.phone} onChange={(e) => updatePayoutInput(allocation.id, "phone", e.target.value)} placeholder="+2547XXXXXXXX" className="rounded border px-3 py-2 text-sm" /> : <div className="rounded border bg-gray-50 px-3 py-2 text-sm text-gray-700">Developer: {roomData.prizePool?.developerPhone || "+254787896447"}</div>}<input aria-label="Safaricom payout receipt" value={input.receipt} onChange={(e) => updatePayoutInput(allocation.id, "receipt", e.target.value)} placeholder="Provider receipt/reference" className="rounded border px-3 py-2 text-sm" />{allocation.recipientType === "developer" ? <input aria-label="Provider fee in minor units" inputMode="numeric" value={input.fees} onChange={(e) => updatePayoutInput(allocation.id, "fees", e.target.value)} placeholder="Fees (minor)" className="rounded border px-3 py-2 text-sm" /> : <Button onClick={() => handleRecordManualPayout(allocation)} disabled={recordManualPayoutMutation.isPending} className="bg-amber-700 hover:bg-amber-800 text-white"><ReceiptText className="mr-2 h-4 w-4" />Record</Button>}{allocation.recipientType === "developer" && <Button onClick={() => handleRecordManualPayout(allocation)} disabled={recordManualPayoutMutation.isPending} className="bg-amber-700 hover:bg-amber-800 text-white"><ReceiptText className="mr-2 h-4 w-4" />Record</Button>}</div>}</div>; })}</div> : <p className="mt-5 rounded-lg border border-amber-200 bg-white p-4 text-sm text-amber-900">Payout allocations appear after at least three verified participants finish the round.</p>}<p className="mt-5 text-xs text-amber-800">Provider fees must be entered in minor units (100 minor units = KSh 1) and are capped at the developer's 10% allocation. Winner allocations are fixed by the server at 45% / 27% / 18% of gross pool.</p></Card>}
          {roomData?.paymentMode === "daraja_mpesa" && !hostIsCurrentPlayer && <Card className="p-6 mb-8 border-blue-200 bg-blue-50"><p className="font-semibold text-blue-950">Safaricom Daraja round</p><p className="mt-1 text-sm text-blue-900">The host will record Safaricom payout receipts after the final ranking. No automatic transfer is initiated by ViperQuiz.</p></Card>}
          <div className="grid sm:grid-cols-2 gap-3">
            {hostIsCurrentPlayer && <Button onClick={async () => { const result = await rematchMutation.mutateAsync({ roomCode, playerId }); if (result.success) setLocation(`/room/${roomCode}`); else toast.error(result.message || "Rematch is unavailable"); }} className="py-6 text-lg bg-emerald-600 hover:bg-emerald-700"><RotateCcw className="mr-2 h-5 w-5" />Rematch</Button>}
            <Button onClick={() => setLocation("/")} className="py-6 text-lg">Back to Home</Button>
          </div>
        </div>
        <Dialog open={sharePreviewOpen} onOpenChange={setSharePreviewOpen}>
          <DialogContent className="max-w-2xl border-slate-700 bg-slate-950 text-white">
            <DialogHeader>
              <DialogTitle>Preview your ViperQuiz result</DialogTitle>
              <DialogDescription className="text-slate-300">Share the branded result card with your friends or download it for social posts.</DialogDescription>
            </DialogHeader>
            {sharePreviewUrl && <img src={sharePreviewUrl} alt="Branded ViperQuiz scoreboard share card" className="w-full rounded-xl border border-cyan-300/20 shadow-2xl" />}
            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={() => setSharePreviewOpen(false)} className="border-slate-600 bg-transparent text-white hover:bg-slate-800">Close</Button>
              <Button type="button" variant="outline" onClick={downloadPreparedCard} className="border-cyan-300/40 bg-transparent text-cyan-100 hover:bg-cyan-300/10">Download card</Button>
              <Button type="button" onClick={sharePreparedCard} className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white">Share now</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 p-4 ${scaleClass} ${highContrast ? "contrast-125" : ""}`}>
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-3 flex flex-wrap justify-end gap-2 mb-1">
          <Button onClick={() => setShowA11y((value) => !value)} variant="outline" className="bg-white text-gray-800"><Accessibility className="mr-2 h-4 w-4" />Accessibility</Button>
          {hostIsCurrentPlayer && <>
            {roomData?.isPaused ? <Button onClick={() => runHostAction("resume")} className="bg-emerald-600 hover:bg-emerald-700 text-white"><Play className="mr-2 h-4 w-4" />Resume</Button> : <Button onClick={() => runHostAction("pause")} className="bg-amber-500 hover:bg-amber-600 text-white"><Pause className="mr-2 h-4 w-4" />Pause</Button>}
            <Button onClick={() => runHostAction("restart")} className="bg-red-600 hover:bg-red-700 text-white"><RotateCcw className="mr-2 h-4 w-4" />Restart</Button>
            <Button onClick={handleGameTimeUp} className="bg-slate-800 hover:bg-slate-900 text-white">End game</Button>
          </>}
        </div>
        {showA11y && <div className="lg:col-span-3 rounded-lg bg-white p-3 flex flex-wrap items-center gap-3 shadow" role="region" aria-label="Accessibility controls"><span className="font-semibold">Text size</span><Button size="sm" variant={fontScale === "normal" ? "default" : "outline"} onClick={() => setFontScale("normal")}>Normal</Button><Button size="sm" variant={fontScale === "large" ? "default" : "outline"} onClick={() => setFontScale("large")}>Large</Button><Button size="sm" variant={fontScale === "xlarge" ? "default" : "outline"} onClick={() => setFontScale("xlarge")}>Extra large</Button><label className="flex items-center gap-2"><input type="checkbox" checked={highContrast} onChange={(e) => setHighContrast(e.target.checked)} /> High contrast</label><span className="text-sm text-gray-600">Answer buttons support keyboard focus and use labels plus color.</span></div>}
        <div className="lg:col-span-2">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-2 text-white">
            <Clock className="w-5 h-5" />
            <span className="text-2xl font-bold">{formatTime(timeLeftMs)}</span>
          </div>
          <div className="text-white text-center">
            <p className="text-sm opacity-90">Question {(roomData?.currentQuestionIndex || 0) + 1} of {roomData?.questionCount || TOTAL_QUESTIONS}</p>
            <Progress value={((roomData?.currentQuestionIndex || 0) + 1) / (roomData?.questionCount || TOTAL_QUESTIONS) * 100} className="w-48 mt-2" />
          </div>
          <div className="flex items-center gap-2 text-white">
            <Users className="w-5 h-5" />
            <span className="text-lg font-semibold">{players.length} players</span>
          </div>
        </div>

        {/* Question Card */}
        {isSpectator ? <Card className="p-10 mb-8 text-center"><Eye className="mx-auto h-12 w-12 text-blue-600 mb-3" /><h2 className="text-2xl font-bold">Spectator mode</h2><p className="mt-2 text-gray-600">You are watching this round. Answers and scoring are disabled for your account.</p><p className="mt-4 font-semibold">{roomData?.isPaused ? "The host has paused the game." : `Live timer: ${formatTime(timeLeftMs)}`}</p></Card> : currentQuestion ? (
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={currentQuestion.id ?? currentQuestion.question} initial={{ opacity: 0, y: 18, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -12, scale: 0.985 }} transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}>
          <Card className="question-card p-8 mb-8 bg-card">
                    <h2 className="text-2xl font-bold mb-8 text-center italic text-foreground">{currentQuestion.question}</h2>
                    {isAnswerSubmitted && <p className="text-center font-semibold text-gray-700" role="status">{correctAnswer === selectedAnswer ? "Correct answer" : `Incorrect answer — correct option: ${correctAnswer}`}</p>}

            {/* Answer Options */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              {["A", "B", "C", "D"].map((option) => {
                const isSelected = selectedAnswer === option;
                const isCorrect = correctAnswer === option;
                const isIncorrect = selectedAnswer === option && correctAnswer !== option && isAnswerSubmitted;
                const showCorrect = isAnswerSubmitted && correctAnswer === option;

                let bgColor = "bg-gray-50";
                let borderColor = "border-gray-300 hover:border-blue-500";
                let textColor = "text-blue-600";
                let badgeBg = "bg-blue-100";

                if (showCorrect) {
                  // Correct answer - always show green
                  bgColor = "bg-green-100";
                  borderColor = "border-green-500";
                  textColor = "text-green-600";
                  badgeBg = "bg-green-100";
                } else if (isIncorrect) {
                  // Selected but incorrect - show red
                  bgColor = "bg-red-100";
                  borderColor = "border-red-500";
                  textColor = "text-red-600";
                  badgeBg = "bg-red-100";
                } else if (isSelected && !isAnswerSubmitted) {
                  // Selected but not submitted yet - show blue
                  bgColor = "bg-blue-100";
                  borderColor = "border-blue-500";
                }

                return (
                  <button
                    key={option}
                    type="button"
                    aria-label={`Option ${option}: ${currentQuestion[`option${option}`]}`}
                    aria-pressed={isSelected}
                    onClick={() => handleAnswerSelect(option)}
                    disabled={selectedAnswer !== null || gameState !== "playing" || timeLeftMs <= 0}
                    className={`answer-option p-6 rounded-lg border-2 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-yellow-400 ${bgColor} ${borderColor} ${selectedAnswer !== null ? "cursor-not-allowed" : "cursor-pointer"}`}
                  >
                    <div className="flex items-center gap-4">
                      <span className={`text-2xl font-bold ${textColor} w-12 h-12 flex items-center justify-center ${badgeBg} rounded-full`}>
                        {option}
                      </span>
                      <span className="text-lg font-semibold text-left">
                        {currentQuestion[`option${option}`]}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {isAnswerSubmitted && (answerExplanation || currentQuestion.explanation) && <div className="mb-5 rounded-lg border border-blue-200 bg-blue-50 p-4" role="status"><p className="font-semibold text-blue-900">Why this answer?</p><p className="mt-1 text-blue-800">{answerExplanation || currentQuestion.explanation}</p></div>}
            <div className="mt-4 border-t pt-4"><div className="flex flex-wrap items-center gap-2"><Flag className="h-4 w-4 text-gray-500" /><label htmlFor="report-reason" className="text-sm font-medium">Report this question</label><select id="report-reason" value={reportReason} onChange={(e) => setReportReason(e.target.value as typeof reportReason)} className="rounded border px-2 py-1 text-sm"><option value="unclear">Unclear</option><option value="incorrect">Incorrect</option><option value="inappropriate">Inappropriate</option><option value="other">Other</option></select><Button size="sm" variant="outline" onClick={handleReportQuestion} disabled={isReporting}>{isReporting ? "Sending..." : "Send report"}</Button></div><textarea aria-label="Optional report details" value={reportDetails} onChange={(e) => setReportDetails(e.target.value)} maxLength={500} placeholder="Optional details (up to 500 characters)" className="mt-2 w-full rounded border px-3 py-2 text-sm" rows={2} /></div>

            {/* Skipped Questions Button - Only show if there are skipped questions */}
            {skippedData?.skipped && skippedData.skipped.length > 0 && (
              <div className="flex justify-center">
                <Button
                  onClick={() => {
                    const skippedList = skippedData.skipped
                      .map((q: any, idx: number) => `Q${idx + 1}: ${q.question}`)
                      .join('\n\n');
                    toast.info(`Skipped Questions (${skippedData.skipped.length}):\n${skippedList}`, {
                      duration: 5000,
                    });
                  }}
                  variant="outline"
                  className="px-8 py-2 text-blue-600 hover:text-blue-700 border-blue-300 hover:border-blue-600"
                >
                  Skipped Questions ({skippedData.skipped.length})
                </Button>
              </div>
            )}
          </Card>
            </motion.div>
          </AnimatePresence>
        ) : (
          <Card className="p-8 text-center">
            {roomData && roomData.players && (roomData.players.find((p: any) => p.id === playerId)?.playerQuestionIndex ?? 0) >= TOTAL_QUESTIONS ? (
              <div>
                {completionData?.completed ? (
                  <>
                    <p className="text-xl font-semibold mb-4">✅ All questions answered!</p>
                    <p className="text-lg text-gray-600">Waiting for the game timer to end...</p>
                    <p className="text-sm text-gray-500 mt-4">Time remaining: {formatTime(timeLeftMs)}</p>
                  </>
                ) : (
                  <>
                    <p className="text-xl font-semibold mb-4">📋 Answering skipped questions...</p>
                    <p className="text-lg text-gray-600">You have {skippedData?.skipped?.length || 0} skipped questions to answer</p>
                    <p className="text-sm text-gray-500 mt-4">Time remaining: {formatTime(timeLeftMs)}</p>
                  </>
                )}
              </div>
            ) : (
              <p className="text-xl font-semibold">{roomData?.isPaused ? "Game paused by host" : "Waiting for next question..."}</p>
            )}
          </Card>
        )}

        {/* Live Scores */}
        <Card className="p-6">
          <h3 className="text-xl font-bold mb-4">Live Scores</h3>
          <div className="space-y-3">
            {players
              .sort((a, b) => b.score - a.score)
              .map((player) => (
                <div key={player.id} className="flex justify-between items-center p-3 bg-gray-100 rounded-lg">
                    <div className="flex flex-col">
                        <span className="font-semibold">{player.name}</span>
                        {player.lastSeenAt && Date.now() - player.lastSeenAt > 15000 && <span className="text-xs text-amber-700">Disconnected</span>}
                      {player.currentStreak >= 3 && (
                        <span className="text-xs font-semibold text-orange-500">🔥 {player.currentStreak}-Streak</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-gray-600">{player.correctAnswers}/{player.totalAnswered}</span>
                      {player.bonusPoints > 0 && (
                        <span className="text-xs font-semibold text-emerald-600">+{player.bonusPoints} bonus</span>
                      )}
                      <span className="font-bold text-blue-600">{player.score} pts</span>
                      {hostIsCurrentPlayer && player.id !== playerId && player.lastSeenAt && Date.now() - player.lastSeenAt > 15000 && <Button size="sm" variant="outline" onClick={() => handleRemovePlayer(player.id, player.name)}>Remove</Button>}
                    </div>
                </div>
              ))}
          </div>
        </Card>
        </div>

        {/* Chat Sidebar */}
        <div className="lg:col-span-1">
          <div className="h-full min-h-96 lg:min-h-screen">
            <GameChat roomCode={roomCode} playerId={playerId} playerName={players.find(p => p.id === playerId)?.name || "Player"} />
          </div>
        </div>
      </div>
    </div>
  );
}
