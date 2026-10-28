from pathlib import Path
import re

root = Path('/home/ubuntu/viperquiz-enhanced')

def edit(path, fn):
    p = root / path
    text = p.read_text()
    updated = fn(text)
    if updated == text:
        raise SystemExit(f'No changes made to {path}')
    p.write_text(updated)

# Server router: remove legacy collection procedures and Airtel simulator procedures.
def game_router(text):
    text = text.replace('import { airtelPaymentAdapter, AIRTEL_ADAPTER_DISABLED_MESSAGE } from "../services/airtelPaymentAdapter";\n', '')
    text = text.replace('manual verification will report it.', 'Daraja reconciliation will report it.')
    text = text.replace('[ManualPilot] Could not create durable prize-pool header', '[Daraja] Could not create durable prize-pool header')
    text = text.replace('paymentMode: "manual_pilot" as const,', 'paymentMode: "daraja_mpesa" as const,')
    text = text.replace('paymentMode: prizePool?.enabled ? "manual_pilot" : "free",', 'paymentMode: prizePool?.enabled ? "daraja_mpesa" : "free",')
    text = re.sub(r'\n  // Configure the room\'s manual-pilot payment mode\..*?\n  // Daraja STK Push boundary\.', '\n  // Daraja STK Push boundary.', text, flags=re.S)
    text = re.sub(r'\n  // Sandbox-only mock payment request; this never contacts Airtel\..*?\n  // Get manual payout preview', '\n  // Get manual payout preview', text, flags=re.S)
    text = text.replace('console.error("[ManualPilot] Failed to fetch payout records", error);', 'console.error("[Daraja] Failed to fetch payout records", error);')
    text = text.replace('console.error("[ManualPilot] Failed to build reconciliation export", error);', 'console.error("[Daraja] Failed to build reconciliation export", error);')
    text = text.replace('console.error("[ManualPilot] Failed to record payout", error);', 'console.error("[Daraja] Failed to record payout", error);')
    text = text.replace('provider: "manual_mpesa",', 'provider: "daraja_mpesa",')
    return text
edit('server/routers/game.ts', game_router)

# Server callback route: remove Airtel callback and use a Daraja-specific status method.
def core_index(text):
    text = re.sub(r'\n  // Reserved Airtel callback boundary\..*?\n  // Daraja callback endpoint', '\n  // Daraja callback endpoint', text, flags=re.S)
    text = text.replace('applyAirtelPaymentStatus', 'applyDarajaPaymentStatus')
    return text
edit('server/_core/index.ts', core_index)

# In-memory game room: remove legacy methods and rename the provider-specific status updater.
def game_room(text):
    text = text.replace('manualPilotEnabled = false', 'darajaEnabled = false')
    text = text.replace('createPrizePool(roundId, DEFAULT_DEVELOPER_PAYOUT_PHONE, manualPilotEnabled)', 'createPrizePool(roundId, DEFAULT_DEVELOPER_PAYOUT_PHONE, darajaEnabled)')
    text = re.sub(r'\n  configureManualPilot\(.*?\n  submitManualPaymentReference\(.*?\n  createDarajaPaymentRequest', '\n  createDarajaPaymentRequest', text, flags=re.S)
    text = re.sub(r'\n  createMockAirtelPaymentRequest\(.*?\n  applyAirtelPaymentStatus\(', '\n  applyDarajaPaymentStatus(', text, flags=re.S)
    text = re.sub(r'\n  markManualPayment\(.*?\n  getManualPayoutPreview', '\n  getManualPayoutPreview', text, flags=re.S)
    text = text.replace('applyAirtelPaymentStatus', 'applyDarajaPaymentStatus')
    return text
edit('server/services/gameRoom.ts', game_room)

# Daraja-only naming in prize pool, while retaining the existing collection phone env for compatibility.
def prize_pool(text):
    text = text.replace('DEFAULT_MANUAL_PILOT_COLLECTION_PHONE', 'DEFAULT_DARAJA_COLLECTION_PHONE')
    text = text.replace('MIN_MANUAL_PILOT_PARTICIPANTS', 'MIN_DARAJA_PARTICIPANTS')
    text = text.replace('collectionPhone: DEFAULT_MANUAL_PILOT_COLLECTION_PHONE', 'collectionPhone: DEFAULT_DARAJA_COLLECTION_PHONE')
    return text
edit('server/services/prizePool.ts', prize_pool)

# Remove the admin Airtel simulator route and import.
def app(text):
    text = text.replace('import AirtelSimulator from "@/pages/AirtelSimulator";\n', '')
    text = text.replace('      <Route path={"/admin/airtel-simulator"} component={AirtelSimulator} />\n', '')
    return text
edit('client/src/App.tsx', app)

