/**
 * Utility functions for calculating photo estimates based on storage size
 * 
 * Assumptions:
 * - Each photo is estimated to be between 15MB and 25MB
 * - This is a rough estimate and actual photo sizes may vary
 * - Calculations are for informational purposes only
 */

export interface PhotoEstimate {
  min: number;
  max: number;
  displayText: string;
  tooltipText: string;
}

/**
 * Calculate photo estimates for common storage sizes
 * @param storage Storage size as string (e.g., "1GB", "3GB", "10GB")
 * @returns Photo estimate with min, max, display text, and tooltip
 */
export function calculatePhotoEstimateFromStorage(storage: "1GB" | "3GB" | "10GB"): PhotoEstimate {
  const storageGB = 
    storage === "1GB" ? 1 :
    storage === "3GB" ? 3 : 10;
  
  // Calculate based on 15-25MB per photo
  const minPhotos = Math.floor((storageGB * 1024) / 25); // Using 25MB (more photos)
  const maxPhotos = Math.floor((storageGB * 1024) / 15); // Using 15MB (fewer photos)
  
  const displayText = `~${minPhotos.toLocaleString()}-${maxPhotos.toLocaleString()} zdjęć`;
  
  const tooltipText = `Szacunkowa liczba zdjęć obliczona na podstawie założenia, że każde zdjęcie ma rozmiar od 15MB do 25MB. Rzeczywista liczba zdjęć może się różnić w zależności od rozdzielczości, formatu i kompresji zdjęć.`;
  
  return {
    min: minPhotos,
    max: maxPhotos,
    displayText,
    tooltipText,
  };
}

