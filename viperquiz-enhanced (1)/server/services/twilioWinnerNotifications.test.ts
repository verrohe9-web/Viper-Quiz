import { describe, expect, it, vi } from "vitest";
import { createWinnerMessage, normalizeKenyanPhone, notifyWinner } from "./twilioWinnerNotifications";

describe("Twilio winner notifications", () => {
  const winner = { rank: 1 as const, playerName: "Viper", phoneNumber: "0712345678", score: 98, roomCode: "ABC123" };
  it("normalizes Kenyan mobile numbers and rejects invalid values", () => {
    expect(normalizeKenyanPhone("0712345678")).toBe("+254712345678");
    expect(normalizeKenyanPhone("+254712345678")).toBe("+254712345678");
    expect(normalizeKenyanPhone("0112345678")).toBeNull();
  });
  it("fails closed until explicitly enabled and completely configured", async () => {
    expect(await notifyWinner(winner, { enabled: true })).toEqual({ sent: false, reason: "disabled_or_incomplete_configuration" });
  });
  it("sends normalized SMS and voice requests when enabled", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ sid: "TW123", status: "queued" }), { status: 201 }));
    const result = await notifyWinner(winner, { enabled: true, accountSid: "AC123", authToken: "secret", smsFrom: "+15005550006", voiceFrom: "+15005550006", voiceUrl: "https://example.com/winner.xml" }, fetchMock as unknown as typeof fetch);
    expect(result.sent).toBe(true);
    expect(result.phoneNumber).toBe("+254712345678");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(createWinnerMessage(winner)).toContain("finished #1");
  });
});
