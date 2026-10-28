export type DarajaPaymentRequest = {
  roomCode: string;
  roundId: string;
  playerId: string;
  phoneNumber: string;
  amountMinor: number;
  currency: string;
  idempotencyKey: string;
};

export type DarajaPaymentResult =
  | { enabled: false; status: "disabled"; message: string }
  | { enabled: true; status: "initiated"; providerRequestId: string; checkoutRequestId?: string };

export type DarajaCallbackResult =
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

type DarajaConfig = {
  enabled?: boolean;
  baseUrl?: string;
  consumerKey?: string;
  consumerSecret?: string;
  shortcode?: string;
  passkey?: string;
  callbackUrl?: string;
  fetchImpl?: typeof fetch;
};

type OAuthResponse = { access_token?: string; expires_in?: number };
type StkResponse = { MerchantRequestID?: string; CheckoutRequestID?: string; ResponseCode?: string; ResponseDescription?: string; errorMessage?: string };

const DISABLED_MESSAGE = "Daraja payment requests are disabled until a Kenyan M-PESA shortcode/Till/PayBill, callback URL, and production approval are configured.";
const DEFAULT_BASE_URL = "https://sandbox.safaricom.co.ke";
const DEFAULT_SANDBOX_SHORTCODE = "174379";
const DEFAULT_SANDBOX_PASSKEY = "";

