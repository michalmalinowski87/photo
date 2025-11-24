# Dashboard Implementation Guide

## Overview

The PhotoHub dashboard is a Next.js application with a complete Polish UI, built using components from the `free-react-tailwind-admin-dashboard-main` template. All user-facing text is in Polish, and the application uses modern React patterns with Context API for state management.

## Architecture

### Frontend Structure

```
frontend/dashboard/
├── pages/
│   ├── index.tsx                    # Dashboard home (statistics + active orders)
│   ├── galleries/
│   │   ├── index.jsx                # Wersje robocze (UNPAID drafts)
│   │   ├── wyslano.jsx              # Wysłano do klienta
│   │   ├── wybrano.jsx              # Wybrano zdjęcia
│   │   ├── prosba-o-zmiany.jsx      # Prośba o zmiany
│   │   ├── gotowe-do-wysylki.jsx    # Gotowe do wysyłki
│   │   ├── dostarczone.jsx          # Dostarczone
│   │   └── [id]/
│   │       ├── index.jsx            # Gallery detail page
│   │       └── orders/
│   │           └── [orderId].jsx    # Order detail page
│   ├── clients.jsx                  # Clients CRUD
│   ├── packages.jsx                 # Packages CRUD
│   ├── wallet.jsx                   # Wallet management
│   └── settings.jsx                 # Settings page
├── components/
│   ├── layout/
│   │   ├── AppLayout.tsx            # Main layout wrapper
│   │   ├── AppSidebar.tsx           # Left sidebar navigation
│   │   ├── AppHeader.tsx            # Top header with "+ Utwórz galerię" button
│   │   ├── Backdrop.tsx             # Mobile overlay
│   │   └── SidebarWidget.tsx       # Sidebar promotional widget
│   ├── galleries/
│   │   ├── CreateGalleryWizard.tsx  # 5-step gallery creation wizard
│   │   └── GalleryList.tsx          # Reusable gallery list component
│   └── ui/                          # Template components
│       ├── modal/
│       ├── button/
│       ├── input/
│       ├── select/
│       ├── badge/
│       ├── alert/
│       ├── table/
│       └── toast/
├── context/
│   ├── SidebarContext.tsx           # Sidebar state management
│   └── ThemeContext.tsx             # Dark/light theme management
└── hooks/
    └── useToast.ts                  # Toast notification hook
```

## Key Features

### 1. Multi-Step Gallery Creation Wizard

**Location**: `components/galleries/CreateGalleryWizard.tsx`

**Steps**:
1. **Typ galerii**: Choose selection mode (client selects vs all photos)
2. **Nazwa galerii**: Enter unique gallery name
3. **Szczegóły pakietu**: Select plan, configure package (manual or from saved packages), optional backup addon
4. **Dane klienta**: Select existing client or create new (individual or company)
5. **Podsumowanie**: Review all settings, enter initial payment amount

**Features**:
- Full-screen modal with animated progress bar
- Step validation
- Integration with Clients and Packages APIs
- Initial payment amount input (determines payment status: UNPAID, PARTIALLY_PAID, PAID)
- Polish UI throughout

### 2. Gallery Status Filtering

**Filter Pages**:
- `/galleries` - Wersje robocze (UNPAID drafts)
- `/galleries/wyslano` - Wysłano do klienta (galleries with orders in CLIENT_SELECTING+)
- `/galleries/wybrano` - Wybrano zdjęcia (CLIENT_APPROVED or AWAITING_FINAL_PHOTOS)
- `/galleries/prosba-o-zmiany` - Prośba o zmiany (CHANGES_REQUESTED)
- `/galleries/gotowe-do-wysylki` - Gotowe do wysyłki (PREPARING_FOR_DELIVERY)
- `/galleries/dostarczone` - Dostarczone (all orders DELIVERED)

**Component**: `components/galleries/GalleryList.tsx` (reusable)

**API**: `GET /galleries?filter={status}`

### 3. Gallery Detail Page

**Location**: `pages/galleries/[id].jsx`

**Left Sidebar**:
- Gallery name and status badge
- UNPAID banner (if unpaid) with "Opłać galerię" button
- Gallery URL with copy button
- Creation date
- "Wyślij link do klienta" button (conditional)
- "Ustawienia galerii" button (opens modal)
- "Zdjęcia w galerii" link

**Main Content**:
- Orders mini-control-panel with table
- Order status badges
- Payment status badges
- Quick actions (Szczegóły button)

### 4. Order Detail Page

**Location**: `pages/galleries/[id]/orders/[orderId].jsx`

**Features**:
- **Tabs**: Oryginały and Finały
- **Oryginały Tab**: Shows all original photos, highlights client selections
- **Finały Tab**: Upload/delete final photos, view final images
- **ZIP Download**: "Pobierz ZIP" button (generates on-the-fly if needed)
- Order information display
- Status badges

### 5. Clients & Packages CRUD

**Clients Page**: `pages/clients.jsx`
- Create, edit, delete clients
- Support for individuals and companies
- Modal-based forms
- Table display with actions

