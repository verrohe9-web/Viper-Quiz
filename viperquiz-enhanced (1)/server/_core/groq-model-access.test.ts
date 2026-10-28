import { describe, expect, it } from "vitest";

describe("Selected Groq model", () => {
  it.skipIf(!process.env.GROQ_API_KEY || !process.env.GROQ_MODEL)("accepts a minimal chat completion request", async () => {
    const apiKey = process.env.GROQ_API_KEY;
    const model = process.env.GROQ_MODEL;
    expect(apiKey).toBeTruthy();
    expect(model).toBeTruthy();

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Reply only OK." }],
        max_tokens: 4,
      }),
    });

    const body = await response.text();
    expect(response.ok, body.slice(0, 500)).toBe(true);
    expect(body).toContain("choices");
  }, 20_000);
});
