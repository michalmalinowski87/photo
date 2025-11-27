# Dashboard Color Palette

Complete list of all colors used in the dashboard system, separated by light and dark themes.

## Tailwind Color Palette (Base Colors)

These colors are defined in `tailwind.config.js` and used across both themes with `dark:` variants.

### Brand Colors
- `brand-25`: `#f2f7ff`
- `brand-50`: `#ecf3ff`
- `brand-100`: `#dde9ff`
- `brand-200`: `#c2d6ff`
- `brand-300`: `#9cb9ff`
- `brand-400`: `#7592ff`
- `brand-500`: `#465fff`
- `brand-600`: `#3641f5`
- `brand-700`: `#2a31d8`
- `brand-800`: `#252dae`
- `brand-900`: `#262e89`
- `brand-950`: `#161950`

### Blue Light Colors
- `blue-light-25`: `#f5fbff`
- `blue-light-50`: `#f0f9ff`
- `blue-light-100`: `#e0f2fe`
- `blue-light-200`: `#b9e6fe`
- `blue-light-300`: `#7cd4fd`
- `blue-light-400`: `#36bffa`
- `blue-light-500`: `#0ba5ec`
- `blue-light-600`: `#0086c9`
- `blue-light-700`: `#026aa2`
- `blue-light-800`: `#065986`
- `blue-light-900`: `#0b4a6f`
- `blue-light-950`: `#062c41`

### Gray Colors
- `gray-25`: `#fcfcfd`
- `gray-50`: `#f9fafb`
- `gray-100`: `#f2f4f7`
- `gray-200`: `#e4e7ec`
- `gray-300`: `#d0d5dd`
- `gray-400`: `#98a2b3`
- `gray-500`: `#667085`
- `gray-600`: `#475467`
- `gray-700`: `#344054`
- `gray-800`: `#1d2939`
- `gray-900`: `#101828`
- `gray-950`: `#0c111d`
- `gray-dark`: `#1a2231` (specific dark theme variant)

### Orange Colors
- `orange-25`: `#fffaf5`
- `orange-50`: `#fff6ed`
- `orange-100`: `#ffead5`
- `orange-200`: `#fddcab`
- `orange-300`: `#feb273`
- `orange-400`: `#fd853a`
- `orange-500`: `#fb6514`
- `orange-600`: `#ec4a0a`
- `orange-700`: `#c4320a`
- `orange-800`: `#9c2a10`
- `orange-900`: `#7e2410`
- `orange-950`: `#511c10`

### Success Colors
- `success-25`: `#f6fef9`
- `success-50`: `#ecfdf3`
- `success-100`: `#d1fadf`
- `success-200`: `#a6f4c5`
- `success-300`: `#6ce9a6`
- `success-400`: `#32d583`
- `success-500`: `#12b76a`
- `success-600`: `#039855`
- `success-700`: `#027a48`
- `success-800`: `#05603a`
- `success-900`: `#054f31`
- `success-950`: `#053321`

### Error Colors
- `error-25`: `#fffbfa`
- `error-50`: `#fef3f2`
- `error-100`: `#fee4e2`
- `error-200`: `#fecdca`
- `error-300`: `#fda29b`
- `error-400`: `#f97066`
- `error-500`: `#f04438`
- `error-600`: `#d92d20`
- `error-700`: `#b42318`
- `error-800`: `#912018`
- `error-900`: `#7a271a`
- `error-950`: `#55160c`

### Warning Colors
- `warning-25`: `#fffcf5`
- `warning-50`: `#fffaeb`
- `warning-100`: `#fef0c7`
- `warning-200`: `#fedf89`
- `warning-300`: `#fec84b`
- `warning-400`: `#fdb022`
- `warning-500`: `#f79009`
- `warning-600`: `#dc6803`
- `warning-700`: `#b54708`
- `warning-800`: `#93370d`
- `warning-900`: `#7a2e0e`
- `warning-950`: `#4e1d09`

---

## Light Theme Colors

### Background Colors
- Body background: `gray-50` (`#f9fafb`)
- Toast container: `rgb(249 250 251)` (gray-50)
- Configuration panel: `#f5f5f5`
- Button backgrounds: `#f0f0f0`
- Error message background: `#ffe6e6`
- Success message background: `#e6f7e6`

### Text Colors
- Default text: `gray-700` (`#344054`)
- Secondary text: `gray-500` (`#667085`)
- Muted text: `#666`
- Error text: `#cc0000`
- Success text: `#006600`
- Button text: `#333`, `white`, `black`

### Border Colors
- Default border: `#e4e7ec` (gray-200)
- Button border: `#ccc`

### Interactive Elements
- Active button background: `#0066cc`
- Button hover states: Various grays
- Checkbox checked: `brand-500` (`#465fff`)

### Button Colors (Orders Page - Now Using Tailwind Classes)
All button colors have been converted from inline styles to Tailwind classes with dark mode support:
- Primary button (Mark as Paid): `bg-brand-500 dark:bg-brand-500` (`#465fff`)
- Secondary button (Mark Deposit Paid, Upload Final Photos): `bg-gray-500 dark:bg-gray-500` (`#667085`)
- Success button (Download ZIP, Approve, Send Final Link): `bg-success-500 dark:bg-success-500` (`#12b76a`)
- Error/Danger button (Mark as Canceled, Deny): `bg-error-500 dark:bg-error-500` (`#f04438`)
- Warning button (Mark as Refunded): `bg-warning-500 dark:bg-warning-500` with `text-gray-900 dark:text-white` (`#f79009`)
- Disabled button: `bg-gray-300 dark:bg-gray-600` (`#d0d5dd` / `#475467`)
- Button text: `text-white dark:text-white` (on colored backgrounds)

### Shadow Colors
- Shadow base: `rgba(16, 24, 40, 0.05)` to `rgba(16, 24, 40, 0.08)`
- Shadow variations use gray-900 (`#101828`) with different opacities

### SVG/Icon Colors
- Error icon fill: `#F04438` (error-500)

---

## Dark Theme Colors

### Background Colors
- Body background: `gray-dark` (`#1a2231`)
- Toast container: `rgb(26 34 49)` (gray-dark)
- Scrollbar thumb: `#344054` (gray-700)
- Modal close button: `#1a1a1a`
- Modal close button hover: `#2d2d2d`

