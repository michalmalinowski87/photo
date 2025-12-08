import React, { ReactNode } from "react";

interface TooltipProps {
  content: string;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  maxWidth?: string;
}

export const Tooltip: React.FC<TooltipProps> = ({ content, children, side = "top", maxWidth }) => {
  const positionClasses = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-0.5",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-0.5",
    left: "right-full top-1/2 -translate-y-1/2 mr-0.5",
    right: "left-full top-1/2 -translate-y-1/2 ml-0.5",
  };

  const arrowClasses = {
    top: "top-full left-1/2 -translate-x-1/2 -mt-0.5 border-4 border-transparent border-t-gray-900 dark:border-t-gray-800",
    bottom:
      "bottom-full left-1/2 -translate-x-1/2 -mb-0.5 border-4 border-transparent border-b-gray-900 dark:border-b-gray-800",
    left: "left-full top-1/2 -translate-y-1/2 -ml-0.5 border-4 border-transparent border-l-gray-900 dark:border-l-gray-800",
    right:
      "right-full top-1/2 -translate-y-1/2 -mr-0.5 border-4 border-transparent border-r-gray-900 dark:border-r-gray-800",
  };

  return (
    <span className="group relative inline-block">
      {children}
      <div
        className={`absolute ${positionClasses[side]} ${maxWidth ?? "w-auto"} min-w-max px-3 py-1.5 bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none ${maxWidth ? "" : "whitespace-nowrap"}`}
        style={maxWidth ? { maxWidth } : undefined}
      >
        {content}
        <div className={`absolute ${arrowClasses[side]}`}></div>
      </div>
    </span>
  );
};