**Packages Page**: `pages/packages.jsx`
- Create, edit, delete pricing packages
- Reusable in gallery wizard
- Table display with actions

### 6. Dashboard Home

**Location**: `pages/index.tsx`

**Features**:
- Statistics cards (4 metrics)
- Active orders list (top 10)
- Wallet section with quick top-up buttons
- Custom amount top-up input

### 7. Wallet Page

**Location**: `pages/wallet.jsx`

**Features**:
- Balance display
- Quick top-up buttons (+20, +50, +100, +200 PLN)
- Custom amount input
- Transaction history table
- Payment success handling via query parameter

### 8. Settings Page

**Location**: `pages/settings.jsx`

**Features**:
- Password change form
- Business information form (name, email, phone, address, NIP)
- Form validation
- Success/error alerts

## Navigation Structure

### Main Sidebar Menu

1. **Panel główny** (`/`) - Dashboard home
2. **Galerie** (collapsible):
   - Wersje robocze (`/galleries`)
   - Wysłano do klienta (`/galleries/wyslano`)
   - Wybrano zdjęcia (`/galleries/wybrano`)
   - Prośba o zmiany (`/galleries/prosba-o-zmiany`)
   - Gotowe do wysyłki (`/galleries/gotowe-do-wysylki`)
   - Dostarczone (`/galleries/dostarczone`)
3. **Klienci** (`/clients`) - Clients CRUD
4. **Pakiety** (`/packages`) - Packages CRUD
5. **Portfel** (`/wallet`) - Wallet management
6. **Ustawienia** (`/settings`) - Settings
7. **Wyloguj** - Logout button

### Header

- Sidebar toggle (mobile)
- Search bar (placeholder)
- Theme toggle
- Notifications dropdown (placeholder)
- User dropdown (placeholder)
- **"+ Utwórz galerię"** button (opens wizard)

## State Management

### SidebarContext

Manages:
- `isExpanded` - Sidebar expanded state
- `isMobileOpen` - Mobile sidebar open state
- `isHovered` - Hover state for auto-expand
- `activeItem` - Currently active menu item
- `openSubmenu` - Open submenu state

### ThemeContext

Manages:
- `theme` - 'light' or 'dark'
- `toggleTheme()` - Toggle function
- Persists to localStorage

## API Integration

### Authentication

- Uses `initializeAuth` from `lib/auth-init`
- Token sharing between landing and dashboard domains
- Redirects to landing sign-in if not authenticated

### API Calls

- `apiFetch` - Standard API calls
- `apiFetchWithAuth` - Authenticated API calls
- All endpoints require `Authorization: Bearer {token}` header

### Error Handling

- Uses `formatApiError` utility
- Displays errors in Alert components or toast notifications
- No `alert()` or `window.confirm()` - uses template modals/toasts

## UI Components

All components from `free-react-tailwind-admin-dashboard-main` template:

- **Modal** - Full-screen wizard, settings modals
- **Button** - Primary, outline variants, sizes
- **Input** - Text, number, email, password with validation
- **Select** - Dropdown selects
- **Badge** - Status indicators (success, error, warning, info)
- **Alert** - Success/error messages
- **Table** - Data tables with headers
- **Toast** - Notification system (implemented)

## Polish Language

All UI text is in Polish:
- Button labels
- Form labels and placeholders
- Error messages
- Status badges
- Navigation items
- Page titles
- Modal titles and content

## Payment Flow

### Gallery Creation

1. Wizard completed → `POST /galleries`
2. Gallery created as UNPAID draft with 3-day TTL
3. Transaction created with `status: UNPAID`
4. No immediate payment
5. Gallery appears in "Wersje robocze" list

### Paying for Gallery

1. Click "Opłać galerię" button
2. `POST /galleries/{id}/pay`
3. System finds UNPAID transaction
4. Creates Stripe checkout (if needed)
5. On payment success (webhook):
   - Removes TTL from gallery
   - Sets `state: PAID_ACTIVE`
   - Sets `expiresAt` to full plan duration
   - Updates transaction `status: PAID`

### Draft Expiry

- 24h before TTL expiry: Email notification sent
- After 3 days: DynamoDB TTL automatically deletes gallery
- Gallery removed from system

## Testing Checklist

- [ ] Gallery creation wizard (all 5 steps)
- [ ] Gallery status filtering (all 6 filter pages)
- [ ] Gallery detail page (sidebar + orders)
- [ ] Order detail page (tabs + ZIP download)
- [ ] Clients CRUD (create, edit, delete)
- [ ] Packages CRUD (create, edit, delete)
- [ ] Wallet top-up (quick buttons + custom amount)
- [ ] Settings page (password change, business info)
- [ ] Payment flow (create UNPAID, pay later)
- [ ] Draft expiry warnings
- [ ] Navigation (sidebar, header, breadcrumbs)

## Deployment Notes

- Environment variables required:
  - `NEXT_PUBLIC_API_URL` - Backend API URL
  - `NEXT_PUBLIC_COGNITO_DOMAIN` - Cognito domain
  - `NEXT_PUBLIC_LANDING_URL` - Landing page URL
- Build command: `yarn build`
- Start command: `yarn dev`