### Text Colors
- Default text: `gray-300` (`#d0d5dd`)
- Secondary text: `gray-400` (`#98a2b3`)
- Brand text: `brand-400` (`#7592ff`)
- Modal close button text: `#f0e0ca/70` (70% opacity)
- Modal close button hover text: `#f0e0ca`

### Background with Opacity
- Menu item active: `brand-500/[0.12]` (12% opacity)
- Menu dropdown badge active: `brand-500/20` (20% opacity)
- Menu dropdown badge inactive: `brand-500/15` (15% opacity)
- Hover states: `white/5` (5% opacity)

### Toast Alert Backgrounds (Dark Mode)
- Success toast: `rgba(18, 183, 106, 0.3)` (success-500 with 30% opacity)
- Error toast: `rgba(240, 68, 56, 0.3)` (error-500 with 30% opacity)
- Warning toast: `rgba(247, 144, 9, 0.3)` (warning-500 with 30% opacity)
- Info toast: `rgba(11, 165, 236, 0.3)` (blue-light-500 with 30% opacity)

### Inline Style Colors (Dark Theme)
- Modal close button background: `#1a1a1a`
- Modal close button text: `#f0e0ca/70`
- Modal close button hover background: `#2d2d2d`
- Modal close button hover text: `#f0e0ca`

---

## Auth Pages Colors (Always Dark Mode)

Auth pages use a separate color system defined in `auth.css` and are always in dark mode.

### CSS Variables (HSL format)
- `--foreground`: `0 0% 98%` (white)
- `--background`: `0 0% 3.9%` (very dark gray)
- `--card`: `0 0% 3.9%`
- `--card-foreground`: `0 0% 98%`
- `--popover`: `0 0% 3.9%`
- `--popover-foreground`: `0 0% 98%`
- `--primary`: `0 0% 98%`
- `--primary-foreground`: `0 0% 9%`
- `--theme-primary`: `108, 39, 157` (purple)
- `--theme-secondary`: `0, 135, 255` (blue)
- `--secondary`: `0 0% 14.9%`
- `--secondary-foreground`: `0 0% 98%`
- `--muted`: `0 0% 14.9%`
- `--muted-foreground`: `0 0% 63.9%`
- `--accent`: `0 0% 14.9%`
- `--accent-foreground`: `0 0% 98%`
- `--destructive`: `0 62.8% 30.6%`
- `--destructive-foreground`: `0 0% 98%`
- `--border`: `0 0% 14.9%`
- `--input`: `0 0% 14.9%`
- `--ring`: `0 0% 83.1%`
- `--radius`: `0.5rem`

### Direct Colors (Auth Pages)
- Background: `hsl(0 0% 3.9%)`
- Text: `hsl(0 0% 98%)`
- Input background: `hsl(0 0% 14.9%)`
- Input text: `hsl(0 0% 98%)`
- Input border: `hsl(0 0% 14.9%)`
- Scrollbar thumb: `#262626`
- Scrollbar track: `rgba(0, 0, 0, 0)`
- Selection background: `rgba(168, 85, 247, 0.2)` (purple with 20% opacity)
- Gradient shadow: `rgba(150, 18, 226, 0.3)` (purple with 30% opacity)

### Gradient Colors (Auth Pages)
- Uses `--theme-primary` and `--theme-secondary` CSS variables
- Conic gradient with varying opacities (0.7 to 1.0)

---

## Login Page Theme (Detailed Extraction)

Complete color and theme specification extracted from `pages/login.tsx`, `components/auth/AuthLayout.tsx`, and `styles/auth.css`.

### Layout & Container Colors

**Main Container:**
- Background: `hsl(0 0% 3.9%)` / `#0a0a0a` (very dark gray, almost black)
- Text color: `hsl(0 0% 98%)` / `#fafafa` (near white)
- Font family: `"Inter", sans-serif`

**Auth Layout Wrapper:**
- Class: `auth-layout min-h-screen bg-background text-foreground antialiased`
- Background: `hsl(0 0% 3.9%)` (inline style - intentionally forced for auth pages)
- Color: `hsl(0 0% 98%)` (inline style - intentionally forced for auth pages)
- **Note:** Auth pages are forced to dark mode and do not respond to theme switching, so inline styles are appropriate here.

### Typography Colors

**Headings:**
- Main heading ("Zaloguj się"): `text-foreground` → `hsl(0 0% 98%)` / `#fafafa`
- Font size: `text-2xl` (24px)
- Font weight: `font-semibold` (600)

**Body Text:**
- Description text: `text-muted-foreground` → `hsl(0 0% 63.9%)` / `#a3a3a3`
- Font size: `text-sm` (14px)
- Terms/Privacy links: `text-primary font-bold` → `hsl(0 0% 98%)` / `#fafafa`
- Sign-up link: `text-primary font-bold` → `hsl(0 0% 98%)` / `#fafafa`

**Brand Text:**
- Logo text ("PhotoCloud"): `text-foreground` → `hsl(0 0% 98%)` / `#fafafa`
- Font size: `text-lg` (18px)
- Font weight: `font-bold` (700)

### Form Elements

**Labels:**
- Color: `text-gray-700 dark:text-gray-300` → `#d0d5dd` (gray-300 in dark mode)
- Font size: `text-sm` (14px)
- Font weight: `font-medium` (500)

**Input Fields (InputField Component):**
- Background: `hsl(0 0% 14.9%)` / `#262626` (forced via auth.css)
- Text color: `hsl(0 0% 98%)` / `#fafafa` (forced via auth.css)
- Border color: `hsl(0 0% 14.9%)` / `#262626` (forced via auth.css)
- Placeholder: `text-gray-400` → `#98a2b3` (in normal state, but overridden to `white/30` in dark mode)
- Focus border: `focus:border-brand-300` → `#9cb9ff` (brand-300)
- Focus ring: `focus:ring-brand-500/20` → `#465fff` with 20% opacity
- Border radius: `rounded-lg` (8px)
- Shadow: `shadow-theme-xs` → `0px 1px 2px 0px rgba(16, 24, 40, 0.05)`
- Min height: `44px` (inline style)

