import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Room from "./pages/Room";
import Game from "./pages/Game";
import { GameHistory } from "./pages/GameHistory";
import Profile from "./pages/Profile";
import Friends from "./pages/Friends";
import AdminDashboard from "./pages/AdminDashboard";
import { useAutoRecovery } from "@/hooks/useAutoRecovery";
import { useRetryRequest } from "@/hooks/useRetryRequest";
import { useState } from "react";
import { Toaster } from "sonner";
import { NotificationCenter } from "./components/NotificationCenter";

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/room/:roomCode"} component={Room} />
      <Route path={"/game/:roomCode"} component={Game} />
      <Route path={"/history"} component={GameHistory} />
      <Route path={"/profile"} component={Profile} />
      <Route path={"/friends"} component={Friends} />
      <Route path={"/admin"} component={AdminDashboard} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  const [connectionStatus, setConnectionStatus] = useState<"healthy" | "unstable" | "recovering">("healthy");

  // Initialize auto-recovery features
  useAutoRecovery({
    checkInterval: 5000,
    stallThreshold: 10000,
    autoRefresh: true,
    onStall: () => {
      setConnectionStatus("unstable");
      console.warn("Server stalled, attempting recovery...");
    },
    onRecover: () => {
      setConnectionStatus("healthy");
      console.log("Connection restored");
    },
  });

  // Initialize retry logic
  useRetryRequest({
    maxRetries: 5,
    initialDelay: 1000,
    maxDelay: 30000,
  });

  const isHealthy = connectionStatus === "healthy";

  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        {/* Connection Status Banner */}
        {!isHealthy && (
          <div className="fixed top-0 left-0 right-0 bg-red-500 text-white px-4 py-2 text-center text-sm z-50 animate-pulse">
            ⚠️ Connection unstable - attempting to recover...
          </div>
        )}
        <TooltipProvider>
          <Toaster />
          <NotificationCenter />
          <Router />
        </TooltipProvider>
        {/* Health Status Indicator */}
        <div className="fixed bottom-4 right-4 z-40">
          <div
            className={`w-3 h-3 rounded-full ${isHealthy ? "bg-green-500" : "bg-red-500"} shadow-lg animate-pulse`}
            title={isHealthy ? "Connection healthy" : "Connection unstable"}
          />
        </div>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
