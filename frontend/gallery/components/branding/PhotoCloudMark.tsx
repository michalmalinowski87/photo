"use client";

import React from "react";

export function PhotoCloudMark({
  className,
  variant = "full",
}: {
  className?: string;
  variant?: "icon" | "wordmark" | "full";
}) {
  // Intentionally simple wordmark (matches brand usage across apps)
  // Avoids any custom SVG marks that could be confused with other brands.
  const sizeClass =
    variant === "icon" ? "text-3xl" : variant === "wordmark" ? "text-4xl" : "text-5xl md:text-6xl";

  return (
    <div className={className}>
      <span
        className={`${sizeClass} font-bold tracking-tight text-gray-900/55 dark:text-white/75 select-none`}
        aria-label="PhotoCloud"
      >
        PhotoCloud
      </span>
    </div>
  );
}

