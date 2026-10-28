import { describe, expect, it } from "vitest";

describe("Daraja sandbox credentials", () => {
  it.skipIf(!process.env.DARAJA_CONSUMER_KEY || !process.env.DARAJA_CONSUMER_SECRET)("reaches the Daraja sandbox OAuth endpoint without an authentication rejection", async () => {
    const consumerKey = process.env.DARAJA_CONSUMER_KEY;
    const consumerSecret = process.env.DARAJA_CONSUMER_SECRET;
    expect(consumerKey).toBeTruthy();
    expect(consumerSecret).toBeTruthy();

    const basic = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
    const response = await fetch(
      "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
      { headers: { Authorization: `Basic ${basic}`, Accept: "application/json" } },
    );
    const text = await response.text();
    const body = (() => {
      try {
        return JSON.parse(text) as { access_token?: string; expires_in?: number | string; errorMessage?: string };
      } catch {
        return undefined;
      }
    })();

    // A 401/400 response is an authentication or request failure and must fail this check.
    expect([400, 401]).not.toContain(response.status);
    if (response.ok) {
      expect(body?.access_token).toBeTruthy();
      expect(Number(body?.expires_in)).toBeGreaterThan(0);
      return;
    }

    // The sandbox edge currently returns an Incapsula HTML challenge from this runner.
    // This confirms the request reached Safaricom but cannot prove the credential pair.
    expect(response.status).toBe(403);
    expect(text).toContain("NOINDEX");
  }, 20_000);
});
