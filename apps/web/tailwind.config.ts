import type { Config } from 'tailwindcss';

// Recipe Systems design tokens — semantic roles (canvas/surface/ink/…) resolve to
// CSS custom properties in app/globals.css, so a future dark theme swaps variables
// without touching component code. The palette layer (rice-flour, tamarind, …)
// is the brand identity: editorial cookbook + culinary lab.
//
// Direction: warm paper canvas, near-black ink, tamarind red as the single saturated
// action accent, turmeric gold for focus/emphasis, curry-leaf green for positive
// states, chili red for destructive/attention. Fraunces (display) + IBM Plex Sans (UI).

const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Semantic roles — rgb(var(--rs-…)) keeps alpha modifiers (e.g. /10) working.
        canvas: 'rgb(var(--rs-canvas) / <alpha-value>)',
        surface: 'rgb(var(--rs-surface) / <alpha-value>)',
        ink: 'rgb(var(--rs-ink) / <alpha-value>)',
        body: 'rgb(var(--rs-body) / <alpha-value>)',
        muted: 'rgb(var(--rs-muted) / <alpha-value>)',
        faint: 'rgb(var(--rs-faint) / <alpha-value>)',
        border: 'rgb(var(--rs-border) / <alpha-value>)',
        'border-strong': 'rgb(var(--rs-border-strong) / <alpha-value>)',
        accent: 'rgb(var(--rs-accent) / <alpha-value>)',
        'accent-strong': 'rgb(var(--rs-accent-strong) / <alpha-value>)',
        gold: 'rgb(var(--rs-gold) / <alpha-value>)',
        positive: 'rgb(var(--rs-positive) / <alpha-value>)',
        negative: 'rgb(var(--rs-negative) / <alpha-value>)',
        // Brand palette layer (culinary names — keep for badges/analysis tags).
        'rice-flour': '#FAF4E6',
        'charred-cumin': '#2B2118',
        turmeric: '#D9A02E',
        tamarind: '#8C3B2E',
        'curry-leaf': '#4C6B3A',
        chili: '#C1442D',
        'ash-gourd': '#D8D2C4',
        'kadai-black': '#1C1712',
        surface_dark: '#241D16',
        'rice-text': '#F2E9D8',
        'turmeric-dark': '#E0B24A',
        'tamarind-dark': '#C1584A',
        'curry-leaf-dark': '#6B8F52',
        'chili-dark': '#DD5C42',
        'border-dark': '#3A3126',
        'muted-dark': '#8C8272',
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        display: ['3.25rem', { lineHeight: '1.04', letterSpacing: '-0.02em', fontWeight: '600' }],
        h1: ['2rem', { lineHeight: '1.15', letterSpacing: '-0.015em', fontWeight: '600' }],
        h2: ['1.375rem', { lineHeight: '1.25', letterSpacing: '-0.01em', fontWeight: '600' }],
        h3: ['1.0625rem', { lineHeight: '1.35', fontWeight: '600' }],
        body: ['1rem', { lineHeight: '1.6' }],
        small: ['0.875rem', { lineHeight: '1.55' }],
        caption: ['0.8125rem', { lineHeight: '1.45' }],
      },
      borderRadius: {
        xs: '4px',
        sm: '6px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        pill: '9999px',
      },
      boxShadow: {
        // Whisper elevation: felt, not seen (warm paper).
        whisper: '0 1px 2px rgba(43, 33, 24, 0.05)',
        card: '0 1px 2px rgba(43, 33, 24, 0.04), 0 4px 12px rgba(43, 33, 24, 0.05), 0 12px 28px rgba(43, 33, 24, 0.05)',
        deep: '0 1px 3px rgba(43, 33, 24, 0.06), 0 8px 20px rgba(43, 33, 24, 0.08), 0 24px 52px rgba(43, 33, 24, 0.10)',
      },
      spacing: {
        section: 'clamp(3rem, 8vw, 6rem)',
      },
      maxWidth: {
        prose: '68ch',
      },
    },
  },
  plugins: [],
};

export default config;
