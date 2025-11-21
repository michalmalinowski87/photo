import { Lock, DollarSign, Settings, Users, HelpCircleIcon } from "lucide-react"

export const NAV_LINKS = [
  {
    title: "Funkcje",
    href: "/features",
    menu: [
      {
        title: "Galeria chroniona hasłem",
        tagline: "Bezpieczne udostępnianie zdjęć tylko wybranym klientom.",
        href: "/features/password-protection",
        icon: Lock,
      },
      {
        title: "Opłacalne rozwiązanie",
        tagline: "Proste i przystępne ceny bez ukrytych kosztów.",
        href: "/features/cost-efficient",
        icon: DollarSign,
      },
      {
        title: "Elastyczne ceny",
        tagline: "System dodatków pozwala dostosować ofertę do potrzeb.",
        href: "/features/flexible-pricing",
        icon: Settings,
      },
      {
        title: "Wybór przez klienta",
        tagline: "Klienci mogą samodzielnie wybierać ulubione zdjęcia.",
        href: "/features/client-selection",
        icon: Users,
      },
    ],
  },
  {
    title: "Cennik",
    href: "/pricing",
  },
  {
    title: "Zasoby",
    href: "/resources/help",
    menu: [
      {
        title: "Pomoc",
        tagline: "Znajdź odpowiedzi na swoje pytania.",
        href: "/resources/help",
        icon: HelpCircleIcon,
      },
    ],
  },
]

