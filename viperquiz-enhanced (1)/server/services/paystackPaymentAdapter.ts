import { createHmac, timingSafeEqual } from "node:crypto";

export type PaystackPaymentRequest = {
  roomCode: string;
  roundId: string;
  playerId: string;
  email: string;
  phoneNumber: string;
  amountMinor: number;
  currency: string;
  reference: string;
};

export type PaystackInitializationResult =
  | { enabled: false; status: "disabled"; message: string }
  | { enabled: true; authorizationUrl: string; reference: string };

export type PaystackVerificationResult = {
  status: "success" | "pending" | "failed";
  reference: string;
  amountMinor: number;
  currency: string;
  providerTransactionId?: string;
};

type PaystackConfig = {
  enabled?: boolean;
  secretKey?: string;
  callbackUrl?: string;
  fetchImpl?: typeof fetch;
};

type PaystackEnvelope<T> = {
  status?: boolean;
  message?: string;
  data?: T;
};

type PaystackInitializeData = {
  authorization_url?: string;
  reference?: string;
};

type PaystackVerifyData = {
  amount?: number;
  currency?: string;
  id?: number | string;
  reference?: string;
  status?: string;
};

const DISABLED_MESSAGE = "Paystack test checkout is disabled. Configure a rotated sk_test key, PAYSTACK_TEST_MODE=true, and a public HTTPS callback URL.";
const API_BASE_URL = "https://api.paystack.co";

export class PaystackPaymentAdapter {
  private readonly config: Required<Pick<PaystackConfig, "enabled" | "fetchImpl">> & Omit<PaystackConfig, "enabled" | "fetchImpl">;

  constructor(config: PaystackConfig = {}) {
    this.config = {
      enabled: config.enabled ?? Boolean(config.secretKey?.startsWith("sk_test_") && config.callbackUrl),
      secretKey: config.secretKey,
      callbackUrl: config.callbackUrl,
      fetchImpl: config.fetchImpl ?? fetch,
    };
  }

  get isConfigured(): boolean {
    if (!this.config.enabled || !this.config.secretKey?.startsWith("sk_test_") || !this.config.callbackUrl) return false;
    try {
      return new URL(this.config.callbackUrl).protocol === "https:";
    } catch {
      return false;
    }
  }

  async initialize(request: PaystackPaymentRequest): Promise<PaystackInitializationResult> {
    if (!this.isConfigured || !this.config.secretKey || !this.config.callbackUrl) {
      return { enabled: false, status: "disabled", message: DISABLED_MESSAGE };
    }
    if (!/^\S+@\S+\.\S+$/.test(request.email)) throw new Error("Enter a valid email address for the Paystack receipt.");
    if (request.currency.toUpperCase() !== "KES") throw new Error("Paystack test checkout requires KES.");
    if (!Number.isSafeInteger(request.amountMinor) || request.amountMinor <= 0) throw new Error("Payment amount must be a positive whole number of minor units.");
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(request.reference)) throw new Error("Payment reference has an invalid format.");

    const callbackUrl = new URL("/api/payments/paystack/callback", this.config.callbackUrl);
    const response = await this.config.fetchImpl(`${API_BASE_URL}/transaction/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.secretKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        email: request.email,
        amount: request.amountMinor,
        currency: request.currency.toUpperCase(),
        reference: request.reference,
        callback_url: callbackUrl.toString(),
        channels: ["mobile_money"],
        metadata: {
          room_code: request.roomCode,
          round_id: request.roundId,
          player_id: request.playerId,
          phone_number: request.phoneNumber,
        },
      }),
    });
    const envelope = (await response.json()) as PaystackEnvelope<PaystackInitializeData>;
    const authorizationUrl = envelope.data?.authorization_url;
    const returnedReference = envelope.data?.reference;
    if (!response.ok || envelope.status !== true || !authorizationUrl || returnedReference !== request.reference) {
      throw new Error(envelope.message || `Paystack initialization failed with HTTP ${response.status}.`);
    }

    const authorization = new URL(authorizationUrl);
    if (authorization.protocol !== "https:" || authorization.hostname !== "checkout.paystack.com") {
      throw new Error("Paystack returned an unexpected checkout URL.");
    }
    return { enabled: true, authorizationUrl: authorization.toString(), reference: returnedReference };
  }

  async verify(reference: string, expected: { amountMinor: number; currency: string }): Promise<PaystackVerificationResult> {
    if (!this.isConfigured || !this.config.secretKey) {
      throw new Error(DISABLED_MESSAGE);
    }
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(reference)) throw new Error("Payment reference has an invalid format.");

    const response = await this.config.fetchImpl(`${API_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: {
        Authorization: `Bearer ${this.config.secretKey}`,
        Accept: "application/json",
      },
    });
    const envelope = (await response.json()) as PaystackEnvelope<PaystackVerifyData>;
    const transaction = envelope.data;
    if (!response.ok || envelope.status !== true || !transaction) {
      throw new Error(envelope.message || `Paystack verification failed with HTTP ${response.status}.`);
    }
    if (transaction.reference !== reference) throw new Error("Paystack returned a mismatched transaction reference.");

    const status = transaction.status === "success" ? "success" : transaction.status === "pending" ? "pending" : "failed";
    if (status === "success" && (transaction.amount !== expected.amountMinor || transaction.currency !== expected.currency.toUpperCase())) {
      throw new Error("Verified Paystack amount or currency does not match the room entry fee.");
    }
    return {
      status,
      reference,
      amountMinor: Number(transaction.amount ?? 0),
      currency: transaction.currency ?? "",
      providerTransactionId: transaction.id === undefined ? undefined : String(transaction.id),
    };
  }

  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
    if (!this.config.secretKey || !signature) return false;
    const supplied = Buffer.from(signature, "hex");
    const expected = createHmac("sha512", this.config.secretKey).update(rawBody).digest();
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  }
}

export const paystackPaymentAdapter = new PaystackPaymentAdapter({
  enabled: process.env.PAYSTACK_TEST_MODE === "true" && Boolean(process.env.PAYSTACK_SECRET_KEY?.startsWith("sk_test_")),
  secretKey: process.env.PAYSTACK_SECRET_KEY,
  callbackUrl: process.env.PAYSTACK_CALLBACK_URL,
});

export { DISABLED_MESSAGE as PAYSTACK_ADAPTER_DISABLED_MESSAGE };
