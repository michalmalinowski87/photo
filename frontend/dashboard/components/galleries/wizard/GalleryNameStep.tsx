import React from "react";

import Input from "../../ui/input/InputField";

interface GalleryNameStepProps {
  galleryName: string;
  onGalleryNameChange: (name: string) => void;
  error?: string;
  onErrorChange: (error: string) => void;
}

export const GalleryNameStep: React.FC<GalleryNameStepProps> = ({
  galleryName,
  onGalleryNameChange,
  error,
  onErrorChange,
}) => {
  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="text-center space-y-2">
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Nazwa galerii</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Podaj unikalną nazwę dla tej galerii
        </p>
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Nazwa galerii *
        </label>
        <Input
          type="text"
          placeholder="np. Sesja ślubna - Anna i Jan"
          value={galleryName}
          onChange={(e) => {
            onGalleryNameChange(e.target.value);
            onErrorChange("");
          }}
          error={!!error}
          hint={error}
        />
      </div>
    </div>
  );
};
