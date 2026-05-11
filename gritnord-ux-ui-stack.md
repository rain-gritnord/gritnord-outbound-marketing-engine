# Gritnord — UX/UI Stack & Page-Building Instructions

Use this as a system prompt / spec when building any new page so it stays visually and behaviorally consistent with the homepage (`src/pages/Index.tsx`).

---

## 1. Tech & Dependency Stack

| Layer | Library |
|---|---|
| Framework | React 18 + Vite + TypeScript |
| Routing | `react-router-dom` (lazy-loaded routes in `App.tsx`) |
| Styling | Tailwind CSS v3 + semantic HSL tokens (`src/index.css`) |
| UI primitives | shadcn/ui (Radix-based) in `src/components/ui/*` |
| Icons | `lucide-react` (stroke-width 1.5 for feature icons) |
| Theming | `next-themes` (`attribute="class"`, system default) |
| SEO | `react-helmet-async` (every page must set Helmet) |
| i18n | `react-i18next` — namespaces: `home`, `common`, `faq`, `contact`, `calculator`, `referrals` |
| Data/Backend | Lovable Cloud (Supabase) via `@/integrations/supabase/client` |
| State / data fetching | `@tanstack/react-query` |
| Forms | `react-hook-form` + `zod` (when forms are needed) |
| Notifications | `sonner` (toasts via `@/components/ui/sonner`) |

---

## 2. Design System (NON-NEGOTIABLE)

**ElevenLabs-inspired**: pure black/white, high contrast, generous whitespace, pill buttons, rounded-2xl cards, holographic accents reserved for moments.

### Color tokens — always semantic, never raw
Use only the tokens defined in `src/index.css`:
- `bg-background` / `text-foreground`
- `bg-card` / `text-card-foreground`
- `bg-muted` / `text-muted-foreground`
- `bg-primary` / `text-primary-foreground` (black on white / white on black)
- `border-border`, `border-border/50`, `border-border/40`
- Brand accents: `text-nardo-grey`, `text-frozen-blue` (also `bg-` / `border-` variants)

**Forbidden**: `text-white`, `bg-black`, raw hex, yellow/orange anywhere, generic AI/robot graphics.

### Gradient utilities (use sparingly, for accent words & stat numbers only)
- `bg-gradient-primary` — solid black→dark
- `bg-gradient-secondary` — pink→coral→purple→blue (the iridescent accent)
- `bg-gradient-holographic` — full spectrum, used inside `<HolographicStrip />`
- `bg-gradient-hero` — hero background wash

Pattern for accent words:
```tsx
<span className="bg-gradient-secondary bg-clip-text text-transparent">accent text</span>
```

### Typography
- Font: Inter (`font-inter` / `font-display`), tight tracking on headings (`letter-spacing: -0.02em` applied globally to h1–h6)
- Hero H1: `text-5xl md:text-7xl font-bold`
- Section H2: `text-3xl md:text-4xl font-bold`
- Card title: `text-xl font-semibold`
- Body: `text-base` / lead `text-xl text-muted-foreground`

### Shape & elevation
- Buttons: pill (`rounded-full`) — built-in to the `Button` component, do not override
- Cards: `rounded-2xl` (default in `Card`), border `border-border/50`, hover lifts to `hover:shadow-elegant hover:border-nardo-grey/50`
- Stat tiles: `rounded-3xl`
- Shadows: `shadow-sm` resting → `shadow-elegant` hover; `shadow-glow` only on hero / pricing peaks

### Motion
- Transitions: `transition-all duration-300`
- Allowed keyframes: `animate-scroll`, `animate-float`, `animate-pulse-glow`, `animate-breathe-glow`, holographic shimmer (already on the strip)
- **No** per-word kinetic typography on hero accents (rejected by user) — static gradient only
- Always honor `prefers-reduced-motion` (already wired in `index.css`)

---

## 3. Page Skeleton (copy this scaffold)

Every new page must include: Helmet → fixed Header (with scroll-hide) → main sections → Footer.

