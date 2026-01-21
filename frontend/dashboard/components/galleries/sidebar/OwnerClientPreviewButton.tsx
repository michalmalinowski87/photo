import { Eye } from "lucide-react";
import React from "react";

import { useToast } from "../../../hooks/useToast";
import { buildTenantGalleryUrl } from "../../../lib/gallery-url";
import type { Gallery } from "../../../types";
import Button from "../../ui/button/Button";

interface OwnerClientPreviewButtonProps {
  gallery: Gallery | null | undefined;
}

export function OwnerClientPreviewButton({ gallery }: OwnerClientPreviewButtonProps) {
  const { showToast } = useToast();

  const handleOpenPreview = () => {
    if (!gallery?.galleryId) {
      return;
    }

    try {
      const baseUrl = buildTenantGalleryUrl(gallery);
      const url = `${baseUrl}?ownerPreview=1`;

      // IMPORTANT: do not use `noopener` here, we need `window.opener` for postMessage token handoff.
      window.open(url, "_blank");
    } catch (_error) {
      showToast(
        "error",
        "Brak konfiguracji",
        "Ustaw NEXT_PUBLIC_GALLERY_URL aby otwierać podgląd galerii."
      );
    }
  };

  return (
    <div className="mt-auto p-3 pb-0">
      <Button
        size="md"
        variant="outline"
        onClick={handleOpenPreview}
        disabled={!gallery?.galleryId}
        className="w-full"
        startIcon={<Eye size={20} />}
      >
        Podgląd galerii
      </Button>
    </div>
  );
}
