import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface GeneratedQuestion {
  question: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: "A" | "B" | "C" | "D";
  difficulty: "easy" | "medium" | "hard";
}

const categoryPrompts: Record<string, string> = {
  Science:
    "Generate a challenging multiple-choice science question about physics, chemistry, biology, or earth sciences.",
  "General Knowledge":
    "Generate a challenging multiple-choice general knowledge question about history, culture, or world facts.",
  India: "Generate a challenging multiple-choice question about India, including history, culture, geography, or politics.",
  "Bollywood/Movies":
    "Generate a challenging multiple-choice question about Bollywood films, actors, directors, or Indian cinema.",
  "Cricket/Sports":
    "Generate a challenging multiple-choice question about cricket, sports, athletes, or sporting events.",
  History:
    "Generate a challenging multiple-choice question about world history, historical events, or famous historical figures.",
  Geography:
    "Generate a challenging multiple-choice question about world geography, countries, capitals, or geographical features.",
  Technology:
    "Generate a challenging multiple-choice question about technology, computers, programming, or innovation.",
  Bible: "Generate a challenging multiple-choice question about the Bible, biblical stories, characters, or verses.",
  Christianity:
    "Generate a challenging multiple-choice question about Christianity, Christian theology, church history, or religious practices.",
  "Christian History":
    "Generate a challenging multiple-choice question about the history of Christianity, important figures, and major events.",
  "Biblical Theology":
    "Generate a challenging multiple-choice question about Christian theology, doctrine, and religious concepts.",
  Prayers:
    "Generate a challenging multiple-choice question about prayers, prayer traditions, famous prayers, or the practice of prayer in various religions.",
};

async function generateQuestion(
  category: string,
  difficulty: "easy" | "medium" | "hard" = "medium"
): Promise<GeneratedQuestion> {
  const prompt = categoryPrompts[category] || categoryPrompts["General Knowledge"];

  const difficultyInstructions = {
    easy: "Make it relatively straightforward but still educational.",
    medium: "Make it moderately challenging, requiring some knowledge.",
    hard: "Make it quite challenging, requiring deep knowledge.",
  };

  const fullPrompt = `${prompt}
  
Difficulty level: ${difficulty} - ${difficultyInstructions[difficulty]}

Format your response as a JSON object with this exact structure:
{
  "question": "The question text here?",
  "optionA": "First option",
  "optionB": "Second option",
  "optionC": "Third option",
  "optionD": "Fourth option",
  "correctAnswer": "A",
  "difficulty": "${difficulty}"
}

Important: 
- The correct answer must be one of: A, B, C, or D
- All options should be plausible but only one correct
- Make the question clear and unambiguous
- Ensure the options are distinct and not overlapping
- Return ONLY the JSON object, no other text`;

  try {
    const message = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "user",
          content: fullPrompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    if (!message.choices || !message.choices[0] || !message.choices[0].message) {
      throw new Error("Invalid response structure from OpenAI");
    }

    const content = message.choices[0].message.content;
    if (!content) {
      throw new Error("Empty response from OpenAI");
    }

    // Extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Could not parse JSON from OpenAI response");
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate the response structure
    if (
      !parsed.question ||
      !parsed.optionA ||
      !parsed.optionB ||
      !parsed.optionC ||
      !parsed.optionD ||
      !["A", "B", "C", "D"].includes(parsed.correctAnswer)
    ) {
      throw new Error("Invalid question structure from OpenAI");
    }

    return {
      question: parsed.question,
      optionA: parsed.optionA,
      optionB: parsed.optionB,
      optionC: parsed.optionC,
      optionD: parsed.optionD,
      correctAnswer: parsed.correctAnswer,
      difficulty: difficulty,
    };
  } catch (error) {
    console.error("Error generating question:", error);
    throw error;
  }
}

export { generateQuestion };