```tsx
import { Helmet } from "react-helmet-async";
import { useTheme } from "next-themes";
import { useScrollDirection } from "@/hooks/useScrollDirection";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CalendlyModal } from "@/components/CalendlyModal";
import { ThemeToggle } from "@/components/theme-toggle";
import HolographicStrip from "@/components/HolographicStrip";
import gritnordLogoDark from "@/assets/gritnord-logo-dark-bg.png";
import gritnordLogoLight from "@/assets/gritnord-logo-light-bg.png";

export default function NewPage() {
  const { theme } = useTheme();
  const logoSrc = theme === "dark" ? gritnordLogoDark : gritnordLogoLight;
  const scrollDirection = useScrollDirection();

  return (
    <div className="min-h-screen bg-background overflow-x-hidden pt-16">
      <Helmet>
        <title>Page Title — Gritnord</title>            {/* < 60 chars */}
        <meta name="description" content="…" />          {/* < 160 chars */}
        <link rel="canonical" href="https://gritnord.com/path" />
        <meta property="og:title" content="…" />
        <meta property="og:description" content="…" />
        <meta property="og:image" content="https://gritnord.com/og-image.png" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
      </Helmet>

      {/* Fixed, scroll-hiding header — copy verbatim from Index.tsx */}
      <header className={cn(
        "border-b border-border/40 bg-background/95 backdrop-blur-xl fixed top-0 left-0 right-0 z-40 transition-transform duration-300",
        scrollDirection === "down" ? "-translate-y-full" : "translate-y-0"
      )}>
        {/* …same nav structure: logo button, mobile Sheet, desktop links, Book Demo CTA, Log In → https://app.gritnord.com */}
      </header>

      <main>
        {/* sections */}
      </main>

      {/* Footer — reuse the one in Index.tsx */}
    </div>
  );
}
```

### Header rules
- Fixed top, `h-16`, `z-40`, blurred translucent bg (`bg-background/95 backdrop-blur-xl`)
- Hides on scroll-down via `useScrollDirection()` + `-translate-y-full`
- Logo is a `<button>` that scrolls to top on home, navigates `/` on subpages
- Theme-aware logo (`gritnordLogoDark` vs `gritnordLogoLight`)
- Right side: nav links (`text-sm text-muted-foreground hover:text-nardo-grey`) + `<CalendlyModal><Button>Book Demo</Button></CalendlyModal>`
- Login link → `<a href="https://app.gritnord.com">Log In</a>` (external, no `Link`)
- Mobile: `<Sheet>` from the right, links use `text-lg font-medium text-muted-foreground hover:text-foreground`
- Add `pt-16` on the page wrapper to offset the fixed header

---

## 4. Section Patterns (drop-in templates)

All sections follow: `<section className="py-20"><div className="container mx-auto px-4">…</div></section>`.

### Hero
- `<GradientOrbsElevenLabs />` background layer
- H1 with one accent span using `bg-gradient-secondary bg-clip-text text-transparent`
- Subhead `text-xl text-muted-foreground` (≤ 2 lines)
- Single primary CTA: `<Button size="lg" className="px-8 py-6 text-base font-semibold">` with trailing `<ArrowRight />`
- End hero with `<HolographicStrip className="mt-16" />`
- Hero messaging MUST sit above the fold

### Stats / social proof
- `bg-muted/30 py-24`, 3-column grid of `rounded-3xl` cards
- Big number: `text-5xl font-bold bg-gradient-secondary bg-clip-text text-transparent`
- Label: `text-nardo-grey font-medium`

### 3-Step / How It Works
- Desktop: `lg:grid-cols-3` with absolute connecting lines (`bg-gradient-to-r from-primary/50 to-primary/30`)
- Mobile: vertical stack with left rail line
- Numbered circle: `w-12 h-12 rounded-full bg-primary text-primary-foreground`
- Lucide icon `h-10 w-10 text-primary` `strokeWidth={1.5}`

### Problem / Solution
- 3 `Card` tiles, icons in `text-red-500` for problems, `text-primary` for solutions
- Closing line bold + gradient text

