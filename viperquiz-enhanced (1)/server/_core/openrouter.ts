import { ENV } from "./env";

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

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
// Use GPT-4 for superior question generation quality and reliability
const MODEL = "openai/gpt-4-turbo";

// Category-specific prompt templates for better question relevance
const CATEGORY_PROMPTS: Record<string, string> = {
  Bible: "Generate questions about Biblical stories, figures, events, and teachings. Focus on Old Testament and New Testament knowledge.",
  Christianity: "Generate questions about Christian theology, denominations, practices, and historical events in Christianity.",
  Prayers: "Generate questions about famous prayers, prayer practices, religious rituals, and spiritual traditions.",
  Science: "Generate questions about general science topics including biology, physics, chemistry, and earth science.",
  "General Knowledge": "Generate questions about diverse topics including history, geography, culture, and current events.",
  Kenya: "Generate questions specifically about Kenya - geography, history, culture, wildlife, government, economy, and notable landmarks.",
  Geography: "Generate questions about world geography, capitals, borders, landmarks, climate zones, and geographical features.",
  History: "Generate questions about world history, historical events, famous figures, civilizations, and historical periods.",
  "Cricket/Sports": "Generate questions about cricket, football, basketball, tennis, and other major sports. Include rules, famous players, and tournaments.",
  Technology: "Generate questions about computers, software, internet, artificial intelligence, programming, and technological innovations.",
  Biology: "Generate questions about living organisms, cells, genetics, evolution, ecology, and human anatomy.",
  Physics: "Generate questions about mechanics, energy, waves, electricity, magnetism, and modern physics concepts.",
  Chemistry: "Generate questions about elements, compounds, chemical reactions, atomic structure, and periodic table.",
  Mathematics: "Generate questions about algebra, geometry, calculus, statistics, and mathematical concepts.",
  Bollywood: "Generate questions about Indian cinema (Bollywood), famous actors, movies, music, and entertainment industry.",
  "Football History": "Generate questions about football (soccer) history, legendary players, famous matches, World Cup tournaments, iconic teams, and memorable moments in football.",
};

// Cache to store generated questions per category to prevent repetition
// Structure: { category: [{ questions: GeneratedQuestion[], timestamp: number }, ...] }
const questionCache: Record<string, Array<{ questions: GeneratedQuestion[]; timestamp: number }>> = {};
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CACHED_SETS_PER_CATEGORY = 5; // Keep up to 5 different question sets per category

function getNextCachedQuestions(category: string): GeneratedQuestion[] | null {
  const cached = questionCache[category];
  if (!cached || cached.length === 0) return null;

  // Remove expired cache entries
  const now = Date.now();
  questionCache[category] = cached.filter((item) => now - item.timestamp < CACHE_EXPIRY_MS);

  if (questionCache[category].length === 0) return null;

  // Return the first cached set and rotate it to the end (round-robin)
  const firstSet = questionCache[category].shift();
  if (firstSet) {
    questionCache[category].push(firstSet);
    return firstSet.questions;
  }

  return null;
}

function cacheQuestions(category: string, questions: GeneratedQuestion[]): void {
  if (!questionCache[category]) {
    questionCache[category] = [];
  }

  // Add new questions to cache
  questionCache[category].push({
    questions,
    timestamp: Date.now(),
  });

  // Keep only the most recent MAX_CACHED_SETS_PER_CATEGORY sets
  if (questionCache[category].length > MAX_CACHED_SETS_PER_CATEGORY) {
    questionCache[category] = questionCache[category].slice(-MAX_CACHED_SETS_PER_CATEGORY);
  }
}

function getCategoryPrompt(category: string): string {
  return CATEGORY_PROMPTS[category] || `Generate questions about ${category}`;
}

export async function generateQuestionsWithOpenRouter(
  category: string,
  count: number = 10,
  difficulty?: "easy" | "medium" | "hard",
  customTopic?: string
): Promise<GeneratedQuestion[]> {
  if (!ENV.openrouterApiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }

  // DISABLED: Cache rotation was causing question repetition across game rooms
  // Always generate fresh questions to ensure uniqueness
  // const cachedQuestions = getNextCachedQuestions(category);
  // if (cachedQuestions) {
  //   console.log(`[OpenRouter] Using cached questions for ${category} (${cachedQuestions.length} questions)`);
  //   return cachedQuestions;
  // }

  // Use custom topic if provided, otherwise use category
  const topicText = customTopic ? `"${customTopic}"` : `"${category}"`;
  const categoryGuidance = customTopic ? `Generate questions about ${customTopic}` : getCategoryPrompt(category);
  const difficultyText = difficulty ? `All questions must be ${difficulty} difficulty.` : "Mix difficulty levels: aim for 3-4 easy, 3-4 medium, 3-4 hard";
  
  const prompt = `${categoryGuidance}

Generate ${count} multiple-choice quiz questions for the ${topicText} category.
${difficultyText} 
  
  Return ONLY a valid JSON array with this exact structure (no markdown, no extra text):
  [
    {
      "question": "Question text here?",
      "optionA": "Option A",
      "optionB": "Option B",
      "optionC": "Option C",
      "optionD": "Option D",
      "correctAnswer": "A",
      "difficulty": "easy",
      "explanation": "Brief explanation of why the answer is correct."
    }
  ]
  
  Requirements:
  - Each question must have exactly 4 options (A, B, C, D)
  - correctAnswer must be one of: "A", "B", "C", or "D"
  - difficulty must be one of: "easy", "medium", or "hard"
  - Mix difficulty levels: aim for 3-4 easy, 3-4 medium, 3-4 hard
  - Questions should be relevant to "${category}"
  - Make questions clear and unambiguous
  - Ensure the correct answer is actually correct
  - Include a concise explanation of the answer
  - All four options must be distinct and non-empty
  - Return ONLY the JSON array, nothing else`;

  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ENV.openrouterApiKey}`,
        "HTTP-Referer": "https://viperquiz.manus.space",
        "X-Title": "ViperQuiz",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`[OpenRouter] API error: ${response.status}`, error);
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    const content = data.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response content from OpenRouter");
    }

    // Parse the JSON response
    const questions = JSON.parse(content) as GeneratedQuestion[];

    // Validate questions
    if (!Array.isArray(questions)) {
      throw new Error("Response is not an array");
    }

    if (questions.length === 0) {
      throw new Error("No questions generated");
    }

    // Validate each question
    for (const q of questions) {
      if (
        !q.question ||
        !q.optionA ||
        !q.optionB ||
        !q.optionC ||
        !q.optionD ||
        !q.correctAnswer ||
        !q.difficulty
      ) {
        throw new Error("Invalid question structure");
      }

      if (!["A", "B", "C", "D"].includes(q.correctAnswer)) {
        throw new Error(`Invalid correctAnswer: ${q.correctAnswer}`);
      }

      if (!["easy", "medium", "hard"].includes(q.difficulty)) {
        throw new Error(`Invalid difficulty: ${q.difficulty}`);
      }
    }

    console.log(`[OpenRouter] Generated ${questions.length} questions for ${category}`);
    
    // Cache the generated questions
    cacheQuestions(category, questions);
    
    return questions;
  } catch (error) {
    console.error(`[OpenRouter] Error generating questions:`, error);
    throw error;
  }
}
