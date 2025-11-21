# PhotoHub Landing Page

Landing page dla PhotoHub - platformy do udostępniania zdjęć klientom przez fotografów.

## Przegląd

Landing page to publiczna strona marketingowa PhotoHub, która służy jako punkt wejścia dla fotografów. Zawiera:

- **Stronę główną** z prezentacją produktu, opiniami klientów i przeglądem funkcji
- **Stronę cennika** z przejrzystą tabelą cenową (3 okresy × 3 rozmiary)
- **Strony funkcji** szczegółowo opisujące kluczowe funkcje platformy
- **Stronę pomocy** z FAQ i przewodnikiem dla początkujących
- **Integrację z Cognito** dla logowania i rejestracji

## Wymagania

- Node.js 18+ 
- Yarn (lub npm)
- Konto AWS z skonfigurowanym Cognito User Pool

## Instalacja

1. **Przejdź do katalogu landing:**
   ```bash
   cd frontend/landing
   ```

2. **Zainstaluj zależności:**
   ```bash
   yarn install
   ```
   lub
   ```bash
   npm install
   ```

## Konfiguracja

Utwórz plik `.env.local` w katalogu `frontend/landing` z następującymi zmiennymi środowiskowymi:

```env
# Cognito Configuration
NEXT_PUBLIC_COGNITO_USER_POOL_ID=your-user-pool-id
NEXT_PUBLIC_COGNITO_CLIENT_ID=your-client-id
NEXT_PUBLIC_COGNITO_DOMAIN=your-cognito-domain

# Dashboard URL (gdzie przekierować po zalogowaniu)
NEXT_PUBLIC_DASHBOARD_URL=http://localhost:3001
```

### Gdzie znaleźć wartości:

- **NEXT_PUBLIC_COGNITO_USER_POOL_ID**: ID User Pool w AWS Cognito Console
- **NEXT_PUBLIC_COGNITO_CLIENT_ID**: ID App Client w Cognito User Pool
- **NEXT_PUBLIC_COGNITO_DOMAIN**: Domain prefix Cognito Hosted UI (np. `photohub-dev`)
- **NEXT_PUBLIC_DASHBOARD_URL**: URL do aplikacji dashboard (domyślnie `http://localhost:3001`)

## Uruchomienie

### Tryb deweloperski

```bash
yarn dev
```

lub

```bash
npm run dev
```

Aplikacja będzie dostępna pod adresem: **http://localhost:3000**

### Build produkcyjny

```bash
yarn build
yarn start
```

## Dostęp do aplikacji

Po uruchomieniu aplikacji:

1. **Strona główna**: http://localhost:3000
2. **Cennik**: http://localhost:3000/pricing
3. **Pomoc**: http://localhost:3000/help
4. **Logowanie**: http://localhost:3000/login
5. **Funkcje**:
   - Ochrona hasłem: http://localhost:3000/features/password-protection
   - Opłacalność: http://localhost:3000/features/cost-efficient
   - Elastyczne ceny: http://localhost:3000/features/flexible-pricing
   - Wybór przez klienta: http://localhost:3000/features/client-selection

## Struktura projektu

```
frontend/landing/
├── components/           # Komponenty React
│   ├── global/          # Komponenty globalne (AnimationContainer, MaxWidthWrapper)
│   ├── navigation/       # Navbar i Footer
│   └── ui/              # Komponenty UI (Button, Card, Accordion)
├── lib/                 # Biblioteki pomocnicze
│   └── auth.ts         # Integracja z Cognito
├── pages/              # Strony Next.js
│   ├── features/       # Strony funkcji
│   ├── _app.tsx       # Główny komponent aplikacji
│   ├── index.tsx      # Strona główna
│   ├── pricing.tsx    # Strona cennika
│   ├── help.tsx      # Strona pomocy
│   └── login.tsx     # Strona logowania
├── styles/            # Style globalne
│   └── globals.css   # Główne style CSS
├── utils/            # Funkcje pomocnicze
│   └── cn.ts        # Funkcja do łączenia klas CSS
├── package.json      # Zależności projektu
├── tailwind.config.ts # Konfiguracja Tailwind CSS
└── tsconfig.json     # Konfiguracja TypeScript
```

