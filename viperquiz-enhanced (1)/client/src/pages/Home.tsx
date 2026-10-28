import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { nanoid } from "nanoid";
import { Download, Hexagon, Loader2, Sparkles, Users } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CustomCategoryModal } from "@/components/CustomCategoryModal";

const ANDROID_APK_URL = "/downloads/viperquiz.apk";

export default function Home() {
  const [, setLocation] = useLocation();
  const [playerName, setPlayerName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [loadingAction, setLoadingAction] = useState<"create" | "join" | null>(null);
  const isLoading = loadingAction !== null;
  const [customCategoryModalOpen, setCustomCategoryModalOpen] = useState(false);
  const [joinAsSpectator, setJoinAsSpectator] = useState(false);
  const [paymentProvider, setPaymentProvider] = useState<"free" | "paystack_mpesa">("free");

  useEffect(() => {
    const savedId = localStorage.getItem("playerId") || `guest-${nanoid()}`;
    localStorage.setItem("playerId", savedId);
    setPlayerId(savedId);
    setPlayerName(localStorage.getItem("playerName") || "");
  }, []);

  const createRoomMutation = trpc.game.createRoom.useMutation();
  const paystackAvailability = trpc.game.paystackAvailability.useQuery(undefined);
  const joinRoomQuery = trpc.game.joinRoom.useQuery(
    { roomCode: roomCode.toUpperCase(), playerName, playerId, spectator: joinAsSpectator },
    { enabled: false }
  );

  const handleCreateRoom = async () => {
    if (!playerName.trim()) return toast.error("Enter your name first");
    setLoadingAction("create");
    try {
      const room = await createRoomMutation.mutateAsync({ playerName: playerName.trim(), playerId, paymentProvider });
      localStorage.setItem("playerName", playerName.trim());
      setLocation(`/room/${room.roomCode}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create the room. Please try again.");
    } finally {
      setLoadingAction(null);
    }
  };

  const handleJoinRoom = async () => {
    if (!playerName.trim()) return toast.error("Enter your name first");
    if (!roomCode.trim()) return toast.error("Enter a room code");
    setLoadingAction("join");
    try {
      const result = await joinRoomQuery.refetch();
      if (!result.data?.success) throw new Error(result.data?.message || "Room not found");
      localStorage.setItem("playerName", playerName.trim());
      setLocation(`/room/${roomCode.toUpperCase()}`);
    } catch {
      toast.error("Room not found or full. Check the code and try again.");
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050b1b] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(120,190,220,.045)_1px,transparent_1px),linear-gradient(90deg,rgba(120,190,220,.045)_1px,transparent_1px),radial-gradient(circle_at_30%_40%,rgba(17,112,255,.28),transparent_45%),linear-gradient(180deg,#071326,#050b1b_88%)] bg-[size:44px_44px,44px_44px,auto,auto]" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-8 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl border border-cyan-200/30 bg-cyan-200/10 text-cyan-100 shadow-[0_0_28px_rgba(34,211,238,.18)]"><Hexagon className="h-6 w-6" /></div><div><p className="text-sm font-semibold tracking-[.24em] text-cyan-100/80">VIPER</p><p className="text-xs tracking-[.32em] text-blue-200/60">QUIZ NETWORK</p></div></div>
          <nav className="flex items-center gap-2 text-xs text-blue-100/70" aria-label="ViperQuiz navigation"><Link href="/history" className="rounded-full border border-white/10 bg-white/5 px-3 py-2 transition hover:border-cyan-200/30 hover:text-cyan-100">History</Link><Link href="/friends" className="hidden rounded-full border border-white/10 bg-white/5 px-3 py-2 transition hover:border-cyan-200/30 hover:text-cyan-100 sm:inline-flex">Friends</Link><Link href="/profile" className="hidden rounded-full border border-white/10 bg-white/5 px-3 py-2 transition hover:border-cyan-200/30 hover:text-cyan-100 sm:inline-flex">Profile</Link><a href={ANDROID_APK_URL} download aria-label="Download the ViperQuiz Android app" className="inline-flex items-center gap-1.5 rounded-full border border-cyan-200/30 bg-cyan-200/10 px-3 py-2 font-semibold text-cyan-100 transition hover:border-cyan-100/60 hover:bg-cyan-200/20 hover:text-white"><Download className="h-3.5 w-3.5" /> App</a><span className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 sm:flex"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" /> Live rooms</span></nav>
        </header>

        <section className="grid flex-1 items-center gap-10 py-14 lg:grid-cols-[1.05fr_.95fr] lg:py-20">
          <div className="max-w-xl">
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-200/20 bg-cyan-200/10 px-3 py-1.5 text-xs font-medium uppercase tracking-[.18em] text-cyan-100"><span className="h-1.5 w-1.5 rounded-full bg-cyan-300" /> Multiplayer challenge</p>
            <h1 className="text-5xl font-semibold tracking-[-.05em] text-white sm:text-7xl">Think fast.<br /><span className="bg-gradient-to-r from-cyan-200 via-blue-300 to-violet-300 bg-clip-text text-transparent">Play sharper.</span></h1>
            <p className="mt-6 max-w-md text-base leading-7 text-blue-100/70 sm:text-lg">Create a room, invite your crew, and compete across custom topics powered by live question generation.</p>
            <div className="mt-8 flex flex-wrap gap-3 text-xs text-blue-100/70"><span className="rounded-full border border-white/10 bg-white/5 px-3 py-2">20 players max</span><span className="rounded-full border border-white/10 bg-white/5 px-3 py-2">Real-time scoring</span><span className="rounded-full border border-white/10 bg-white/5 px-3 py-2">Custom topics</span></div>
            <a href={ANDROID_APK_URL} download aria-label="Download the ViperQuiz Android app APK" className="mt-7 inline-flex items-center gap-2 rounded-xl border border-cyan-200/30 bg-cyan-200/10 px-4 py-3 text-sm font-semibold text-cyan-100 shadow-[0_8px_30px_rgba(34,211,238,.12)] transition hover:-translate-y-0.5 hover:border-cyan-100/60 hover:bg-cyan-200/20 hover:text-white"><Download className="h-4 w-4" /> Download Android app <span className="text-xs font-normal text-cyan-100/60">APK</span></a>
          </div>

          <div className="relative mx-auto w-full max-w-md rounded-[2rem] border border-white/15 bg-[#0b1630]/85 p-6 shadow-[0_24px_100px_rgba(0,0,0,.45)] backdrop-blur-xl sm:p-8">
            <div className="mb-7"><p className="text-xs font-semibold uppercase tracking-[.18em] text-cyan-200/70">Enter the arena</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">Start your next round</h2></div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-[.14em] text-blue-100/60" htmlFor="player-name">Your name</label>
            <Input id="player-name" value={playerName} onChange={(event) => setPlayerName(event.target.value)} placeholder="How should we call you?" disabled={isLoading} className="mb-4 h-12 border-white/10 bg-white/[.07] text-white placeholder:text-blue-100/35" />
            <fieldset className="mb-4">
              <legend className="mb-2 block text-xs font-medium uppercase tracking-[.14em] text-blue-100/60">Room payment</legend>
              <div className="grid grid-cols-2 gap-2">
                <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition ${paymentProvider === "free" ? "border-cyan-200/50 bg-cyan-200/10 text-cyan-100" : "border-white/10 bg-white/[.04] text-blue-100/60"}`}>
                  <input type="radio" name="room-payment" value="free" checked={paymentProvider === "free"} onChange={() => setPaymentProvider("free")} disabled={isLoading} />
                  Free room
                </label>
                <label className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition ${paystackAvailability.data?.enabled ? "cursor-pointer" : "cursor-not-allowed opacity-50"} ${paymentProvider === "paystack_mpesa" ? "border-emerald-300/60 bg-emerald-300/10 text-emerald-100" : "border-white/10 bg-white/[.04] text-blue-100/60"}`}>
                  <input type="radio" name="room-payment" value="paystack_mpesa" checked={paymentProvider === "paystack_mpesa"} onChange={() => setPaymentProvider("paystack_mpesa")} disabled={isLoading || !paystackAvailability.data?.enabled} />
                  Paystack test
                </label>
              </div>
              {!paystackAvailability.data?.enabled && <p className="mt-2 text-xs leading-5 text-blue-100/50">Test checkout is unavailable until the server has a rotated test secret and public HTTPS callback URL.</p>}
            </fieldset>
            <Button onClick={handleCreateRoom} disabled={isLoading} aria-busy={loadingAction === "create"} className="h-12 w-full bg-gradient-to-r from-cyan-500 to-blue-600 font-semibold text-white shadow-[0_8px_24px_rgba(14,165,233,.25)] hover:from-cyan-400 hover:to-blue-500">{loadingAction === "create" ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating room…</> : <>Create a room<Users className="ml-2 h-4 w-4" /></>}</Button>
            <div className="my-6 flex items-center gap-3 text-[11px] uppercase tracking-[.2em] text-blue-100/35"><span className="h-px flex-1 bg-white/10" /> or join <span className="h-px flex-1 bg-white/10" /></div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-[.14em] text-blue-100/60" htmlFor="room-code">Room code</label>
            <Input id="room-code" value={roomCode} maxLength={6} onChange={(event) => setRoomCode(event.target.value.toUpperCase())} placeholder="e.g. 4K8P2Q" disabled={isLoading} className="h-12 border-white/10 bg-white/[.07] font-mono uppercase tracking-[.3em] text-white placeholder:tracking-normal placeholder:text-blue-100/35" />
            <label className="mt-3 flex items-center gap-2 text-xs text-blue-100/60"><input type="checkbox" checked={joinAsSpectator} onChange={(event) => setJoinAsSpectator(event.target.checked)} disabled={isLoading} className="accent-cyan-400" /> Watch as a spectator</label>
            <Button onClick={handleJoinRoom} disabled={isLoading} aria-busy={loadingAction === "join"} variant="outline" className="mt-4 h-12 w-full border-cyan-200/20 bg-transparent font-semibold text-cyan-100 hover:bg-cyan-100/10">{loadingAction === "join" ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Joining room…</> : "Join a room"}</Button>
            {isLoading && <p className="mt-3 flex items-center justify-center gap-2 text-center text-xs text-cyan-100/70" role="status" aria-live="polite"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" />{loadingAction === "create" ? "Setting up your private lobby…" : "Checking the room code…"}</p>}
            <button type="button" onClick={() => setCustomCategoryModalOpen(true)} className="mt-6 flex w-full items-center justify-center gap-2 border-t border-white/10 pt-5 text-sm text-violet-200/85 transition hover:text-violet-100"><Sparkles className="h-4 w-4" /> Create a custom category</button>
            <p className="mt-3 text-center text-xs leading-5 text-blue-100/40">Use any topic worldwide and let ViperQuiz generate the challenge.</p>
          </div>
        </section>
        <footer className="flex flex-col gap-2 border-t border-white/10 py-5 text-xs text-blue-100/40 sm:flex-row sm:items-center sm:justify-between"><span>Built for quick minds and close finishes.</span><span>Secure rooms · Live results · Smarter play</span></footer>
      </div>
      <CustomCategoryModal open={customCategoryModalOpen} onOpenChange={setCustomCategoryModalOpen} />
    </main>
  );
}
