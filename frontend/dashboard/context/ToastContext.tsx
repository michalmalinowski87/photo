import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";
import Toast from "../components/ui/toast/Toast";

export interface ToastMessage {
  id: string;
  variant: "success" | "error" | "warning" | "info";
  title: string;
  message: string;
}

interface ToastContextType {
  showToast: (
    variant: "success" | "error" | "warning" | "info",
    title: string,
    message: string
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

  const showToast = useCallback(
    (
      variant: "success" | "error" | "warning" | "info",
      title: string,
      message: string
    ) => {
      const id = Math.random().toString(36).substring(7);
      setToasts((prev) => [...prev, { id, variant, title, message }]);
      return id;
    },
    []
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, removeToast }}>
      {children}
      {/* Render toasts */}
      <div className="fixed top-4 right-4 z-[99999] flex flex-col gap-2 max-w-md">
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            variant={toast.variant}
            title={toast.title}
            message={toast.message}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
};