const normalizePhone = (phone: string) => {
  const digits = phone.replace(/\D/g, "");
  if (/^07\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  if (/^2547\d{8}$/.test(digits)) return digits;
  throw new Error("Enter a valid Kenyan mobile number beginning with 07 or 2547.");
};

const formatTimestamp = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}${parts.month}${parts.day}${parts.hour}${parts.minute}${parts.second}`;
};

export class DarajaPaymentAdapter {
  private readonly config: Required<Pick<DarajaConfig, "enabled" | "baseUrl" | "fetchImpl">> & Omit<DarajaConfig, "enabled" | "baseUrl" | "fetchImpl">;
  private token: { value: string; expiresAt: number } | null = null;

  constructor(config: DarajaConfig = {}) {
    this.config = {
      enabled: config.enabled ?? Boolean(config.consumerKey && config.consumerSecret && config.callbackUrl),
      baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
      fetchImpl: config.fetchImpl ?? fetch,
      consumerKey: config.consumerKey,
      consumerSecret: config.consumerSecret,
      shortcode: config.shortcode ?? DEFAULT_SANDBOX_SHORTCODE,
      passkey: config.passkey ?? DEFAULT_SANDBOX_PASSKEY,
      callbackUrl: config.callbackUrl,
    };
  }

  async initiate(request: DarajaPaymentRequest): Promise<DarajaPaymentResult> {
    if (!this.config.enabled || !this.config.consumerKey || !this.config.consumerSecret || !this.config.callbackUrl || !this.config.shortcode || !this.config.passkey) {
      return { enabled: false, status: "disabled", message: DISABLED_MESSAGE };
    }
    if (request.currency.toUpperCase() !== "KES") throw new Error("Daraja payments require KES.");
    if (request.amountMinor % 100 !== 0 || request.amountMinor <= 0) throw new Error("Daraja amount must be a positive whole KSh amount.");

    const accessToken = await this.getAccessToken();
    const timestamp = formatTimestamp();
    const password = Buffer.from(`${this.config.shortcode}${this.config.passkey}${timestamp}`).toString("base64");
    const phoneNumber = normalizePhone(request.phoneNumber);
    const response = await this.config.fetchImpl(`${this.config.baseUrl}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        BusinessShortCode: Number(this.config.shortcode),
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: Math.round(request.amountMinor / 100),
        PartyA: phoneNumber,
        PartyB: Number(this.config.shortcode),
        PhoneNumber: phoneNumber,
        CallBackURL: this.config.callbackUrl,
        AccountReference: `VQ-${request.roomCode}-${request.playerId}`.slice(0, 12),
        TransactionDesc: `ViperQuiz ${request.idempotencyKey}`.slice(0, 20),
      }),
    });
    const body = (await response.json()) as StkResponse;
    if (!response.ok || body.ResponseCode !== "0" || !body.MerchantRequestID) {
      throw new Error(body.errorMessage || body.ResponseDescription || `Daraja STK Push failed with HTTP ${response.status}.`);
    }
    return { enabled: true, status: "initiated", providerRequestId: body.MerchantRequestID, checkoutRequestId: body.CheckoutRequestID };
  }

  reconcileCallback(payload: unknown, expected: Pick<DarajaPaymentRequest, "amountMinor" | "currency" | "phoneNumber"> & { providerRequestId: string }): DarajaCallbackResult {
    if (!payload || typeof payload !== "object") return { accepted: false, reason: "Daraja callback payload is not an object." };
    const root = payload as { Body?: { stkCallback?: Record<string, unknown> } };
    const callback = root.Body?.stkCallback;
    if (!callback) return { accepted: false, reason: "Missing Body.stkCallback." };
    const providerRequestId = typeof callback.MerchantRequestID === "string" ? callback.MerchantRequestID.trim() : "";
    if (!providerRequestId || providerRequestId !== expected.providerRequestId) return { accepted: false, reason: "Callback MerchantRequestID does not match the payment attempt." };
    const resultCode = callback.ResultCode;
    const status = resultCode === 0 ? "paid" : resultCode === undefined ? null : "failed";
    if (!status) return { accepted: false, reason: "Missing callback ResultCode." };
    const items = Array.isArray((callback.CallbackMetadata as { Item?: unknown[] } | undefined)?.Item)
      ? ((callback.CallbackMetadata as { Item: unknown[] }).Item as Array<{ Name?: unknown; Value?: unknown }>)
      : [];
    const item = (name: string) => items.find((entry) => entry.Name === name)?.Value;
    const amount = Number(item("Amount"));
    const phone = item("PhoneNumber") === undefined ? undefined : String(item("PhoneNumber"));
    const expectedPhone = normalizePhone(expected.phoneNumber);
    if (status === "paid" && (amount !== Math.round(expected.amountMinor / 100) || phone !== expectedPhone)) {
      return { accepted: false, reason: "Successful callback amount or phone does not match the expected payment." };
    }
    const receipt = item("MpesaReceiptNumber");
    return { accepted: true, providerRequestId, providerTransactionId: receipt === undefined ? undefined : String(receipt), status, amountMinor: expected.amountMinor, currency: "KES", phoneNumber: phone };
  }

  private async getAccessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 30_000) return this.token.value;
    const basic = Buffer.from(`${this.config.consumerKey}:${this.config.consumerSecret}`).toString("base64");
    const response = await this.config.fetchImpl(`${this.config.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { Authorization: `Basic ${basic}`, Accept: "application/json" },
    });
    const body = (await response.json()) as OAuthResponse & { errorMessage?: string };
    if (!response.ok || !body.access_token) throw new Error(body.errorMessage || `Daraja OAuth failed with HTTP ${response.status}.`);
    this.token = { value: body.access_token, expiresAt: Date.now() + Math.max(60, body.expires_in ?? 3600) * 1000 };
    return body.access_token;
  }
}

export const darajaPaymentAdapter = new DarajaPaymentAdapter({
  enabled: process.env.DARAJA_ENABLED === "true",
  baseUrl: process.env.DARAJA_BASE_URL ?? DEFAULT_BASE_URL,
  consumerKey: process.env.DARAJA_CONSUMER_KEY,
  consumerSecret: process.env.DARAJA_CONSUMER_SECRET,
  shortcode: process.env.DARAJA_SHORTCODE,
  passkey: process.env.DARAJA_PASSKEY,
  callbackUrl: process.env.DARAJA_CALLBACK_URL,
});

export { DEFAULT_SANDBOX_PASSKEY, DEFAULT_SANDBOX_SHORTCODE, DISABLED_MESSAGE as DARAJA_ADAPTER_DISABLED_MESSAGE, normalizePhone };
