export const PLANS = [
  {
    name: "1 GB",
    info: "~200-400 zdjęć",
    price: {
      "1m": 7,
      "3m": 9,
      "12m": 15,
    },
    features: [
      { text: "Galeria chroniona hasłem" },
      { text: "Wybór zdjęć przez klienta" },
      { text: "Wsparcie techniczne" },
      { text: "Bezpieczne przechowywanie" },
      { text: "Szybkie ładowanie zdjęć" },
    ],
    btn: {
      text: "Rozpocznij za darmo",
      href: `${process.env.NEXT_PUBLIC_DASHBOARD_URL || 'http://localhost:3000'}/sign-up`,
      variant: "default",
    }
  },
  {
    name: "3 GB",
    info: "~600-1200 zdjęć",
    price: {
      "1m": 12,
      "3m": 14,
      "12m": 21,
    },
    features: [
      { text: "Galeria chroniona hasłem" },
      { text: "Wybór zdjęć przez klienta" },
      { text: "Wsparcie techniczne" },
      { text: "Bezpieczne przechowywanie" },
      { text: "Szybkie ładowanie zdjęć" },
    ],
    btn: {
      text: "Rozpocznij za darmo",
      href: `${process.env.NEXT_PUBLIC_DASHBOARD_URL || 'http://localhost:3000'}/sign-up`,
      variant: "primary",
    }
  },
  {
    name: "10 GB",
    info: "~2000-4000 zdjęć",
    price: {
      "1m": 14,
      "3m": 16,
      "12m": 26,
    },
    features: [
      { text: "Galeria chroniona hasłem" },
      { text: "Wybór zdjęć przez klienta" },
      { text: "Wsparcie techniczne" },
      { text: "Bezpieczne przechowywanie" },
      { text: "Szybkie ładowanie zdjęć" },
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

