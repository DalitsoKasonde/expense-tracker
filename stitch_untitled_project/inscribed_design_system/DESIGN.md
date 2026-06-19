---
name: Inscribed Design System
colors:
  surface: '#f9f9fe'
  surface-dim: '#dad9df'
  surface-bright: '#f9f9fe'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f4f3f8'
  surface-container: '#eeedf3'
  surface-container-high: '#e8e8ed'
  surface-container-highest: '#e2e2e7'
  on-surface: '#1a1c1f'
  on-surface-variant: '#434750'
  inverse-surface: '#2f3034'
  inverse-on-surface: '#f1f0f6'
  outline: '#737781'
  outline-variant: '#c3c6d1'
  surface-tint: '#395f98'
  primary: '#03376e'
  on-primary: '#ffffff'
  primary-container: '#264e86'
  on-primary-container: '#9dc1ff'
  inverse-primary: '#a9c7ff'
  secondary: '#005ab4'
  on-secondary: '#ffffff'
  secondary-container: '#0072e1'
  on-secondary-container: '#fefcff'
  tertiary: '#1b375e'
  on-tertiary: '#ffffff'
  tertiary-container: '#344e76'
  on-tertiary-container: '#a6c0ef'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d6e3ff'
  primary-fixed-dim: '#a9c7ff'
  on-primary-fixed: '#001b3d'
  on-primary-fixed-variant: '#1d477e'
  secondary-fixed: '#d6e3ff'
  secondary-fixed-dim: '#aac7ff'
  on-secondary-fixed: '#001b3e'
  on-secondary-fixed-variant: '#00458d'
  tertiary-fixed: '#d5e3ff'
  tertiary-fixed-dim: '#adc7f7'
  on-tertiary-fixed: '#001b3c'
  on-tertiary-fixed-variant: '#2d476f'
  background: '#f9f9fe'
  on-background: '#1a1c1f'
  surface-variant: '#e2e2e7'
typography:
  display-lg:
    fontFamily: Quicksand
    fontSize: 48px
    fontWeight: '600'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Quicksand
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
  headline-lg-mobile:
    fontFamily: Quicksand
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-md:
    fontFamily: Quicksand
    fontSize: 24px
    fontWeight: '500'
    lineHeight: 32px
  body-lg:
    fontFamily: Quicksand
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Quicksand
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Quicksand
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Quicksand
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.03em
  accent-flourish:
    fontFamily: Great Vibes
    fontSize: 24px
    fontWeight: '400'
    lineHeight: 32px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 64px
---

## Brand & Style

The design system is anchored in the concept of "Digital Stationery"—blending the tactile precision of a high-end physical ledger with the seamless efficiency of a modern financial tool. The brand personality is mature, analytical, and composed, designed to evoke a sense of quiet confidence in the user's financial journey.

The aesthetic follows a **Premium Minimalist** movement. It avoids the fleeting trends of "bubbly" tech interfaces in favor of architectural stability and editorial clarity. This is achieved through a deliberate use of white space, a disciplined color palette, and a focus on high-quality typography. The goal is to create a gender-neutral environment that feels globally relevant and professionally reliable, where data is the protagonist and the UI provides a sophisticated stage.

## Colors

The palette is a monochromatic exploration of blue, chosen for its psychological associations with stability and trust. 

