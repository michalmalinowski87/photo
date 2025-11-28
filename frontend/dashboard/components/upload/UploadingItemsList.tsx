import React from "react";

import { ImageProgressItem } from "./ImageProgressItem";
import type { PerImageProgress } from "./UploadProgressOverlay";

interface UploadingItemsListProps {
  images: PerImageProgress[];
}

export const UploadingItemsList: React.FC<UploadingItemsListProps> = ({ images }) => {
  if (images.length === 0) {
    return null;
  }

  return (
    <div className="px-4 py-2">
      <div className="space-y-1">
        {images.map((image, index) => (
          <ImageProgressItem key={`uploading-${image.fileName}-${index}`} image={image} />
        ))}
      </div>
    </div>
  );
};