## Funkcjonalności

### Strona główna
- Hero section z CTA "Rozpocznij za darmo"
- Sekcja funkcji z linkami do szczegółowych stron
- Opinie klientów (testimonials)
- Sekcja CTA na końcu strony

### Strona cennika
- Tabela cenowa pokazująca wszystkie kombinacje (okres × rozmiar)
- Karty z planami zawierające szczegóły i przyciski CTA
- Informacje o funkcjach w każdym planie

### Strony funkcji
- Szczegółowe opisy każdej funkcji
- Wizualne przedstawienie korzyści
- Instrukcje krok po kroku
- Linki do logowania/rejestracji

### Strona pomocy
- FAQ z najczęściej zadawanymi pytaniami
- Przewodnik "Jak rozpocząć" z 5 krokami
- Informacje kontaktowe

### Logowanie
- Integracja z AWS Cognito Hosted UI
- Obsługa OAuth callback
- Automatyczne przekierowanie do dashboard po zalogowaniu

## Technologie

- **Next.js 14** - Framework React
- **TypeScript** - Typowanie statyczne
- **Tailwind CSS** - Stylowanie
- **Framer Motion** - Animacje
- **Radix UI** - Komponenty UI
- **Lucide React** - Ikony
- **Amazon Cognito** - Uwierzytelnianie

## Integracja z Dashboard

Po zalogowaniu użytkownik jest przekierowywany do aplikacji dashboard (`NEXT_PUBLIC_DASHBOARD_URL`). Upewnij się, że:

1. Dashboard jest uruchomiony i dostępny pod podanym URL
2. Dashboard akceptuje tokeny JWT z Cognito
3. Callback URL w Cognito User Pool zawiera `/login` z landing page

## Rozwój

### Dodawanie nowych stron

1. Utwórz plik w `pages/` (np. `pages/about.tsx`)
2. Strona będzie automatycznie dostępna pod `/about`
3. Użyj komponentów z `components/` dla spójnego wyglądu

### Modyfikacja stylów

- Globalne style: `styles/globals.css`
- Konfiguracja Tailwind: `tailwind.config.ts`
- Komponenty używają klas Tailwind

### Dodawanie animacji

Użyj komponentu `AnimationContainer` z `components/global/animation-container.tsx`:

```tsx
import AnimationContainer from "@/components/global/animation-container"

<AnimationContainer delay={0.2}>
  {/* Twój kontent */}
</AnimationContainer>
```

## Troubleshooting

### Problem: Błąd "Can't resolve 'tailwindcss/colors'"
**Rozwiązanie**: Upewnij się, że katalog `temp-linkify` został usunięty.

### Problem: Błąd uwierzytelniania Cognito
**Rozwiązanie**: 
- Sprawdź czy wszystkie zmienne środowiskowe są ustawione
- Zweryfikuj konfigurację Cognito User Pool
- Upewnij się, że callback URL jest poprawnie skonfigurowany

### Problem: Stylowanie nie działa
**Rozwiązanie**: 
- Upewnij się, że `globals.css` jest importowany w `_app.tsx`
- Sprawdź czy Tailwind jest poprawnie skonfigurowany w `tailwind.config.ts`
- Uruchom `yarn dev` ponownie

## Deployment

### Vercel

1. Połącz repozytorium z Vercel
2. Dodaj zmienne środowiskowe w ustawieniach projektu
3. Vercel automatycznie wykryje Next.js i zbuduje aplikację

### Inne platformy

Aplikacja może być wdrożona na dowolnej platformie obsługującej Next.js:
- Netlify
- AWS Amplify
- Docker + własny serwer

## Wsparcie

W razie pytań lub problemów:
- Email: support@photohub.pl
- Dokumentacja: `/help` w aplikacji

## Licencja

MIT

