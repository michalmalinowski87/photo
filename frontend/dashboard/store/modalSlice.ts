import { StateCreator } from "zustand";

export interface ModalSlice {
  modals: Record<string, boolean>;
  openModal: (id: string) => void;
  closeModal: (id: string) => void;
  toggleModal: (id: string) => void;
  isOpen: (id: string) => boolean;
  closeAllModals: () => void;
}

export const createModalSlice: StateCreator<
  ModalSlice,
  [["zustand/devtools", never]],
  [],
  ModalSlice
> = (set, get) => ({
  modals: {},

  openModal: (id: string) => {
    set(
      (state) => ({
        modals: { ...state.modals, [id]: true },
      }),
      undefined,
      `modal/openModal/${id}`
    );
  },

  closeModal: (id: string) => {
    set(
      (state) => {
        const { [id]: _removed, ...rest } = state.modals;
        return { modals: rest };
      },
      undefined,
      `modal/closeModal/${id}`
    );
  },

  toggleModal: (id: string) => {
    set(
      (state) => ({
        modals: {
          ...state.modals,
          [id]: !state.modals[id],
        },
      }),
      undefined,
      `modal/toggleModal/${id}`
    );
  },

  isOpen: (id: string) => {
    return get().modals[id] || false;
  },

  closeAllModals: () => {
    set({ modals: {} }, undefined, "modal/closeAllModals");
  },
});

