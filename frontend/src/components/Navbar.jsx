import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import {
  SunIcon, MoonIcon, Bars3Icon, XMarkIcon, DevicePhoneMobileIcon,
} from '@heroicons/react/24/outline';
import { useTheme } from '../theme/ThemeContext';

const LINKS = [
  { to: '/dashboard', label: 'Dashboard', end: true },
  { to: '/flow-analysis', label: 'Upload' },
  { to: '/live-monitor', label: 'Live' },
  { to: '/alerts', label: 'Alerts' },
  { to: '/statistics', label: 'Statistics' },
  { to: '/topology', label: 'Topology' },
  { to: '/admin', label: 'Admin' },
  { to: '/ml-info', label: 'ML Info' },
];

function ThemeToggle() {
  const { mode, toggle } = useTheme();
  const isDark = mode === 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surfaceElevated text-textSecondary transition-colors duration-200 hover:text-primary hover:border-primary/40 active:scale-95"
    >
      {isDark ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
    </button>
  );
}

const linkClass = ({ isActive }) =>
  `relative px-3 py-2 text-sm font-medium transition-colors duration-200 ${
    isActive ? 'text-primary' : 'text-textSecondary hover:text-text'
  }`;

function Navbar() {
  const [open, setOpen] = useState(false);
  // Product name shown in the navigation bar.
  const BRAND = 'Residual-based ODE EWS IPS';

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-surface/80 font-sans backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4">
        <div className="flex h-16 items-center justify-between">
          <Link to="/dashboard" className="group flex select-none items-center gap-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-primary shadow-neon" aria-hidden="true" />
            <span className="font-display text-lg font-semibold tracking-tight text-text transition-colors duration-200 group-hover:text-primary">
              {BRAND}
            </span>
          </Link>

          {/* Desktop links */}
          <div className="hidden items-center gap-1 lg:flex">
            {LINKS.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={linkClass}>
                {l.label}
              </NavLink>
            ))}
            <Link to="/mobile" title="Mobile dashboard"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surfaceElevated text-textSecondary hover:text-primary hover:border-primary/40">
              <DevicePhoneMobileIcon className="h-5 w-5" />
            </Link>
            <ThemeToggle />
          </div>

          {/* Mobile menu button */}
          <div className="flex items-center gap-2 lg:hidden">
            <ThemeToggle />
            <button type="button" onClick={() => setOpen((o) => !o)} aria-label="Toggle menu"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surfaceElevated text-textSecondary hover:text-primary">
              {open ? <XMarkIcon className="h-5 w-5" /> : <Bars3Icon className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        {open && (
          <div className="grid grid-cols-2 gap-1 border-t border-border py-3 lg:hidden">
            {[...LINKS, { to: '/mobile', label: 'Mobile View' }].map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 text-sm font-medium ${
                    isActive ? 'bg-primary/10 text-primary' : 'text-textSecondary hover:bg-surfaceElevated'
                  }`}>
                {l.label}
              </NavLink>
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}

export default Navbar;
