import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, UserPlus, UserCheck, Trash2, Clock } from "lucide-react";
import { toast } from "sonner";

export default function Friends() {
  const [, setLocation] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: friendsList, refetch: refetchFriends } = trpc.social.getFriendsList.useQuery(
    undefined,
    { enabled: !!user }
  );

  const { data: pendingRequests, refetch: refetchPending } = trpc.social.getPendingRequests.useQuery(
    undefined,
    { enabled: !!user }
  );

  const sendFriendRequestMutation = trpc.social.sendFriendRequest.useMutation({
    onSuccess: () => {
      toast.success("Friend request sent!");
      setSearchQuery("");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to send friend request");
    },
  });

  const acceptFriendRequestMutation = trpc.social.acceptFriendRequest.useMutation({
    onSuccess: () => {
      toast.success("Friend request accepted!");
      refetchFriends();
      refetchPending();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to accept request");
    },
  });

  const rejectFriendRequestMutation = trpc.social.rejectFriendRequest.useMutation({
    onSuccess: () => {
      toast.success("Friend request rejected");
      refetchPending();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to reject request");
    },
  });

  const removeFriendMutation = trpc.social.removeFriend.useMutation({
    onSuccess: () => {
      toast.success("Friend removed");
      refetchFriends();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to remove friend");
    },
  });

  useEffect(() => {
    if (isAuthenticated === false && !user) {
      setLocation("/");
    }
  }, [isAuthenticated, user, setLocation]);

  const handleSendFriendRequest = async (friendId: number) => {
    await sendFriendRequestMutation.mutateAsync({ receiverId: friendId });
  };

  const handleAcceptRequest = async (requestId: number) => {
    await acceptFriendRequestMutation.mutateAsync({ requestId });
  };

  const handleRejectRequest = async (requestId: number) => {
    await rejectFriendRequestMutation.mutateAsync({ requestId });
  };

  const handleRemoveFriend = async (friendId: number) => {
    await removeFriendMutation.mutateAsync({ friendId });
  };

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
          <h1 className="text-3xl font-bold text-white">Friends</h1>
          <div className="w-20" />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="friends" className="bg-white/95 backdrop-blur rounded-lg p-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="friends">
              Friends ({friendsList?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="pending">
              Pending ({pendingRequests?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="add">Add Friend</TabsTrigger>
          </TabsList>

          {/* Friends Tab */}
          <TabsContent value="friends" className="mt-6">
            {friendsList && friendsList.length > 0 ? (
              <div className="space-y-3">
                {friendsList.map((friend) => (
                  <div
                    key={friend.id}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-purple-400 to-blue-400 rounded-full flex items-center justify-center text-white font-bold">
                        F
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">Friend #{friend.friendId}</p>
                        <p className="text-sm text-gray-600">Friends since {new Date(friend.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleRemoveFriend(friend.friendId)}
                      disabled={removeFriendMutation.isPending}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-600">No friends yet. Add some friends to get started!</p>
              </div>
            )}
          </TabsContent>

          {/* Pending Tab */}
          <TabsContent value="pending" className="mt-6">
            {pendingRequests && pendingRequests.length > 0 ? (
              <div className="space-y-3">
                {pendingRequests.map((request: any) => (
                  <div
                    key={request.id}
                    className="flex items-center justify-between p-4 bg-yellow-50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <Clock className="w-5 h-5 text-yellow-600" />
                      <div>
                        <p className="font-semibold text-gray-900">Friend Request #{request.senderId}</p>
                        <p className="text-sm text-gray-600">Sent {new Date(request.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleAcceptRequest(request.id)}
                        disabled={acceptFriendRequestMutation.isPending}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <UserCheck className="w-4 h-4 mr-2" />
                        Accept
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRejectRequest(request.id)}
                        disabled={rejectFriendRequestMutation.isPending}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-600">No pending friend requests</p>
              </div>
            )}
          </TabsContent>

          {/* Add Friend Tab */}
          <TabsContent value="add" className="mt-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Search for a player
                </label>
                <Input
                  placeholder="Enter player name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full"
                />
              </div>
              {searchQuery && (
                <div className="p-4 bg-gray-50 rounded-lg text-center">
                  <p className="text-gray-600">Search functionality coming soon!</p>
                  <p className="text-sm text-gray-500 mt-2">For now, use room codes to invite friends</p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
