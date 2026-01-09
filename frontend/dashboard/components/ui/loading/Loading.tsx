import React from "react";
import { createPortal } from "react-dom";

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
export const FullPageLoading = ({ text, logo }: { text?: string; logo?: React.ReactNode }) => {
  const [isMounted, setIsMounted] = React.useState(false);

  // Ensure component only renders on client to prevent hydration mismatch
  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  const welcomingMessages = [
    "Przygotowujemy wszystko dla Ciebie...",
    "Już prawie gotowe...",
    "Wszystko będzie gotowe za chwilę...",
    "Pracujemy nad tym...",
  ];

  const defaultMessage = welcomingMessages[0];

  const content = (
    <div className="flex flex-col items-center justify-center gap-6 opacity-60">
      {/* Logo or PhotoHub text with fade animation */}
      <div className="flex items-center justify-center">
        {logo ? (
          <div className="animate-pulse">{logo}</div>
        ) : (
          <h1 className="text-5xl font-bold text-gray-900 dark:text-white animate-fade-in-out">
            PhotoHub
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
    <div className="fixed inset-0 flex items-center justify-center bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm z-[9999]">
      {content}
    </div>
  );

  // Don't render on server to prevent hydration mismatch
  if (!isMounted) {
    return null;
  }

  // Render full-page loading via portal to document.body to ensure it's above all other content
  return createPortal(loadingOverlay, document.body);
};

// Inline loading component
export const InlineLoading = ({ text }: { text?: string }) => {
  return <Loading size="md" text={text} />;
};

// Gallery loading component - subtle PhotoHub text fading in/out with customizable loading text
// Use this for gallery image loading states (originals, user selected, finals)
export const GalleryLoading = ({ text = "Ładowanie..." }: { text?: string }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[300px] py-16">
      <div className="flex flex-col items-center justify-center gap-4">
        {/* PhotoHub text with subtle fade animation */}
        <h1 className="text-4xl font-bold text-gray-500 dark:text-gray-600 animate-fade-in-out">
          PhotoHub
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
        {/* Logo or PhotoHub text with fade animation */}
        <div className="flex items-center justify-center">
          {logo ? (
            <div className="animate-pulse">{logo}</div>
          ) : (
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white animate-fade-in-out">
              PhotoHub
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
        {/* PhotoHub text with fade animation */}
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white animate-fade-in-out">
          PhotoHub
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
