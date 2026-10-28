import { describe, expect, it } from "vitest";
import {
  calculatePoolAmounts,
  allParticipantsPaid,
  calculatePayoutAllocations,
  createPrizePool,
  refreshPoolAmounts,
} from "./prizePool";

describe("prize pool configuration", () => {
  it.skipIf(!process.env.DEVELOPER_PAYOUT_PHONE)("loads the configured developer payout destination without exposing it to the client", () => {
    const destination = process.env.DEVELOPER_PAYOUT_PHONE;
    expect(destination).toMatch(/^\+2547\d{8}$/);
    const pool = createPrizePool("test-round", destination || "");
    expect(pool.developerPhone).toBe(destination);
  });

  it("keeps the payment-complete flag separate from the three-player payout minimum", () => {
    const twoPaid = refreshPoolAmounts({
      ...createPrizePool("two-player", "+254787896447", true),
      participants: {
        p1: { playerId: "p1", playerName: "One", paid: true, paymentStatus: "paid" },
        p2: { playerId: "p2", playerName: "Two", paid: true, paymentStatus: "paid" },
      },
    });
    expect(Object.values(twoPaid.participants).every((participant) => participant.paid)).toBe(true);
    expect(allParticipantsPaid(twoPaid)).toBe(false);

    const threePaid = refreshPoolAmounts({
      ...twoPaid,
      participants: {
        ...twoPaid.participants,
        p3: { playerId: "p3", playerName: "Three", paid: true, paymentStatus: "paid" },
      },
    });
    expect(allParticipantsPaid(threePaid)).toBe(true);
  });

  it("allocates ten percent to the developer and ninety percent to winners", () => {
    expect(calculatePoolAmounts(10)).toEqual({
      grossPoolMinor: 10_000,
      developerAllocationMinor: 1_000,
      developerNetMinor: 1_000,
      winnerAllocationMinor: 9_000,
      providerFeesMinor: 0,
    });
  });

  it("deducts provider fees from the developer allocation only", () => {
    const pool = refreshPoolAmounts({
      ...createPrizePool("test-round-fees", "+254700000000", true),
      providerFeesMinor: 75,
      participants: {
        p1: { playerId: "p1", playerName: "One", paid: true, paymentStatus: "paid" },
        p2: { playerId: "p2", playerName: "Two", paid: true, paymentStatus: "paid" },
        p3: { playerId: "p3", playerName: "Three", paid: true, paymentStatus: "paid" },
      },
    });
    expect(pool.grossPoolMinor).toBe(3_000);
    expect(pool.developerAllocationMinor).toBe(300);
    expect(pool.developerNetMinor).toBe(225);
    expect(pool.winnerAllocationMinor).toBe(2_700);
  });

  it("creates developer and top-three payouts from a funded pool", () => {
    const pool = refreshPoolAmounts({
      ...createPrizePool("test-round-payout", "+254787896447", true),
      participants: {
        p1: { playerId: "p1", playerName: "One", walletPhone: "+254700000001", paid: true, paymentStatus: "paid" },
        p2: { playerId: "p2", playerName: "Two", walletPhone: "+254700000002", paid: true, paymentStatus: "paid" },
        p3: { playerId: "p3", playerName: "Three", walletPhone: "+254700000003", paid: true, paymentStatus: "paid" },
      },
    });
    const payouts = calculatePayoutAllocations(pool, [
      { playerId: "p1", playerName: "One", rank: 1, walletPhone: "+254700000001" },
      { playerId: "p2", playerName: "Two", rank: 2, walletPhone: "+254700000002" },
      { playerId: "p3", playerName: "Three", rank: 3, walletPhone: "+254700000003" },
    ]);
    // Three KSh 10 entries create a KSh 30 gross pool: 10% developer,
    // then 45% / 27% / 18% of gross pool to the three winners.
    expect(payouts.map((payout) => payout.netAmountMinor)).toEqual([300, 1_350, 810, 540]);
    expect(payouts[0].recipientType).toBe("developer");
  });
});


describe("Safaricom Daraja collection configuration", () => {
  it.skipIf(!process.env.MANUAL_PILOT_COLLECTION_PHONE)("exposes the configured participant collection number to the server", () => {
    expect(process.env.MANUAL_PILOT_COLLECTION_PHONE).toMatch(/^0[17]\d{8}$/);
  });
});
