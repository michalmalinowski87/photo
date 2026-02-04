import { Camera, Image, Users } from "lucide-react";

export const DEFAULT_AVATAR_URL = "https://api.dicebear.com/8.x/initials/svg?backgroundType=gradientLinear&backgroundRotation=0,360&seed=";

export const PAGINATION_LIMIT = 10;

export const COMPANIES = [
  {
    name: "PixiProof",
    logo: "/assets/company-01.svg",
  },
] as const;

export const PROCESS = [
  {
    title: "Utwórz galerię",
    description: "Stwórz bezpieczną galerię chronioną hasłem i prześlij zdjęcia dla swojego klienta.",
    icon: Camera,
  },
  {
    title: "Udostępnij klientowi",
    description: "Wyślij link do galerii. Klient może przeglądać i wybraź zdjęcia do edycji.",
    icon: Users,
  },
  {
    title: "Dostarcz finałową wersję",
    description: "Pobierz zdjęcia wybrane przez klienta w formacie ZIP i po edycji dostarcz klientowi finalną wersję.",
    icon: Image,
  },
] as const;

export const REVIEWS = [
  {
    name: "Anna Kowalska",
    username: "Fotograf ślubny",
    avatar: "https://randomuser.me/api/portraits/women/1.jpg",
    rating: 5,
    review: "PixiProof zmienił sposób, w jaki udostępniam zdjęcia klientom. Prosty, bezpieczny i bardzo opłacalny! costam jescze zeby bylo za dlugo do testu clapa"
  },
  {
    name: "Marcin Nowak",
    username: "Fotograf portretowy",
    avatar: "https://randomuser.me/api/portraits/men/1.jpg",
    rating: 5,
    review: "Kocham elastyczny system cenowy. Mogę dostosować ofertę do potrzeb każdego klienta. Gorąco polecam!"
  },
  {
    name: "Katarzyna Wiśniewska",
    username: "Fotograf rodzinny",
    avatar: "https://randomuser.me/api/portraits/women/2.jpg",
    rating: 5,
    review: "Ochrona hasłem i łatwy wybór zdjęć przez klientów to ogromna zaleta. Klienci są zachwyceni!"
  },
  {
    name: "Piotr Zieliński",
    username: "Fotograf eventowy",
    avatar: "https://randomuser.me/api/portraits/men/2.jpg",
    rating: 5,
    review: "Szybkie ładowanie, intuicyjny interfejs i świetne wsparcie. To wszystko czego potrzebuję!"
  },
  {
    name: "Magdalena Krawczyk",
    username: "Fotograf produktowy",
    avatar: "https://randomuser.me/api/portraits/women/3.jpg",
    rating: 5,
    review: "Najlepsza inwestycja w moim biznesie. Klienci doceniają profesjonalizm i wygodę."
  },
  {
    name: "Tomasz Lewandowski",
    username: "Fotograf komercyjny",
    avatar: "https://randomuser.me/api/portraits/men/3.jpg",
    rating: 5,
    review: "PixiProof to game changer. Oszczędzam czas i pieniądze, a klienci są zadowoleni."
  },
] as const;

