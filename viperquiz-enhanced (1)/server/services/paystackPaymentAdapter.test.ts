import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { PaystackPaymentAdapter } from "./paystackPaymentAdapter";

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const request = {
  roomCode: "ABC123",
  roundId: "round-1",
  playerId: "player-1",
  email: "player@example.com",
  phoneNumber: "0712345678",
  amountMinor: 1000,
  currency: "KES",
  reference: "vq_0123456789abcdef0123456789abcdef",
};

describe("PaystackPaymentAdapter", () => {
  it("initializes a KES mobile-money checkout with a server callback", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      status: true,
      data: {
        authorization_url: "https://checkout.paystack.com/session-1",
        reference: request.reference,
      },
    }));
    const adapter = new PaystackPaymentAdapter({
      secretKey: "sk_test_example",
      callbackUrl: "https://quiz.example",
      fetchImpl,
    });

    const result = await adapter.initialize(request);

    expect(result).toEqual({
      enabled: true,
      authorizationUrl: "https://checkout.paystack.com/session-1",
      reference: request.reference,
    });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.paystack.co/transaction/initialize");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk_test_example");
    expect(JSON.parse(String(init.body))).toMatchObject({
      amount: 1000,
      currency: "KES",
      channels: ["mobile_money"],
      callback_url: "https://quiz.example/api/payments/paystack/callback",
      reference: request.reference,
    });
  });

  it("verifies transaction status, exact amount, currency, and reference", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      status: true,
      data: {
        amount: 1000,
        currency: "KES",
        id: 12345,
        reference: request.reference,
        status: "success",
      },
    }));
    const adapter = new PaystackPaymentAdapter({ secretKey: "sk_test_example", callbackUrl: "https://quiz.example", fetchImpl });

    await expect(adapter.verify(request.reference, { amountMinor: 1000, currency: "KES" })).resolves.toEqual({
      status: "success",
      reference: request.reference,
      amountMinor: 1000,
      currency: "KES",
      providerTransactionId: "12345",
    });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(`https://api.paystack.co/transaction/verify/${request.reference}`);
  });

  it("rejects successful verification with a mismatched amount", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      status: true,
      data: { amount: 500, currency: "KES", reference: request.reference, status: "success" },
    }));
    const adapter = new PaystackPaymentAdapter({ secretKey: "sk_test_example", callbackUrl: "https://quiz.example", fetchImpl });

    await expect(adapter.verify(request.reference, { amountMinor: 1000, currency: "KES" }))
      .rejects.toThrow("Verified Paystack amount or currency does not match the room entry fee.");
  });

  it("accepts valid webhook signatures and rejects tampered bodies", () => {
    const secretKey = "sk_test_example";
    const adapter = new PaystackPaymentAdapter({ secretKey, callbackUrl: "https://quiz.example" });
    const body = Buffer.from('{"event":"charge.success"}');
    const signature = createHmac("sha512", secretKey).update(body).digest("hex");

    expect(adapter.verifyWebhookSignature(body, signature)).toBe(true);
    expect(adapter.verifyWebhookSignature(Buffer.from('{"event":"charge.failed"}'), signature)).toBe(false);
  });

  it("stays disabled without a test secret or HTTPS callback", async () => {
    const noSecret = new PaystackPaymentAdapter({ callbackUrl: "https://quiz.example" });
    const httpCallback = new PaystackPaymentAdapter({ secretKey: "sk_test_example", callbackUrl: "http://localhost:3000" });

    await expect(noSecret.initialize(request)).resolves.toMatchObject({ enabled: false, status: "disabled" });
    await expect(httpCallback.initialize(request)).resolves.toMatchObject({ enabled: false, status: "disabled" });
  });
});
