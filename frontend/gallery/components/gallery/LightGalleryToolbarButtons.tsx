"use client";

import { BookOpen, BookOpenCheck, Image as ImageIcon, ImagePlus, Check } from "lucide-react";
import type { ImageData } from "@/types/gallery";

export interface LightGalleryToolbarButtonsProps {
  currentIndex: number;
  images: ImageData[];
  selectedKeys: Set<string>;
  photoBookKeys: string[];
  photoPrintKeys: string[];
  photoBookCount: number;
  photoPrintCount: number;
  showPhotoBookUi: boolean;
  showPhotoPrintUi: boolean;
  baseLimit: number;
  extraPriceCents: number;
  currentSelectedCount: number;
  onImageSelect: (key: string) => void;
  onTogglePhotoBook?: (key: string) => void;
  onTogglePhotoPrint?: (key: string) => void;
}

export function LightGalleryToolbarButtons({
  currentIndex,
  images,
  selectedKeys,
  photoBookKeys,
  photoPrintKeys,
  photoBookCount,
  photoPrintCount,
  showPhotoBookUi,
  showPhotoPrintUi,
  baseLimit,
  extraPriceCents,
  currentSelectedCount,
  onImageSelect,
  onTogglePhotoBook,
  onTogglePhotoPrint,
}: LightGalleryToolbarButtonsProps) {
  const currentImage = images[currentIndex];
  if (!currentImage) return null;

  const isSelected = selectedKeys.has(currentImage.key);
  const isAtMaxLimit = extraPriceCents === 0 && currentSelectedCount >= baseLimit;
  const shouldDisable = !isSelected && isAtMaxLimit;

  const inBook = showPhotoBookUi && photoBookKeys.includes(currentImage.key);
  const inPrint = showPhotoPrintUi && photoPrintKeys.includes(currentImage.key);
  const canAddToBook = showPhotoBookUi && (inBook || photoBookKeys.length < photoBookCount);
  const canAddToPrint = showPhotoPrintUi && (inPrint || photoPrintKeys.length < photoPrintCount);
  const showBook = isSelected && canAddToBook && onTogglePhotoBook;
  const showPrint = isSelected && canAddToPrint && onTogglePhotoPrint;
  const showGroup = showBook || showPrint;

  const handleSelectionClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (shouldDisable) return;
    onImageSelect(currentImage.key);
  };

  const handleBookClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.nativeEvent as Event).stopImmediatePropagation();
    onTogglePhotoBook?.(currentImage.key);
  };

  const handlePrintClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.nativeEvent as Event).stopImmediatePropagation();
    onTogglePhotoPrint?.(currentImage.key);
  };

  return (
    <>
      <button
        type="button"
        className="lg-selection-toggle"
        onClick={handleSelectionClick}
        disabled={shouldDisable}
        aria-label={
          isSelected
            ? "Wybrane zdjęcie"
            : shouldDisable
              ? "Osiągnięto limit wyboru zdjęć"
              : "Wybierz zdjęcie"
        }
        title={
          shouldDisable
            ? `Osiągnięto limit wyboru zdjęć (${baseLimit}). Odznacz przynajmniej jedno zdjęcie, aby wybrać inne.`
            : undefined
        }
        style={{
          minWidth: 44,
          minHeight: 44,
          padding: "0 12px",
          display: "flex",
          gap: 8,
          alignItems: "center",
          justifyContent: "center",
          cursor: shouldDisable ? "not-allowed" : "pointer",
          opacity: shouldDisable ? 0.5 : 1,
        }}
      >
        {isSelected ? (
          <>
            <Check className="w-[18px] h-[18px] shrink-0" strokeWidth={2} />
            <span>Wybrane Zdjęcie</span>
          </>
        ) : (
          <span>Wybierz Zdjęcie</span>
        )}
      </button>
      {showGroup && (
        <div
          className="lg-toolbar-selection-group"
          style={{
            marginLeft: "108px",
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
          }}
        >
          {showBook && (
            <button
              type="button"
              className={`lg-photo-book ${inBook ? "lg-toolbar-action-selected" : "lg-toolbar-action-unselected"}`}
              onClick={handleBookClick}
              aria-label={inBook ? "Usuń z albumu" : "Dodaj do albumu"}
              title={inBook ? "Usuń z albumu" : "Dodaj do albumu"}
              style={{
                minWidth: 40,
                minHeight: 40,
                padding: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              {inBook ? (
                <BookOpenCheck className="w-[18px] h-[18px] shrink-0" strokeWidth={2} />
              ) : (
                <BookOpen className="w-[18px] h-[18px] shrink-0" strokeWidth={2} />
              )}
            </button>
          )}
          {showPrint && (
            <button
              type="button"
              className={`lg-photo-print ${inPrint ? "lg-toolbar-action-selected" : "lg-toolbar-action-unselected"}`}
              onClick={handlePrintClick}
              aria-label={inPrint ? "Usuń z druku" : "Dodaj do druku"}
              title={inPrint ? "Usuń z druku" : "Dodaj do druku"}
              style={{
                minWidth: 40,
                minHeight: 40,
                padding: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              {inPrint ? (
                <ImageIcon className="w-[18px] h-[18px] shrink-0" strokeWidth={2} />
              ) : (
                <ImagePlus className="w-[18px] h-[18px] shrink-0" strokeWidth={2} />
              )}
            </button>
          )}
        </div>
      )}
    </>
  );
}