**Button (Button Component - Primary Variant):**
- Background: `bg-brand-500` → `#465fff` (brand-500)
- Text color: `text-white` → `#ffffff`
- Hover background: `hover:bg-brand-600` → `#3641f5` (brand-600)
- Disabled background: `disabled:bg-brand-300` → `#9cb9ff` (brand-300)
- Shadow: `shadow-theme-xs` → `0px 1px 2px 0px rgba(16, 24, 40, 0.05)`
- Border radius: `rounded-lg` (8px)
- Padding: `px-5 py-3.5` (20px horizontal, 14px vertical)
- Font size: `text-sm` (14px)

### Error Messages

**Error Alert Box:**
- Background: `bg-red-50` → `#fef3f2` (error-50)
- Border: `border border-red-200` → `#fecdca` (error-200)
- Text color: `text-red-600` → `#d92d20` (error-600)
- Border radius: `rounded` (4px)
- Padding: `p-3` (12px)
- Font size: `text-sm` (14px)

### Borders & Dividers

**Top Border (Logo Section):**
- Border: `border-b border-border/80` → `hsl(0 0% 14.9%)` with 80% opacity / `rgba(38, 38, 38, 0.8)`

**Bottom Border (Sign-up Section):**
- Border: `border-t border-border/80` → `hsl(0 0% 14.9%)` with 80% opacity / `rgba(38, 38, 38, 0.8)`
- Padding: `py-6` (24px vertical)

### Loading State

**Spinner:**
- Border color: `border-primary` → `hsl(0 0% 98%)` / `#fafafa`
- Border style: `border-[3px] border-primary rounded-full border-b-transparent`
- Secondary border: `border-primary/30` → `hsl(0 0% 98%)` with 30% opacity
- Animation: `animate-spin`
- Size: `w-12 h-12` (48px)

**Loading Text:**
- Color: `text-muted-foreground` → `hsl(0 0% 63.9%)` / `#a3a3a3`
- Font size: `text-sm` (14px)

### Theme Colors (RGB values for gradients)

**Primary Theme Color:**
- RGB: `108, 39, 157` (purple)
- Hex: `#6c279d`
- Used in: Conic gradients, selection highlights

**Secondary Theme Color:**
- RGB: `0, 135, 255` (blue)
- Hex: `#0087ff`
- Used in: Conic gradients

### Conic Gradient Specification

The `.gradient` class uses a conic gradient with the following stops:
- Start angle: `230.29deg`
- Center point: `51.63% 52.16%`
- Color stops:
  - `0deg`: `rgba(0, 135, 255, 1)` (theme-secondary, 100% opacity)
  - `67.5deg`: `rgba(0, 135, 255, 0.9)` (theme-secondary, 90% opacity)
  - `198.75deg`: `rgba(108, 39, 157, 0.8)` (theme-primary, 80% opacity)
  - `251.25deg`: `rgba(0, 135, 255, 0.7)` (theme-secondary, 70% opacity)
  - `301.88deg`: `rgba(0, 135, 255, 0.85)` (theme-secondary, 85% opacity)
  - `360deg`: `rgba(108, 39, 157, 0.95)` (theme-primary, 95% opacity)

### Scrollbar Colors

- Width: `6px`
- Thumb color: `#262626`
- Thumb border radius: `3px`
- Track color: `rgba(0, 0, 0, 0)` (transparent)

### Selection Colors

- Background: `rgba(168, 85, 247, 0.2)` (purple with 20% opacity)
- Text color: `hsl(var(--foreground))` → `hsl(0 0% 98%)` / `#fafafa`

### Spacing & Layout

**Container:**
- Max width: `max-w-sm` (384px)
- Margin: `mx-auto` (centered)
- Height: `h-dvh` (100dvh)
- Overflow: `overflow-hidden`
- Padding top: `pt-4 md:pt-20` (16px on mobile, 80px on desktop)

**Sections:**
- Logo section padding: `py-8` (32px vertical)
- Form section margin top: `mt-8` (32px)
- Terms section margin top: `mt-8` (32px)
- Sign-up section: `mt-auto` (pushes to bottom)

**Form Spacing:**
- Form gap: `space-y-4` (16px vertical between fields)
- Field group gap: `space-y-2` (8px vertical between label and input)

### Component-Specific Colors

**InputField Component (when used in auth context):**
- Default state:
  - Background: `hsl(0 0% 14.9%)` (forced via auth.css)
  - Border: `border-gray-700` → `#344054` (but overridden to `hsl(0 0% 14.9%)` via auth.css)
  - Text: `hsl(0 0% 98%)` (forced via auth.css)
  - Placeholder: `text-white/30` → `rgba(255, 255, 255, 0.3)` (in dark mode)
- Focus state:
  - Border: `focus:border-brand-300` → `#9cb9ff`
  - Ring: `focus:ring-brand-500/20` → `#465fff` with 20% opacity

**Button Component (Primary variant):**
- Default: `bg-brand-500` → `#465fff`
- Hover: `hover:bg-brand-600` → `#3641f5`
- Disabled: `disabled:bg-brand-300` → `#9cb9ff`
- Text: `text-white` → `#ffffff`

### Important Notes

1. **Forced Dark Mode**: All auth pages (including login) are forced to dark mode via `AuthLayout` component and `auth.css`. The `auth-dark` class is added to `html` and `body` elements.

2. **CSS Overrides**: The `auth.css` file uses `!important` flags to ensure auth page styles override any dashboard theme styles.

3. **Color Format**: Most colors use HSL format via CSS variables, but some components use hex values directly.

4. **Theme Isolation**: Auth pages are completely isolated from the main dashboard theme system to ensure consistent appearance.

5. **Responsive Design**: The login page uses responsive padding (`pt-4 md:pt-20`) and maintains a max-width of `384px` (max-w-sm) for optimal readability.

---

## Component-Specific Inline Colors

### Modal Component (`components/ui/modal/index.tsx`)
- Light mode close button: `#f0e0ca/80` background, `#4a4a4a` text
- Light mode close button hover: `#f0e0ca` background, `#1a1a1a` text
- Dark mode close button: `#1a1a1a` background, `#f0e0ca/70` text
- Dark mode close button hover: `#2d2d2d` background, `#f0e0ca` text

### Orders Page (`pages/orders.tsx`)

**All colors now use Tailwind classes with dark mode support:**

