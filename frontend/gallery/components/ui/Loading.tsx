"use client";

import React from "react";
import { createPortal } from "react-dom";

/** Themed three-dots loading indicator for infinite scroll and inline loading states */
export const ThreeDotsIndicator = ({ className = "" }: { className?: string }) => (
  <div className={`flex items-center justify-center gap-1.5 ${className}`} role="status" aria-label="Ładowanie">
    <div
      className="w-2 h-2 rounded-full bg-primary opacity-80 animate-pulse"
      style={{ animationDelay: "0ms" }}
    />
    <div
      className="w-2 h-2 rounded-full bg-primary opacity-80 animate-pulse"
      style={{ animationDelay: "150ms" }}
    />
    <div
      className="w-2 h-2 rounded-full bg-primary opacity-80 animate-pulse"
      style={{ animationDelay: "300ms" }}
    />
  </div>
);

// Full page loading component
// Fixed overlay that covers the entire screen including header
export const FullPageLoading = ({
  text,
  logo,
  isVisible = true,
}: {
  text?: string;
  logo?: React.ReactNode;
  isVisible?: boolean;
}) => {
  const [isMounted, setIsMounted] = React.useState(false);

  // Ensure component only renders on client to prevent hydration mismatch
  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  // Ensure document.body exists
  const canRender = isMounted && typeof document !== "undefined" && !!document.body;

  const welcomingMessages = [
    "Przygotowujemy wszystko dla Ciebie...",
    "Już prawie gotowe...",
    "Wszystko będzie gotowe za chwilę...",
    "Pracujemy nad tym...",
  ];

  const defaultMessage = welcomingMessages[0];

  const content = (
    <div className="flex flex-col items-center justify-center gap-6 opacity-60">
      {/* Logo or PixiProof text with fade animation */}
      <div className="flex items-center justify-center">
        {logo ? (
          <div className="animate-pulse">{logo}</div>
        ) : (
          <h1 className="text-5xl font-bold text-gray-900 animate-fade-in-out">
            PixiProof
          </h1>
        )}
      </div>

      {/* Welcoming message */}
      <p className="text-lg text-gray-600 font-medium">
        {text ?? defaultMessage}
      </p>

      {/* Subtle loading indicator */}
      <div className="flex items-center gap-2 mt-2">
        <div
          className="w-2 h-2 bg-black rounded-full animate-pulse"
          style={{ animationDelay: "0s" }}
        ></div>
        <div
          className="w-2 h-2 bg-gray-500 rounded-full animate-pulse"
          style={{ animationDelay: "0.2s" }}
        ></div>
        <div
          className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"
          style={{ animationDelay: "0.4s" }}
        ></div>
      </div>
    </div>
  );

  const loadingOverlay = (
    <div
      className="fixed inset-0 flex items-center justify-center bg-white/95 backdrop-blur-sm"
      style={{ 
        zIndex: 2147483647,
        display: isVisible ? 'flex' : 'none',
      }}
    >
      {content}
    </div>
  );

  // Don't render on server / pre-hydration
  if (!canRender) {
    return null;
  }

  // Always render the portal when mounted, control visibility with CSS
  // This ensures the portal is set up and ready to show instantly
  return createPortal(loadingOverlay, document.body);
};
