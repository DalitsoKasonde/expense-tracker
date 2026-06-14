---
name: Teal Admin Identity
colors:
  surface: '#f8f9ff'
  surface-dim: '#d0dbed'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e6eeff'
  surface-container-high: '#dee9fc'
  surface-container-highest: '#d9e3f6'
  on-surface: '#121c2a'
  on-surface-variant: '#3f4947'
  inverse-surface: '#27313f'
  inverse-on-surface: '#eaf1ff'
  outline: '#6f7977'
  outline-variant: '#bec9c7'
  surface-tint: '#216963'
  primary: '#004541'
  on-primary: '#ffffff'
  primary-container: '#115e59'
  on-primary-container: '#91d5ce'
  inverse-primary: '#8fd3cc'
  secondary: '#655e4d'
  on-secondary: '#ffffff'
  secondary-container: '#e9dfc9'
  on-secondary-container: '#696251'
  tertiary: '#1f4335'
  on-tertiary: '#ffffff'
  tertiary-container: '#375b4b'
  on-tertiary-container: '#a9d1bd'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#abefe8'
  primary-fixed-dim: '#8fd3cc'
  on-primary-fixed: '#00201e'
  on-primary-fixed-variant: '#00504b'
  secondary-fixed: '#ece1cc'
  secondary-fixed-dim: '#d0c6b1'
  on-secondary-fixed: '#201b0e'
  on-secondary-fixed-variant: '#4d4636'
  tertiary-fixed: '#c3ecd7'
  tertiary-fixed-dim: '#a8cfbc'
  on-tertiary-fixed: '#002115'
  on-tertiary-fixed-variant: '#294e3f'
  background: '#f8f9ff'
  on-background: '#121c2a'
  surface-variant: '#d9e3f6'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 48px
    fontWeight: '800'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 34px
  title-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Manrope
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Manrope
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-bold:
    fontFamily: Manrope
    fontSize: 14px
    fontWeight: '700'
    lineHeight: 16px
  label-caps:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '800'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  container-padding-mobile: 20px
  container-padding-desktop: 40px
  gutter: 16px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 24px
---

## Brand & Style

This design system is defined by a sophisticated blend of **Modern Corporate** efficiency and **Soft Minimalist** warmth. It is designed for administrative professionals who require high-density information environments that don't sacrifice human-centric comfort. 

The aesthetic leverages high-quality white space and a "warm-neutral" foundation to reduce eye strain during long sessions. It utilizes a bold, rounded typographic hierarchy to create clear entry points for information, while the deep teal primary accents provide a sense of stability, security, and institutional trust. The interaction model is tactile yet clean, using subtle tonal layering rather than aggressive shadows to define depth.

## Colors

The palette is anchored by **Deep Teal (#115E59)**, used for primary actions, critical brand moments, and high-level navigation items. This is paired with a **Warm Off-White (#F9F6F0)** background that differentiates the interface from standard "clinical" white SaaS applications.

- **Primary:** Deep Teal. Used for primary buttons, active states, and focus indicators.
- **Secondary:** Warm Sand (#F3E8D2). Used for secondary badges, chip backgrounds, and subtle surface differentiation.
- **Surface:** Pure White (#FFFFFF) is reserved for cards and input fields to ensure they "pop" against the off-white background.
- **Functional:** Success states utilize the Tertiary Mint (#D1FAE5) to maintain a cohesive green-adjacent spectrum.

## Typography

The system uses a dual-font strategy. **Plus Jakarta Sans** provides the "Bold and Rounded" personality for headlines and labels, giving the interface a friendly but modern character. **Manrope** is used for body copy and data entry, chosen for its exceptional legibility in dense administrative layouts.

Headlines should always use tighter letter spacing and heavy weights (700+) to replicate the punchy, authoritative look of the brand identity. Labels for inputs use a bold weight to ensure clarity against white surfaces.

## Layout & Spacing

This design system employs a **Fluid Grid** with fixed-margin safe zones. For mobile admin views, a 4-column grid is used with 20px side margins. For desktop, a 12-column grid is used with a maximum content width of 1280px.

Spacing follows a strict 4pt / 8pt rhythm. 
- **Vertical Stack:** Use `stack-lg` (24px) between major sections (e.g., between an input group and a button).
- **Grouped Elements:** Use `stack-sm` (8px) for internal grouping (e.g., between a label and its input).
- **Mobile Reflow:** In mobile views, cards should span the full width of the 4-column grid, minus the container padding.

## Elevation & Depth

Depth is achieved primarily through **Tonal Layers** and subtle, low-opacity shadows. 
- **Level 0 (Background):** The Warm Off-White surface.
- **Level 1 (Cards/Inputs):** Pure white surfaces with a 1px border (#E5E7EB) or a very soft shadow (0px 4px 12px rgba(17, 94, 89, 0.05)).
- **Level 2 (Modals/Popovers):** Pure white with a more pronounced, diffused shadow.

Avoid heavy black shadows. Instead, use a "Tinted Shadow" approach where the shadow color is a highly transparent version of the Deep Teal primary color. This maintains the clean, professional aesthetic without looking "dirty."

## Shapes

The shape language is consistently **Rounded**, reflecting the soft but professional personality. 
- **Small Elements (Inputs, Buttons):** Use a 0.5rem (8px) radius.
- **Large Elements (Cards, Containers):** Use a 1.5rem (24px) radius to create the "pill-box" aesthetic seen in the identity.
- **Chips/Badges:** Use a full pill-shape (999px) for status indicators and metadata tags.

## Components

### Buttons
- **Primary:** Deep Teal background, white text. Use 700 weight. Height: 48px for mobile accessibility.
- **Secondary:** Warm Sand background with Deep Teal text.
- **Ghost:** No background, Deep Teal text and bold weight.

### Input Fields
- **Container:** Pure white background, 1px border (#E5E7EB). On focus, the border becomes Deep Teal (2px).
- **Labels:** Positioned above the field in `label-bold` style. 
- **Help Text:** Positioned below the field in `body-sm`, using a medium-gray tone.

### Chips & Badges
- Used for status (e.g., "Phase 0"). Backgrounds use the Secondary or Tertiary colors with 70% opacity. Text is consistently the darkest version of the hue for contrast.

### Cards
- White background, 24px corner radius. Used to group related admin data (e.g., "Stock Levels," "Recent Sales"). All cards should include a consistent internal padding of 24px.