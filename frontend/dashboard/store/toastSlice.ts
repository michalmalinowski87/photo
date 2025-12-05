import { StateCreator } from "zustand";

export interface ToastMessage {
  id: string;
  variant: "success" | "error" | "warning" | "info";
  title: string;
  message: string;
  duration?: number;
}

export interface ToastSlice {
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

export const createToastSlice: StateCreator<
  ToastSlice,
  [["zustand/devtools", never]],
  [],
  ToastSlice
> = (set) => ({
  toasts: [],

  showToast: (
    variant: "success" | "error" | "warning" | "info",
    title: string,
    message: string,
    duration?: number
  ) => {
    const id = Math.random().toString(36).substring(7);
    const newToast: ToastMessage = { id, variant, title, message, duration };
    set(
      (state) => ({
        toasts: [...state.toasts, newToast],
      }),
      undefined,
      `toast/showToast/${variant}`
    );
    return id;
  },

  removeToast: (id: string) => {
    set(
      (state) => ({
        toasts: state.toasts.filter((toast) => toast.id !== id),
      }),
      undefined,
      "toast/removeToast"
    );
  },

  clearAllToasts: () => {
    set({ toasts: [] }, undefined, "toast/clearAllToasts");
  },
});
