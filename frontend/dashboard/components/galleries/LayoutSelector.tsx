"use client";

import { Grid3x3, LayoutGrid, LayoutDashboard } from "lucide-react";

export type GridLayout = "square" | "standard" | "marble";

interface LayoutSelectorProps {
  layout: GridLayout;
  onLayoutChange: (layout: GridLayout) => void;
  className?: string;
}

export function LayoutSelector({ layout, onLayoutChange, className = "" }: LayoutSelectorProps) {
  return (
    <div className={`flex items-center gap-1 sm:gap-2 bg-transparent ${className}`}>
      <button
        onClick={() => onLayoutChange("standard")}
        className={`h-9 w-9 rounded transition-all flex items-center justify-center border-0 touch-manipulation ${
          layout === "standard"
            ? "bg-transparent text-gray-900 dark:text-white"
            : "text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-400"
        }`}
        title="Układ standardowy"
        aria-label="Układ standardowy"
      >
        <Grid3x3 className="w-5 h-5" />
      </button>
      <button
        onClick={() => onLayoutChange("square")}
        className={`h-9 w-9 rounded transition-all flex items-center justify-center border-0 touch-manipulation ${
          layout === "square"
            ? "bg-transparent text-gray-900 dark:text-white"
            : "text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-400"
        }`}
        title="Układ kwadratowy"
        aria-label="Układ kwadratowy"
      >
        <LayoutGrid className="w-5 h-5" />
      </button>
      <button
        onClick={() => onLayoutChange("marble")}
        className={`h-9 w-9 rounded transition-all flex items-center justify-center border-0 touch-manipulation ${
          layout === "marble"
            ? "bg-transparent text-gray-900 dark:text-white"
            : "text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-400"
        }`}
        title="Układ mozaikowy"
        aria-label="Układ mozaikowy"
      >
        <LayoutDashboard className="w-5 h-5" />
      </button>
    </div>
  );
}
