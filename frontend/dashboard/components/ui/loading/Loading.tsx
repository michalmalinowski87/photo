import React from "react";
import { createPortal } from "react-dom";

interface LoadingProps {
  size?: "sm" | "md" | "lg" | "xl";
  fullScreen?: boolean;
  text?: string;
  className?: string;
}

export const Loading: React.FC<LoadingProps> = ({
  size = "md",
  fullScreen = false,
  text,
  className = "",
}) => {
  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-8 h-8",
    lg: "w-12 h-12",
    xl: "w-16 h-16",
  };

  const spinnerSize = sizeClasses[size];

  const spinner = (
    <div className={`${spinnerSize} relative`}>
      <div className="absolute inset-0 border-4 border-gray-200 dark:border-gray-700 rounded-full"></div>
      <div className="absolute inset-0 border-4 border-transparent border-t-brand-500 dark:border-t-brand-400 rounded-full animate-spin"></div>
    </div>
  );

  const content = (
    <div className={`flex flex-col items-center justify-center gap-4 ${className}`}>
      {spinner}
      {text && <p className="text-gray-600 dark:text-gray-400 text-sm font-medium">{text}</p>}
    </div>
  );

  if (fullScreen) {
    const loadingOverlay = (
      <div className="fixed inset-0 flex items-center justify-center bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm z-50">
        {content}
      </div>
    );

    // Render full-screen loading via portal to document.body to ensure it's above all other content
    if (typeof window !== "undefined") {
      return createPortal(loadingOverlay, document.body);
    }

    return loadingOverlay;
  }

  return content;
};

// Full page loading component
// Fixed overlay that covers the entire screen including header
export const FullPageLoading: React.FC<{ text?: string }> = ({ text }) => {
  const content = (
    <div className="flex flex-col items-center justify-center gap-4">
      <div className="w-16 h-16 relative">
        <div className="absolute inset-0 border-4 border-gray-200 dark:border-gray-700 rounded-full"></div>
        <div className="absolute inset-0 border-4 border-transparent border-t-brand-500 dark:border-t-brand-400 rounded-full animate-spin"></div>
      </div>
      {text && <p className="text-gray-600 dark:text-gray-400 text-sm font-medium">{text}</p>}
    </div>
  );

  const loadingOverlay = (
    <div className="fixed inset-0 flex items-center justify-center bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm z-[9999]">
      {content}
    </div>
  );

  // Render full-page loading via portal to document.body to ensure it's above all other content
  if (typeof window !== "undefined") {
    return createPortal(loadingOverlay, document.body);
  }

  return loadingOverlay;
};

// Inline loading component
export const InlineLoading: React.FC<{ text?: string }> = ({ text }) => {
  return <Loading size="md" text={text} />;
};
