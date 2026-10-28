import { ENV } from "../_core/env";

export const DEFAULT_DEVELOPER_PAYOUT_PHONE = process.env.DEVELOPER_PAYOUT_PHONE || "+254787896447";
export const DEFAULT_DARAJA_COLLECTION_PHONE = ENV.darajaCollectionPhone || "0713443577";

export const MIN_DARAJA_PARTICIPANTS = 3;

export const PRIZE_POOL_POLICY = {
  entryFeeMinor: 1_000,
  currency: "KES" as const,
  developerRatePercent: 10,
  winnerRatesByRank: {
    1: 45,
    2: 27,
    3: 18,
  } as const,
};

export type PrizeRecipientType = "developer" | "first" | "second" | "third";
export type PrizePoolStatus = "open" | "funded" | "payout_pending" | "paid" | "cancelled" | "failed";
export type PaymentStatus = "pending" | "paid" | "failed";

export interface PrizeParticipant {
  playerId: string;
  playerName: string;
  walletPhone?: string;
  paid: boolean;
  paymentStatus: PaymentStatus;
  providerTransactionId?: string;
  providerRequestId?: string;
}

export interface PrizePoolState {
  roundId: string;
  enabled: boolean;
  status: PrizePoolStatus;
  entryFeeMinor: number;
  currency: "KES";
  developerPhone: string;
  collectionPhone: string;
  minimumParticipantCount: number;
  participants: Record<string, PrizeParticipant>;
  providerFeesMinor: number;
  grossPoolMinor: number;
  developerAllocationMinor: number;
  developerNetMinor: number;
  winnerAllocationMinor: number;
}

export interface RankedPlayer {
  playerId: string;
  playerName: string;
  rank: number;
  walletPhone?: string;
}

export interface PayoutAllocation {
  recipientType: PrizeRecipientType;
  playerId?: string;
  playerName?: string;
  recipientPhone: string;
  rank?: number;
  grossAmountMinor: number;
  providerFeesMinor: number;
  netAmountMinor: number;
}

export function createPrizePool(roundId: string, developerPhone: string, enabled = false): PrizePoolState {
  return {
    roundId,
    enabled,
    status: enabled ? "open" : "cancelled",
    entryFeeMinor: PRIZE_POOL_POLICY.entryFeeMinor,
    currency: PRIZE_POOL_POLICY.currency,
    developerPhone,
    collectionPhone: DEFAULT_DARAJA_COLLECTION_PHONE,
    minimumParticipantCount: MIN_DARAJA_PARTICIPANTS,
    participants: {},
    providerFeesMinor: 0,
    grossPoolMinor: 0,
    developerAllocationMinor: 0,
    developerNetMinor: 0,
    winnerAllocationMinor: 0,
  };
}

export function calculatePoolAmounts(participantCount: number, providerFeesMinor = 0, entryFeeMinor = PRIZE_POOL_POLICY.entryFeeMinor) {
  const safeCount = Math.max(0, Math.floor(participantCount));
  const grossPoolMinor = safeCount * entryFeeMinor;
  const developerAllocationMinor = Math.floor((grossPoolMinor * PRIZE_POOL_POLICY.developerRatePercent) / 100);
  const winnerAllocationMinor = grossPoolMinor - developerAllocationMinor;
  const safeProviderFeesMinor = Math.max(0, Math.min(Math.floor(providerFeesMinor), developerAllocationMinor));
  const developerNetMinor = developerAllocationMinor - safeProviderFeesMinor;

  return {
    grossPoolMinor,
    developerAllocationMinor,
    developerNetMinor,
    winnerAllocationMinor,
    providerFeesMinor: safeProviderFeesMinor,
  };
}

export function refreshPoolAmounts(pool: PrizePoolState): PrizePoolState {
  const paidParticipants = Object.values(pool.participants).filter((participant) => participant.paid).length;
  const amounts = calculatePoolAmounts(paidParticipants, pool.providerFeesMinor, pool.entryFeeMinor);
  return {
    ...pool,
    ...amounts,
    status: pool.enabled ? (paidParticipants > 0 ? "funded" : "open") : "cancelled",
  };
}

function shareForRank(rank: number, grossPoolMinor: number): number {
  if (rank === 1) return Math.floor((grossPoolMinor * PRIZE_POOL_POLICY.winnerRatesByRank[1]) / 100);
  if (rank === 2) return Math.floor((grossPoolMinor * PRIZE_POOL_POLICY.winnerRatesByRank[2]) / 100);
  if (rank === 3) return Math.floor((grossPoolMinor * PRIZE_POOL_POLICY.winnerRatesByRank[3]) / 100);
  return 0;
}

export function calculatePayoutAllocations(
  pool: PrizePoolState,
  rankedPlayers: RankedPlayer[],
  providerFeesMinor = pool.providerFeesMinor,
): PayoutAllocation[] {
  const paidParticipants = Object.values(pool.participants).filter((participant) => participant.paid);
  if (!pool.enabled || paidParticipants.length < 3) return [];

  const amounts = calculatePoolAmounts(paidParticipants.length, providerFeesMinor, pool.entryFeeMinor);
  const payouts: PayoutAllocation[] = [{
    recipientType: "developer",
    recipientPhone: pool.developerPhone,
    grossAmountMinor: amounts.developerAllocationMinor,
    providerFeesMinor: amounts.providerFeesMinor,
    netAmountMinor: amounts.developerNetMinor,
  }];

  const eligible = rankedPlayers.filter((player) => player.rank <= 3 && pool.participants[player.playerId]?.paid);
  const groups: RankedPlayer[][] = [];
  for (const player of eligible) {
    const group = groups[groups.length - 1];
    if (!group || group[0].rank !== player.rank) groups.push([player]);
    else group.push(player);
  }

  for (const group of groups) {
    const startRank = group[0].rank;
    const endRank = startRank + group.length - 1;
    const combinedShare = Array.from({ length: group.length }, (_, index) => shareForRank(startRank + index, amounts.grossPoolMinor))
      .reduce((total, share) => total + share, 0);
    const baseShare = Math.floor(combinedShare / group.length);
    let remainder = combinedShare - (baseShare * group.length);

    for (const player of group) {
      const grossAmountMinor = baseShare + (remainder > 0 ? 1 : 0);
      remainder -= remainder > 0 ? 1 : 0;
      const recipientType: PrizeRecipientType = player.rank === 1 ? "first" : player.rank === 2 ? "second" : "third";
      payouts.push({
        recipientType,
        playerId: player.playerId,
        playerName: player.playerName,
        recipientPhone: player.walletPhone || "",
        rank: player.rank,
        grossAmountMinor,
        providerFeesMinor: 0,
        netAmountMinor: grossAmountMinor,
      });
    }

    // Keep this variable explicit for readability and future validation of rank groups.
    void endRank;
  }

  return payouts;
}

export function allParticipantsPaid(pool: PrizePoolState): boolean {
  const participants = Object.values(pool.participants);
  return participants.length >= MIN_DARAJA_PARTICIPANTS && participants.every((participant) => participant.paid);
}

export function formatKsh(minor: number): string {
  return `KSh ${(Math.max(0, minor) / 100).toFixed(2)}`;
}