- Configuration panel: `bg-gray-100 dark:bg-gray-800` (`#f2f4f7` / `#1d2939`)
- Empty state text: `text-gray-500 dark:text-gray-400` (`#667085` / `#98a2b3`)
- Primary button (Mark as Paid): `bg-brand-500 dark:bg-brand-500 text-white`
- Secondary button (Mark Deposit Paid, Upload Final Photos): `bg-gray-500 dark:bg-gray-500 text-white`
- Success button (Download ZIP, Approve, Send Final Link): `bg-success-500 dark:bg-success-500 text-white`
- Error button (Mark as Canceled, Deny): `bg-error-500 dark:bg-error-500 text-white`
- Warning button (Mark as Refunded): `bg-warning-500 dark:bg-warning-500 text-gray-900 dark:text-white`
- Disabled button: `bg-gray-300 dark:bg-gray-600 text-white`

### Gallery View Page (`pages/galleries/[id]/view.tsx`)

**All colors now use Tailwind classes with dark mode support:**

- Refresh button: `bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 border-gray-300 dark:border-gray-600` (background `#f2f4f7` / `#1d2939`, text `#1d2939` / `#e4e7ec`, border `#d0d5dd` / `#475467`)
- View mode toggle container: `bg-gray-100 dark:bg-gray-800` (`#f2f4f7` / `#1d2939`)
- Active view mode: `bg-brand-600 dark:bg-brand-500 text-white` (`#3641f5` / `#465fff`)
- Inactive view mode: `bg-transparent text-gray-500 dark:text-gray-400` (`#667085` / `#98a2b3`)
- Back button: `bg-gray-500 dark:bg-gray-500 text-white` (`#667085`)
- Error message: `bg-error-50 dark:bg-error-500/15 text-error-600 dark:text-error-400` (background `#fef3f2` / `rgba(240, 68, 56, 0.15)`, text `#d92d20` / `#f97066`)
- Success message: `bg-success-50 dark:bg-success-500/15 text-success-600 dark:text-success-400` (background `#ecfdf3` / `rgba(18, 183, 106, 0.15)`, text `#039855` / `#32d583`)
- Empty state text: `text-gray-500 dark:text-gray-400` (`#667085` / `#98a2b3`)

### Toast Context (`context/ToastContext.tsx`)
- Container background: `bg-gray-50 dark:bg-gray-dark` (`#f9fafb` / `#1a2231`)
- Now uses Tailwind classes instead of inline styles for theme support

---

## Custom Components Theme Implementation

This section documents all custom components created during development and their theme-specific styling.

### Toast System

The toast notification system consists of three components working together: `ToastContext`, `Toast`, and `Alert`.

#### ToastContext (`context/ToastContext.tsx`)

**Container Styling:**
- **Light Mode:**
  - Background: `bg-gray-50` (`#f9fafb`) - now using Tailwind class
  - Position: Fixed, top: `87px`, right: `16px` (inline style for positioning)
  - Z-index: `2147483647` (maximum) - inline style
  - Max width: `420px` - inline style
  - Border radius: `rounded-xl` (`0.75rem`) - Tailwind class
  
- **Dark Mode:**
  - Background: `dark:bg-gray-dark` (`#1a2231`) - Tailwind class
  - Same positioning and sizing as light mode

**Implementation Details:**
- Uses React Portal to render to `document.body`
- Container has `data-toast-container` attribute for CSS targeting
- Uses `pointer-events-none` on container, `pointer-events-auto` on individual toasts
- Background color now uses Tailwind classes (`bg-gray-50 dark:bg-gray-dark`) for proper theme support
- Note: `globals.css` still has dark mode override rules for toast container, but they're now redundant since we use Tailwind classes

#### Toast Component (`components/ui/toast/Toast.tsx`)

**Wrapper Styling:**
- Max width: `max-w-md` (448px)
- Width: `w-full`
- Shadow: `shadow-2xl`
- Min width: `320px` (inline style)
- Min height: `80px` (inline style)
- Animation: Slide-in from right with opacity transition
- Transition: `duration-300 ease-out`

**Theme Behavior:**
- No direct theme classes (delegates to Alert component)
- Shadow remains consistent across themes

#### Alert Component (`components/ui/alert/Alert.tsx`)

The Alert component is used by Toast and can also be used standalone. It has four variants with theme-specific styling.

**Container Classes (All Variants):**
- Border radius: `rounded-xl`
- Padding: `p-4`
- Border width: `border` (1px)

**Success Variant:**
- **Light Mode:**
  - Background: `bg-success-50` → `#ecfdf3`
  - Border: `border-success-500` → `#12b76a`
  - Icon: `text-success-500` → `#12b76a`
  
- **Dark Mode:**
  - Background: `dark:bg-success-500/15` → `rgba(18, 183, 106, 0.15)` (overridden to 30% in globals.css)
  - Border: `dark:border-success-500/30` → `rgba(18, 183, 106, 0.3)`
  - Icon: `text-success-500` (same as light)

**Error Variant:**
- **Light Mode:**
  - Background: `bg-error-50` → `#fef3f2`
  - Border: `border-error-500` → `#f04438`
  - Icon: `text-error-500` → `#f04438`
  
- **Dark Mode:**
  - Background: `dark:bg-error-500/15` → `rgba(240, 68, 56, 0.15)` (overridden to 30% in globals.css)
  - Border: `dark:border-error-500/30` → `rgba(240, 68, 56, 0.3)`
  - Icon: `text-error-500` (same as light)

**Warning Variant:**
- **Light Mode:**
  - Background: `bg-warning-50` → `#fffaeb`
  - Border: `border-warning-500` → `#f79009`
  - Icon: `text-warning-500` → `#f79009`
  
- **Dark Mode:**
  - Background: `dark:bg-warning-500/15` → `rgba(247, 144, 9, 0.15)` (overridden to 30% in globals.css)
  - Border: `dark:border-warning-500/30` → `rgba(247, 144, 9, 0.3)`
  - Icon: `text-warning-500` (same as light)

**Info Variant:**
- **Light Mode:**
  - Background: `bg-blue-light-50` → `#f0f9ff`
  - Border: `border-blue-light-500` → `#0ba5ec`
  - Icon: `text-blue-light-500` → `#0ba5ec`
  
- **Dark Mode:**
  - Background: `dark:bg-blue-light-500/15` → `rgba(11, 165, 236, 0.15)` (overridden to 30% in globals.css)
  - Border: `dark:border-blue-light-500/30` → `rgba(11, 165, 236, 0.3)`
  - Icon: `text-blue-light-500` (same as light)