### FAQ
- shadcn `<Accordion type="single" collapsible>`
- i18n strings from `faq` namespace

### CTA band (closing)
- Full-width muted bg, centered headline, single pill CTA, optional `<HolographicStrip />` above

### Footer
- 4-column grid: Company / Resources / Legal / brand blurb
- Links use `text-sm text-muted-foreground hover:text-foreground`
- Copyright year **2026**

---

## 5. Reusable Components (import, don't rebuild)

| Component | Purpose |
|---|---|
| `@/components/ui/*` | shadcn primitives (Button, Card, Sheet, Accordion, Dialog, Tabs, etc.) |
| `@/components/CalendlyModal` | Wrap any element to open the booking modal |
| `@/components/HolographicStrip` | Animated iridescent separator |
| `@/components/GradientOrbsElevenLabs` | Subtle background blobs (also `Blue`, `Purple`, `Slate`) |
| `@/components/OrganicGlowBackground` | Organic blob hero backdrop |
| `@/components/ProductTabs` | Pinned product feature tabs |
| `@/components/SDRCalculator` | ROI calculator block |
| `@/components/StatisticsTicker` | Auto-scrolling stat marquee |
| `@/components/theme-toggle` | Dark/light switch |
| `@/components/LanguageSwitcher` | EN/ET locale switch |
| `@/components/ScrollToTop` | Already mounted in `App.tsx` |
| `@/components/PageBreadcrumb` + `BreadcrumbSchema` | Subpage breadcrumbs + JSON-LD |

### Hooks
- `useScrollDirection()` — header hide/show
- `useIsMobile()` — `< 768px`
- `useTheme()` from `next-themes`
- `useTranslation([...namespaces])`

---

## 6. Routing
Add lazy import + `<Route>` in `src/App.tsx` **above** the `*` catch-all. Use kebab-case URLs.

---

## 7. Content & Copy Rules
- Tagline anchor: "Digital B2B Matchmaking / ICP based meetings generator"
- Markets: Scandinavia, UK, Europe
- Glossary: **UC** = Upstream Customer (client), **DC** = Downstream Customer (prospect); on referral pages always say **Client**, never Customer
- Default language English; Latvian uses formal *Jūs*, keeps SaaS terms in English
- Never persist PII to localStorage/sessionStorage

---

## 8. SEO Checklist (every page)
- One `<h1>`
- `<title>` < 60 chars including keyword
- Meta description < 160 chars
- Canonical URL
- OG: title / description / image (`/og-image.png`, 1200×630) / type / url
- Twitter: `summary_large_image`
- JSON-LD where applicable (Article for blog, BreadcrumbList for subpages)
- Semantic HTML (`<main>`, `<section>`, `<nav>`, `<article>`)
- `alt` on all images, lazy-load below-the-fold images

---

## 9. Accessibility
- All interactive elements keyboard-reachable; visible focus rings (already on Button via `focus-visible:ring-2 ring-ring`)
- `aria-label` on icon-only buttons (e.g. menu toggle)
- Color contrast preserved in both themes — only use semantic tokens
- Respect `prefers-reduced-motion` (handled globally)

---

## 10. Authoring Checklist (before shipping a new page)
- [ ] `pt-16` on root + scroll-hiding header
- [ ] Helmet with title / desc / canonical / OG / Twitter
- [ ] Hero above the fold, single primary CTA, `<HolographicStrip />` after hero
- [ ] Only semantic color tokens; no raw colors, no yellow/orange
- [ ] Pill buttons via `<Button>`, `rounded-2xl` cards
- [ ] Lucide icons stroke-width 1.5
- [ ] Mobile: sheet nav, no sticky footer CTA on mobile
- [ ] i18n strings (no hard-coded copy in feature sections)
- [ ] Lazy route registered in `App.tsx`
- [ ] Footer reused, copyright 2026
- [ ] Login button → `https://app.gritnord.com`
- [ ] Built and renders clean in light AND dark mode
