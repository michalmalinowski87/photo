import { StateCreator } from "zustand";

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
    const currentState = get();
    // Only update if values actually changed to prevent unnecessary state updates
    if (
      currentState.userId === userId &&
      currentState.email === email &&
      currentState.username === username
    ) {
      if (process.env.NODE_ENV === "development") {
        console.log("[UserSlice] setUser: Skipping - values unchanged", {
          userId,
          email,
          username,
        });
      }
      return;
    }
    if (process.env.NODE_ENV === "development") {
      console.log("[UserSlice] setUser: Updating", {
        old: {
          userId: currentState.userId,
          email: currentState.email,
          username: currentState.username,
        },
        new: { userId, email, username },
      });
    }
    set({ userId, email, username }, undefined, "user/setUser");
  },

  setWalletBalance: (balanceCents: number) => {
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
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";

    if (!apiUrl || typeof window === "undefined") {
      return;
    }

    set({ isLoading: true }, undefined, "user/refreshWalletBalance/start");
    try {
      const { default: api } = await import("../lib/api-service");
      const response = await api.wallet.getBalance();
      set(
        {
          walletBalanceCents: response.balanceCents || 0,
          isLoading: false,
        },
        undefined,
        "user/refreshWalletBalance/success"
      );
    } catch (_err) {
      // Silently fail - wallet balance is not critical
      set({ isLoading: false }, undefined, "user/refreshWalletBalance/error");
    }
  },
});
