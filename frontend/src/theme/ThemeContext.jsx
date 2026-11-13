import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'ews-theme';

const ThemeContext = createContext({ mode: 'dark', toggle: () => {}, setMode: () => {} });

function readInitialMode() {
  if (typeof window === 'undefined') return 'dark';
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
    const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    return prefersLight ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState(readInitialMode);

  // Keep <html class="dark"> and localStorage in sync with the mode.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', mode === 'dark');
    try { window.localStorage.setItem(STORAGE_KEY, mode); } catch { /* ignore */ }
  }, [mode]);

  const setMode = useCallback((m) => setModeState(m === 'light' ? 'light' : 'dark'), []);
  const toggle = useCallback(() => setModeState((m) => (m === 'dark' ? 'light' : 'dark')), []);

  const value = useMemo(() => ({ mode, toggle, setMode }), [mode, toggle, setMode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

// ─────────────────────────────────────────────────────────────────────────
// Chart palette. Recharts needs concrete color strings (it can't read Tailwind
// classes), so we resolve a palette per mode here and every chart consumes it.
// Colors are tuned for readability against each background:
//   - dark mode: brighter, slightly desaturated fills on charcoal
//   - light mode: deeper, more saturated so marks don't wash out on white
// ─────────────────────────────────────────────────────────────────────────
const DARK_PALETTE = {
  mode: 'dark',
  grid: 'rgba(90,200,245,0.14)',
  axis: '#969EAA',
  axisLabel: '#C4CCD8',
  tooltipBg: '#121217',
  tooltipBorder: '#24262E',
  tooltipText: '#EDF0F4',
  tooltipMuted: '#969EAA',
  benign: '#2ECC96',   // normal traffic (emerald)
  ddos: '#FF2E78',     // anomalous traffic (neon rose)
  // Alert-severity ramp (LOW → HIGH), distinct from benign/ddos.
  level: { BENIGN: '#5A6070', LOW: '#22A0E0', MED: '#FBBF24', HIGH: '#FF5D6E' },
  // Attack-phase markers — three distinct hues, one consistent style.
  marker: { start: '#FBBF24', peak: '#FF2E78', end: '#5AC8F5' },
  phaseBand: '#FF2E78',
};

const LIGHT_PALETTE = {
  mode: 'light',
  grid: 'rgba(42,19,36,0.10)',
  axis: '#685664',
  axisLabel: '#2A1324',
  tooltipBg: '#FFFFFF',
  tooltipBorder: '#DDD6E0',
  tooltipText: '#2A1324',
  tooltipMuted: '#685664',
  benign: '#168C6E',
  ddos: '#C6283C',
  level: { BENIGN: '#8E85A0', LOW: '#5B2A4E', MED: '#EEA422', HIGH: '#C6283C' },
  marker: { start: '#EEA422', peak: '#C6283C', end: '#5B2A4E' },
  phaseBand: '#C6283C',
};

export function useChartTheme() {
  const { mode } = useTheme();
  return mode === 'light' ? LIGHT_PALETTE : DARK_PALETTE;
}
