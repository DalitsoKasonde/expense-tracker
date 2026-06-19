---
name: Inscribed
colors:
  surface: '#f6fafe'
  surface-dim: '#d6dade'
  surface-bright: '#f6fafe'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f0f4f8'
  surface-container: '#eaeef2'
  surface-container-high: '#e4e9ed'
  surface-container-highest: '#dfe3e7'
  on-surface: '#171c1f'
  on-surface-variant: '#414753'
  inverse-surface: '#2c3134'
  inverse-on-surface: '#edf1f5'
  outline: '#717785'
  outline-variant: '#c1c6d6'
  surface-tint: '#005db8'
  primary: '#005cb7'
  on-primary: '#ffffff'
  primary-container: '#0074e4'
  on-primary-container: '#ffffff'
  inverse-primary: '#aac7ff'
  secondary: '#395f98'
  on-secondary: '#ffffff'
  secondary-container: '#9bbfff'
  on-secondary-container: '#254d85'
  tertiary: '#445e87'
  on-tertiary: '#ffffff'
  tertiary-container: '#5d77a2'
  on-tertiary-container: '#ffffff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d6e3ff'
  primary-fixed-dim: '#aac7ff'
  on-primary-fixed: '#001b3e'
  on-primary-fixed-variant: '#00458d'
  secondary-fixed: '#d6e3ff'
  secondary-fixed-dim: '#a9c7ff'
  on-secondary-fixed: '#001b3d'
  on-secondary-fixed-variant: '#1d477e'
  tertiary-fixed: '#d5e3ff'
  tertiary-fixed-dim: '#adc7f7'
  on-tertiary-fixed: '#001b3c'
  on-tertiary-fixed-variant: '#2d476f'
  background: '#f6fafe'
  on-background: '#171c1f'
  surface-variant: '#dfe3e7'
typography:
  display-accent:
    fontFamily: Great Vibes
    fontSize: 36px
    fontWeight: '400'
    lineHeight: 44px
  headline-lg:
    fontFamily: Quicksand
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
  headline-lg-mobile:
    fontFamily: Quicksand
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-md:
    fontFamily: Quicksand
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Quicksand
    fontSize: 16px
    fontWeight: '500'
    lineHeight: 24px
  body-md:
    fontFamily: Quicksand
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  label-sm:
    fontFamily: Quicksand
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  container-margin-mobile: 20px
  container-margin-desktop: 40px
  gutter: 16px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
---

## Brand & Style
The design system embodies a "Professional Cutesy" aesthetic—a sophisticated balance of approachability and executive polish. It leverages the tactile visual metaphor of a high-end physical planner, translating the serenity of an organized digital desk into a functional interface. 

The style is characterized by **Soft Minimalism** mixed with **Tactile Layering**. It avoids the juvenile nature of "bubble" designs by using disciplined geometry and high-end typography. The emotional goal is to provide a sense of "Airy Order," where the user feels calm, focused, and empowered. The interface should feel like premium stationery: smooth, substantial, and intentionally composed.

## Colors
This design system utilizes a tiered cooling palette to establish hierarchy and depth. 

- **Foundation:** The `background_paper` (#F4F8FC) acts as the desk surface. Surfaces layered on top use pure white or the `surface_accent` (#CEDDEF) at low opacities to mimic vellum or light cardstock.
- **Action & Focus:** `primary_color_hex` (Sky Blue) is reserved for high-priority interactive elements. `secondary_color_hex` (Indigo) provides a sophisticated anchor for headers and branding.
- **Typography:** Contrast is maintained through `text_main` (Midnight), while `text_muted` (Warm Gray) handles metadata and labels to reduce visual noise.
- **Dividers:** Use `border_color` (#EBEBE6) sparingly. Prefer depth-based separation over hard lines where possible.

## Typography
The typography strategy pairs the structural legibility of **Quicksand** with the artisanal elegance of **Great Vibes**.

- **Quicksand** is the workhorse. Use Medium (500) for body text to ensure a "premium ink" feel, and Bold (700) for headers to maintain authority.
- **Great Vibes** is a decorative accent. Use it exclusively for "moment" text: empty state messages, pull quotes, or subtle brand signatures. It should never be used for critical UI labels or long-form body content.
- **Letter Spacing:** Apply a slight tracking increase (2%) to labels to enhance the professional feel and offset the inherent playfulness of rounded letterforms.

## Layout & Spacing
The layout follows a **Fluid Grid** model with generous internal padding to maintain the "Airy" brand promise.

- **Mobile (Default):** Single column with 20px side margins. Components should feel "tucked in" from the screen edge to suggest a page within a cover.
- **Desktop:** A centered 12-column grid with a max-width of 1200px. Content should be grouped into logical "clusters" (cards) rather than spanning the full width of the viewport.
- **Vertical Rhythm:** Use a 4px baseline grid. Most vertical spacing should utilize `stack-md` (16px) for related items and `stack-lg` (32px) for distinct sections.

## Elevation & Depth
Depth in this design system is achieved through **Tonal Layering** and **Soft Ambient Shadows**. We avoid high-contrast drop shadows.

- **Level 0 (Base):** `background_paper`. 
- **Level 1 (Cards):** White background with a subtle 1px border in `border_color` or an extremely soft, large-radius shadow (Blur: 20px, Opacity: 4%, Color: Indigo).
- **Level 2 (Modals/Sheets):** Elevated cards with a more pronounced shadow (Blur: 30px, Opacity: 8%). 
- **Interaction:** On hover or tap, cards should not "lift" aggressively. Instead, a subtle change in border-color intensity or a very slight increase in shadow spread is preferred to maintain the professional tone.

## Shapes
The shape language is "Moderately Soft." We reject both sharp 90-degree corners and circular pill shapes to occupy a sophisticated middle ground.

- **Primary Cards:** 20px corner radius. This creates a friendly but structured container.
- **Buttons & Inputs:** 12px corner radius. This provides a tactile, "squished square" look that feels premium.
- **Bottom Sheets:** 22px top corner radius to emphasize the "soft drawer" metaphor.
- **Icons:** Use icons with a consistent 2pt stroke width and rounded terminals to match the Quicksand typeface.

## Components
Consistent application of these components ensures the "Professional Cutesy" mood remains cohesive.

- **Buttons:**
  - **Primary:** Sky Blue fill with White text. Bold 12px corners. No gradients.
  - **Secondary:** White fill with Indigo border (1.5px) and Indigo text.
- **Cards:** White surfaces with 20px corners. Use `surface_accent` (#CEDDEF) for internal "sub-sections" within a card (e.g., a header area inside a card).
- **Input Fields:** 12px rounded corners, `background_paper` fill, and a subtle 1px border. Focus state uses a 2px `primary_color` border.
- **Chips/Tags:** 8px rounded corners (not pill). Use low-saturation background tints from the secondary color palette.
- **Bottom Sheets:** Mobile-first navigation and action sheets should use a thick "grabber" bar (40px wide, 4px tall, Warm Gray) at the top to enhance the tactile feel.
- **Lists:** Use "inset" lists where each item is a soft-cornered card, rather than a continuous line-separated list, to reinforce the "organized desk" metaphor.