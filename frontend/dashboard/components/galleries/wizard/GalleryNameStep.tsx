import React from "react";

import TypeformInput from "../../ui/input/TypeformInput";

interface GalleryNameStepProps {
  galleryName: string;
  onGalleryNameChange: (name: string) => void;
  error?: string;
}

export const GalleryNameStep: React.FC<GalleryNameStepProps> = ({
  galleryName,
  onGalleryNameChange,
  error,
}) => {
  return (
    <div className="w-full">
      <TypeformInput
        type="text"
        placeholder=""
        value={galleryName}
        onChange={(e) => onGalleryNameChange(e.target.value)}
        error={!!error}
        errorMessage={error}
        autoFocus
      />
    </div>
  );
};
