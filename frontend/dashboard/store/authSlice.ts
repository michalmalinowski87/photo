import { StateCreator } from "zustand";

export interface AuthSlice {
  isSessionExpired: boolean;
  returnUrl: string;
  setSessionExpired: (expired: boolean, returnUrl?: string) => void;
}

export const createAuthSlice: StateCreator<
  AuthSlice,
  [["zustand/devtools", never]],
  [],
  AuthSlice
> = (set) => ({
  isSessionExpired: false,
  returnUrl: "",

  setSessionExpired: (expired: boolean, returnUrl?: string) => {
    set(
      {
        isSessionExpired: expired,
        returnUrl: returnUrl ?? "",
      },
      undefined,
      "auth/setSessionExpired"
    );
  },
});
