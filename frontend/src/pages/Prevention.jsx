import { useNavigate } from 'react-router-dom';
import { CloudArrowUpIcon, BoltIcon, ArrowRightIcon } from '@heroicons/react/24/outline';

const METHODS = [
  {
    key: 'upload',
    to: '/flow-analysis',
    icon: CloudArrowUpIcon,
    title: 'Dataset upload',
    body: 'Analyze a captured traffic CSV. The pipeline scores every second and flags LOW / MEDIUM / HIGH severity against its benign baseline.',
    cta: 'Upload CSV',
  },
  {
    key: 'live',
    to: '/live-capture',
    icon: BoltIcon,
    title: 'Real-time monitoring',
    body: 'Capture live traffic and watch the early-warning engine surface severity second by second, then run a final pass on stop.',
    cta: 'Start capture',
  },
];

const Prevention = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-[100dvh] bg-background bg-ambient text-text font-sans relative overflow-hidden">
      {/* Technical grid backdrop */}
      <div className="absolute inset-0 pointer-events-none z-0 opacity-40 bg-grid" aria-hidden="true" />

      <main className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        {/* Hero */}
        <header className="max-w-2xl mb-16">
          <span className="inline-flex items-center rounded-full border border-border bg-surface/60 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.22em] text-textSecondary">
            Choose a method
          </span>
          <h1 className="mt-5 font-display text-4xl md:text-5xl font-semibold text-text tracking-tightest leading-[1.08]">
            Proactive DDoS defense
          </h1>
          <p className="mt-5 text-lg text-textSecondary leading-relaxed text-pretty">
            Two ways into the same early-warning engine — feed it a dataset, or point
            it at a live interface and detect threats before they impact your systems.
          </p>
        </header>

        {/* Method cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {METHODS.map(({ key, to, icon: Icon, title, body, cta }) => (
            <button
              key={key}
              type="button"
              onClick={() => navigate(to)}
              className="group text-left flex flex-col h-full rounded-2xl border border-border bg-surface/70 p-8 shadow-card ring-1 ring-inset ring-white/5 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-1 hover:border-primary/40 hover:shadow-elev active:translate-y-0 active:scale-[0.99]"
            >
              <span className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-xl border border-border bg-surfaceElevated text-primary transition-colors duration-300 group-hover:border-primary/40 group-hover:text-primary">
                <Icon className="h-7 w-7" />
              </span>
              <h2 className="font-display text-2xl font-semibold text-text mb-3">{title}</h2>
              <p className="text-textSecondary leading-relaxed">{body}</p>
              <span className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-primary">
                {cta}
                <ArrowRightIcon className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </span>
            </button>
          ))}
        </div>

        <p className="mt-14 text-sm text-textSecondary/80">
          Select a method above to begin analysis.
        </p>
      </main>
    </div>
  );
};

export default Prevention;
