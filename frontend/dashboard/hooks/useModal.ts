import { useCallback } from "react";

import { useModalStore } from "../store/modalSlice";

/**
 * Hook for managing modal state
 * Uses Zustand store to prevent prop drilling and reduce re-renders
 *
 * @param modalId - Unique identifier for the modal
 * @returns Object with isOpen, openModal, closeModal, toggleModal
 *
 * @example
 * const { isOpen, openModal, closeModal } = useModal('payment-modal');
 *
 * <Modal isOpen={isOpen} onClose={closeModal}>
 *   ...
 * </Modal>
 */
export const useModal = (modalId: string) => {
  const isOpen = useModalStore((state) => state.isOpen(modalId));
  const openModal = useModalStore((state) => state.openModal);
  const closeModal = useModalStore((state) => state.closeModal);
  const toggleModal = useModalStore((state) => state.toggleModal);

  const handleOpen = useCallback(() => {
    openModal(modalId);
  }, [modalId, openModal]);

  const handleClose = useCallback(() => {
    closeModal(modalId);
  }, [modalId, closeModal]);

  const handleToggle = useCallback(() => {
    toggleModal(modalId);
  }, [modalId, toggleModal]);

  return {
    isOpen,
    openModal: handleOpen,
    closeModal: handleClose,
    toggleModal: handleToggle,
  };
};
