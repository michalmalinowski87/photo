"use client";

import React, { useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { FlaskConical, X } from "lucide-react";

/**
 * Floating dev menu button that appears in the bottom-right corner
 * Provides quick access to dev tools
 */
export const DevMenuButton: React.FC = () => {
  const router = useRouter();
  const [isHovered, setIsHovered] = useState(false);

  // Only show on dev routes or main routes (not on gallery detail pages)
  const showButton =
    !router.pathname?.includes("/galleries/[id]") &&
    router.pathname !== "/dev/create-test-galleries" &&
    router.pathname !== "/dev/delete-galleries-by-status";

  if (!showButton) {
    return null;
  }

  return (
    <Link
      href="/dev"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 bg-purple-600 text-white rounded-full shadow-lg hover:bg-purple-700 transition-all duration-200 ${
        router.pathname === "/dev" ? "ring-4 ring-purple-300 dark:ring-purple-700" : ""
      }`}
      aria-label="Dev Menu"
    >
      <FlaskConical size={20} />
      {(isHovered || router.pathname === "/dev") && (
        <span className="text-sm font-medium whitespace-nowrap">Dev Menu</span>
      )}
    </Link>
  );
};