**Text Styling (All Variants):**
- **Title:**
  - Light: `text-gray-800` → `#1d2939`
  - Dark: `dark:text-white/90` → `rgba(255, 255, 255, 0.9)`
  - Font: `text-sm font-semibold`
  
- **Message:**
  - Light: `text-gray-500` → `#667085`
  - Dark: `dark:text-gray-400` → `#98a2b3`
  - Font: `text-sm`
  
- **Link (if shown):**
  - Light: `text-gray-500` → `#667085`
  - Dark: `dark:text-gray-400` → `#98a2b3`
  - Font: `text-sm font-medium underline`

**Important Note:** The dark mode background opacities are overridden in `globals.css` from 15% to 30% for better visibility:
```css
[data-toast-container] .dark\:bg-success-500\/15 {
  background-color: rgba(18, 183, 106, 0.3) !important;
}
```

### Badge Component (`components/ui/badge/Badge.tsx`)

The Badge component supports two variants (`light` and `solid`) and multiple colors, all with theme support.

**Base Styles:**
- Display: `inline-flex items-center`
- Padding: `px-2.5 py-0.5`
- Border radius: `rounded-full`
- Font: `font-medium`
- Gap: `gap-1` (for icons)

**Size Variants:**
- Small (`sm`): `text-theme-xs` (12px)
- Medium (`md`): `text-sm` (14px) - default

**Light Variant Colors:**

**Primary:**
- Light: `bg-brand-50 text-brand-500` → Background `#ecf3ff`, Text `#465fff`
- Dark: `dark:bg-brand-500/15 dark:text-brand-400` → Background `rgba(70, 95, 255, 0.15)`, Text `#7592ff`

**Success:**
- Light: `bg-success-50 text-success-600` → Background `#ecfdf3`, Text `#039855`
- Dark: `dark:bg-success-500/15 dark:text-success-500` → Background `rgba(18, 183, 106, 0.15)`, Text `#12b76a`

**Error:**
- Light: `bg-error-50 text-error-600` → Background `#fef3f2`, Text `#d92d20`
- Dark: `dark:bg-error-500/15 dark:text-error-500` → Background `rgba(240, 68, 56, 0.15)`, Text `#f04438`

**Warning:**
- Light: `bg-warning-50 text-warning-600` → Background `#fffaeb`, Text `#dc6803`
- Dark: `dark:bg-warning-500/15 dark:text-orange-400` → Background `rgba(247, 144, 9, 0.15)`, Text `#fb923c`

**Info:**
- Light: `bg-blue-light-50 text-blue-light-500` → Background `#f0f9ff`, Text `#0ba5ec`
- Dark: `dark:bg-blue-light-500/15 dark:text-blue-light-500` → Background `rgba(11, 165, 236, 0.15)`, Text `#0ba5ec`

**Light (Gray):**
- Light: `bg-gray-100 text-gray-700` → Background `#f2f4f7`, Text `#344054`
- Dark: `dark:bg-white/5 dark:text-white/80` → Background `rgba(255, 255, 255, 0.05)`, Text `rgba(255, 255, 255, 0.8)`

**Dark (Gray):**
- Light: `bg-gray-500 text-white` → Background `#667085`, Text `#ffffff`
- Dark: `dark:bg-white/5 dark:text-white` → Background `rgba(255, 255, 255, 0.05)`, Text `#ffffff`

**Solid Variant Colors:**

All solid variants use the same text color (`text-white` / `dark:text-white`) but different backgrounds:

**Primary:**
- Light: `bg-brand-500` → `#465fff`
- Dark: `dark:text-white` (background stays brand-500)

**Success:**
- Light: `bg-success-500` → `#12b76a`
- Dark: `dark:text-white` (background stays success-500)

**Error:**
- Light: `bg-error-500` → `#f04438`
- Dark: `dark:text-white` (background stays error-500)

**Warning:**
- Light: `bg-warning-500` → `#f79009`
- Dark: `dark:text-white` (background stays warning-500)

**Info:**
- Light: `bg-blue-light-500` → `#0ba5ec`
- Dark: `dark:text-white` (background stays blue-light-500)

**Light (Gray):**
- Light: `bg-gray-400` → `#98a2b3`
- Dark: `dark:bg-white/5 dark:text-white/80` → Background `rgba(255, 255, 255, 0.05)`, Text `rgba(255, 255, 255, 0.8)`

**Dark (Gray):**
- Light: `bg-gray-700` → `#344054`
- Dark: `dark:text-white` (background stays gray-700)

### Welcome Popup (`components/welcome/WelcomePopup.tsx`)

A custom modal component with gradient backgrounds and theme-specific styling.

**Main Container:**
- Background: `bg-white` → `dark:bg-gray-900`
- Border radius: `rounded-3xl`
- Shadow: `shadow-xl`

**Heading:**
- Light: `text-gray-900` → `#101828`
- Dark: `dark:text-white` → `#ffffff`
- Gradient text: `bg-gradient-to-r from-brand-600 to-brand-500 bg-clip-text text-transparent` (works in both themes)

**Body Text:**
- Light: `text-gray-700` → `#344054`
- Dark: `dark:text-gray-300` → `#d0d5dd`

**Secondary Text:**
- Light: `text-gray-600` → `#475467`
- Dark: `dark:text-gray-400` → `#98a2b3`

**Welcome Bonus Section:**
- **Light Mode:**
  - Background: `bg-gradient-to-br from-brand-50 via-brand-100/50 to-brand-50`
  - Border: `border-brand-200/50`
  
- **Dark Mode:**
  - Background: `dark:from-brand-900/30 dark:via-brand-800/20 dark:to-brand-900/30`
  - Border: `dark:border-brand-700/50`

**Feature Items:**
- Hover background: `hover:bg-gray-50` → `dark:hover:bg-gray-800/50`
- Title: `text-gray-900` → `dark:text-white`
- Description: `text-gray-600` → `dark:text-gray-400`

**Divider:**
- Color: `via-gray-300` → `dark:via-gray-600`

**Footer:**
- Border: `border-gray-200` → `dark:border-gray-700`
- Background: `bg-white` → `dark:bg-gray-900`
- Text: `text-gray-500` → `dark:text-gray-400`

### Modal Component (`components/ui/modal/index.tsx`)

