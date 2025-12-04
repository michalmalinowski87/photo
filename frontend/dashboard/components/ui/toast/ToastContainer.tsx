import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { useToastStore, type ToastMessage } from "../../../store";

import Toast from "./Toast";

/**
 * ToastContainer component that renders toasts from Zustand store
 * This replaces the ToastProvider context component
 */
export const ToastContainer: React.FC = () => {
  const toasts = useToastStore((state) => state.toasts);
  const removeToast = useToastStore((state) => state.removeToast);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && typeof window !== "undefined" && toasts.length > 0) {
      // Force toast container to be last element in body
      const container = document.querySelector("[data-toast-container]");
      if (container?.parentNode) {
        container.parentNode.removeChild(container);
        document.body.appendChild(container);
      }
    }
  }, [mounted, toasts.length]);

  if (!mounted || typeof window === "undefined" || toasts.length === 0) {
    return null;
  }

  return createPortal(
    <div
      data-toast-container
      className="flex flex-col gap-2 pointer-events-none toast-container rounded-xl overflow-hidden bg-gray-50 dark:bg-gray-dark"
      style={
        {
          position: "fixed",
          top: "87px",
          right: "16px",
          zIndex: 2147483647,
          maxWidth: "420px",
          width: "auto",
          pointerEvents: "none",
        } as React.CSSProperties
      }
    >
      {toasts.map((toast: ToastMessage) => (
        <div
          key={toast.id}
          className="pointer-events-auto rounded-xl overflow-hidden"
          style={
            {
              position: "relative",
            } as React.CSSProperties
          }
        >
          <Toast
            variant={toast.variant}
            title={toast.title}
            message={toast.message}
            onClose={() => removeToast(toast.id)}
            duration={toast.duration ?? 2000}
          />
        </div>
      ))}
    </div>,
    document.body
  );
};
