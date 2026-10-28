import { describe, expect, it } from "vitest";

describe("Groq credentials", () => {
  it.skipIf(!process.env.GROQ_API_KEY)("authenticates against the Groq models endpoint", async () => {
    const apiKey = process.env.GROQ_API_KEY;
    expect(apiKey).toBeTruthy();

    const response = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    expect(response.ok).toBe(true);
    const body = (await response.json()) as { data?: unknown[] };
    expect(Array.isArray(body.data)).toBe(true);
  }, 20_000);
});
