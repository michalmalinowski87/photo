import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface AuthState {
  isSessionExpired: boolean;
  returnUrl: string;
  setSessionExpired: (expired: boolean, returnUrl?: string) => void;
}

export const useAuthStore = create<AuthState>()(
  devtools(
    (set) => ({
      isSessionExpired: false,
      returnUrl: "",

      setSessionExpired: (expired: boolean, returnUrl?: string) => {
        set({
          isSessionExpired: expired,
          returnUrl: returnUrl ?? "",
        });
      },
    }),
    { name: "AuthStore" }
  )
);

