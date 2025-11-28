/**
 * Frontend Pricing Plans
 * 
 * NOTE: This is a display-only format for the landing page.
 * The single source of truth for pricing is: backend/lib/src/pricing.ts
 * 
 * When updating prices, update backend/lib/src/pricing.ts first,
 * then sync the values here to match (priceCents / 100).
 * 
 * Current prices (from backend):
 * - 1GB: 1m=700¢ (7 PLN), 3m=900¢ (9 PLN), 12m=1500¢ (15 PLN)
 * - 3GB: 1m=1200¢ (12 PLN), 3m=1400¢ (14 PLN), 12m=2100¢ (21 PLN)
 * - 10GB: 1m=1400¢ (14 PLN), 3m=1600¢ (16 PLN), 12m=2600¢ (26 PLN)
 * 
 * Photo estimates are calculated using calculatePhotoEstimateFromStorage()
 * from utils/photo-estimates.ts (assumes 15-25MB per photo)
 */
import { calculatePhotoEstimateFromStorage } from "../photo-estimates";

const photoEstimate1GB = calculatePhotoEstimateFromStorage("1GB");
const photoEstimate3GB = calculatePhotoEstimateFromStorage("3GB");
const photoEstimate10GB = calculatePhotoEstimateFromStorage("10GB");

export const PLANS = [
  {
    name: "1 GB",
    info: photoEstimate1GB.displayText,
    photoEstimate: photoEstimate1GB,
    price: {
      "1m": 7,   // Matches backend: 700 cents
      "3m": 9,   // Matches backend: 900 cents
      "12m": 15, // Matches backend: 1500 cents
    },
    features: [
      { text: "Galeria chroniona hasłem", tooltip: undefined },
      { text: "Wybór zdjęć przez klienta", tooltip: undefined },
      { text: "Wsparcie techniczne", tooltip: undefined },
      { text: "Bezpieczne przechowywanie", tooltip: undefined },
      { text: "Szybkie ładowanie zdjęć", tooltip: undefined },
    ],
    btn: {
      text: "Rozpocznij za darmo",
      href: `${process.env.NEXT_PUBLIC_DASHBOARD_URL || 'http://localhost:3000'}/sign-up`,
      variant: "default",
    }
  },
  {
    name: "3 GB",
    info: photoEstimate3GB.displayText,
    photoEstimate: photoEstimate3GB,
    price: {
      "1m": 12,  // Matches backend: 1200 cents
      "3m": 14,  // Matches backend: 1400 cents
      "12m": 21, // Matches backend: 2100 cents
    },
    features: [
      { text: "Galeria chroniona hasłem", tooltip: undefined },
      { text: "Wybór zdjęć przez klienta", tooltip: undefined },
      { text: "Wsparcie techniczne", tooltip: undefined },
      { text: "Bezpieczne przechowywanie", tooltip: undefined },
      { text: "Szybkie ładowanie zdjęć", tooltip: undefined },
    ],
    btn: {
      text: "Rozpocznij za darmo",
      href: `${process.env.NEXT_PUBLIC_DASHBOARD_URL || 'http://localhost:3000'}/sign-up`,
      variant: "primary",
    }
  },
  {
    name: "10 GB",
    info: photoEstimate10GB.displayText,
    photoEstimate: photoEstimate10GB,
    price: {
      "1m": 14,  // Matches backend: 1400 cents
      "3m": 16,  // Matches backend: 1600 cents
      "12m": 26, // Matches backend: 2600 cents
    },
    features: [
      { text: "Galeria chroniona hasłem", tooltip: undefined },
      { text: "Wybór zdjęć przez klienta", tooltip: undefined },
      { text: "Wsparcie techniczne", tooltip: undefined },
      { text: "Bezpieczne przechowywanie", tooltip: undefined },
      { text: "Szybkie ładowanie zdjęć", tooltip: undefined },
    ],
    btn: {
      text: "Rozpocznij za darmo",
      href: `${process.env.NEXT_PUBLIC_DASHBOARD_URL || 'http://localhost:3000'}/sign-up`,
      variant: "default",
    }
  }
];

export const PRICING_FEATURES = [
  {
    text: "Galeria chroniona hasłem",
    tooltip: "Bezpieczne udostępnianie zdjęć tylko wybranym klientom",
  },
  {
    text: "Wybór zdjęć przez klienta",
    tooltip: "Klienci mogą samodzielnie wybierać ulubione zdjęcia",
  },
  {
    text: "Wsparcie techniczne",
    tooltip: "Pomoc techniczna dostępna dla wszystkich użytkowników",
  },
  {
    text: "Bezpieczne przechowywanie",
    tooltip: "Twoje zdjęcia są bezpiecznie przechowywane",
  },
  {
    text: "Szybkie ładowanie zdjęć",
    tooltip: "Optymalizacja zapewnia szybkie ładowanie zdjęć",
  },
];

export const WORKSPACE_LIMIT = 2;

