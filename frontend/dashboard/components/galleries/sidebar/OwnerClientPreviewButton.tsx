import { Eye, ExternalLink } from "lucide-react";
import React from "react";

import { useToast } from "../../../hooks/useToast";
import Button from "../../ui/button/Button";

interface OwnerClientPreviewButtonProps {
  galleryId: string;
}

export function OwnerClientPreviewButton({ galleryId }: OwnerClientPreviewButtonProps) {
  const { showToast } = useToast();

  const handleOpenPreview = () => {
    if (!galleryId) {
      return;
    }

    const base =
      process.env.NEXT_PUBLIC_GALLERY_URL ??
      (typeof window !== "undefined" ? `${window.location.origin}/gallery` : "");

    if (!base) {
      showToast(
        "error",
        "Brak konfiguracji",
        "Ustaw NEXT_PUBLIC_GALLERY_URL aby otwierać podgląd galerii."
      );
      return;
    }

    const baseTrimmed = base.replace(/\/$/, "");
    const url = `${baseTrimmed}/${encodeURIComponent(galleryId)}?ownerPreview=1`;

    // IMPORTANT: do not use `noopener` here, we need `window.opener` for postMessage token handoff.
    window.open(url, "_blank");
  };

  return (
    <div className="mt-auto p-3 pb-0">
      <Button
        size="md"
        variant="outline"
        onClick={handleOpenPreview}
        disabled={!galleryId}
        className="w-full"
        startIcon={<Eye size={20} />}
      >
        Podgląd galerii
      </Button>
    </div>
  );
}