**Container:**
- **Light Mode:**
  - Background: `bg-white` → `#ffffff`
  - Border radius: `rounded-3xl`
  - Shadow: `shadow-xl`
  
- **Dark Mode:**
  - Background: `dark:bg-gray-900` → `#101828`
  - Same border radius and shadow

**Backdrop:**
- **Light Mode:**
  - Background: `bg-white/30` → `rgba(255, 255, 255, 0.3)`
  - Backdrop blur: `backdrop-blur-sm`
  
- **Dark Mode:**
  - Background: `dark:bg-black/50` → `rgba(0, 0, 0, 0.5)`
  - Same backdrop blur

**Close Button:**
- See "Component-Specific Inline Colors" section above for detailed close button styling

### Input Field (`components/ui/input/InputField.tsx`)

**Base Styles:**
- Height: `h-11` (44px)
- Border radius: `rounded-lg`
- Padding: `px-4 py-2.5`
- Font: `text-sm`
- Shadow: `shadow-theme-xs`

**Default State:**
- **Light Mode:**
  - Background: `bg-transparent`
  - Text: `text-gray-800` → `#1d2939`
  - Border: `border-gray-300` → `#d0d5dd`
  - Placeholder: `placeholder:text-gray-400` → `#98a2b3`
  
- **Dark Mode:**
  - Background: `dark:bg-gray-900` or `dark:bg-white/[0.03]`
  - Text: `dark:text-white/90` → `rgba(255, 255, 255, 0.9)`
  - Border: `dark:border-gray-700` → `#344054`
  - Placeholder: `dark:placeholder:text-white/30` → `rgba(255, 255, 255, 0.3)`

**Focus State:**
- **Light Mode:**
  - Border: `focus:border-brand-300` → `#9cb9ff`
  - Ring: `focus:ring-brand-500/20` → `rgba(70, 95, 255, 0.2)`
  
- **Dark Mode:**
  - Border: `dark:focus:border-brand-800` → `#252dae`
  - Ring: `dark:focus:ring-brand-500/20` (same opacity)

**Error State:**
- **Light Mode:**
  - Border: `border-error-500` → `#f04438`
  - Focus border: `focus:border-error-300` → `#fda29b`
  - Focus ring: `focus:ring-error-500/20`
  - Text: `text-error-500` → `#f04438`
  
- **Dark Mode:**
  - Border: `dark:border-error-500` → `#f04438`
  - Focus border: `dark:focus:border-error-800` → `#912018`
  - Text: `dark:text-error-400` → `#f97066`

**Success State:**
- **Light Mode:**
  - Border: `border-success-500` → `#12b76a`
  - Focus border: `focus:border-success-300` → `#6ce9a6`
  - Focus ring: `focus:ring-success-500/20`
  - Text: `text-success-500` → `#12b76a`
  
- **Dark Mode:**
  - Border: `dark:border-success-500` → `#12b76a`
  - Focus border: `dark:focus:border-success-800` → `#05603a`
  - Text: `dark:text-success-400` → `#32d583`

**Disabled State:**
- **Light Mode:**
  - Background: `bg-gray-100` → `#f2f4f7`
  - Text: `text-gray-500` → `#667085`
  - Border: `border-gray-300` → `#d0d5dd`
  - Opacity: `opacity-40`
  
- **Dark Mode:**
  - Background: `dark:bg-gray-800` → `#1d2939`
  - Text: `dark:text-gray-400` → `#98a2b3`
  - Border: `dark:border-gray-700` → `#344054`
  - Opacity: `opacity-40`

**Hint Text:**
- Error: `text-error-500` → `#f04438` (both themes)
- Success: `text-success-500` → `#12b76a` (both themes)
- Default: `text-gray-500` → `#667085` (light), `#98a2b3` (dark)

### Button Component (`components/ui/button/Button.tsx`)

**Primary Variant:**
- **Light & Dark:**
  - Background: `bg-brand-500` → `#465fff`
  - Text: `text-white` → `#ffffff`
  - Hover: `hover:bg-brand-600` → `#3641f5`
  - Disabled: `disabled:bg-brand-300` → `#9cb9ff`
  - Shadow: `shadow-theme-xs`

**Outline Variant:**
- **Light Mode:**
  - Background: `bg-white` → `#ffffff`
  - Text: `text-gray-700` → `#344054`
  - Border: `ring-1 ring-inset ring-gray-300` → `#d0d5dd`
  - Hover: `hover:bg-gray-50` → `#f9fafb`
  
- **Dark Mode:**
  - Background: `dark:bg-gray-800` → `#1d2939`
  - Text: `dark:text-gray-400` → `#98a2b3`
  - Border: `dark:ring-gray-700` → `#344054`
  - Hover: `dark:hover:bg-white/[0.03] dark:hover:text-gray-300` → Background `rgba(255, 255, 255, 0.03)`, Text `#d0d5dd`

**Sizes:**
- Small (`sm`): `px-4 py-3 text-sm`
- Medium (`md`): `px-5 py-3.5 text-sm` (default)

**Common:**
- Border radius: `rounded-lg`
- Display: `inline-flex items-center justify-center gap-2`
- Transition: `transition`
- Disabled: `cursor-not-allowed opacity-50`

---

## Summary

### Color Usage Patterns

**Light Theme:**
- Primary backgrounds: Light grays (`gray-50`, `gray-100`)
- Text: Dark grays (`gray-700`, `gray-500`)
- Brand accents: Brand blues (`brand-500`, `brand-400`)
- Borders: Light gray (`gray-200`)

**Dark Theme:**
- Primary backgrounds: Dark grays (`gray-dark`, `gray-800`, `gray-900`)
- Text: Light grays (`gray-300`, `gray-400`)
- Brand accents: Lighter brand blues (`brand-400`, `brand-500` with opacity)
- Borders: Darker grays (`gray-700`, `gray-600`)

**Common Patterns:**
- Success states: Green (`success-500`, `success-50`)
- Error states: Red (`error-500`, `error-50`)
- Warning states: Orange/Yellow (`warning-500`, `warning-50`)
- Info states: Blue (`blue-light-500`, `blue-light-50`)

---

## Theme Switching System

### How Theme Switching Works

The dashboard uses a React Context-based theme system that manages light and dark modes.

#### Core Mechanism

