import axios from "axios";

const DEVX_API_URL = "https://api.devx.com/v1";
const DEVX_API_KEY = process.env.DEVX_API_KEY || "";
const DEVX_MODEL = "gpt-4";
const DEVX_TIMEOUT = 10000; // 10 seconds

interface QuestionGenerationRequest {
  category: string;
  count: number;
}

interface GeneratedQuestion {
  question: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: "A" | "B" | "C" | "D";
  difficulty: "easy" | "medium" | "hard";
}

/**
 * Generate quiz questions using DevX API (Primary tier)
 * Falls back to OpenRouter if this fails
 */
export async function generateQuestionsWithDevX(
  category: string,
  count: number,
  difficulty?: "easy" | "medium" | "hard",
  customTopic?: string
): Promise<GeneratedQuestion[] | null> {
  if (!DEVX_API_KEY) {
    console.log("[DevX] API key not configured, skipping DevX generation");
    return null;
  }

  try {
    console.log(`[DevX] Generating ${count} questions for category: ${category}`);

    let topicText = customTopic ? `specifically about "${customTopic}"` : `about "${category}"`;
    let difficultyText = difficulty ? `All questions must be ${difficulty} difficulty.` : "Vary difficulty levels (easy, medium, hard).";
    
    const prompt = `Generate exactly ${count} multiple-choice quiz questions ${topicText}.
${difficultyText}
    
Return a JSON array with this exact structure for each question:
{
  "question": "The question text",
  "optionA": "Option A",
  "optionB": "Option B",
  "optionC": "Option C",
  "optionD": "Option D",
  "correctAnswer": "A",
  "difficulty": "medium"
}

Ensure:
- Difficulty is one of: easy, medium, hard
- correctAnswer is one of: A, B, C, D
- All fields are strings
- Return ONLY the JSON array, no markdown or extra text`;

    const response = await axios.post(
      `${DEVX_API_URL}/chat/completions`,
      {
        model: DEVX_MODEL,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 4000,
      },
      {
        headers: {
          Authorization: `Bearer ${DEVX_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: DEVX_TIMEOUT,
      }
    );

    const content = response.data.choices?.[0]?.message?.content;
    if (!content) {
      console.warn("[DevX] No content in response");
      return null;
    }

    // Parse JSON from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn("[DevX] Could not find JSON array in response");
      return null;
    }

    const questions = JSON.parse(jsonMatch[0]) as GeneratedQuestion[];

    // Validate questions
    const validQuestions = questions.filter((q) => {
      return (
        q.question &&
        q.optionA &&
        q.optionB &&
        q.optionC &&
        q.optionD &&
        ["A", "B", "C", "D"].includes(q.correctAnswer) &&
        ["easy", "medium", "hard"].includes(q.difficulty)
      );
    });

    if (validQuestions.length === 0) {
      console.warn("[DevX] No valid questions generated");
      return null;
    }

    console.log(`[DevX] Successfully generated ${validQuestions.length} questions`);
    return validQuestions;
  } catch (error: any) {
    console.warn(`[DevX] Generation failed: ${error.message}`);
    return null;
  }
}
