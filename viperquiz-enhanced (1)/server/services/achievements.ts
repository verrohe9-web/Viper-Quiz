/**
 * Achievement and Badge System for ViperQuiz
 */

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string; // emoji or icon name
  rarity: "common" | "uncommon" | "rare" | "epic" | "legendary";
  condition: (gameStats: GameStats) => boolean;
}

export interface GameStats {
  score: number;
  correctAnswers: number;
  totalAnswered: number;
  timeSpentSeconds: number;
  category: string;
  playerRank: number; // 1 = first place, 2 = second, etc.
  totalPlayers: number;
  questionsAnswered: number;
  maxStreak: number;
  bonusPoints: number;
}

export interface UserBadge {
  achievementId: string;
  earnedAt: Date;
  earnedInGameId?: string;
}

/**
 * Define all available achievements
 */
export const ACHIEVEMENTS: Record<string, Achievement> = {
  PERFECT_SCORE: {
    id: "perfect_score",
    name: "Perfect Score",
    description: "Answer all 10 questions correctly in a single game",
    icon: "⭐",
    rarity: "epic",
    condition: (stats) => stats.correctAnswers === 10 && stats.totalAnswered === 10,
  },

  SPEED_DEMON: {
    id: "speed_demon",
    name: "Speed Demon",
    description: "Complete a game in under 60 seconds",
    icon: "⚡",
    rarity: "rare",
    condition: (stats) => stats.timeSpentSeconds < 60 && stats.questionsAnswered >= 5,
  },

  FIRST_BLOOD: {
    id: "first_blood",
    name: "First Blood",
    description: "Win your first game",
    icon: "🏆",
    rarity: "common",
    condition: (stats) => stats.playerRank === 1,
  },

  DOMINANT_VICTORY: {
    id: "dominant_victory",
    name: "Dominant Victory",
    description: "Win a game with 100+ point lead over second place",
    icon: "👑",
    rarity: "rare",
    condition: (stats) => stats.playerRank === 1 && stats.score >= 100,
  },

  CONSISTENT_WINNER: {
    id: "consistent_winner",
    name: "Consistent Winner",
    description: "Win 5 games in a row",
    icon: "🎯",
    rarity: "epic",
    condition: (stats) => stats.playerRank === 1, // Tracked separately
  },

  KNOWLEDGE_MASTER: {
    id: "knowledge_master",
    name: "Knowledge Master",
    description: "Score 90+ points in a single game",
    icon: "🧠",
    rarity: "uncommon",
    condition: (stats) => stats.score >= 90,
  },

  ACCURACY_EXPERT: {
    id: "accuracy_expert",
    name: "Accuracy Expert",
    description: "Answer 9 out of 10 questions correctly",
    icon: "🎪",
    rarity: "uncommon",
    condition: (stats) => stats.correctAnswers >= 9 && stats.totalAnswered === 10,
  },

  CATEGORY_MASTER_BIBLE: {
    id: "category_master_bible",
    name: "Bible Scholar",
    description: "Score 80+ points in Bible category",
    icon: "📖",
    rarity: "uncommon",
    condition: (stats) => stats.category === "Bible" && stats.score >= 80,
  },

  CATEGORY_MASTER_SCIENCE: {
    id: "category_master_science",
    name: "Science Genius",
    description: "Score 80+ points in Science category",
    icon: "🔬",
    rarity: "uncommon",
    condition: (stats) => stats.category === "Science" && stats.score >= 80,
  },

  CATEGORY_MASTER_MATH: {
    id: "category_master_math",
    name: "Math Wizard",
    description: "Score 80+ points in Mathematics category",
    icon: "🔢",
    rarity: "uncommon",
    condition: (stats) => stats.category === "Mathematics" && stats.score >= 80,
  },

  UNDERDOG_VICTORY: {
    id: "underdog_victory",
    name: "Underdog Victory",
    description: "Win a game with 3+ players",
    icon: "🐕",
    rarity: "rare",
    condition: (stats) => stats.playerRank === 1 && stats.totalPlayers >= 3,
  },

  MULTIPLAYER_MASTER: {
    id: "multiplayer_master",
    name: "Multiplayer Master",
    description: "Play 10 games with 3+ players",
    icon: "👥",
    rarity: "rare",
    condition: (stats) => stats.totalPlayers >= 3, // Tracked separately
  },

  STREAK_THREE: {
    id: "streak_three",
    name: "Heating Up",
    description: "Get 3 correct answers in a row",
    icon: "🔥",
    rarity: "common",
    condition: (stats) => stats.maxStreak >= 3,
  },

  STREAK_FIVE: {
    id: "streak_five",
    name: "On Fire",
    description: "Get 5 correct answers in a row",
    icon: "🔥",
    rarity: "uncommon",
    condition: (stats) => stats.maxStreak >= 5,
  },

  STREAK_TEN: {
    id: "streak_ten",
    name: "Unstoppable",
    description: "Get all 10 answers correct in a row",
    icon: "⚡",
    rarity: "epic",
    condition: (stats) => stats.maxStreak >= 10,
  },

  COMEBACK_KING: {
    id: "comeback_king",
    name: "Comeback King",
    description: "Win a game after being behind",
    icon: "🎬",
    rarity: "epic",
    condition: (stats) => stats.playerRank === 1, // Tracked separately
  },

  LEGENDARY_SCORE: {
    id: "legendary_score",
    name: "Legendary Score",
    description: "Score 150+ points in a single game",
    icon: "💎",
    rarity: "legendary",
    condition: (stats) => stats.score >= 150,
  },

  COMPLETIONIST: {
    id: "completionist",
    name: "Completionist",
    description: "Answer all 10 questions in a game",
    icon: "✅",
    rarity: "common",
    condition: (stats) => stats.questionsAnswered === 10 && stats.totalAnswered === 10,
  },

  BONUS_HUNTER: {
    id: "bonus_hunter",
    name: "Bonus Hunter",
    description: "Earn at least 35 streak bonus points in a game",
    icon: "💰",
    rarity: "rare",
    condition: (stats) => stats.bonusPoints >= 35,
  },

  FAST_FINISHER: {
    id: "fast_finisher",
    name: "Fast Finisher",
    description: "Complete all 10 questions in under 2 minutes",
    icon: "⏱️",
    rarity: "rare",
    condition: (stats) => stats.timeSpentSeconds < 120 && stats.questionsAnswered === 10,
  },
};

/**
 * Check which achievements were earned in a game
 */
export function checkAchievements(stats: GameStats): string[] {
  const earned: string[] = [];

  for (const [key, achievement] of Object.entries(ACHIEVEMENTS)) {
    if (achievement.condition(stats)) {
      earned.push(achievement.id);
    }
  }

  return earned;
}

/**
 * Get achievement by ID
 */
export function getAchievement(id: string): Achievement | undefined {
  return Object.values(ACHIEVEMENTS).find((a) => a.id === id);
}

/**
 * Get all achievements
 */
export function getAllAchievements(): Achievement[] {
  return Object.values(ACHIEVEMENTS);
}
