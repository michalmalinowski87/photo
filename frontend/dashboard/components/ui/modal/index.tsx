import { useRef, useEffect } from "react";
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

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  children,
  className,
  showCloseButton = true,
  isFullscreen = false,
  closeOnClickOutside = true,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);

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
    : "relative w-full mx-4 rounded-3xl bg-white dark:bg-gray-900 shadow-xl";

  // If className is provided, use it; otherwise default to max-w-lg
  // If className includes height (h-), add flex flex-col for proper layout
  const hasHeight = className?.includes("h-");
  const contentClasses = isFullscreen
    ? baseClasses
    : className
      ? `${baseClasses} ${className}${hasHeight ? " flex flex-col" : ""}`
      : `${baseClasses} max-w-lg`;

  const modalContent = (
    <div className="fixed inset-0 flex items-center justify-center overflow-y-auto modal z-[999999] p-4">
      {!isFullscreen && (
        <div
          className="fixed inset-0 h-full w-full bg-white/30 dark:bg-black/50 backdrop-blur-sm z-[999998]"
          onClick={closeOnClickOutside ? onClose : undefined}
        ></div>
      )}
      <div
        ref={modalRef}
        className={`${contentClasses} z-[999999] relative`}
        onClick={(e) => e.stopPropagation()}
      >
        {showCloseButton && (
          <button
            onClick={onClose}
            className="absolute right-2 top-2 z-999 flex h-8 w-8 items-center justify-center rounded-full bg-[#f0e0ca]/80 text-[#4a4a4a] transition-colors hover:bg-[#f0e0ca] hover:text-[#1a1a1a] dark:bg-[#1a1a1a] dark:text-[#f0e0ca]/70 dark:hover:bg-[#2d2d2d] dark:hover:text-[#f0e0ca] sm:right-3 sm:top-3 sm:h-9 sm:w-9"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M6.04289 16.5413C5.65237 16.9318 5.65237 17.565 6.04289 17.9555C6.43342 18.346 7.06658 18.346 7.45711 17.9555L11.9987 13.4139L16.5408 17.956C16.9313 18.3466 17.5645 18.3466 17.955 17.956C18.3455 17.5655 18.3455 16.9323 17.955 16.5418L13.4129 11.9997L17.955 7.4576C18.3455 7.06707 18.3455 6.43391 17.955 6.04338C17.5645 5.65286 16.9313 5.65286 16.5408 6.04338L11.9987 10.5855L7.45711 6.0439C7.06658 5.65338 6.43342 5.65338 6.04289 6.0439C5.65237 6.43442 5.65237 7.06759 6.04289 7.45811L10.5845 11.9997L6.04289 16.5413Z"
                fill="currentColor"
              />
            </svg>
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
