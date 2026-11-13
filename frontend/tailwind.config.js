/** @type {import('tailwindcss').Config} */

// Color tokens resolve to CSS variables (space-separated RGB channels) so the
// same class works in light and dark mode. `<alpha-value>` keeps opacity
// utilities like `bg-surface/60` working. Channel values live in src/index.css
// (`:root` = light, `.dark` = dark).
const tokenColor = (v) => `rgb(var(${v}) / <alpha-value>)`;

module.exports = {
  darkMode: 'class',
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
    './index.html',
  ],
  theme: {
    extend: {
      fontFamily: {
        // UI / body — geometric grotesk with character (replaces Inter).
        sans: ['Outfit', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        // Display — headings and hero type.
        display: ['"Space Grotesk"', 'Outfit', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        // Monospace — metrics, timestamps, tabular data.
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        background: tokenColor('--c-background'),
        surface: tokenColor('--c-surface'),
        surfaceElevated: tokenColor('--c-surface-elevated'),
        primary: tokenColor('--c-primary'),
        secondary: tokenColor('--c-secondary'),
        accent: tokenColor('--c-accent'),
        text: tokenColor('--c-text'),
        textSecondary: tokenColor('--c-text-secondary'),
        border: tokenColor('--c-border'),
        danger: tokenColor('--c-danger'),
        success: tokenColor('--c-success'),
      },
      boxShadow: {
        // Soft, tinted elevation (single light source, cool hue) — no harsh black.
        card: '0 1px 2px rgba(0,0,0,0.30), 0 8px 24px -12px rgba(0,0,0,0.55)',
        elev: '0 4px 12px rgba(0,0,0,0.35), 0 24px 48px -24px rgba(0,0,0,0.65)',
        // Restrained cerulean focus glow (used sparingly, not on everything).
        neon: '0 0 0 1px rgba(34,160,224,0.35), 0 0 20px -4px rgba(34,160,224,0.40)',
        insetHi: 'inset 0 1px 0 0 rgba(255,255,255,0.05)',
      },
      dropShadow: {
        neon: ['0 0 6px rgba(34,160,224,0.45)', '0 0 2px rgba(255,46,120,0.55)'],
      },
      borderRadius: {
        none: '0',
        md: '0.5rem',
        lg: '0.75rem',
        xl: '1rem',
        '2xl': '1.25rem',
      },
      letterSpacing: {
        tightest: '-0.03em',
      },
    },
  },
  plugins: [],
} 