1. **Theme Context** (`context/ThemeContext.tsx`):
   - Manages theme state (`"light"` or `"dark"`)
   - Persists theme preference in `localStorage` (key: `"theme"`)
   - Defaults to `"light"` theme if no preference is saved
   - Adds/removes the `dark` class on `document.documentElement` (the `<html>` element)

2. **Tailwind Configuration** (`tailwind.config.js`):
   - Uses `darkMode: ["class"]` configuration
   - This means Tailwind checks for the `dark` class on the HTML element
   - All `dark:` prefixed classes are activated when the `dark` class is present

3. **Theme Provider**:
   - Wraps the application in `AppLayout.tsx` and `GalleryLayout.tsx`
   - Provides `theme` state and `toggleTheme()` function to all child components

4. **Theme Toggle Button** (`components/common/ThemeToggleButton.tsx`):
   - Located in the header (AppHeader and GalleryHeader)
   - Calls `toggleTheme()` when clicked
   - Shows sun icon in dark mode, moon icon in light mode

#### Code Flow

```typescript
// User clicks theme toggle button
toggleTheme() 
  → setTheme(prevTheme === "light" ? "dark" : "light")
    → useEffect detects theme change
      → localStorage.setItem("theme", theme)
      → document.documentElement.classList.add("dark") // or remove
        → Tailwind activates all dark: classes
```

### What Changes in the UI

When the `dark` class is added to the `<html>` element, Tailwind activates all `dark:` prefixed classes. Here's what changes:

#### Background Colors

**Light Mode → Dark Mode:**
- Body: `bg-gray-50` → `dark:bg-gray-dark` (`#f9fafb` → `#1a2231`)
- Sidebar: `bg-white` → `dark:bg-gray-900` (`#ffffff` → `#101828`)
- Header: `bg-white` → `dark:bg-gray-900` (`#ffffff` → `#101828`)
- Cards/Panels: `bg-white` → `dark:bg-gray-900` or `dark:bg-gray-dark`
- Modals: `bg-white` → `dark:bg-gray-900`
- Input fields: `bg-transparent` → `dark:bg-gray-900` or `dark:bg-white/[0.03]`
- Dropdowns: `bg-white` → `dark:bg-gray-dark`
- Toast container: `rgb(249 250 251)` → `rgb(26 34 49)` (gray-dark)

#### Text Colors

**Light Mode → Dark Mode:**
- Primary text: `text-gray-900` → `dark:text-white` (`#101828` → `#ffffff`)
- Secondary text: `text-gray-700` → `dark:text-gray-300` (`#344054` → `#d0d5dd`)
- Muted text: `text-gray-500` → `dark:text-gray-400` (`#667085` → `#98a2b3`)
- Placeholder text: `text-gray-400` → `dark:text-white/30` (`#98a2b3` → `rgba(255, 255, 255, 0.3)`)
- Brand text: `text-brand-500` → `dark:text-brand-400` (`#465fff` → `#7592ff`)

#### Border Colors

**Light Mode → Dark Mode:**
- Default borders: `border-gray-200` → `dark:border-gray-800` (`#e4e7ec` → `#1d2939`)
- Input borders: `border-gray-300` → `dark:border-gray-700` (`#d0d5dd` → `#344054`)
- Focus borders: `border-brand-300` → `dark:border-brand-800` (`#9cb9ff` → `#252dae`)

#### Interactive Elements

**Buttons:**
- Outline buttons: `bg-white` → `dark:bg-gray-800`, `text-gray-700` → `dark:text-gray-400`
- Hover states: `hover:bg-gray-100` → `dark:hover:bg-gray-800` or `dark:hover:bg-white/5`

**Menu Items:**
- Active: `bg-brand-50` → `dark:bg-brand-500/[0.12]` (12% opacity)
- Inactive: `text-gray-700` → `dark:text-gray-300`, `hover:bg-gray-100` → `dark:hover:bg-white/5`
- Icons: `text-gray-500` → `dark:text-gray-400`

**Input Fields:**
- Background: `bg-transparent` → `dark:bg-gray-900` or `dark:bg-white/[0.03]`
- Text: `text-gray-800` → `dark:text-white/90`
- Placeholder: `placeholder:text-gray-400` → `dark:placeholder:text-white/30`
- Focus ring: `focus:ring-brand-500/10` → `dark:focus:ring-brand-500/20`

**Scrollbars:**
- Thumb: `bg-gray-200` → `dark:bg-gray-700` (`#e4e7ec` → `#344054`)

#### Shadows

Shadows remain the same (using `gray-900` with opacity), but appear more prominent in dark mode due to contrast.

#### Component-Specific Changes

**Modal:**
- Background: `bg-white` → `dark:bg-gray-900`
- Backdrop: `bg-white/30` → `dark:bg-black/50`

**Toast Alerts:**
- Success: `bg-success-50` → `dark:bg-success-500/15` (15% opacity, overridden to 30% in globals.css)
- Error: `bg-error-50` → `dark:bg-error-500/15` (15% opacity, overridden to 30% in globals.css)
- Warning: `bg-warning-50` → `dark:bg-warning-500/15` (15% opacity, overridden to 30% in globals.css)
- Info: `bg-blue-light-50` → `dark:bg-blue-light-500/15` (15% opacity, overridden to 30% in globals.css)

**Sidebar Widget:**
- Background: `bg-gray-50` → `dark:bg-white/[0.03]`
- Text: `text-gray-900` → `dark:text-white`, `text-gray-500` → `dark:text-gray-400`

### How to Switch Themes

#### Programmatically

```typescript
import { useTheme } from '../context/ThemeContext';

function MyComponent() {
  const { theme, toggleTheme } = useTheme();
  
  // Get current theme
  console.log(theme); // "light" or "dark"
  
  // Toggle theme
  toggleTheme();
  
  // Or set specific theme
  // Note: toggleTheme only toggles, you'd need to modify ThemeContext to set directly
}
```

#### Via UI

Click the theme toggle button in the header (sun/moon icon).

#### Via Browser Console

```javascript
// Switch to dark mode
document.documentElement.classList.add('dark');
localStorage.setItem('theme', 'dark');

// Switch to light mode
document.documentElement.classList.remove('dark');
localStorage.setItem('theme', 'light');
```

---

## Comprehensive Guide: Replacing Light Theme

If you want to remove the light theme and make dark mode the default (or only) theme, follow these steps:

