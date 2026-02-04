import { PostHogActions } from "@photocloud/posthog-types";
import React from "react";

import TypeformInput from "../../ui/input/TypeformInput";

interface GalleryNameStepProps {
  galleryName: string;
  onGalleryNameChange: (name: string) => void;
  error?: string;
}

export const GalleryNameStep = ({
  galleryName,
  onGalleryNameChange,
  error,
}: GalleryNameStepProps) => {
  return (
    <div className="w-full mt-[150px]">
      <div className="mb-8 md:mb-12">
        <div className="text-2xl md:text-3xl font-medium text-photographer-heading dark:text-white mb-2">
          Jaką nazwę ma mieć galeria? *
        </div>
        <p className="text-base text-photographer-mutedText dark:text-gray-400 italic">
          To pomoże Ci łatwo ją znaleźć później
        </p>
      </div>
      <TypeformInput
        type="text"
        placeholder=""
        value={galleryName}
        onChange={(e) => {
          const value = e.target.value;
          if (value.length <= 100) {
            onGalleryNameChange(value);
          }
        }}
        error={!!error}
        errorMessage={error}
        autoFocus
        maxLength={100}
        data-ph-action={PostHogActions.gallery.nameInput}
      />
    </div>
  );
};