- **Primary Indigo (#264E86):** Used for primary actions and key brand touchpoints.
- **Sky Blue (#0074E4):** Utilized for interactive states, focus indicators, and data visualization highlights.
- **Deep Blue & Navy:** Reserved for deep hierarchy levels, footer elements, and high-contrast typography backgrounds.
- **The Canvas:** An **Ice Blue (#F4F8FC)** background provides a cool, crisp foundation that differentiates the interface from standard stark-white apps.
- **Surfaces:** Primary cards and containers use **Pure White (#FFFFFF)** to create a clear "layering" effect against the ice-blue canvas, mimicking the look of premium paper on a desk.
- **Text:** High-contrast **Midnight (#181A2A)** and **Charcoal (#1A1A1A)** ensure maximum legibility and an authoritative editorial feel.

## Typography

The typography system relies on **Quicksand** for 99% of the interface. Its geometric yet open nature provides modern readability without feeling overly "tech-heavy." 

- **Functional UI:** Quicksand is used across all weights. Headers use Medium (500) and Semi-Bold (600) to establish a firm hierarchy. Body text stays at Regular (400) for optimal flow.
- **Subtle Accents:** **Great Vibes** is a restricted secondary font. It should only be used for "signature" moments—such as a small greeting (e.g., *"Welcome back"*), a decorative section divider, or a personalized note. It must never be used for critical data, labels, or navigation.
- **Numerical Data:** Given the financial nature of the product, ensure tabular figures (monospaced numbers) are utilized within Quicksand where possible to keep balance sheets aligned.

## Layout & Spacing

The layout philosophy follows a **Fixed-Fluid Hybrid** model. Content is contained within a max-width of 1280px on desktop to maintain readability, while utilizing a fluid 12-column grid for internal card layouts.

- **Vertical Rhythm:** A strict 4px baseline grid ensures that all elements—from text lines to icon placements—feel intentional and "inscribed" onto the page.
- **Generous Margins:** Large external margins (64px on desktop) create a "gallery" effect, focusing the user's eye on the central financial data. 
- **Reflow:** On mobile, margins reduce to 16px, and the 12-column grid collapses to 4 columns. Spacing between cards (gutters) remains consistent at 24px to prevent the UI from feeling cramped.

## Elevation & Depth

This design system avoids heavy drop shadows in favor of **Tonal Layering** and **Micro-Shadows**.

1.  **Level 0 (Canvas):** The Ice Blue (#F4F8FC) background.
2.  **Level 1 (Cards):** Pure White (#FFFFFF) surfaces with a very soft, diffused 2px blur shadow (3% opacity) to subtly lift the card from the canvas. 
3.  **Level 2 (Modals/Popovers):** Higher elevation with a slightly deeper indigo-tinted shadow to indicate temporary interaction.

Contrast is primarily driven by color blocks rather than depth effects. High-contrast borders (1px width in #E2E8F0) may be used on white cards to define edges when shadow is unnecessary.

## Shapes

The shape language is "Refined Architectural." It avoids the juvenile feel of fully rounded pill shapes.

- **Cards:** Use a **16px** radius, providing a soft but structured frame for data.
- **Interactive Elements:** Buttons, input fields, and dropdowns use a tighter **10px** radius. This distinction helps the user subconsciously differentiate between static containers and clickable actions.
- **Icons:** Should follow a linear, 2px stroke weight style with slightly rounded ends to match the Quicksand typeface.

## Components

- **Buttons:** Primary buttons use a solid Primary Indigo (#264E86) fill with white text. Secondary buttons use a 1.5px Indigo border with transparent backgrounds. No pill shapes; strictly 10px rounded rectangles.
- **Inputs:** Use a subtle 1px border in a lightened Navy tint. On focus, the border transitions to Sky Blue (#0074E4) with a soft 2px outer glow.
- **Chips/Tags:** Used for categorizing transactions. These should have a light tinted background (e.g., 10% opacity of the category color) and 4px rounded corners—avoiding the circular ends of traditional chips.
- **Cards:** Every card should have a clear "Header" area with a thin 1px bottom divider to separate the title from the content, reinforcing the stationery aesthetic.
- **Lists:** Transaction lists should feature generous 16px padding between rows, using horizontal dividers only where necessary to maintain a clean vertical rhythm.
- **Data Visualization:** Charts should use the full blue palette (Navy through Sky Blue) with high-contrast lines. Area charts should use low-opacity gradients to maintain the "minimalist" feel.