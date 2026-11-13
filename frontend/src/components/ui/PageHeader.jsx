// Consistent page title block used across the new feature pages.
export default function PageHeader({ eyebrow, title, subtitle, actions }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && (
          <span className="inline-flex items-center rounded-full border border-border bg-surface/60 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.22em] text-textSecondary">
            {eyebrow}
          </span>
        )}
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tightest text-text">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-textSecondary">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
