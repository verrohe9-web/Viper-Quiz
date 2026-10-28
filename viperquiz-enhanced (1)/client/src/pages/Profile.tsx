import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Trophy, Target, TrendingUp, Users } from "lucide-react";

export default function Profile() {
  const [, setLocation] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const authLoading = !isAuthenticated && !user;
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  const userId = selectedUserId || user?.id;

  const { data: statsData, isLoading: profileLoading } = trpc.social.getPlayerStats.useQuery(
    undefined,
    { enabled: !!user }
  );

  useEffect(() => {
    if (isAuthenticated === false && !user) {
      setLocation("/");
    }
  }, [isAuthenticated, user, setLocation]);

  if (authLoading || profileLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
        <div className="text-white text-2xl">Loading profile...</div>
      </div>
    );
  }

  if (!statsData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
        <div className="text-white text-2xl">Profile not found</div>
      </div>
    );
  }

  const stats = statsData;
  const winRate = stats ? ((stats.totalWins / (stats.totalWins + stats.totalLosses)) * 100).toFixed(1) : 0;
  const accuracy = stats ? ((stats.totalCorrectAnswers / stats.totalAnswered) * 100).toFixed(1) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation("/")}
            className="text-white border-white hover:bg-white/20"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <h1 className="text-3xl font-bold text-white">Player Profile</h1>
          <div className="w-20" />
        </div>

        {/* Profile Card */}
        <Card className="bg-white/95 backdrop-blur p-6 mb-6">
          <div className="flex items-center gap-6 mb-6">
            <div className="w-20 h-20 bg-gradient-to-br from-purple-400 to-blue-400 rounded-full flex items-center justify-center text-white text-3xl font-bold">
              {user?.name?.charAt(0).toUpperCase() || "P"}
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{user?.name || "Player"}</h2>
              <p className="text-gray-600">Player Statistics</p>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Trophy className="w-5 h-5 text-purple-600" />
                <span className="text-sm font-semibold text-gray-600">Wins</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{stats?.totalWins || 0}</p>
            </div>

            <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-5 h-5 text-blue-600" />
                <span className="text-sm font-semibold text-gray-600">Win Rate</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{winRate}%</p>
            </div>

            <div className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 text-green-600" />
                <span className="text-sm font-semibold text-gray-600">Accuracy</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{accuracy}%</p>
            </div>

            <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-5 h-5 text-orange-600" />
                <span className="text-sm font-semibold text-gray-600">Games Played</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{stats?.totalGames || 0}</p>
            </div>
          </div>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="stats" className="bg-white/95 backdrop-blur rounded-lg p-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="stats">Statistics</TabsTrigger>
            <TabsTrigger value="achievements">Achievements</TabsTrigger>
            <TabsTrigger value="categories">Top Categories</TabsTrigger>
          </TabsList>

          <TabsContent value="stats" className="mt-6">
            <div className="space-y-4">
              <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
                <span className="text-gray-600">Total Games</span>
                <span className="font-bold text-gray-900">{stats?.totalGames || 0}</span>
              </div>
              <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
                <span className="text-gray-600">Wins</span>
                <span className="font-bold text-gray-900">{stats?.totalWins || 0}</span>
              </div>
              <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
                <span className="text-gray-600">Losses</span>
                <span className="font-bold text-gray-900">{stats?.totalLosses || 0}</span>
              </div>
              <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
                <span className="text-gray-600">Correct Answers</span>
                <span className="font-bold text-gray-900">{stats?.totalCorrectAnswers || 0}</span>
              </div>
              <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
                <span className="text-gray-600">Total Score</span>
                <span className="font-bold text-gray-900">{stats?.totalScore || 0}</span>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="achievements" className="mt-6">
            <div className="text-center py-8">
              <p className="text-gray-600">Achievements coming soon!</p>
            </div>
          </TabsContent>

          <TabsContent value="categories" className="mt-6">
            <div className="text-center py-8">
              <p className="text-gray-600">Category statistics coming soon!</p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
