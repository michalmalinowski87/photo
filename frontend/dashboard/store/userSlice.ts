import { StateCreator } from "zustand";

import { storeLogger } from "../lib/store-logger";

export interface UserSlice {
  userId: string | null;
  email: string | null;
  username: string | null;
  walletBalanceCents: number | null;
  isLoading: boolean;
  setUser: (userId: string, email: string, username: string) => void;
  setWalletBalance: (balanceCents: number) => void;
  clearUserState: () => void;
  refreshWalletBalance: () => Promise<void>;
}

export const createUserSlice: StateCreator<
  UserSlice,
  [["zustand/devtools", never]],
  [],
  UserSlice
> = (set, get) => ({
  userId: null,
  email: null,
  username: null,
  walletBalanceCents: null,
  isLoading: false,

  setUser: (userId: string, email: string, username: string) => {
    storeLogger.logAction("user", "setUser", { userId, email, username });
    const currentState = get();
    // Only update if values actually changed to prevent unnecessary state updates
    if (
      currentState.userId === userId &&
      currentState.email === email &&
      currentState.username === username
    ) {
      storeLogger.log("user", "setUser: skipped (unchanged)", { userId, email, username });
      return;
    }
    storeLogger.logStateChange(
      "user",
      "setUser",
      { userId: currentState.userId, email: currentState.email, username: currentState.username },
      { userId, email, username },
      ["userId", "email", "username"]
    );
    set({ userId, email, username }, undefined, "user/setUser");
  },

  setWalletBalance: (balanceCents: number) => {
    const currentState = get();
    if (currentState.walletBalanceCents !== balanceCents) {
      storeLogger.logStateChange(
        "user",
        "setWalletBalance",
        { walletBalanceCents: currentState.walletBalanceCents },
        { walletBalanceCents: balanceCents },
        ["walletBalanceCents"]
      );
    }
    set({ walletBalanceCents: balanceCents }, undefined, "user/setWalletBalance");
  },

  clearUserState: () => {
    set(
      {
        userId: null,
        email: null,
        username: null,
        walletBalanceCents: null,
        isLoading: false,
      },
      undefined,
      "user/clearUserState"
    );
  },

  refreshWalletBalance: async () => {
    storeLogger.logAction("user", "refreshWalletBalance", {});
    const timerKey = "refreshWalletBalance";
    storeLogger.startTimer(timerKey);
    storeLogger.logLoadingState("user", "refreshWalletBalance", true);
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";

    if (!apiUrl || typeof window === "undefined") {
      return;
    }

    set({ isLoading: true }, undefined, "user/refreshWalletBalance/start");
    try {
      const { default: api } = await import("../lib/api-service");
      const response = await api.wallet.getBalance();
      storeLogger.logLoadingState("user", "refreshWalletBalance", false);
      set(
        {
          walletBalanceCents: response.balanceCents || 0,
          isLoading: false,
        },
        undefined,
        "user/refreshWalletBalance/success"
      );
      storeLogger.endTimer(timerKey, "user", "refreshWalletBalance", {
        balanceCents: response.balanceCents,
      });
    } catch (_err) {
      // Silently fail - wallet balance is not critical
      storeLogger.logLoadingState("user", "refreshWalletBalance", false, { error: true });
      storeLogger.endTimer(timerKey, "user", "refreshWalletBalance", { error: true });
      set({ isLoading: false }, undefined, "user/refreshWalletBalance/error");
    }
  },
});
