import { Check } from "lucide-react";
import React, { useId, useState, useEffect } from "react";

import Button from "../ui/button/Button";
import { Modal } from "../ui/modal";

export type CollisionAction = "stop" | "skip" | "replace" | "duplicate";

interface UploadCollisionModalProps {
  isOpen: boolean;
  fileName: string;
  totalCount: number;
  onChoice: (action: CollisionAction, applyToAll: boolean) => void;
}

export const UploadCollisionModal = ({
  isOpen,
  fileName,
  totalCount,
  onChoice,
}: UploadCollisionModalProps) => {
  const [applyToAllChecked, setApplyToAllChecked] = useState(false);
  const checkboxId = useId();

  useEffect(() => {
    if (isOpen) {
      setApplyToAllChecked(false);
    }
  }, [isOpen]);

  const handleChoice = (action: CollisionAction) => {
    onChoice(action, applyToAllChecked);
  };

  const applyToAllLabel = `Zastosuj do: ${totalCount}`;

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => handleChoice("stop")}
      showCloseButton={true}
      className="max-w-2xl"
    >
      <div className="p-6">
        <h2 className="text-3xl font-semibold text-gray-900 dark:text-white">Plik już istnieje</h2>

        <div className="mt-3 mb-4 border-t border-gray-300 dark:border-gray-600" />

        <p className="text-lg text-gray-600 dark:text-gray-400 mb-6">
          Element o nazwie &quot;{fileName}&quot; już istnieje w tej galerii. Czy chcesz go
          zastąpić, pominąć czy duplikować?
        </p>

        {totalCount > 0 && (
          <label
            htmlFor={checkboxId}
            className="mb-6 flex cursor-pointer items-start gap-3 rounded-lg border border-gray-400 dark:border-gray-700 bg-photographer-background p-4 dark:bg-gray-800/50"
          >
            <input
              id={checkboxId}
              type="checkbox"
              checked={applyToAllChecked}
              onChange={(e) => setApplyToAllChecked(e.target.checked)}
              className="sr-only"
              aria-label={applyToAllLabel}
            />
            <span
              className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 transition-all duration-200 ${
                applyToAllChecked
                  ? "border-blue-600 bg-blue-600 dark:border-blue-500 dark:bg-blue-500"
                  : "border-photographer-border bg-white dark:border-gray-600 dark:bg-gray-700"
              }`}
            >
              {applyToAllChecked && (
                <Check className="h-3.5 w-3.5 shrink-0 text-white" strokeWidth={3} aria-hidden />
              )}
            </span>
            <span className="text-lg leading-relaxed text-gray-700 dark:text-gray-300">
              {applyToAllLabel}
            </span>
          </label>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="danger" onClick={() => handleChoice("stop")}>
            Zatrzymaj
          </Button>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleChoice("skip")}
              className="px-4 py-2 text-base font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              Pomiń
            </button>
            <Button variant="secondary" onClick={() => handleChoice("replace")}>
              Zastąp
            </Button>
            <Button variant="primary" onClick={() => handleChoice("duplicate")}>
              Duplikuj
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
