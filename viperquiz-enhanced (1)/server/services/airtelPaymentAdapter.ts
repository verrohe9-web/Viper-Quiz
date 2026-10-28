export type AirtelMoneyRequest = {
  roomCode: string;
  roundId: string;
  playerId: string;
  phoneNumber: string;
  amountMinor: number;
  currency: string;
  idempotencyKey: string;
};

export type AirtelPaymentResult =
  | { enabled: false; status: "disabled"; message: string }
  | { enabled: true; status: "initiated"; providerRequestId: string; providerTransactionId?: string };

export type AirtelCallbackResult =
  | { accepted: false; reason: string }
  | {
      accepted: true;
      providerRequestId: string;
      providerTransactionId?: string;
      status: "paid" | "failed";
      amountMinor: number;
      currency: "KES";
      phoneNumber?: string;
    };

type AirtelConfig = {
  enabled?: boolean;
  baseUrl?: string;
  apiKey?: string;
  clientId?: string;
  clientSecret?: string;
  shortcode?: string;
  callbackUrl?: string;
  fetchImpl?: typeof fetch;
};

const DISABLED_MESSAGE =
  "Airtel Money Kenya payment requests are disabled until the Airtel developer onboarding, API credentials, callback URL, and operating-company approval are configured.";

const DEFAULT_BASE_URL = "https://sandboxapi.airtel.africa";

export const normalizePhone = (phone: string) => {
  const digits = phone.replace(/\D/g, "");
  if (/^07\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  if (/^2547\d{8}$/.test(digits)) return digits;
  throw new Error("Enter a valid Kenyan mobile number beginning with 07 or 2547.");
};

export class AirtelMoneyAdapter {
  private readonly config: Required<Pick<AirtelConfig, "enabled" | "baseUrl" | "fetchImpl">> & Omit<AirtelConfig, "enabled" | "baseUrl" | "fetchImpl">;

  constructor(config: AirtelConfig = {}) {
    this.config = {
      enabled: config.enabled ?? Boolean(config.apiKey && config.clientId && config.clientSecret && config.callbackUrl),
      baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
      fetchImpl: config.fetchImpl ?? fetch,
      apiKey: config.apiKey,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      shortcode: config.shortcode,
      callbackUrl: config.callbackUrl,
    };
  }

  async initiate(request: AirtelMoneyRequest): Promise<AirtelPaymentResult> {
    if (
      !this.config.enabled ||
      !this.config.apiKey ||
      !this.config.clientId ||
      !this.config.clientSecret ||
      !this.config.callbackUrl ||
      !this.config.shortcode
    ) {
      return { enabled: false, status: "disabled", message: DISABLED_MESSAGE };
    }

    if (request.currency.toUpperCase() !== "KES") {
      throw new Error("Airtel Money payments require KES.");
    }

    if (request.amountMinor <= 0 || request.amountMinor % 100 !== 0) {
      throw new Error("Airtel Money amount must be a positive whole KSh amount.");
    }

    // This is a scaffold only. The real Airtel Kenya API contract must be verified against
    // the official Airtel developer portal before enabling live calls.
    const providerRequestId = `airtel-${request.idempotencyKey}`;
    return {
      enabled: true,
      status: "initiated",
      providerRequestId,
      providerTransactionId: undefined,
    };
  }

  reconcileCallback(
    payload: unknown,
    expected: Pick<AirtelMoneyRequest, "amountMinor" | "currency" | "phoneNumber"> & { providerRequestId: string }
  ): AirtelCallbackResult {
    if (!payload || typeof payload !== "object") {
      return { accepted: false, reason: "Airtel callback payload is not an object." };
    }

    const root = payload as Record<string, unknown>;
    const providerRequestId = typeof root.providerRequestId === "string" ? root.providerRequestId.trim() : "";
    if (!providerRequestId || providerRequestId !== expected.providerRequestId) {
      return { accepted: false, reason: "Airtel callback request ID does not match the payment attempt." };
    }

    const statusValue = root.status;
    const status = statusValue === "success" || statusValue === "paid" ? "paid" : statusValue === "failed" ? "failed" : null;

    if (!status) {
      return { accepted: false, reason: "Missing Airtel callback status." };
    }

    const amount = Number(root.amount);
    const phone = typeof root.phoneNumber === "string" ? root.phoneNumber : undefined;
    const expectedPhone = normalizePhone(expected.phoneNumber);

    if (status === "paid" && (Number.isNaN(amount) || amount !== Math.round(expected.amountMinor / 100) || (phone && phone !== expectedPhone))) {
      return { accepted: false, reason: "Successful callback amount or phone does not match the expected payment." };
    }

    return {
      accepted: true,
      providerRequestId,
      providerTransactionId: typeof root.transactionId === "string" ? root.transactionId : undefined,
      status,
      amountMinor: expected.amountMinor,
      currency: "KES",
      phoneNumber: phone,
    };
  }
}

export const airtelPaymentAdapter = new AirtelMoneyAdapter({
  enabled: process.env.AIRTEL_ENABLED === "true",
  baseUrl: process.env.AIRTEL_BASE_URL ?? DEFAULT_BASE_URL,
  apiKey: process.env.AIRTEL_API_KEY,
  clientId: process.env.AIRTEL_CLIENT_ID,
  clientSecret: process.env.AIRTEL_CLIENT_SECRET,
  shortcode: process.env.AIRTEL_SHORTCODE,
  callbackUrl: process.env.AIRTEL_CALLBACK_URL,
});

export { DISABLED_MESSAGE as AIRTEL_ADAPTER_DISABLED_MESSAGE, DEFAULT_BASE_URL as AIRTEL_DEFAULT_BASE_URL };
