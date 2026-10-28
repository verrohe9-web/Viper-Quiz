/**
 * Question Deduplication Service
 * Tracks recently used questions per category to prevent repetition across game rooms
 */

interface RecentlyUsedQuestion {
  questionText: string;
  usedAt: number;
}

// Store recently used questions per category
// Structure: { category: [{ questionText, usedAt }, ...] }
const recentlyUsedQuestions: Record<string, RecentlyUsedQuestion[]> = {};

// How long to remember used questions (7 days in milliseconds)
const QUESTION_MEMORY_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Mark a question as used in a category
 */
export function markQuestionAsUsed(category: string, questionText: string): void {
  if (!recentlyUsedQuestions[category]) {
    recentlyUsedQuestions[category] = [];
  }

  recentlyUsedQuestions[category].push({
    questionText,
    usedAt: Date.now(),
  });

  // Clean up old entries
  cleanupOldQuestions(category);
}

/**
 * Mark multiple questions as used (for a game room)
 */
export function markQuestionsAsUsed(category: string, questionTexts: string[]): void {
  questionTexts.forEach((text) => markQuestionAsUsed(category, text));
}

/**
 * Check if a question was recently used
 */
export function isQuestionRecentlyUsed(category: string, questionText: string): boolean {
  const used = recentlyUsedQuestions[category];
  if (!used) return false;

  return used.some((q) => q.questionText === questionText);
}

/**
 * Get all recently used questions for a category
 */
export function getRecentlyUsedQuestions(category: string): string[] {
  const used = recentlyUsedQuestions[category];
  if (!used) return [];

  // Clean up old entries first
  cleanupOldQuestions(category);

  return used.map((q) => q.questionText);
}

/**
 * Remove questions that are older than QUESTION_MEMORY_MS
 */
function cleanupOldQuestions(category: string): void {
  const used = recentlyUsedQuestions[category];
  if (!used) return;

  const now = Date.now();
  recentlyUsedQuestions[category] = used.filter((q) => now - q.usedAt < QUESTION_MEMORY_MS);

  // Remove category if no questions left
  if (recentlyUsedQuestions[category].length === 0) {
    delete recentlyUsedQuestions[category];
  }
}

/**
 * Clear all recently used questions (for testing)
 */
export function clearAllRecentlyUsedQuestions(): void {
  Object.keys(recentlyUsedQuestions).forEach((key) => {
    delete recentlyUsedQuestions[key];
  });
}

/**
 * Get statistics about recently used questions
 */
export function getDeduplicationStats(): Record<string, { count: number; oldestUsedAt: number; newestUsedAt: number }> {
  const stats: Record<string, { count: number; oldestUsedAt: number; newestUsedAt: number }> = {};

  Object.entries(recentlyUsedQuestions).forEach(([category, questions]) => {
    if (questions.length > 0) {
      const timestamps = questions.map((q) => q.usedAt);
      stats[category] = {
        count: questions.length,
        oldestUsedAt: Math.min(...timestamps),
        newestUsedAt: Math.max(...timestamps),
      };
    }
  });

  return stats;
}
