"use client";

import { useState, useEffect } from "react";
import { ChevronUp } from "lucide-react";
import { hapticFeedback } from "@/utils/hapticFeedback";

export function ScrollToTopButton() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const toggleVisibility = () => {
      // Show button when user scrolls down 300px
      if (window.scrollY > 300) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    window.addEventListener("scroll", toggleVisibility);

    return () => {
      window.removeEventListener("scroll", toggleVisibility);
    };
  }, []);

  const scrollToTop = () => {
    hapticFeedback("light");
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  if (!isVisible) {
    return null;
  }

  return (
    <button
      onClick={scrollToTop}
      className="fixed bottom-6 right-6 z-50 w-12 h-12 bg-white/80 backdrop-blur-sm border border-gray-200/50 rounded-lg shadow-lg hover:bg-white/90 hover:shadow-xl transition-all duration-200 ease-out flex items-center justify-center group"
      aria-label="Scroll to top"
      title="Scroll to top"
    >
      <ChevronUp className="w-6 h-6 text-gray-700 group-hover:text-gray-900 transition-colors" />
    </button>
  );
}
