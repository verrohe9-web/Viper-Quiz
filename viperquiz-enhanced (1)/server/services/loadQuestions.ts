import fs from "fs";
import path from "path";

export interface Question {
  id: number;
  category: string;
  question: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: "A" | "B" | "C" | "D";
  difficulty: "easy" | "medium" | "hard";
}

let cachedQuestions: Question[] = [];

export function loadQuestionsFromFile(): Question[] {
  if (cachedQuestions.length > 0) {
    return cachedQuestions;
  }

  try {
    const filePath = path.join(process.cwd(), "questions_1000.json");
    const fileContent = fs.readFileSync(filePath, "utf-8");
    cachedQuestions = JSON.parse(fileContent) as Question[];
    console.log(`[Questions] Loaded ${cachedQuestions.length} questions from file`);
    return cachedQuestions;
  } catch (error) {
    console.error("[Questions] Failed to load questions from file:", error);
    return [];
  }
}

export function getQuestionsByCategory(category: string): Question[] {
  const questions = loadQuestionsFromFile();
  return questions.filter((q) => q.category === category);
}

export function getAllCategories(): string[] {
  const questions = loadQuestionsFromFile();
  const categories = new Set(questions.map((q) => q.category));
  return Array.from(categories).sort();
}

export function getRandomQuestion(category: string): Question | undefined {
  const questions = getQuestionsByCategory(category);
  if (questions.length === 0) return undefined;
  return questions[Math.floor(Math.random() * questions.length)];
}
