import { useCallback } from "react";

import { useModalContext } from "../context/ModalContext";

/**
 * Hook for managing modal state
 * Uses ModalContext to prevent prop drilling and reduce re-renders
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
  const { isOpen: checkIsOpen, openModal, closeModal, toggleModal } = useModalContext();

  const isOpen = checkIsOpen(modalId);

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
