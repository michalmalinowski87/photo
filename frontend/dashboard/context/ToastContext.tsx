import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";
import Toast from "../components/ui/toast/Toast";

export interface ToastMessage {
  id: string;
  variant: "success" | "error" | "warning" | "info";
  title: string;
  message: string;
  duration?: number;
}

interface ToastContextType {
  showToast: (
    variant: "success" | "error" | "warning" | "info",
    title: string,
    message: string,
    duration?: number
  ) => string;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
};

interface ToastProviderProps {
  children: ReactNode;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const showToast = useCallback(
    (
      variant: "success" | "error" | "warning" | "info",
      title: string,
      message: string,
      duration?: number
    ) => {
      const id = Math.random().toString(36).substring(7);
      setToasts((prev) => [...prev, { id, variant, title, message, duration }]);
      return id;
    },
    []
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  useEffect(() => {
    if (mounted && typeof window !== 'undefined' && toasts.length > 0) {
      // Force toast container to be last element in body
      const container = document.querySelector('[data-toast-container]');
      if (container && container.parentNode) {
        container.parentNode.removeChild(container);
        document.body.appendChild(container);
      }
    }
  }, [mounted, toasts.length]);

  return (
    <ToastContext.Provider value={{ showToast, removeToast }}>
      {children}
      {/* Render toasts via portal directly to body - ensures viewport positioning */}
      {mounted && typeof window !== 'undefined' && createPortal(
        <div 
          data-toast-container
          className="flex flex-col gap-2 pointer-events-none toast-container rounded-xl overflow-hidden" 
          style={{ 
            position: 'fixed',
            top: '87px',
            right: '16px',
            zIndex: 2147483647,
            maxWidth: '420px',
            width: 'auto',
            pointerEvents: 'none',
            backgroundColor: 'rgb(249 250 251)', // bg-gray-50 for light mode
            borderRadius: '0.75rem', // rounded-xl to match Alert component
          } as React.CSSProperties}
        >
          {toasts.map((toast) => (
            <div 
              key={toast.id} 
              className="pointer-events-auto rounded-xl overflow-hidden"
              style={{ 
                position: 'relative'
              } as React.CSSProperties}
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
      )}
    </ToastContext.Provider>
  );
};

