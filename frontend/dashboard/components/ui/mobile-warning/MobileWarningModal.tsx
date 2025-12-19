import { Monitor, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";

import Button from "../button/Button";
import { Modal } from "../modal";

interface MobileWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Modal component that warns users about mobile device limitations
 * Shows a warning that the dashboard is optimized for desktop only
 * due to upload-driven nature, but allows users to proceed
 */
export const MobileWarningModal = ({ isOpen, onClose }: MobileWarningModalProps) => {
  const [hasSeenWarning, setHasSeenWarning] = useState(false);

  useEffect(() => {
    // Check if user has already seen and dismissed this warning in this session
    if (isOpen && typeof window !== "undefined") {
      const seen = sessionStorage.getItem("mobile-warning-dismissed");
      if (seen === "true") {
        setHasSeenWarning(true);
        onClose();
      } else {
        setHasSeenWarning(false);
      }
    }
  }, [isOpen, onClose]);

  const handleContinue = () => {
    // Mark as dismissed for this session
    if (typeof window !== "undefined") {
      sessionStorage.setItem("mobile-warning-dismissed", "true");
    }
    setHasSeenWarning(true);
    onClose();
  };

  // Don't show if user has already dismissed it
  if (hasSeenWarning) {
    return null;
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleContinue}
      showCloseButton={true}
      className="max-w-lg"
      closeOnClickOutside={false}
    >
      <div className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-yellow-900/30 flex items-center justify-center">
            <Smartphone className="w-5 h-5 text-yellow-400" />
          </div>
          <h2 className="text-xl font-semibold text-foreground">Ostrzeżenie o kompatybilności</h2>
        </div>

        <div className="mb-6">
          <p className="text-sm text-muted-foreground mb-3">
            Dashboard jest zoptymalizowany dla komputerów stacjonarnych. Dedykowana wersja mobilna
            jest w przygotowaniu.
          </p>

          <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-3 mb-3">
            <div className="flex items-center gap-2">
              <Monitor className="w-4 h-4 text-blue-400 flex-shrink-0" />
              <p className="text-xs text-blue-200">
                Pełna funkcjonalność jest gwarantowana tylko na komputerach stacjonarnych
              </p>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Możesz kontynuować, ale niektóre funkcje mogą działać nieoptymalnie.
          </p>
        </div>

        <div className="flex justify-end">
          <Button variant="primary" onClick={handleContinue} className="min-w-[120px]">
            Rozumiem
          </Button>
        </div>
      </div>
    </Modal>
  );
};