### Step 1: Change Default Theme

**File:** `context/ThemeContext.tsx`

```typescript
// Change line 24 from:
const initialTheme = savedTheme || "light"; // Default to light theme

// To:
const initialTheme = savedTheme || "dark"; // Default to dark theme
```

**File:** `context/ThemeContext.tsx`

```typescript
// Change line 18 from:
const [theme, setTheme] = useState<Theme>("light");

// To:
const [theme, setTheme] = useState<Theme>("dark");
```

### Step 2: Remove Light Theme Classes (Optional - Force Dark Only)

If you want to completely remove light theme support and only use dark mode:

#### Option A: Keep Both Themes but Default to Dark
- Only change Step 1 above
- Users can still toggle to light mode if desired

#### Option B: Remove Light Theme Completely
- Change default to dark (Step 1)
- Remove or hide the theme toggle button
- Remove all non-`dark:` classes (light theme classes)

### Step 3: Update Components to Remove Light Theme Classes

Search for components that use light theme classes and either:
1. Remove the light theme classes (keep only `dark:` variants)
2. Or make dark theme classes the default (remove `dark:` prefix)

**Files to check:**
- All files in `components/` directory
- All files in `pages/` directory

**Search pattern:**
```bash
# Find all components with light theme classes
grep -r "bg-white\|text-gray-900\|border-gray-200" frontend/dashboard/components --include="*.tsx"
```

**Example transformation:**

```tsx
// Before (supports both themes)
<div className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white">

// After (dark only)
<div className="bg-gray-900 text-white">
```

### Step 4: Update Global Styles

**File:** `styles/globals.css`

```css
/* Change line 20 from: */
@apply relative font-normal font-outfit bg-gray-50 dark:bg-gray-dark;

/* To (if removing light theme): */
@apply relative font-normal font-outfit bg-gray-dark;
```

### Step 5: Update Tailwind Config (If Removing Light Theme)

**File:** `tailwind.config.js`

If you're completely removing light theme support, you can:
- Keep `darkMode: ["class"]` if you want to keep the toggle functionality
- Or remove it if you're making dark mode permanent

### Step 6: Remove Theme Toggle Button (Optional)

**Files:**
- `components/layout/AppHeader.tsx` - Remove `<ThemeToggleButton />`
- `components/layout/GalleryHeader.tsx` - Remove `<ThemeToggleButton />`

Or hide it conditionally:

```tsx
{/* Only show if you want to keep toggle functionality */}
{allowThemeToggle && <ThemeToggleButton />}
```

### Step 7: Update Inline Styles (✅ COMPLETED)

**Note:** All inline color styles have been converted to Tailwind classes with dark mode support. This step is already complete.

**Files that were updated:**
- ✅ `pages/orders.tsx` - All button colors converted to Tailwind classes
- ✅ `pages/galleries/[id]/view.tsx` - All colors converted to Tailwind classes
- ✅ `context/ToastContext.tsx` - Container background converted to Tailwind classes

**Conversion pattern used:**
```tsx
// Before (inline styles)
style={{ backgroundColor: '#f0f0f0', color: '#333' }}

// After (Tailwind classes with dark mode)
className="bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200"
```

**Remaining inline styles:**
- `components/auth/AuthLayout.tsx` - Intentionally left as-is (auth pages are forced dark mode)
- Non-color styles (positioning, sizing, transitions) - These don't need theme support

### Step 8: Update CSS Variables (If Used)

If you have CSS variables that change based on theme, update them in:
- `styles/globals.css`
- `styles/auth.css` (auth pages are already dark-only)

### Step 9: Test All Pages

After making changes, test:
1. ✅ Dashboard home page
2. ✅ Gallery pages
3. ✅ Settings page
4. ✅ Orders page
5. ✅ All modals and dropdowns
6. ✅ Forms and inputs
7. ✅ Buttons and interactive elements
8. ✅ Toast notifications
9. ✅ Sidebar navigation

### Step 10: Update Documentation

Update this file (COLORS.md) to reflect that dark mode is now the default or only theme.

### Quick Reference: Color Mappings

When replacing light theme classes, use these mappings:

| Light Theme | Dark Theme |
|------------|------------|
| `bg-white` | `bg-gray-900` or `bg-gray-dark` |
| `bg-gray-50` | `bg-gray-dark` |
| `text-gray-900` | `text-white` |
| `text-gray-700` | `text-gray-300` |
| `text-gray-500` | `text-gray-400` |
| `border-gray-200` | `border-gray-800` |
| `border-gray-300` | `border-gray-700` |
| `hover:bg-gray-100` | `hover:bg-gray-800` or `hover:bg-white/5` |
| `bg-brand-50` | `bg-brand-500/[0.12]` |

### Important Notes

1. **Auth Pages**: Auth pages (login, sign-up, verify-email) are already dark-only and use a separate color system. They won't be affected by these changes.

2. **Preserve Functionality**: If you want to keep the ability to toggle themes but just change the default, only do Step 1.

3. **Backward Compatibility**: If users have `"light"` saved in localStorage, they'll still see light theme until they toggle or clear localStorage. You may want to clear localStorage on first load after the change:

```typescript
// In ThemeContext.tsx, add to initialization:
useEffect(() => {
  // Clear old light theme preference if you're removing it
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "light") {
    localStorage.removeItem("theme");
  }
  // ... rest of initialization
}, []);
```

4. **Testing**: After making changes, test in incognito/private mode to ensure default theme works correctly.

5. **Build Process**: Run `npm run build` to ensure Tailwind compiles correctly with your changes.

---

## Notes

1. **Theme Switching**: The dashboard uses Tailwind's `dark:` prefix for dark mode variants. The theme is controlled by adding/removing the `dark` class on the `html` element.

2. **Auth Pages**: Auth pages always use dark mode and have their own color system separate from the main dashboard theme.

3. **Opacity Variants**: Many dark theme colors use opacity modifiers (e.g., `brand-500/[0.12]`, `white/5`) for subtle backgrounds and hover states.

4. **Inline Styles**: All inline color styles have been converted to Tailwind classes with dark mode support. The only remaining inline color styles are in `AuthLayout.tsx`, which intentionally forces dark mode for auth pages.

5. **Shadow Colors**: All shadows use `gray-900` (`#101828`) with varying opacities (0.03 to 0.1).