# Remove compact legacy state, handlers, and JSX from Room.tsx.
def room(text):
    text = text.replace('  const verifyManualPaymentMutation = trpc.game.verifyManualPayment.useMutation();\n', '')
    text = text.replace('  const submitManualPaymentReferenceMutation = trpc.game.submitManualPaymentReference.useMutation();\n', '')
    text = text.replace('  const requestMockAirtelPaymentMutation = trpc.game.requestMockAirtelPayment.useMutation();\n', '')
    text = text.replace('  const [paymentReferenceSuffix, setPaymentReferenceSuffix] = useState("");\n', '')
    text = text.replace('  const [airtelNumber, setAirtelNumber] = useState("");\n', '')
    text = re.sub(r'\n  const handleRequestMockAirtelPayment = async \(\) => \{.*?\n  \};\n', '\n', text, flags=re.S)
    text = re.sub(r'\n  const handleSubmitPaymentReference = async \(\) => \{.*?\n  \};\n', '\n', text, flags=re.S)
    text = re.sub(r'\n  const handleVerifyPayment = async \(.*?\n  \};\n', '\n', text, flags=re.S)
    text = text.replace('  const manualPilot = room.paymentMode === "manual_pilot" && room.prizePool;\n', '  const darajaPayment = room.paymentMode === "daraja_mpesa" && room.prizePool;\n')
    text = text.replace('  const canStart = Boolean(customTopic.trim()) && (!manualPilot || Boolean(room.prizePool?.allParticipantsPaid));\n', '  const canStart = Boolean(customTopic.trim()) && (!darajaPayment || Boolean(room.prizePool?.allParticipantsPaid));\n')
    text = re.sub(r'\n  const paymentLockLabel = participantsNeedMore.*?\n    : `Verify.*?`;\n', '\n  const paymentLockLabel = participantsNeedMore > 0\n    ? `Add ${participantsNeedMore} more paid player${participantsNeedMore === 1 ? "" : "s"}`\n    : `Waiting for Daraja payment confirmation`;\n', text, flags=re.S)
    text = text.replace('{manualPilot && room.players.some((player) => player.id === playerId && !player.isSpectator) && <DarajaPaymentPanel', '{darajaPayment && room.players.some((player) => player.id === playerId && !player.isSpectator) && <DarajaPaymentPanel')
    text = re.sub(r'\{manualPilot \? <div className="mt-6 space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">.*?</div> : <div className="mt-6 p-4 bg-blue-50', '{darajaPayment ? <div className="mt-6 space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4"><div><p className="font-bold text-amber-950">Safaricom M-Pesa payment</p><p className="text-sm text-amber-900">Each participating player contributes {formatKsh(room.prizePool?.entryFeeMinor)}. Use the Daraja STK Push above and approve it on your phone. The game unlocks after Safaricom confirms every participant.</p></div><div className="grid grid-cols-2 gap-2 text-sm text-amber-950"><div>Verified <strong>{paidParticipantCount}/{room.prizePool?.participantCount || 0}</strong></div><div>Pool <strong>{formatKsh(room.prizePool?.grossPoolMinor)}</strong></div><div>Developer 10% <strong>{formatKsh(room.prizePool?.developerNetMinor)}</strong></div><div>Winner shares 90% <strong>{formatKsh(room.prizePool?.winnerAllocationMinor)}</strong></div></div><p className="text-xs text-amber-800">The round requires at least {minimumParticipantCount} paid players, and every active player must be confirmed by Safaricom Daraja.</p></div> : <div className="mt-6 p-4 bg-blue-50', text, flags=re.S)
    text = text.replace('{manualPilot && !room.prizePool?.allParticipantsPaid ? paymentLockLabel : "Start game"}', '{darajaPayment && !room.prizePool?.allParticipantsPaid ? paymentLockLabel : "Start game"}')
    text = text.replace('Airtel payment failed', 'M-Pesa payment failed').replace('Airtel mock pending', 'M-Pesa confirmation pending').replace('Awaiting host verification', 'Awaiting M-Pesa confirmation')
    text = re.sub(r'\{isHost && payment && <Button.*?</Button>\}', '', text)
    return text
edit('client/src/pages/Room.tsx', room)

# Remove the obsolete admin simulator source and its dedicated Airtel adapter/tests.
for rel in ['client/src/pages/AirtelSimulator.tsx', 'server/services/airtelPaymentAdapter.ts', 'server/services/airtelPaymentAdapter.test.ts']:
    p = root / rel
    if p.exists(): p.unlink()

# Remove legacy tests from the game-room suite, retaining prize payout coverage under the existing method name.
p = root / 'server/services/gameRoom.test.ts'
t = p.read_text()
t = re.sub(r'\ndescribe\("Manual Pilot M-Pesa reference suffix".*?\n\}\);\n', '\n', t, flags=re.S)
t = re.sub(r'\ndescribe\("Mock Airtel payment lifecycle".*?\n\}\);\n', '\n', t, flags=re.S)
t = t.replace('describe("Manual Pilot payout records"', 'describe("Daraja prize payout records"')
t = t.replace('manager.markManualPayment(room.roomCode, "host", id, true,', 'manager.createDarajaPaymentRequest(room.roomCode, id,')
p.write_text(t)

print('legacy payment paths removed')
