import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface ModalState {
  modals: Record<string, boolean>;
  openModal: (id: string) => void;
  closeModal: (id: string) => void;
  toggleModal: (id: string) => void;
  isOpen: (id: string) => boolean;
  closeAllModals: () => void;
}

export const useModalStore = create<ModalState>()(
  devtools(
    (set, get) => ({
      modals: {},

      openModal: (id: string) => {
        set((state) => ({
          modals: { ...state.modals, [id]: true },
        }));
      },

      closeModal: (id: string) => {
        set((state) => {
          const { [id]: _removed, ...rest } = state.modals;
          return { modals: rest };
        });
      },

      toggleModal: (id: string) => {
        set((state) => ({
          modals: {
            ...state.modals,
            [id]: !state.modals[id],
          },
        }));
      },

      isOpen: (id: string) => {
        return get().modals[id] || false;
      },

      closeAllModals: () => {
        set({ modals: {} });
      },
    }),
    { name: "ModalStore" }
  )
);
