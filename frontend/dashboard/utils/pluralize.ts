/**
 * Polish pluralization rules for "zdjęcie"
 * - 0: zdjęć
 * - 1: zdjęcie
 * - 2-4: zdjęcia
 * - 5+: zdjęć
 */
export function pluralizeZdjęcie(count: number): string {
  if (count === 0) {
    return "zdjęć";
  }
  if (count === 1) {
    return "zdjęcie";
  }
  if (count >= 2 && count <= 4) {
    return "zdjęcia";
  }
  // 5 and above
  return "zdjęć";
}

