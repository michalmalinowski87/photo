import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";

interface ModalState {
  modals: Record<string, boolean>;
  openModal: (id: string) => void;
  closeModal: (id: string) => void;
  toggleModal: (id: string) => void;
  isOpen: (id: string) => boolean;
  closeAllModals: () => void;
}

const ModalContext = createContext<ModalState | undefined>(undefined);

interface ModalProviderProps {
  children: ReactNode;
}

export const ModalProvider: React.FC<ModalProviderProps> = ({ children }) => {
  const [modals, setModals] = useState<Record<string, boolean>>({});

  const openModal = useCallback((id: string) => {
    setModals((prev) => ({ ...prev, [id]: true }));
  }, []);

  const closeModal = useCallback((id: string) => {
    setModals((prev) => {
      const { [id]: _removed, ...rest } = prev;
      return rest;
    });
  }, []);

  const toggleModal = useCallback((id: string) => {
    setModals((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }, []);

  const isOpen = useCallback(
    (id: string) => {
      return modals[id] || false;
    },
    [modals]
  );

  const closeAllModals = useCallback(() => {
    setModals({});
  }, []);

  return (
    <ModalContext.Provider
      value={{
        modals,
        openModal,
        closeModal,
        toggleModal,
        isOpen,
        closeAllModals,
      }}
    >
      {children}
    </ModalContext.Provider>
  );
};

export const useModalContext = () => {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error("useModalContext must be used within ModalProvider");
  }
  return context;
};
