import type React from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface DropdownProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  triggerRef?: React.RefObject<HTMLElement | null> | { current: HTMLElement | null };
}

export const Dropdown = ({
  isOpen,
  onClose,
  children,
  className = "",
  triggerRef,
}: DropdownProps) => {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{
    top?: number;
    bottom?: number;
    right: number;
  }>({ top: 0, right: 0 });
  const positionModeRef = useRef<"top" | "bottom">("bottom");

  useEffect(() => {
    if (!isOpen || !triggerRef?.current) {
      return;
    }

    const updatePosition = () => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        const viewportHeight = window.innerHeight;

        // Estimate dropdown height (will be refined after render)
        // Typical dropdown with 2-3 items is ~120-180px
        const estimatedDropdownHeight = 180;
        const spaceBelow = viewportHeight - rect.bottom;
        const spaceAbove = rect.top;

        // Position above if there's not enough space below but more space above
        const needsToBeAbove = spaceBelow < estimatedDropdownHeight && spaceAbove > spaceBelow;

        if (needsToBeAbove) {
          positionModeRef.current = "top";
          // Position above the button
          setPosition({
            top: undefined,
            bottom: viewportHeight - rect.top + 4, // 4px gap above button
            right: window.innerWidth - rect.right,
          });
        } else {
          positionModeRef.current = "bottom";
          // Position below the button (default)
          setPosition({
            top: rect.bottom + 4, // 4px = mt-1 equivalent
            bottom: undefined,
            right: window.innerWidth - rect.right,
          });
        }
      }
    };

    updatePosition();

    // Refine position after dropdown is rendered and we can measure its actual height
    const refinePosition = () => {
      if (triggerRef.current && dropdownRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        const dropdownHeight = dropdownRef.current.offsetHeight;
        const viewportHeight = window.innerHeight;
        const spaceBelow = viewportHeight - rect.bottom;
        const spaceAbove = rect.top;

        // Check again with actual height
        const needsToBeAbove = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;
        const currentlyAbove = positionModeRef.current === "top";

        if (needsToBeAbove && !currentlyAbove) {
          // Switch to above
          positionModeRef.current = "top";
          setPosition({
            top: undefined,
            bottom: viewportHeight - rect.top + 4,
            right: window.innerWidth - rect.right,
          });
        } else if (!needsToBeAbove && currentlyAbove) {
          // Switch to below
          positionModeRef.current = "bottom";
          setPosition({
            top: rect.bottom + 4,
            bottom: undefined,
            right: window.innerWidth - rect.right,
          });
        }
      }
    };

    // Refine after a short delay to allow dropdown to render
    const refineTimeout = setTimeout(refinePosition, 10);

    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);

    return () => {
      clearTimeout(refineTimeout);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [isOpen, triggerRef]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        triggerRef?.current &&
        !triggerRef.current.contains(target) &&
        !target.closest(".dropdown-toggle")
      ) {
        onClose();
      }
    };

    // Use a small delay to prevent immediate close on open
    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose, triggerRef]);

  if (!isOpen) {
    return null;
  }

  const dropdownContent = (
    <div
      ref={dropdownRef}
      className={`fixed z-[100000] rounded-xl border border-gray-200 bg-white shadow-theme-lg dark:border-gray-800 dark:bg-gray-900 overflow-hidden ${className}`}
      style={{
        ...(position.top !== undefined ? { top: `${position.top}px` } : {}),
        ...(position.bottom !== undefined ? { bottom: `${position.bottom}px` } : {}),
        right: `${position.right}px`,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );

  // Render via portal to document.body to ensure it's above all table rows
  if (typeof window !== "undefined") {
    return createPortal(dropdownContent, document.body);
  }

  return dropdownContent;
};
