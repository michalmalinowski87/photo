import { create } from "zustand";
import { persist, devtools } from "zustand/middleware";

interface UserState {
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

export const useUserStore = create<UserState>()(
  devtools(
    persist(
      (set, _get) => ({
        userId: null,
        email: null,
        username: null,
        walletBalanceCents: null,
        isLoading: false,

        setUser: (userId: string, email: string, username: string) => {
          set({ userId, email, username });
        },

        setWalletBalance: (balanceCents: number) => {
          set({ walletBalanceCents: balanceCents });
        },

        clearUserState: () => {
          set({
            userId: null,
            email: null,
            username: null,
            walletBalanceCents: null,
            isLoading: false,
          });
        },

        refreshWalletBalance: async () => {
          const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";

          if (!apiUrl || typeof window === "undefined") {
            return;
          }

          set({ isLoading: true });
          try {
            const { apiFetchWithAuth } = await import("../lib/api");
            const { data } = await apiFetchWithAuth(`${apiUrl}/wallet/balance`);
            set({
              walletBalanceCents: (data as { balanceCents?: number })?.balanceCents || 0,
              isLoading: false,
            });
          } catch (_err) {
            // Silently fail - wallet balance is not critical
            set({ isLoading: false });
          }
        },
      }),
      {
        name: "user-storage",
        partialize: (state) => ({
          // Only persist user identity, not wallet balance (ephemeral)
          userId: state.userId,
          email: state.email,
          username: state.username,
        }),
      }
    ),
    { name: "UserStore" }
  )
);
