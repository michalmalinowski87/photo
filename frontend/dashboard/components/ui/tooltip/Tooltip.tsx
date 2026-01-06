import React, { ReactNode, useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

interface TooltipProps {
  content: string | undefined;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  align?: "center" | "start" | "end";
  maxWidth?: string;
  fullWidth?: boolean;
}

export const Tooltip = ({
  content,
  children,
  side = "top",
  align = "center",
  maxWidth,
  fullWidth = false,
}: TooltipProps) => {
  // Don't render tooltip if content is empty or undefined
  if (!content || content.trim() === "") {
    return <>{children}</>;
  }
  const [isHovered, setIsHovered] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isHovered || !triggerRef.current || !tooltipRef.current) {
      return;
    }

    const updatePosition = () => {
      if (!triggerRef.current || !tooltipRef.current) {
        return;
      }

      const triggerRect = triggerRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();

      let top = 0;
      let left = 0;

      if (side === "top") {
        top = triggerRect.top - tooltipRect.height - 4;
        if (align === "start") {
          left = triggerRect.left;
        } else if (align === "end") {
          left = triggerRect.right - tooltipRect.width;
        } else {
          left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
        }
      } else if (side === "bottom") {
        top = triggerRect.bottom + 4;
        if (align === "start") {
          left = triggerRect.left;
        } else if (align === "end") {
          left = triggerRect.right - tooltipRect.width;
        } else {
          left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
        }
      } else if (side === "left") {
        left = triggerRect.left - tooltipRect.width - 4;
        if (align === "start") {
          top = triggerRect.top;
        } else if (align === "end") {
          top = triggerRect.bottom - tooltipRect.height;
        } else {
          top = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
        }
      } else {
        // right
        left = triggerRect.right + 4;
        if (align === "start") {
          top = triggerRect.top;
        } else if (align === "end") {
          top = triggerRect.bottom - tooltipRect.height;
        } else {
          top = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
        }
      }

      setPosition({ top, left });
    };

    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);

    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [isHovered, side, align]);

  // Arrow classes based on side and alignment
  const getArrowClasses = () => {
    if (side === "top") {
      if (align === "start") {
        return "top-full left-4 -mt-0.5 border-4 border-transparent border-t-gray-700 dark:border-t-gray-800";
      } else if (align === "end") {
        return "top-full right-4 -mt-0.5 border-4 border-transparent border-t-gray-700 dark:border-t-gray-800";
      }
      return "top-full left-1/2 -translate-x-1/2 -mt-0.5 border-4 border-transparent border-t-gray-700 dark:border-t-gray-800";
    } else if (side === "bottom") {
      if (align === "start") {
        return "bottom-full left-4 -mb-0.5 border-4 border-transparent border-b-gray-700 dark:border-b-gray-800";
      } else if (align === "end") {
        return "bottom-full right-4 -mb-0.5 border-4 border-transparent border-b-gray-700 dark:border-b-gray-800";
      }
      return "bottom-full left-1/2 -translate-x-1/2 -mb-0.5 border-4 border-transparent border-b-gray-700 dark:border-b-gray-800";
    } else if (side === "left") {
      if (align === "start") {
        return "left-full top-4 -ml-0.5 border-4 border-transparent border-l-gray-700 dark:border-l-gray-800";
      } else if (align === "end") {
        return "left-full bottom-4 -ml-0.5 border-4 border-transparent border-l-gray-700 dark:border-l-gray-800";
      }
      return "left-full top-1/2 -translate-y-1/2 -ml-0.5 border-4 border-transparent border-l-gray-700 dark:border-l-gray-800";
    } else {
      // right
      if (align === "start") {
        return "right-full top-4 -mr-0.5 border-4 border-transparent border-r-gray-700 dark:border-r-gray-800";
      } else if (align === "end") {
        return "right-full bottom-4 -mr-0.5 border-4 border-transparent border-r-gray-700 dark:border-r-gray-800";
      }
      return "right-full top-1/2 -translate-y-1/2 -mr-0.5 border-4 border-transparent border-r-gray-700 dark:border-r-gray-800";
    }
  };

  const wrapperClass = fullWidth ? "group relative block w-full" : "group relative inline-block";

  const tooltipContent = isHovered && mounted && (
    <div
      ref={tooltipRef}
      className={`fixed ${maxWidth ?? "w-auto"} min-w-max px-3 py-1.5 bg-gray-700 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg z-[100] pointer-events-none ${maxWidth ? "" : "whitespace-nowrap"}`}
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        maxWidth: maxWidth ?? undefined,
      }}
    >
      {content}
      <div className={`absolute ${getArrowClasses()}`}></div>
    </div>
  );

  return (
    <>
      <span
        ref={triggerRef as React.RefObject<HTMLSpanElement>}
        className={wrapperClass}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{ isolation: "isolate" }}
      >
        {children}
      </span>
      {mounted && typeof window !== "undefined" && tooltipContent
        ? createPortal(tooltipContent, document.body)
        : tooltipContent}
    </>
  );
};
