import { Bell, CheckCheck, Inbox } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { trpc } from "@/lib/trpc";

export function NotificationCenter() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const notifications = trpc.notifications.list.useQuery({ limit: 30 }, { enabled: Boolean(user), refetchInterval: 15000 });
  const unreadCount = trpc.notifications.unreadCount.useQuery(undefined, { enabled: Boolean(user), refetchInterval: 15000 });
  const markRead = trpc.notifications.markRead.useMutation({ onSuccess: () => { void notifications.refetch(); void unreadCount.refetch(); } });
  const markAllRead = trpc.notifications.markAllRead.useMutation({ onSuccess: () => { void notifications.refetch(); void unreadCount.refetch(); } });

  if (!user) return null;

  return <div className="fixed right-5 top-5 z-40">
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" aria-label={unreadCount.data ? `${unreadCount.data} unread notifications` : "Notifications"} className="relative rounded-full border-white/50 bg-white/90 shadow-lg backdrop-blur hover:bg-white">
          <Bell className="h-4 w-4 text-slate-700" />
          {(unreadCount.data ?? 0) > 0 && <Badge className="absolute -right-2 -top-2 min-w-5 justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] text-white">{unreadCount.data! > 99 ? "99+" : unreadCount.data}</Badge>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,380px)] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3"><div><h2 className="font-semibold">Notifications</h2><p className="text-xs text-muted-foreground">Room activity, payments, and achievements.</p></div><Button variant="ghost" size="sm" disabled={!unreadCount.data || markAllRead.isPending} onClick={() => markAllRead.mutate()}><CheckCheck className="mr-1 h-4 w-4" />Mark all read</Button></div>
        <ScrollArea className="h-80">
          {notifications.isLoading ? <p className="p-6 text-sm text-muted-foreground">Loading notifications…</p> : notifications.data?.length ? <div className="divide-y">{notifications.data.map((item) => <button key={item.id} type="button" onClick={() => !item.isRead && markRead.mutate({ notificationId: item.id })} className={`block w-full px-4 py-3 text-left transition-colors hover:bg-muted/60 ${item.isRead ? "bg-background" : "bg-blue-50/70"}`}><div className="flex items-start gap-3"><span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${item.isRead ? "bg-slate-300" : "bg-blue-600"}`} aria-hidden="true" /><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-foreground">{item.title}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{item.message}</span><span className="mt-2 block text-[11px] text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</span></span></div></button>)}</div> : <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-muted-foreground"><Inbox className="h-8 w-8" /><p className="text-sm font-medium">You’re all caught up</p><p className="text-xs">New game activity will appear here.</p></div>}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  </div>;
}
