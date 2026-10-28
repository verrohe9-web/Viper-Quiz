import { invokeLLM } from "./llm";

export interface GeneratedQuestion {
  question: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: "A" | "B" | "C" | "D";
  difficulty: "easy" | "medium" | "hard";
  explanation?: string;
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part) return String((part as { text?: unknown }).text || "");
      return "";
    })
    .join("\n");
}

function normalizeQuestion(value: unknown): GeneratedQuestion | null {
  if (!value || typeof value !== "object") return null;
  const question = value as Record<string, unknown>;
  const correctAnswer = String(question.correctAnswer || "").trim().toUpperCase();
  const difficulty = String(question.difficulty || "medium").trim().toLowerCase();
  const normalized: GeneratedQuestion = {
    question: String(question.question || "").trim(),
    optionA: String(question.optionA || "").trim(),
    optionB: String(question.optionB || "").trim(),
    optionC: String(question.optionC || "").trim(),
    optionD: String(question.optionD || "").trim(),
    correctAnswer: correctAnswer as GeneratedQuestion["correctAnswer"],
    difficulty: difficulty as GeneratedQuestion["difficulty"],
    explanation: String(question.explanation || "").trim() || undefined,
  };

  const options = [normalized.optionA, normalized.optionB, normalized.optionC, normalized.optionD];
  if (
    !normalized.question ||
    options.some((option) => !option) ||
    new Set(options).size !== 4 ||
    !["A", "B", "C", "D"].includes(normalized.correctAnswer) ||
    !["easy", "medium", "hard"].includes(normalized.difficulty)
  ) {
    return null;
  }

  return normalized;
}

/**
 * Generate questions through the built-in Manus LLM proxy.
 * The proxy currently rejects JSON response_format when web search is enabled,
 * so this intentionally requests plain text and parses the JSON payload locally.
 */
export async function generateQuestionsWithLLM(
  topic: string,
  count = 10,
  difficulty?: "easy" | "medium" | "hard"
): Promise<GeneratedQuestion[] | null> {
  try {
    const difficultyText = difficulty
      ? `All questions must be ${difficulty} difficulty.`
      : "Mix easy, medium, and hard difficulty.";
    const prompt = `Generate exactly ${count} multiple-choice quiz questions about "${topic}". If multiple topics are listed, distribute questions across them as evenly as possible.
${difficultyText}

Return ONLY a JSON array, with no markdown fences or commentary:
[{"question":"Question text?","optionA":"Option A","optionB":"Option B","optionC":"Option C","optionD":"Option D","correctAnswer":"A","difficulty":"easy","explanation":"Brief factual explanation."}]

Quality rules: every question must be clear, unambiguous, factually correct, globally relevant, have four distinct non-empty options, exactly one correct answer, and a concise explanation. Avoid duplicates and avoid time-sensitive claims unless a date is included.`;

    const response = await invokeLLM({
      messages: [{ role: "user", content: prompt }],
    });
    const raw = response as unknown as { error?: unknown; choices?: Array<{ message?: { content?: unknown } }> };
    if (raw.error) {
      throw new Error(typeof raw.error === "string" ? raw.error : JSON.stringify(raw.error));
    }

    const content = extractText(raw.choices?.[0]?.message?.content);
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn("[LLM] No JSON array found in response");
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]) as unknown;
    if (!Array.isArray(parsed)) return null;
    const seen = new Set<string>();
    const questions = parsed
      .map(normalizeQuestion)
      .filter((question): question is GeneratedQuestion => {
        if (!question) return false;
        const key = question.question.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    if (questions.length < count) {
      console.warn(`[LLM] Only ${questions.length}/${count} valid questions returned`);
      return null;
    }

    console.log(`[LLM] Successfully generated ${count} questions for ${topic}`);
    return questions.slice(0, count);
  } catch (error) {
    console.warn(`[LLM] Generation failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
