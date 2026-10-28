import { useEffect, useState } from "react";

interface LoadingAnimationProps {
  message?: string;
  duration?: number; // in milliseconds
}

export function LoadingAnimation({
  message = "Generating questions...",
  duration = 3000,
}: LoadingAnimationProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const newProgress = Math.min((elapsed / duration) * 100, 100);
      setProgress(newProgress);

      if (newProgress >= 100) {
        clearInterval(interval);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [duration]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-purple-500 via-blue-500 to-cyan-500 p-4">
      <div className="bg-white rounded-lg shadow-2xl p-8 w-full max-w-md">
        {/* Animated spinner */}
        <div className="flex justify-center mb-6">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-4 border-gray-200"></div>
            <div
              className="absolute inset-0 rounded-full border-4 border-transparent border-t-purple-500 border-r-blue-500 animate-spin"
              style={{
                animation: "spin 1.5s linear infinite",
              }}
            ></div>
          </div>
        </div>

        {/* Loading message */}
        <h2 className="text-center text-xl font-semibold text-gray-800 mb-6">
          {message}
        </h2>

        {/* Progress bar */}
        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden mb-4">
          <div
            className="h-full bg-gradient-to-r from-purple-500 via-blue-500 to-cyan-500 transition-all ease-out"
            style={{
              width: `${progress}%`,
              transitionDuration: "100ms",
            }}
          ></div>
        </div>

        {/* Progress percentage */}
        <p className="text-center text-sm text-gray-600">
          {Math.round(progress)}%
        </p>

        {/* Animated dots */}
        <div className="flex justify-center gap-2 mt-6">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-2 bg-purple-500 rounded-full"
              style={{
                animation: `bounce 1.4s infinite`,
                animationDelay: `${i * 0.2}s`,
              }}
            ></div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes bounce {
          0%, 80%, 100% {
            opacity: 0.5;
            transform: translateY(0);
          }
          40% {
            opacity: 1;
            transform: translateY(-8px);
          }
        }
      `}</style>
    </div>
  );
}
