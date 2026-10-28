import { useEffect, useRef, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Copy, Users, Play, LogIn, LogOut, UserPlus, Link2, Settings2, Loader2 } from "lucide-react";
import { LoadingAnimation } from "@/components/LoadingAnimation";
import { InviteFriendsModal } from "@/components/InviteFriendsModal";
import { DarajaPaymentPanel } from "@/components/DarajaPaymentPanel";
import { PaystackPaymentPanel } from "@/components/PaystackPaymentPanel";

const TOPIC_HINTS = ["Science", "Kenya", "Geography", "History", "Technology", "Biology", "Physics", "Chemistry", "Mathematics", "Bible", "Christianity", "Prayers", "General Knowledge", "Cricket/Sports", "Bollywood"];

export default function Room() {
  const [match, params] = useRoute("/room/:roomCode");
  const [, setLocation] = useLocation();
  const roomCode = params?.roomCode as string;
  const playerId = localStorage.getItem("playerId") || "";
  const playerName = localStorage.getItem("playerName") || "Guest player";
  const rejoinSentRef = useRef(false);
  const previousPlayersRef = useRef<Set<string>>(new Set());

  const [selectedDifficulty, setSelectedDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [customTopic, setCustomTopic] = useState("");
  const [additionalTopics, setAdditionalTopics] = useState("");
  const [questionCount, setQuestionCount] = useState(10);
  const [timerSeconds, setTimerSeconds] = useState(300);
  const [streakBonusesEnabled, setStreakBonusesEnabled] = useState(true);
  const [isHost, setIsHost] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [selectedPaymentPlayers, setSelectedPaymentPlayers] = useState<string[]>([]);

  const { data: room, isLoading } = trpc.game.getRoom.useQuery({ roomCode, playerId }, { refetchInterval: 1000 });
  const rejoinMutation = trpc.game.rejoinRoom.useMutation();
  const setReadyMutation = trpc.game.setPlayerReady.useMutation();
  const startGameMutation = trpc.game.startGame.useMutation();
  const requestDarajaPaymentMutation = trpc.game.requestDarajaPayment.useMutation();
  const verifyDarajaPaymentsBatchMutation = trpc.game.verifyDarajaPaymentsBatch.useMutation();
  const [darajaNumber, setDarajaNumber] = useState("");
  const utils = trpc.useUtils();

  useEffect(() => {
    if (!match) setLocation("/");
  }, [match, setLocation]);

  useEffect(() => {
    if (!room) return;
    setIsHost(room.hostId === playerId);
    if (!rejoinSentRef.current && playerId) {
      rejoinSentRef.current = true;
      rejoinMutation.mutate({ roomCode, playerId, playerName });
    }
    const currentIds = new Set(room.players.map((p) => p.id));
    previousPlayersRef.current.forEach((id) => {
      if (!currentIds.has(id)) toast.info("A player left the lobby", { icon: <LogOut className="h-4 w-4" /> });
    });
    currentIds.forEach((id) => {
      if (!previousPlayersRef.current.has(id) && id !== playerId) {
        const player = room.players.find((candidate) => candidate.id === id);
        if (player) toast.success(`${player.name} joined the game!`, { icon: <LogIn className="h-4 w-4" /> });
      }
    });
    previousPlayersRef.current = currentIds;
    if (room.status === "playing") setLocation(`/game/${roomCode}`);
  }, [room, roomCode, playerId, playerName, setLocation]);

  const handleToggleReady = async () => {
    try {
      await setReadyMutation.mutateAsync({ roomCode, isReady: !isReady, playerId });
      setIsReady((value) => !value);
      toast.success(isReady ? "Marked as not ready" : "Ready for the next round");
    } catch (error: any) {
      toast.error(error?.message || "Failed to update ready status");
    }
  };

  const parseTopics = () => [customTopic, ...additionalTopics.split(",").map((topic) => topic.trim()).filter(Boolean)]
    .filter((topic, index, topics) => topics.indexOf(topic) === index);


  const handleRequestDarajaPayment = async () => {
    const normalizedNumber = darajaNumber.trim();
    if (!/^(?:254|0)7\\d{8}$/.test(normalizedNumber)) {
      toast.error("Enter a valid Kenyan M-Pesa number, for example 0712345678.");
      return;
    }
    try {
      const result = await requestDarajaPaymentMutation.mutateAsync({ roomCode, playerId, phoneNumber: normalizedNumber });
      if (!result.success) throw new Error(result.message || "Could not initiate Daraja payment");
      await utils.game.getRoom.invalidate({ roomCode, playerId });
      toast.success("M-Pesa STK Push initiated. Approve it on your phone.");
    } catch (error: any) {
      toast.error(error?.message || "Could not initiate Daraja payment");
    }
  };



  const formatKsh = (minor: number | undefined) => `KSh ${((minor || 0) / 100).toFixed(2)}`;

  const togglePaymentPlayer = (participantId: string) => {
    setSelectedPaymentPlayers((current) => current.includes(participantId) ? current.filter((id) => id !== participantId) : [...current, participantId]);
  };

  const handleVerifyPaymentBatch = async () => {
    if (!isHost || !selectedPaymentPlayers.length) return;
    try {
      const result = await verifyDarajaPaymentsBatchMutation.mutateAsync({ roomCode, hostId: playerId, playerIds: selectedPaymentPlayers });
      if (!result.success) throw new Error(result.message || "Could not verify the selected payments");
      setSelectedPaymentPlayers([]);
      await utils.game.getRoom.invalidate({ roomCode, playerId });
      toast.success(`${selectedPaymentPlayers.length} M-Pesa payment${selectedPaymentPlayers.length === 1 ? "" : "s"} verified by host`);
    } catch (error: any) {
      toast.error(error?.message || "Could not verify the selected payments");
    }
  };

  const handleStartGame = async () => {
    const topics = parseTopics();
    if (!topics.length || topics[0].length < 2) {
      toast.error("Enter a specific topic with at least two characters.");
      return;
    }
    if (topics.some((topic) => topic.length > 120)) {
      toast.error("Each topic must be 120 characters or fewer.");
      return;
    }
    if (/^(anything|everything|random|whatever)$/i.test(topics[0])) {
      toast.error("Please make the topic more specific so the AI can create a focused round.");
      return;
    }

    setIsGeneratingQuestions(true);
    try {
      const result = await startGameMutation.mutateAsync({
        roomCode,
        category: topics[0],
        playerId,
        difficulty: selectedDifficulty,
        customTopic: topics[0],
        questionCount,
        timerDurationSeconds: timerSeconds,
        streakBonusesEnabled,
        topics,
      });
      if (!result.success) throw new Error(result.message || "Failed to start game");
      setLocation(`/game/${roomCode}`);
    } catch (error: any) {
      toast.error(error?.message || "Failed to generate questions");
      setIsGeneratingQuestions(false);
    }
  };

  const copyText = async (text: string, message: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(message);
    } catch {
      toast.error("Copy failed. Select and copy the room details manually.");
    }
  };

  if (isGeneratingQuestions) return <LoadingAnimation message="Validating topics and generating questions..." duration={3000} />;
  if (isLoading) return <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center"><div className="text-white text-2xl">Loading lobby...</div></div>;
  if (!room) return <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center"><Card className="p-8"><p className="text-xl font-semibold">Room not found</p><Button className="mt-4" onClick={() => setLocation("/")}>Back home</Button></Card></div>;

  const joinLink = `${window.location.origin}/room/${roomCode}`;
  const darajaPayment = room.paymentMode === "daraja_mpesa" && room.prizePool;
  const paystackPayment = room.paymentMode === "paystack_mpesa" && room.prizePool;
  const currentParticipantPayment = room.prizePool?.participants.find((participant) => participant.playerId === playerId);
  const paidParticipantCount = room.prizePool?.paidParticipantCount || 0;
  const minimumParticipantCount = room.prizePool?.minimumParticipantCount || 3;
  const participantsNeedMore = Math.max(0, minimumParticipantCount - (room.prizePool?.participantCount || 0));
  const canStart = Boolean(customTopic.trim()) && (!darajaPayment || Boolean(room.prizePool?.allParticipantsPaid));
  const paymentLockLabel = participantsNeedMore > 0
    ? `Add ${participantsNeedMore} more paid player${participantsNeedMore === 1 ? "" : "s"}`
    : `Waiting for ${paystackPayment ? "Paystack" : "Daraja"} payment confirmation`;

  return (
    <>
      <InviteFriendsModal isOpen={isInviteModalOpen} onClose={() => setIsInviteModalOpen(false)} roomCode={roomCode} />
      <main className="min-h-screen bg-gradient-to-br from-purple-600 via-blue-600 to-cyan-600 p-4">
        <div className="max-w-5xl mx-auto">
          <header className="text-center mb-8 text-white">
            <p className="uppercase tracking-[0.25em] text-xs font-semibold text-white/70">ViperQuiz Enhanced</p>
            <h1 className="text-4xl font-bold mb-2">Game Lobby</h1>
            <p className="text-white/80 text-sm">Build a focused worldwide quiz round, then invite your challengers.</p>
            <div className="flex flex-wrap items-center justify-center gap-2 mt-5">
              <span className="text-white/80">Room code</span>
              <Button aria-label="Copy room code" onClick={() => copyText(roomCode, "Room code copied")} className="bg-white/20 hover:bg-white/30 text-white" size="sm"><span className="font-mono font-bold text-xl">{roomCode}</span><Copy className="ml-2 h-4 w-4" /></Button>
              <Button aria-label="Copy shareable room link" onClick={() => copyText(joinLink, "Shareable room link copied")} className="bg-white/20 hover:bg-white/30 text-white" size="sm"><Link2 className="mr-2 h-4 w-4" />Copy link</Button>
              <Button onClick={() => setIsInviteModalOpen(true)} className="bg-purple-500 hover:bg-purple-600 text-white" size="sm"><UserPlus className="mr-2 h-4 w-4" />Invite friends</Button>
            </div>
          </header>

          <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-6">
            <Card className="p-6">
              <div className="flex items-center justify-between gap-3 mb-5"><div className="flex items-center gap-2"><Users className="h-6 w-6" /><h2 className="text-2xl font-bold">Players</h2></div><div className="flex items-center gap-2"><Badge variant="outline">{room.playerCount}/{room.maxPlayers} players</Badge>{room.spectatorCount > 0 && <Badge variant="outline">{room.spectatorCount} watching</Badge>}</div></div>
              <div className="space-y-2" aria-live="polite">
                {room.players.map((player) => {
                  const payment = room.prizePool?.participants.find((participant) => participant.playerId === player.id);
                  return <div key={player.id} className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200"><div className="min-w-0"><span className="font-semibold text-gray-800 block truncate">{player.name}</span>{payment && !player.isSpectator && <span className={`text-xs ${payment.paid ? "text-green-700" : payment.paymentStatus === "failed" ? "text-red-700" : "text-amber-700"}`}>{payment.paid ? "KSh 10 paid" : payment.paymentStatus === "failed" ? "M-Pesa payment failed" : payment.providerRequestId ? "M-Pesa confirmation pending" : "Awaiting M-Pesa confirmation"}</span>}</div><div className="flex flex-wrap items-center justify-end gap-2">{isHost && payment && !payment.paid && payment.walletPhone && !player.isSpectator && <label className="flex items-center gap-1 text-xs font-semibold text-slate-700"><input type="checkbox" aria-label={`Select ${player.name} for payment verification`} checked={selectedPaymentPlayers.includes(player.id)} onChange={() => togglePaymentPlayer(player.id)} />Verify</label>}{player.isSpectator && <Badge variant="outline">Spectator</Badge>}{payment && !player.isSpectator && <Badge className={payment.paid ? "bg-green-600" : "bg-amber-500"}>{payment.paid ? "Paid" : "Unpaid"}</Badge>}{player.isReady && !player.isSpectator && <Badge className="bg-green-500">Ready</Badge>}{player.id === room.hostId && <Badge className="bg-purple-500">Host</Badge>}{isHost && payment?.walletPhone && <span className="rounded bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">M-Pesa {payment.walletPhone}</span>}{isHost && payment?.providerRequestId && <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">Request {payment.providerRequestId.slice(-10)}</span>}{isHost && payment?.providerTransactionId && <span className="rounded bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-800">Ref {payment.providerTransactionId}</span>}</div></div>;
                })}
              </div>
              {isHost && darajaPayment && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3"><p className="text-xs text-emerald-900">Select players whose M-Pesa numbers you have verified separately, then confirm the batch.</p><Button type="button" size="sm" onClick={handleVerifyPaymentBatch} disabled={!selectedPaymentPlayers.length || verifyDarajaPaymentsBatchMutation.isPending} className="bg-emerald-700 text-white hover:bg-emerald-800">{verifyDarajaPaymentsBatchMutation.isPending ? "Verifying…" : `Verify selected (${selectedPaymentPlayers.length})`}</Button></div>}
              {darajaPayment && room.players.some((player) => player.id === playerId && !player.isSpectator) && <DarajaPaymentPanel roomCode={roomCode} playerId={playerId} />}
              {paystackPayment && room.players.some((player) => player.id === playerId && !player.isSpectator) && <PaystackPaymentPanel roomCode={roomCode} playerId={playerId} entryFeeMinor={room.prizePool?.entryFeeMinor || 0} paymentReference={currentParticipantPayment?.providerRequestId} />}
              {darajaPayment || paystackPayment ? <div className="mt-6 space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4"><div><p className="font-bold text-amber-950">{paystackPayment ? "Paystack M-Pesa test payment" : "Safaricom M-Pesa payment"}</p><p className="text-sm text-amber-900">Each participating player contributes {formatKsh(room.prizePool?.entryFeeMinor)}. {paystackPayment ? "Complete checkout and wait for server-side transaction verification." : "Use the Daraja STK Push above and approve it on your phone. The game unlocks after Safaricom confirms every participant."}</p></div><div className="grid grid-cols-2 gap-2 text-sm text-amber-950"><div>Verified <strong>{paidParticipantCount}/{room.prizePool?.participantCount || 0}</strong></div><div>Pool <strong>{formatKsh(room.prizePool?.grossPoolMinor)}</strong></div><div>Developer 10% <strong>{formatKsh(room.prizePool?.developerNetMinor)}</strong></div><div>Winner shares 90% <strong>{formatKsh(room.prizePool?.winnerAllocationMinor)}</strong></div></div><p className="text-xs text-amber-800">The round requires at least {minimumParticipantCount} paid players, and every active player must be confirmed before play starts.</p></div> : <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200"><p className="text-sm text-gray-700">{isHost ? "You control the round settings. Start when the topic and players are ready." : "The host controls the settings and starts the round. Keep this tab open to stay connected."}</p></div>}
              {!isHost && <Button onClick={handleToggleReady} className={`w-full mt-5 font-bold py-3 ${isReady ? "bg-green-500 hover:bg-green-600" : "bg-gray-700 hover:bg-gray-800"} text-white`} size="lg">{isReady ? "Ready ✓" : "Mark me ready"}</Button>}
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-2 mb-5"><Settings2 className="h-5 w-5" /><h2 className="text-xl font-bold">Round settings</h2></div>
              <div className="space-y-4">
                <div><label htmlFor="quiz-topic" className="block text-sm font-semibold text-gray-700 mb-2">Primary topic *</label><input id="quiz-topic" list="quiz-topic-options" value={customTopic} onChange={(e) => setCustomTopic(e.target.value)} placeholder={TOPIC_HINTS[0]} maxLength={120} disabled={!isHost} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" /><datalist id="quiz-topic-options">{TOPIC_HINTS.map((topic) => <option key={topic} value={topic} />)}</datalist><p className="text-xs text-gray-500 mt-1">Choose a built-in topic or enter a custom one. Built-in topics work without AI credentials.</p></div>
                <div><label htmlFor="extra-topics" className="block text-sm font-semibold text-gray-700 mb-2">Additional topics <span className="font-normal text-gray-500">(optional, comma-separated)</span></label><input id="extra-topics" value={additionalTopics} onChange={(e) => setAdditionalTopics(e.target.value)} placeholder="e.g., Mars missions, satellite technology" disabled={!isHost} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                <fieldset><legend className="block text-sm font-semibold text-gray-700 mb-2">Difficulty</legend><div className="grid grid-cols-3 gap-2">{(["easy", "medium", "hard"] as const).map((level) => <button type="button" key={level} aria-pressed={selectedDifficulty === level} onClick={() => setSelectedDifficulty(level)} disabled={!isHost} className={`py-2 px-3 rounded-lg font-semibold text-sm transition-all ${selectedDifficulty === level ? "bg-blue-600 text-white" : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"}`}>{level[0].toUpperCase() + level.slice(1)}</button>)}</div></fieldset>
                <div className="grid grid-cols-2 gap-3"><div><label htmlFor="question-count" className="block text-sm font-semibold text-gray-700 mb-2">Questions</label><select id="question-count" value={questionCount} onChange={(e) => setQuestionCount(Number(e.target.value))} disabled={!isHost} className="w-full px-3 py-2 border rounded-lg"><option value={5}>5</option><option value={10}>10</option><option value={15}>15</option><option value={20}>20</option></select></div><div><label htmlFor="timer" className="block text-sm font-semibold text-gray-700 mb-2">Timer</label><select id="timer" value={timerSeconds} onChange={(e) => setTimerSeconds(Number(e.target.value))} disabled={!isHost} className="w-full px-3 py-2 border rounded-lg"><option value={60}>1 minute</option><option value={180}>3 minutes</option><option value={300}>5 minutes</option><option value={600}>10 minutes</option></select></div></div>
                <label className="flex items-center gap-3 text-sm font-medium text-gray-700"><input type="checkbox" checked={streakBonusesEnabled} onChange={(e) => setStreakBonusesEnabled(e.target.checked)} disabled={!isHost} className="h-4 w-4" /> Enable streak bonus points</label>
              </div>
              {isHost && <Button onClick={handleStartGame} disabled={!canStart} className="w-full mt-6 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-bold py-3" size="lg"><Play className="mr-2 h-5 w-5" />{darajaPayment && !room.prizePool?.allParticipantsPaid ? paymentLockLabel : "Start game"}</Button>}
            </Card>
          </div>
        </div>
      </main>
    </>
  );
}
