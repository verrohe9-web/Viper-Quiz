import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// Achievement definitions (mirrored from server)
const ACHIEVEMENT_ICONS: Record<
  string,
  { icon: string; name: string; description: string; rarity: string }
> = {
  perfect_score: {
    icon: "⭐",
    name: "Perfect Score",
    description: "Answer all 10 questions correctly",
    rarity: "epic",
  },
  speed_demon: {
    icon: "⚡",
    name: "Speed Demon",
    description: "Complete a game in under 60 seconds",
    rarity: "rare",
  },
  first_blood: {
    icon: "🏆",
    name: "First Blood",
    description: "Win your first game",
    rarity: "common",
  },
  dominant_victory: {
    icon: "👑",
    name: "Dominant Victory",
    description: "Win with 100+ point lead",
    rarity: "rare",
  },
  consistent_winner: {
    icon: "🎯",
    name: "Consistent Winner",
    description: "Win 5 games in a row",
    rarity: "epic",
  },
  knowledge_master: {
    icon: "🧠",
    name: "Knowledge Master",
    description: "Score 90+ points",
    rarity: "uncommon",
  },
  accuracy_expert: {
    icon: "🎪",
    name: "Accuracy Expert",
    description: "Answer 9 out of 10 correctly",
    rarity: "uncommon",
  },
  category_master_bible: {
    icon: "📖",
    name: "Bible Scholar",
    description: "Score 80+ in Bible",
    rarity: "uncommon",
  },
  category_master_science: {
    icon: "🔬",
    name: "Science Genius",
    description: "Score 80+ in Science",
    rarity: "uncommon",
  },
  category_master_math: {
    icon: "🔢",
    name: "Math Wizard",
    description: "Score 80+ in Mathematics",
    rarity: "uncommon",
  },
  underdog_victory: {
    icon: "🐕",
    name: "Underdog Victory",
    description: "Win with 3+ players",
    rarity: "rare",
  },
  multiplayer_master: {
    icon: "👥",
    name: "Multiplayer Master",
    description: "Play 10 games with 3+ players",
    rarity: "rare",
  },
  streak_three: {
    icon: "🔥",
    name: "Heating Up",
    description: "Get 3 correct in a row",
    rarity: "common",
  },
  streak_five: {
    icon: "🔥",
    name: "On Fire",
    description: "Get 5 correct in a row",
    rarity: "uncommon",
  },
  streak_ten: {
    icon: "⚡",
    name: "Unstoppable",
    description: "Get all 10 correct in a row",
    rarity: "epic",
  },
  comeback_king: {
    icon: "🎬",
    name: "Comeback King",
    description: "Win after being behind",
    rarity: "epic",
  },
  legendary_score: {
    icon: "💎",
    name: "Legendary Score",
    description: "Score 150+ points",
    rarity: "legendary",
  },
  completionist: {
    icon: "✅",
    name: "Completionist",
    description: "Answer all 10 questions",
    rarity: "common",
  },
  bonus_hunter: {
    icon: "💰",
    name: "Bonus Hunter",
    description: "Earn 35+ streak bonus points",
    rarity: "rare",
  },
  fast_finisher: {
    icon: "⏱️",
    name: "Fast Finisher",
    description: "Complete all 10 in under 2 minutes",
    rarity: "rare",
  },
};

interface BadgeDisplayProps {
  achievementIds: string[];
}

export function BadgeDisplay({ achievementIds }: BadgeDisplayProps) {
  if (!achievementIds || achievementIds.length === 0) {
    return null;
  }

  return (
    <div className="flex gap-1 flex-wrap">
      {achievementIds.map((id) => {
        const achievement = ACHIEVEMENT_ICONS[id];
        if (!achievement) return null;

        return (
          <Tooltip key={id}>
            <TooltipTrigger asChild>
              <div className="text-xl cursor-help hover:scale-110 transition-transform">
                {achievement.icon}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <div className="text-sm">
                <p className="font-bold">{achievement.name}</p>
                <p className="text-xs text-gray-400">{achievement.description}</p>
                <p className="text-xs text-purple-400 mt-1">
                  {achievement.rarity.toUpperCase()}
                </p>
              </div>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
