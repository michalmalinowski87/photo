import React, { useState, useLayoutEffect } from "react";
import { createPortal } from "react-dom";

/** Themed three-dots loading indicator (used in FullPageLoading, ContentAreaLoadingOverlay, etc.) */
export const ThreeDotsIndicator = ({ className = "" }: { className?: string }) => (
  <div className={`flex items-center justify-center gap-1.5 ${className}`} role="status" aria-label="Ładowanie">
    <div
      className="w-2 h-2 rounded-full bg-photographer-accent dark:bg-photographer-accent opacity-80 animate-pulse"
      style={{ animationDelay: "0ms" }}
    />
    <div
      className="w-2 h-2 rounded-full bg-photographer-accent dark:bg-photographer-accent opacity-80 animate-pulse"
      style={{ animationDelay: "150ms" }}
    />
    <div
      className="w-2 h-2 rounded-full bg-photographer-accent dark:bg-photographer-accent opacity-80 animate-pulse"
      style={{ animationDelay: "300ms" }}
    />
  </div>
);

interface LoadingProps {
  size?: "sm" | "md" | "lg" | "xl";
  text?: string;
  className?: string;
}

export const Loading = ({ size = "md", text, className = "" }: LoadingProps) => {
  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-8 h-8",
    lg: "w-12 h-12",
    xl: "w-16 h-16",
  };

  const spinnerSize = sizeClasses[size];

  const spinner = (
    <div className={`${spinnerSize} relative`}>
      <div className="absolute inset-0 border-4 border-gray-500 dark:border-gray-700 rounded-full"></div>
      <div className="absolute inset-0 border-4 border-transparent border-t-brand-500 dark:border-t-brand-400 rounded-full animate-spin"></div>
    </div>
  );

  return (
    <div className={`flex flex-col items-center justify-center gap-4 ${className}`}>
      {spinner}
      {text && <p className="text-gray-600 dark:text-gray-400 text-sm font-medium">{text}</p>}
    </div>
  );
};

// Full page loading component
// Fixed overlay that covers the entire screen including header
// CRITICAL: Renders immediately on client to prevent content flash (sidebar appearing before overlay)
export const FullPageLoading = ({ text, logo }: { text?: string; logo?: React.ReactNode }) => {
  const [hasMounted, setHasMounted] = useState(false);

  const welcomingMessages = [
    "Przygotowujemy wszystko dla Ciebie...",
    "Już prawie gotowe...",
    "Wszystko będzie gotowe za chwilę...",
    "Pracujemy nad tym...",
  ];

  const defaultMessage = welcomingMessages[0];

  // Track client-side mount to prevent hydration mismatch
  // Use useLayoutEffect for synchronous rendering before paint
  useLayoutEffect(() => {
    setHasMounted(true);
  }, []);

  const content = (
    <div className="flex flex-col items-center justify-center gap-6 opacity-60">
      {/* Logo or PhotoCloud text with fade animation */}
      <div className="flex items-center justify-center">
        {logo ? (
          <div className="animate-pulse">{logo}</div>
        ) : (
          <h1 className="text-5xl font-bold text-gray-900 dark:text-white animate-fade-in-out">
            PhotoCloud
          </h1>
        )}
      </div>

      {/* Welcoming message */}
      <p className="text-lg text-gray-600 dark:text-gray-400 font-medium">
        {text ?? defaultMessage}
      </p>

      {/* Subtle loading indicator */}
      <div className="flex items-center gap-2 mt-2">
        <div
          className="w-2 h-2 bg-photographer-accent dark:bg-photographer-accent rounded-full animate-pulse"
          style={{ animationDelay: "0s" }}
        ></div>
        <div
          className="w-2 h-2 bg-photographer-accent dark:bg-photographer-accent rounded-full animate-pulse"
          style={{ animationDelay: "0.2s" }}
        ></div>
        <div
          className="w-2 h-2 bg-photographer-accent dark:bg-photographer-accent rounded-full animate-pulse"
          style={{ animationDelay: "0.4s" }}
        ></div>
      </div>
    </div>
  );

  const loadingOverlay = (
    <div
      className="fixed inset-0 flex items-center justify-center bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm"
      style={{ zIndex: 2147483647 }}
    >
      {content}
    </div>
  );

  // Prevent hydration mismatch by ensuring server and client first render match
  // Server-side and client first render: return null
  // Client after mount: render portal to prevent content flash
  if (!hasMounted || typeof window === "undefined") {
    return null;
  }

  // Client-side after mount: render immediately via portal to prevent any content flash
  // This ensures overlay appears before sidebar/layout renders
  return createPortal(loadingOverlay, document.body);
};

