import { describe, expect, it } from "vitest";

describe("Neon credentials", () => {
  it.skipIf(!process.env.NEON_API_KEY)("authenticates the configured Neon API key", async () => {
    const apiKey = process.env.NEON_API_KEY;
    expect(apiKey, "NEON_API_KEY must be configured for this credential check").toBeTruthy();

    const response = await fetch("https://console.neon.tech/api/v2/projects", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    expect(response.ok).toBe(true);
    const body = await response.json() as { projects?: unknown[] };
    expect(Array.isArray(body.projects)).toBe(true);
  }, 20_000);
});
