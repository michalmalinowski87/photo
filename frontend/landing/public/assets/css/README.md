# Landing Page CSS Architecture

This directory contains a well-organized, maintainable CSS architecture following design system principles.

## Structure

```
css/
├── design-tokens.css          # CSS variables (colors, spacing, shadows, etc.)
├── typography.css             # Typography system and text utilities
├── base.css                   # Base styles and resets
├── style.css                  # Main entry point (imports all files)
└── components/
    ├── buttons.css            # Button components and variants
    ├── navbar.css             # Navigation bar and sidebar
    ├── header.css             # Hero/header section
    ├── section-title.css      # Section title component
    ├── about.css              # About section and tabs
    ├── services.css           # Services section
    ├── video.css              # Video section
    ├── pricing.css            # Pricing cards and duration selectors
    ├── call-action.css        # CTA sections
    ├── testimonials.css      # Testimonials grid and cards
    ├── brand.css              # Brand/client logos
    ├── contact.css            # Contact section and form
    ├── footer.css             # Footer section
    └── scroll-top.css         # Scroll to top button
```

## Design System Principles

### 1. Design Tokens (`design-tokens.css`)
All design values are centralized as CSS variables:
- **Colors**: Brand, semantic, and neutral colors
- **Gradients**: Predefined gradient combinations
- **Shadows**: Elevation system (shadow-1 through shadow-6)
- **Spacing**: Consistent spacing scale
- **Border Radius**: Standardized radius values
- **Transitions**: Timing functions for animations

### 2. Typography System (`typography.css`)
Complete typography scale with:
- Heading hierarchy (h1-h6, .h1-.h6)
- Display types (.display-1 through .display-4)
- Text utilities (.text-small, .text-lg)
- Brand text utilities (.brand-text, .brand-text-white, .brand-text-black, .brand-text-primary)
- Responsive typography adjustments

### 3. Component-Based Architecture
Each component has its own CSS file for:
- **Maintainability**: Easy to find and update component styles
- **Clarity**: Clear separation of concerns
- **Scalability**: Easy to add new components

### 4. Utility Classes
Reusable utility classes for common patterns:
- `.duration-selector` - Duration selector container
- `.duration-btn` - Duration selector buttons
- `.pricing-btn` - Pricing card buttons
- `.brand-text-*` - Brand text variants

## Usage

### Importing Styles
The main `style.css` file imports all component files in the correct order. Simply include it in your HTML:

```html
<link rel="stylesheet" href="/assets/css/style.css" />
```

### Using Design Tokens
All design tokens are available as CSS variables:

```css
.my-component {
  background-color: var(--primary);
  color: var(--white);
  box-shadow: var(--shadow-2);
  border-radius: var(--radius-md);
  transition: var(--transition-base);
}
```

### Using Typography Classes
Apply typography classes directly:

```html
<h1 class="brand-text-white">PhotoCloud</h1>
<p class="text-lg">Large text content</p>
```

### Using Component Classes
Component classes follow BEM-like naming:

```html
<div class="pricing-style-fourteen middle">
  <h6 class="title">Plan Name</h6>
  <h2 class="amount">Price<span class="currency"> PLN</span></h2>
</div>
```

## Best Practices

1. **Never use inline styles** - Always use CSS classes or CSS variables
2. **Use design tokens** - Reference CSS variables instead of hardcoded values
3. **Follow naming conventions** - Use component-based class names
4. **Maintain component files** - Update component CSS in their respective files
5. **Test responsive breakpoints** - All components include mobile-first responsive styles

## Adding New Components

1. Create a new file in `components/` directory
2. Follow the existing component structure
3. Use design tokens for all values
4. Include responsive breakpoints
5. Import the new file in `style.css`

## Migration Notes

All inline styles have been removed from React components and replaced with CSS classes:
- Duration selector buttons → `.duration-btn` class
- Pricing amount display → `.amount` and `.currency` classes
- Brand text → `.brand-text-*` utility classes
- Button text transforms → `.pricing-btn` class

This ensures maximum maintainability and consistency across the codebase.

