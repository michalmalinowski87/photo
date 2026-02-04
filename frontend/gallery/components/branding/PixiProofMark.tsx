"use client";

import React from "react";

export function PixiProofMark({
  className,
  variant = "full",
  showSlogan = false,
}: {
  className?: string;
  variant?: "icon" | "wordmark" | "full";
  showSlogan?: boolean;
}) {
  // Intentionally simple wordmark (matches brand usage across apps)
  // Avoids any custom SVG marks that could be confused with other brands.
  const sizeClass =
    variant === "icon" ? "text-3xl" : variant === "wordmark" ? "text-4xl" : "text-5xl md:text-6xl";

  return (
    <div className={className}>
      <div className="flex flex-col items-center">
        <span
          className={`${sizeClass} font-bold tracking-tight text-gray-900/55 dark:text-white/75 select-none`}
          aria-label="PixiProof"
        >
          PixiProof
        </span>
        {showSlogan && (
          <p className="text-sm md:text-base text-gray-600 dark:text-gray-400 mt-1 font-medium tracking-wide">
            Your photos. Their stories.
          </p>
        )}
      </div>
    </div>
  );
}
