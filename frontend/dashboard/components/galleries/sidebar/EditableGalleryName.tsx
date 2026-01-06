import { Check, X, Pencil } from "lucide-react";
import React from "react";

import { useGalleryNameEdit } from "../../../hooks/useGalleryNameEdit";
import { Loading } from "../../ui/loading/Loading";
import { Tooltip } from "../../ui/tooltip/Tooltip";

interface EditableGalleryNameProps {
  galleryId: string;
  galleryName: string;
  onNameClick?: () => void;
}

export const EditableGalleryName = ({
  galleryId,
  galleryName,
  onNameClick,
}: EditableGalleryNameProps) => {
  const {
    isEditing,
    editingValue,
    isSaving,
    setEditingValue,
    handleStartEdit,
    handleCancelEdit,
    handleSave,
    handleKeyDown,
  } = useGalleryNameEdit({
    galleryId,
    currentGalleryName: galleryName,
  });

  const displayName = typeof galleryName === "string" ? galleryName : "Galeria";

  // Track if we're clicking a button to prevent blur from triggering save
  const buttonRef = React.useRef<HTMLDivElement>(null);

  const handleInputBlur = React.useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      // Don't save if focus is moving to a button
      if (buttonRef.current?.contains(e.relatedTarget as Node)) {
        return;
      }
      void handleSave();
    },
    [handleSave]
  );

  if (isEditing) {
    return (
      <div className="flex items-center gap-2 w-full">
        <input
          type="text"
          value={editingValue}
          onChange={(e) => setEditingValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleInputBlur}
          className="flex-1 text-lg font-semibold text-gray-900 dark:text-white bg-transparent border-0 border-b-2 border-gray-400 dark:border-gray-500 focus:outline-none focus:border-brand-500 dark:focus:border-photographer-accent px-0 py-1"
          autoFocus
          disabled={isSaving}
          maxLength={100}
        />
        <div ref={buttonRef} className="flex items-center gap-1">
          <Tooltip content="Zapisz">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="p-1 text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Check className="w-4 h-4" strokeWidth={2} />
            </button>
          </Tooltip>
          <Tooltip content="Anuluj">
            <button
              onClick={handleCancelEdit}
              disabled={isSaving}
              className="p-1 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <X className="w-4 h-4" strokeWidth={2} />
            </button>
          </Tooltip>
          {isSaving && <Loading size="sm" />}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 w-full">
      <button
        onClick={onNameClick}
        className="flex-1 text-left text-lg font-semibold text-gray-900 dark:text-white hover:text-brand-600 dark:hover:text-photographer-accent transition-colors"
      >
        {displayName}
      </button>
      <Tooltip content="Edytuj nazwę">
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleStartEdit();
          }}
          className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 transition-colors"
        >
          <Pencil className="w-4 h-4" strokeWidth={2} />
        </button>
      </Tooltip>
    </div>
  );
};
