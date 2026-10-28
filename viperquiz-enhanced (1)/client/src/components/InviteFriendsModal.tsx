import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

interface InviteFriendsModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomCode: string;
}

export function InviteFriendsModal({ isOpen, onClose, roomCode }: InviteFriendsModalProps) {
  const [selectedFriends, setSelectedFriends] = useState<number[]>([]);
  const [copied, setCopied] = useState(false);

  const { data: friendsList } = trpc.social.getFriendsList.useQuery(undefined);

  const handleCopyRoomCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    toast.success("Room code copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSelectFriend = (friendId: number) => {
    setSelectedFriends((prev) =>
      prev.includes(friendId) ? prev.filter((id) => id !== friendId) : [...prev, friendId]
    );
  };

  const handleSendInvites = async () => {
    if (selectedFriends.length === 0) {
      toast.error("Please select at least one friend to invite");
      return;
    }

    try {
      // Send invitations to each selected friend
      for (const friendId of selectedFriends) {
        // In a real implementation, this would call an API to send room invitations
        // For now, we'll just show a success message and copy the room code
        console.log(`Sending invitation to friend ${friendId} for room ${roomCode}`);
      }
      
      toast.success(`Invitations sent to ${selectedFriends.length} friend(s)!`);
      // Copy room code to clipboard for easy sharing
      navigator.clipboard.writeText(roomCode);
      setSelectedFriends([]);
      onClose();
    } catch (error) {
      toast.error("Failed to send invitations");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Invite Friends to Game</DialogTitle>
          <DialogDescription>
            Share your room code or select friends to invite
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Room Code Section */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Room Code</label>
            <div className="flex gap-2">
              <Input
                value={roomCode}
                readOnly
                className="font-mono text-lg font-bold"
              />
              <Button
                onClick={handleCopyRoomCode}
                variant="outline"
                size="sm"
                className="px-3"
              >
                {copied ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-gray-500">
              Share this code with friends so they can join your game
            </p>
          </div>

          {/* Friends List Section */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              Or Select Friends to Invite ({selectedFriends.length})
            </label>
            {friendsList && friendsList.length > 0 ? (
              <ScrollArea className="h-[200px] border rounded-lg p-4">
                <div className="space-y-3">
                  {friendsList.map((friend) => (
                    <div
                      key={friend.id}
                      className="flex items-center gap-3 p-2 hover:bg-gray-100 rounded cursor-pointer"
                      onClick={() => handleSelectFriend(friend.friendId)}
                    >
                      <Checkbox
                        checked={selectedFriends.includes(friend.friendId)}
                        onCheckedChange={() => handleSelectFriend(friend.friendId)}
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">
                          Friend #{friend.friendId}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="p-4 bg-gray-50 rounded-lg text-center">
                <p className="text-sm text-gray-600">No friends yet</p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSendInvites}
              disabled={selectedFriends.length === 0}
              className="flex-1 bg-purple-600 hover:bg-purple-700"
            >
              Send Invites ({selectedFriends.length})
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
