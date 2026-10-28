import axios from "axios";

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

const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = process.env.GROQ_MODEL || "";
const GROQ_TIMEOUT = 20_000;
const BATCH_SIZE = 5;
const BATCH_ATTEMPTS = 3;

function isValidQuestion(q: GeneratedQuestion): boolean {
  const options = [q.optionA, q.optionB, q.optionC, q.optionD].map((value) => String(value || "").trim());
  return Boolean(
    q.question?.trim() &&
      options.every(Boolean) &&
      new Set(options).size === 4 &&
      ["A", "B", "C", "D"].includes(q.correctAnswer) &&
      ["easy", "medium", "hard"].includes(q.difficulty) &&
      (!q.explanation || q.explanation.trim().length >= 10),
  );
}

function parseQuestions(content: unknown): GeneratedQuestion[] {
  if (typeof content !== "string") return [];
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return Array.isArray(parsed) ? parsed.filter(isValidQuestion) : [];
  } catch {
    return [];
  }
}

async function generateBatch(
  topic: string,
  count: number,
  difficulty: "easy" | "medium" | "hard" | undefined,
  excludedQuestions: string[],
): Promise<GeneratedQuestion[]> {
  const difficultyText = difficulty
    ? `All questions must be ${difficulty} difficulty.`
    : "Mix easy, medium, and hard difficulty.";
  const exclusionText = excludedQuestions.length
    ? `Do not repeat or closely paraphrase these already-used questions:\n${excludedQuestions.map((q) => `- ${q}`).join("\n")}`
    : "";
  const prompt = `Generate exactly ${count} independent multiple-choice quiz questions about "${topic}".
${difficultyText}
${exclusionText}

Return ONLY a valid JSON array with exactly ${count} objects, with no markdown or commentary:
[{"question":"Q?","optionA":"A","optionB":"B","optionC":"C","optionD":"D","correctAnswer":"A","difficulty":"easy","explanation":"Brief explanation."}]

Every object must have four distinct non-empty options, exactly one correct answer, a concise explanation, and no duplicate or ambiguous question.`;

  const response = await axios.post(
    GROQ_API_URL,
    {
      model: GROQ_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.65,
      max_tokens: 2200,
    },
    {
      headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
      timeout: GROQ_TIMEOUT,
    },
  );
  return parseQuestions(response.data.choices?.[0]?.message?.content);
}

/** Generate an exact question set. Larger rounds are split into small requests to avoid truncation. */
export async function generateQuestionsWithGroq(
  topic: string,
  count: number = 10,
  difficulty?: "easy" | "medium" | "hard",
): Promise<GeneratedQuestion[] | null> {
  if (!GROQ_API_KEY || !GROQ_MODEL) {
    console.log("[Groq] API key or enabled GROQ_MODEL not configured; Groq-only generation cannot continue");
    return null;
  }

  const target = Math.min(20, Math.max(1, Math.floor(count)));
  const questions: GeneratedQuestion[] = [];
  const seen = new Set<string>();
  let batchNumber = 0;

  while (questions.length < target && batchNumber < Math.ceil(target / BATCH_SIZE) + 2) {
    const remaining = target - questions.length;
    const requested = Math.min(BATCH_SIZE, remaining);
    let batch: GeneratedQuestion[] = [];

    for (let attempt = 1; attempt <= BATCH_ATTEMPTS && batch.length < requested; attempt++) {
      try {
        console.log(`[Groq] Generating batch ${batchNumber + 1}: ${requested} questions for ${topic} (attempt ${attempt})`);
        const candidate = await generateBatch(topic, requested, difficulty, questions.map((q) => q.question));
        const unique = candidate.filter((q) => {
          const key = q.question.trim().toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        batch = unique.slice(0, requested);
        if (batch.length < requested) console.warn(`[Groq] Batch returned ${batch.length}/${requested} unique valid questions`);
      } catch (error: any) {
        console.warn(`[Groq] Batch ${batchNumber + 1} attempt ${attempt} failed: ${error?.message || error}`);
      }
    }

    if (batch.length === 0) return null;
    questions.push(...batch);
    batchNumber += 1;
  }

  if (questions.length !== target) {
    console.warn(`[Groq] Could not complete set: ${questions.length}/${target}`);
    return null;
  }
  console.log(`[Groq] ✓ Generated exact set of ${questions.length} questions`);
  return questions;
}
