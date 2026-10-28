import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Search, MessageCircle, Users, Smile } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface GameChatProps {
  roomCode: string;
  playerId: string;
  playerName: string;
}

interface ChatMessage {
  id: number;
  roomCode: string;
  playerId: string;
  playerName: string;
  message: string;
  createdAt: Date;
}

interface MessageReaction {
  id: number;
  messageId: number;
  playerId: string;
  playerName: string;
  emoji: string;
  createdAt: Date;
}

const REACTION_EMOJIS = ["👍", "😂", "🔥", "❤️"];

export function GameChat({ roomCode, playerId, playerName }: GameChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [messageReactions, setMessageReactions] = useState<Record<number, MessageReaction[]>>({});
  const [typingPlayers, setTypingPlayers] = useState<Array<{ playerId: string; playerName: string }>>([]);
  const [showReactionPicker, setShowReactionPicker] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const sendMessageMutation = trpc.game.sendMessage.useMutation();
  const addReactionMutation = trpc.game.addReaction.useMutation();
  const setTypingStatusMutation = trpc.game.setTypingStatus.useMutation();

  const { data: messagesData, refetch: refetchMessages } = trpc.game.getMessages.useQuery(
    { roomCode, limit: 50 },
    { refetchInterval: 1000 }
  );

  const { data: typingData, refetch: refetchTyping } = trpc.game.getTypingStatus.useQuery(
    { roomCode },
    { refetchInterval: 500 }
  );

  // Fetch reactions for all messages
  const fetchAllReactions = async () => {
    if (messages.length === 0) return;
    
    const reactionsMap: Record<number, MessageReaction[]> = {};
    
    for (const msg of messages) {
      try {
        // Use the useQuery hook to fetch reactions
        const utils = trpc.useUtils();
        const result = await utils.game.getReactions.fetch({ messageId: msg.id });
        if (result.success) {
          reactionsMap[msg.id] = result.reactions;
        }
      } catch (error) {
        console.error("Failed to fetch reactions:", error);
      }
    }
    
    setMessageReactions(reactionsMap);
  };

  useEffect(() => {
    if (messagesData?.success && messagesData.messages) {
      setMessages(messagesData.messages as ChatMessage[]);
      fetchAllReactions();
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, 0);
    }
  }, [messagesData]);

  useEffect(() => {
    if (typingData?.success && typingData.typingPlayers) {
      setTypingPlayers(typingData.typingPlayers);
    }
  }, [typingData]);

  const handleSendMessage = async () => {
    if (!messageInput.trim()) return;

    setIsLoading(true);
    try {
      // Set typing status to false
      setTypingStatusMutation.mutate({
        roomCode,
        playerId,
        playerName,
        isTyping: false,
      });

      const result = await sendMessageMutation.mutateAsync({
        roomCode,
        playerId,
        playerName,
        message: messageInput.trim(),
      });

      if (result.success) {
        setMessageInput("");
        refetchMessages();
      } else {
        toast.error("Failed to send message");
      }
    } catch (error) {
      console.error("Error sending message:", error);
      toast.error("Failed to send message");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessageInput(e.target.value);

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set typing status to true
    setTypingStatusMutation.mutate({
      roomCode,
      playerId,
      playerName,
      isTyping: true,
    });

    // Set typing status to false after 3 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      setTypingStatusMutation.mutate({
        roomCode,
        playerId,
        playerName,
        isTyping: false,
      });
    }, 3000);
  };

  const handleAddReaction = async (messageId: number, emoji: string) => {
    try {
      const result = await addReactionMutation.mutateAsync({
        messageId,
        playerId,
        playerName,
        emoji,
      });

      if (result.success) {
        fetchAllReactions();
        setShowReactionPicker(null);
      } else {
        toast.error("Failed to add reaction");
      }
    } catch (error) {
      console.error("Error adding reaction:", error);
      toast.error("Failed to add reaction");
    }
  };

  const filteredMessages = messages.filter((msg) =>
    msg.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
    msg.playerName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getAvatarColor = (name: string) => {
    const colors = [
      "bg-red-500",
      "bg-blue-500",
      "bg-green-500",
      "bg-yellow-500",
      "bg-purple-500",
      "bg-pink-500",
      "bg-indigo-500",
      "bg-teal-500",
    ];
    const hash = name.charCodeAt(0) + name.charCodeAt(name.length - 1);
    return colors[hash % colors.length];
  };

  const groupReactions = (reactions: MessageReaction[]) => {
    const grouped: Record<string, number> = {};
    reactions.forEach((r) => {
      grouped[r.emoji] = (grouped[r.emoji] || 0) + 1;
    });
    return grouped;
  };

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-slate-950 to-slate-900 rounded-lg overflow-hidden border border-slate-800">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-800 bg-slate-900">
        <h3 className="font-bold text-white text-lg mb-3">Game Chat</h3>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input
            placeholder="Search messages..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-slate-800 border-slate-700 text-white placeholder-slate-500 rounded-full text-sm"
          />
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 mt-3 overflow-x-auto pb-2">
          <button className="px-3 py-1 bg-green-600 text-white text-sm rounded-full font-medium whitespace-nowrap">
            All
          </button>
          <button className="px-3 py-1 bg-slate-700 text-slate-300 text-sm rounded-full font-medium whitespace-nowrap hover:bg-slate-600">
            Unread
          </button>
          <button className="px-3 py-1 bg-slate-700 text-slate-300 text-sm rounded-full font-medium whitespace-nowrap hover:bg-slate-600">
            Active
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1">
        <div ref={scrollRef} className="px-4 py-3 space-y-3">
          {filteredMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-slate-500 text-sm">
              <MessageCircle className="w-8 h-8 mb-2 opacity-50" />
              <p>No messages yet</p>
            </div>
          ) : (
            <>
              {filteredMessages.map((msg) => {
                const reactions = messageReactions[msg.id] || [];
                const groupedReactions = groupReactions(reactions);

                return (
                  <div key={msg.id} className="group">
                    <div className="flex gap-3 hover:bg-slate-800 p-2 rounded transition-colors">
                      {/* Avatar */}
                      <div
                        className={`w-10 h-10 rounded-full ${getAvatarColor(msg.playerName)} flex items-center justify-center flex-shrink-0 border-2 border-slate-700 font-bold text-white text-sm`}
                      >
                        {msg.playerName.charAt(0).toUpperCase()}
                      </div>

                      {/* Message Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-semibold text-white text-sm">{msg.playerName}</span>
                          <span className="text-xs text-slate-500 flex-shrink-0">
                            {new Date(msg.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <p className="text-slate-300 text-sm break-words mt-1">{msg.message}</p>

                        {/* Reactions Display */}
                        {Object.keys(groupedReactions).length > 0 && (
                          <div className="flex gap-1 mt-2 flex-wrap">
                            {Object.entries(groupedReactions).map(([emoji, count]: [string, number]) => (
                              <button
                                key={emoji}
                                onClick={() => handleAddReaction(msg.id, emoji)}
                                className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs text-white transition-colors"
                              >
                                {emoji} {count > 1 ? count : ""}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Reaction Picker */}
                        {showReactionPicker === msg.id && (
                          <div className="flex gap-1 mt-2 p-2 bg-slate-800 rounded">
                            {REACTION_EMOJIS.map((emoji) => (
                              <button
                                key={emoji}
                                onClick={() => handleAddReaction(msg.id, emoji)}
                                className="text-lg hover:scale-125 transition-transform"
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Reaction Button */}
                      <button
                        onClick={() => setShowReactionPicker(showReactionPicker === msg.id ? null : msg.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                      >
                        <Smile className="w-4 h-4 text-slate-400 hover:text-slate-300" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Typing Indicator */}
              {typingPlayers.length > 0 && (
                <div className="flex gap-3 p-2 text-slate-400 text-sm">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" } as React.CSSProperties} />
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0.4s" } as React.CSSProperties} />
                  </div>
                  <span>
                    {typingPlayers.map((p) => p.playerName).join(", ")} {typingPlayers.length === 1 ? "is" : "are"} typing...
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="px-4 py-3 border-t border-slate-800 bg-slate-900">
        <div className="flex gap-2">
          <Input
            placeholder="Type a message..."
            value={messageInput}
            onChange={handleInputChange}
            onKeyPress={handleKeyPress}
            disabled={isLoading}
            className="flex-1 bg-slate-800 border-slate-700 text-white placeholder-slate-500 rounded-full text-sm"
          />
          <Button
            size="sm"
            onClick={handleSendMessage}
            disabled={isLoading || !messageInput.trim()}
            className="bg-green-600 hover:bg-green-700 text-white rounded-full p-2 h-10 w-10 flex items-center justify-center"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Bottom Status Bar */}
      <div className="px-4 py-2 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-xs text-slate-500">
        <span>{filteredMessages.length} messages</span>
        <div className="flex items-center gap-2">
          <Users className="w-3 h-3" />
          <span>Game Room</span>
        </div>
      </div>
    </div>
  );
}
