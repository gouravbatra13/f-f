import { AlertCircle, LoaderCircle } from 'lucide-react';

export function LoadingState({ label = 'Loading data…' }: { label?: string }) {
  return (
    <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-slate-400">
      <LoaderCircle size={16} className="animate-spin text-cyan-300" />
      {label}
    </div>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="empty-state rounded-2xl border border-dashed border-white/10 px-6 py-12 text-center">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-300/10 bg-cyan-400/[0.07] text-cyan-300 shadow-[0_0_28px_rgba(34,211,238,0.07)]">
        <AlertCircle size={18} />
      </div>
      <h3 className="mt-4 text-sm font-semibold tracking-tight text-slate-100">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-[13px] leading-6 text-slate-400">
        {description}
      </p>
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-4 text-sm text-rose-200"
    >
      <p>{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 rounded-lg border border-rose-300/20 px-3 py-1.5 text-xs hover:bg-rose-300/5"
        >
          Retry
        </button>
      )}
    </div>
  );
}

export function Panel({
  title,
  subtitle,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const normalizedTitle = title.toLowerCase();
  const accentClass = normalizedTitle.includes('incident')
    ? 'panel-accent-incidents'
    : normalizedTitle.includes('issue')
      ? 'panel-accent-issues'
      : normalizedTitle.includes('deployment') || normalizedTitle.includes('impact')
        ? 'panel-accent-deployments'
        : normalizedTitle.includes('analytic')
          ? 'panel-accent-analytics'
          : normalizedTitle.includes('alert') || normalizedTitle.includes('notification')
            ? 'panel-accent-alerts'
            : '';
  return (
    <section
      className={`panel-surface ${accentClass} rounded-2xl border p-5 md:p-6 ${className}`}
    >
      <div className="panel-heading mb-5">
        <h2 className="text-[15px] font-semibold tracking-tight text-slate-100">{title}</h2>
        {subtitle && (
          <p className="mt-1.5 max-w-3xl text-[13px] leading-5 text-slate-400">{subtitle}</p>
        )}
      </div>
      {children}
    </section>
  );
}

export function StatusBadge({ value }: { value: string }) {
  const normalized = value.toLowerCase();
  const tone = /critical|sev1|failed|(^|_)open($|_)/i.test(normalized)
    ? 'border-rose-400/15 bg-rose-400/[0.08] text-rose-300'
    : /resolved|success|monitoring|enabled/i.test(normalized)
      ? 'border-emerald-400/15 bg-emerald-400/[0.08] text-emerald-300'
      : /high|sev2|investigating|progress|spike/i.test(normalized)
        ? 'border-amber-400/15 bg-amber-400/[0.08] text-amber-300'
        : /disabled|ignored|rolled_back/i.test(normalized)
          ? 'border-slate-400/15 bg-slate-400/[0.08] text-slate-300'
          : 'border-sky-400/15 bg-sky-400/[0.08] text-sky-300';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium capitalize tracking-wide ${tone}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" aria-hidden="true" />
      {value.replaceAll('_', ' ')}
    </span>
  );
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date);
}
