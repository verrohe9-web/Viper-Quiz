import { beforeEach, describe, expect, it, vi } from "vitest";
import { invokeLLM } from "./llm";
import { generateQuestionsWithLLM } from "./llm-questions";

vi.mock("./llm", () => ({
  invokeLLM: vi.fn(),
}));

const mockedInvokeLLM = vi.mocked(invokeLLM);

const validQuestion = (index: number) => ({
  question: `Question ${index}?`,
  optionA: `Option ${index}A`,
  optionB: `Option ${index}B`,
  optionC: `Option ${index}C`,
  optionD: `Option ${index}D`,
  correctAnswer: "A",
  difficulty: "medium",
  explanation: `Explanation for question ${index}.`,
});

describe("built-in LLM question generation", () => {
  beforeEach(() => mockedInvokeLLM.mockReset());

  it("parses plain-text JSON responses and preserves explanations", async () => {
    mockedInvokeLLM.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify([validQuestion(1), validQuestion(2)]) } }],
    } as never);

    const questions = await generateQuestionsWithLLM("Astrobiology", 2, "medium");

    expect(questions).toHaveLength(2);
    expect(questions?.[0].explanation).toContain("Explanation");
    expect(mockedInvokeLLM).toHaveBeenCalledWith(expect.objectContaining({ messages: expect.any(Array) }));
  });

  it("returns null for proxy error payloads instead of treating them as questions", async () => {
    mockedInvokeLLM.mockResolvedValue({
      error: { type: "invalid_request_error", message: "temporary upstream failure" },
    } as never);

    await expect(generateQuestionsWithLLM("Astrobiology", 2)).resolves.toBeNull();
  });

  it("rejects duplicate or incomplete generated questions", async () => {
    mockedInvokeLLM.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify([validQuestion(1), validQuestion(1)]) } }],
    } as never);

    await expect(generateQuestionsWithLLM("Astrobiology", 2)).resolves.toBeNull();
  });
});
