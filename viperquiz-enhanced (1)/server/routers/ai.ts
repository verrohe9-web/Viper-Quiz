import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import {
  createCustomCategory,
  getCustomCategoryById,
  getActiveCustomCategories,
  updateCustomCategoryStatus,
  insertAIGeneratedQuestions,
  getAIGeneratedQuestionsByCategory,
  updateCustomCategoryQuestionCount,
} from "../db";

const QUESTIONS_PER_CATEGORY = 10;

export const aiRouter = router({
  // Request a new custom category with AI-generated questions
  generateCustomCategory: publicProcedure
    .input(
      z.object({
        categoryName: z.string().min(3).max(100),
        categoryDescription: z.string().min(10).max(500),
        userId: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        // Create the custom category in the database
        const categoryResult = await createCustomCategory({
          name: input.categoryName,
          description: input.categoryDescription,
          creatorId: input.userId || 1, // Default to user 1 if not provided
          status: "pending",
          questionCount: 0,
        });

        const categoryId = (categoryResult as any).insertId;

        // Generate questions using AI with structured JSON schema
        const prompt = `Generate exactly ${QUESTIONS_PER_CATEGORY} multiple-choice quiz questions for the category: "${input.categoryName}".

Category Description: ${input.categoryDescription}

Requirements:
- Each question must be unique and educational
- Distribute difficulty levels: ${Math.ceil(QUESTIONS_PER_CATEGORY / 3)} easy, ${Math.ceil(QUESTIONS_PER_CATEGORY / 3)} medium, ${Math.ceil(QUESTIONS_PER_CATEGORY / 3)} hard
- Each question must have exactly 4 options (A, B, C, D)
- Only one option can be correct
- Options should be plausible but clearly distinguishable
- Avoid trick questions or ambiguous answers
- Return valid JSON only, no markdown or extra text`;

        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content:
                "You are an expert quiz question generator. Generate educational, clear, and well-structured multiple-choice questions.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "quiz_questions",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  questions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        question: {
                          type: "string",
                          description: "The quiz question text",
                        },
                        optionA: {
                          type: "string",
                          description: "Option A",
                        },
                        optionB: {
                          type: "string",
                          description: "Option B",
                        },
                        optionC: {
                          type: "string",
                          description: "Option C",
                        },
                        optionD: {
                          type: "string",
                          description: "Option D",
                        },
                        correctAnswer: {
                          type: "string",
                          enum: ["A", "B", "C", "D"],
                          description: "The correct answer (A, B, C, or D)",
                        },
                        difficulty: {
                          type: "string",
                          enum: ["easy", "medium", "hard"],
                          description: "Question difficulty level",
                        },
                        explanation: {
                          type: "string",
                          description: "Brief explanation of why the answer is correct",
                        },
                      },
                      required: [
                        "question",
                        "optionA",
                        "optionB",
                        "optionC",
                        "optionD",
                        "correctAnswer",
                        "difficulty",
                      ],
                      additionalProperties: false,
                    },
                    minItems: QUESTIONS_PER_CATEGORY,
                    maxItems: QUESTIONS_PER_CATEGORY,
                  },
                },
                required: ["questions"],
                additionalProperties: false,
              },
            },
          },
        });

        // Parse the AI response
        const content = response.choices[0]?.message.content;
        if (!content) {
          throw new Error("No response from AI");
        }

        const parsedContent = typeof content === "string" ? JSON.parse(content) : content;
        const generatedQuestions = parsedContent.questions || [];

        if (generatedQuestions.length !== QUESTIONS_PER_CATEGORY) {
          throw new Error(
            `Expected ${QUESTIONS_PER_CATEGORY} questions, got ${generatedQuestions.length}`
          );
        }

        // Insert the generated questions into the database
        const questionsToInsert = generatedQuestions.map(
          (q: {
            question: string;
            optionA: string;
            optionB: string;
            optionC: string;
            optionD: string;
            correctAnswer: string;
            difficulty: string;
            explanation?: string;
          }) => ({
            categoryId,
            question: q.question,
            optionA: q.optionA,
            optionB: q.optionB,
            optionC: q.optionC,
            optionD: q.optionD,
            correctAnswer: q.correctAnswer,
            difficulty: q.difficulty,
            explanation: q.explanation,
          })
        );

        await insertAIGeneratedQuestions(questionsToInsert);

        // Update category status to active and set question count
        await updateCustomCategoryStatus(categoryId, "active");
        await updateCustomCategoryQuestionCount(categoryId, QUESTIONS_PER_CATEGORY);

        return {
          success: true,
          categoryId,
          categoryName: input.categoryName,
          questionCount: QUESTIONS_PER_CATEGORY,
          questions: generatedQuestions,
        };
      } catch (error: any) {
        console.error("[AI] Error generating custom category:", error);
        return {
          success: false,
          error: error?.message || "Failed to generate custom category",
        };
      }
    }),

  // Get all active custom categories
  getCustomCategories: publicProcedure.query(async () => {
    try {
      const categories = await getActiveCustomCategories();
      return {
        success: true,
        categories: categories.map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          questionCount: c.questionCount,
          createdAt: c.createdAt,
        })),
      };
    } catch (error: any) {
      console.error("[AI] Error fetching custom categories:", error);
      return {
        success: false,
        error: error?.message || "Failed to fetch custom categories",
        categories: [],
      };
    }
  }),

  // Get questions for a specific custom category
  getCustomCategoryQuestions: publicProcedure
    .input(z.object({ categoryId: z.number() }))
    .query(async ({ input }) => {
      try {
        const category = await getCustomCategoryById(input.categoryId);
        if (!category) {
          return {
            success: false,
            error: "Category not found",
            questions: [],
          };
        }

        const questions = await getAIGeneratedQuestionsByCategory(input.categoryId);
        return {
          success: true,
          category: {
            id: category.id,
            name: category.name,
            description: category.description,
          },
          questions: questions.map((q) => ({
            id: q.id,
            question: q.question,
            optionA: q.optionA,
            optionB: q.optionB,
            optionC: q.optionC,
            optionD: q.optionD,
            correctAnswer: q.correctAnswer,
            difficulty: q.difficulty,
            explanation: q.explanation,
          })),
        };
      } catch (error: any) {
        console.error("[AI] Error fetching custom category questions:", error);
        return {
          success: false,
          error: error?.message || "Failed to fetch questions",
          questions: [],
        };
      }
    }),
});
