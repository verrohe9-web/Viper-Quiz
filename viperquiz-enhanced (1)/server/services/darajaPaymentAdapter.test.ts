import { describe, expect, it, vi } from "vitest";
import { DarajaPaymentAdapter } from "./darajaPaymentAdapter";

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("DarajaPaymentAdapter", () => {
  it("caches OAuth and initiates an STK Push with KES amount conversion", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "token-1", expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ MerchantRequestID: "merchant-1", CheckoutRequestID: "checkout-1", ResponseCode: "0" }));
    const adapter = new DarajaPaymentAdapter({ enabled: true, consumerKey: "key", consumerSecret: "secret", shortcode: "174379", passkey: "passkey", callbackUrl: "https://example.test/api/payments/daraja/callback", fetchImpl });

    const result = await adapter.initiate({ roomCode: "ABC123", roundId: "round-1", playerId: "player-1", phoneNumber: "0712345678", amountMinor: 1000, currency: "KES", idempotencyKey: "daraja-payment:round-1:player-1" });

    expect(result).toEqual({ enabled: true, status: "initiated", providerRequestId: "merchant-1", checkoutRequestId: "checkout-1" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const request = fetchImpl.mock.calls[1]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.Amount).toBe(10);
    expect(body.PhoneNumber).toBe("254712345678");
    expect(body.PartyA).toBe("254712345678");
  });

  it("accepts a matching successful callback and returns the receipt", () => {
    const adapter = new DarajaPaymentAdapter();
    const result = adapter.reconcileCallback({ Body: { stkCallback: { MerchantRequestID: "merchant-1", ResultCode: 0, CallbackMetadata: { Item: [ { Name: "Amount", Value: 10 }, { Name: "MpesaReceiptNumber", Value: "ABC123XYZ" }, { Name: "PhoneNumber", Value: 254712345678 } ] } } } }, { providerRequestId: "merchant-1", amountMinor: 1000, currency: "KES", phoneNumber: "0712345678" });
    expect(result).toMatchObject({ accepted: true, status: "paid", providerTransactionId: "ABC123XYZ", amountMinor: 1000, currency: "KES" });
  });

  it("rejects a successful callback with a mismatched amount or phone", () => {
    const adapter = new DarajaPaymentAdapter();
    const result = adapter.reconcileCallback({ Body: { stkCallback: { MerchantRequestID: "merchant-1", ResultCode: 0, CallbackMetadata: { Item: [ { Name: "Amount", Value: 11 }, { Name: "PhoneNumber", Value: 254700000000 } ] } } } }, { providerRequestId: "merchant-1", amountMinor: 1000, currency: "KES", phoneNumber: "0712345678" });
    expect(result).toEqual({ accepted: false, reason: "Successful callback amount or phone does not match the expected payment." });
  });

  it("fails closed when the adapter lacks a callback URL or passkey", async () => {
    const adapter = new DarajaPaymentAdapter({ enabled: true, consumerKey: "key", consumerSecret: "secret", shortcode: "174379", callbackUrl: "" });
    await expect(adapter.initiate({ roomCode: "ABC123", roundId: "round-1", playerId: "player-1", phoneNumber: "0712345678", amountMinor: 1000, currency: "KES", idempotencyKey: "idempotency" })).resolves.toMatchObject({ enabled: false, status: "disabled" });
  });
});