// Inline loading component
export const InlineLoading = ({ text }: { text?: string }) => {
  return <Loading size="md" text={text} />;
};

// Gallery loading component - subtle PhotoCloud text fading in/out with customizable loading text
// Use this for gallery image loading states (originals, user selected, finals)
export const GalleryLoading = ({ text = "Ładowanie..." }: { text?: string }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[300px] py-16">
      <div className="flex flex-col items-center justify-center gap-4">
        {/* PhotoCloud text with subtle fade animation */}
        <h1 className="text-4xl font-bold text-gray-500 dark:text-gray-600 animate-fade-in-out">
          PhotoCloud
        </h1>
        {/* Loading text */}
        <p className="text-base text-gray-600 dark:text-gray-400 font-medium">{text}</p>
      </div>
    </div>
  );
};

// Content view loading component - only covers the content area (not sidebar/header)
// Use this for page-level loading states instead of FullPageLoading
// This shows a loading state centered in the content area without covering sidebar/header
export const ContentViewLoading = ({ text, logo }: { text?: string; logo?: React.ReactNode }) => {
  const welcomingMessages = [
    "Przygotowujemy wszystko dla Ciebie...",
    "Już prawie gotowe...",
    "Wszystko będzie gotowe za chwilę...",
    "Pracujemy nad tym...",
  ];

  const defaultMessage = welcomingMessages[0];

  return (
    <div className="flex items-center justify-center min-h-[400px] py-16">
      <div className="flex flex-col items-center justify-center gap-6 opacity-60">
        {/* Logo or PhotoCloud text with fade animation */}
        <div className="flex items-center justify-center">
          {logo ? (
            <div className="animate-pulse">{logo}</div>
          ) : (
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white animate-fade-in-out">
              PhotoCloud
            </h1>
          )}
        </div>

        {/* Welcoming message */}
        <p className="text-base text-gray-600 dark:text-gray-400 font-medium">
          {text ?? defaultMessage}
        </p>

        {/* Subtle loading indicator */}
        <div className="flex items-center gap-2 mt-2">
          <div
            className="w-2 h-2 bg-photographer-accent dark:bg-photographer-accent rounded-full animate-pulse"
            style={{ animationDelay: "0s" }}
          ></div>
          <div
            className="w-2 h-2 bg-photographer-accent dark:bg-photographer-accent rounded-full animate-pulse"
            style={{ animationDelay: "0.2s" }}
          ></div>
          <div
            className="w-2 h-2 bg-photographer-accent dark:bg-photographer-accent rounded-full animate-pulse"
            style={{ animationDelay: "0.4s" }}
          ></div>
        </div>
      </div>
    </div>
  );
};

// Content area overlay loading component - shows an overlay in the main content area only
// Use this for list loading states where you want to show an overlay over the list container
// The overlay covers only the content area (where the list will appear), not the header/search controls
export const ContentAreaLoadingOverlay = ({ text }: { text?: string }) => {
  const welcomingMessages = [
    "Przygotowujemy wszystko dla Ciebie...",
    "Już prawie gotowe...",
    "Wszystko będzie gotowe za chwilę...",
    "Pracujemy nad tym...",
  ];

  const defaultMessage = welcomingMessages[0];

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm z-50">
      <div className="flex flex-col items-center justify-center gap-6 opacity-60">
        {/* PhotoCloud text with fade animation */}
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white animate-fade-in-out">
          PhotoCloud
        </h1>

        {/* Welcoming message */}
        <p className="text-base text-gray-600 dark:text-gray-400 font-medium">
          {text ?? defaultMessage}
        </p>

        {/* Subtle loading indicator */}
        <div className="flex items-center gap-2 mt-2">
          <div
            className="w-2 h-2 bg-photographer-accent dark:bg-photographer-accent rounded-full animate-pulse"
            style={{ animationDelay: "0s" }}
          ></div>
          <div
            className="w-2 h-2 bg-photographer-accent dark:bg-photographer-accent rounded-full animate-pulse"
            style={{ animationDelay: "0.2s" }}
          ></div>
          <div
            className="w-2 h-2 bg-photographer-accent dark:bg-photographer-accent rounded-full animate-pulse"
            style={{ animationDelay: "0.4s" }}
          ></div>
        </div>
      </div>
    </div>
  );
};
