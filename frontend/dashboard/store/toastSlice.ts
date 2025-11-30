import { create } from "zustand";
import { devtools } from "zustand/middleware";

export interface ToastMessage {
  id: string;
  variant: "success" | "error" | "warning" | "info";
  title: string;
  message: string;
  duration?: number;
}

interface ToastState {
  toasts: ToastMessage[];
  showToast: (
    variant: "success" | "error" | "warning" | "info",
    title: string,
    message: string,
    duration?: number
  ) => string;
  removeToast: (id: string) => void;
  clearAllToasts: () => void;
}

export const useToastStore = create<ToastState>()(
  devtools(
    (set) => ({
      toasts: [],

      showToast: (
        variant: "success" | "error" | "warning" | "info",
        title: string,
        message: string,
        duration?: number
      ) => {
        const id = Math.random().toString(36).substring(7);
        const newToast: ToastMessage = { id, variant, title, message, duration };
        set((state) => ({
          toasts: [...state.toasts, newToast],
        }));
        return id;
      },

      removeToast: (id: string) => {
        set((state) => ({
          toasts: state.toasts.filter((toast) => toast.id !== id),
        }));
      },

      clearAllToasts: () => {
        set({ toasts: [] });
      },
    }),
    { name: "ToastStore" }
  )
);
