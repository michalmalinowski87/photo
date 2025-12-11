import { X } from "lucide-react";
import { useRef, useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string;
  children: React.ReactNode;
  showCloseButton?: boolean;
  isFullscreen?: boolean;
  closeOnClickOutside?: boolean;
}

export const Modal = ({
  isOpen,
  onClose,
  children,
  className,
  showCloseButton = true,
  isFullscreen = false,
  closeOnClickOutside = true,
}: ModalProps) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const [isAuthPage, setIsAuthPage] = useState(false);

  // Check if we're on an auth page (auth-dark class)
  useEffect(() => {
    if (typeof document !== "undefined") {
      const checkAuthPage = () => {
        const hasAuthDark = 
          document.documentElement.classList.contains("auth-dark") || 
          document.body.classList.contains("auth-dark");
        setIsAuthPage(hasAuthDark);
      };
      
      checkAuthPage();
      // Also check when modal opens
      if (isOpen) {
        checkAuthPage();
      }
    }
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && showCloseButton) {
        onClose();
      }
    };

    if (isOpen && showCloseButton) {
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose, showCloseButton]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }

    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const baseClasses = isFullscreen
    ? "w-full h-full"
    : isAuthPage
      ? "relative w-full mx-4 rounded-3xl shadow-xl"
      : "relative w-full mx-4 rounded-3xl bg-white dark:bg-gray-900 shadow-xl";

  // If className is provided, use it; otherwise default to max-w-2xl
  // If className includes height (h-), add flex flex-col and overflow-hidden for proper layout
  const hasHeight = className?.includes("h-");
  const contentClasses = isFullscreen
    ? baseClasses
    : className
      ? `${baseClasses} ${className}${hasHeight ? " flex flex-col overflow-hidden" : ""}`
      : `${baseClasses} max-w-2xl`;

  const modalContent = (
    <div className="fixed inset-0 flex items-center justify-center overflow-y-auto modal z-[1000] p-6">
      {!isFullscreen && (
        <div
          className="fixed inset-0 h-full w-full bg-white/30 dark:bg-black/50 backdrop-blur-sm z-[999]"
          onClick={closeOnClickOutside ? onClose : undefined}
        ></div>
      )}
      <div
        ref={modalRef}
        className={`${contentClasses} z-[1000] relative`}
        style={isAuthPage ? { backgroundColor: "hsl(0 0% 3.9%)" } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        {showCloseButton && (
          <button
            onClick={onClose}
            className={`absolute right-2 top-2 z-999 flex h-8 w-8 items-center justify-center rounded-full transition-colors sm:right-3 sm:top-3 sm:h-9 sm:w-9 ${
              isAuthPage
                ? "bg-[#1a1a1a] text-[#f0e0ca]/70 hover:bg-[#2d2d2d] hover:text-[#f0e0ca]"
                : "bg-[#f0e0ca]/80 text-[#4a4a4a] hover:bg-[#f0e0ca] hover:text-[#1a1a1a] dark:bg-[#1a1a1a] dark:text-[#f0e0ca]/70 dark:hover:bg-[#2d2d2d] dark:hover:text-[#f0e0ca]"
            }`}
          >
            <X size={24} />
          </button>
        )}
        <div>{children}</div>
      </div>
    </div>
  );

  // Render modal via portal to document.body to ensure it's above all other content
  // This bypasses any stacking context issues from parent elements
  if (typeof window !== "undefined") {
    return createPortal(modalContent, document.body);
  }

  return modalContent;
};
