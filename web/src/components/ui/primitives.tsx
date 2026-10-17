import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';
import { AlertTriangle, Inbox } from 'lucide-react';

const button = cva('inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control text-[13px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:translate-y-px select-none', {
  variants: {
    variant: {
      primary: 'bg-brand text-on-brand hover:bg-brand-hover',
      secondary: 'border border-control bg-surface text-ink hover:bg-muted-surface',
      ghost: 'text-muted hover:bg-muted-surface hover:text-ink',
      danger: 'border border-danger/30 bg-surface text-danger hover:bg-danger-soft',
    },
    size: { sm: 'h-8 px-3', md: 'h-10 px-4', icon: 'h-10 w-10 md:h-9 md:w-9' },
  },
  defaultVariants: { variant: 'secondary', size: 'md' },
});
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> { asChild?: boolean }
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, ...p }, ref) => {
  const C: any = asChild ? Slot : 'button';
  return <C ref={ref} className={cn(button({ variant, size }), className)} {...p} />;
});
Button.displayName = 'Button';

export const Card = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn('rounded-card border border-line bg-surface', className)} {...p} />;
export const CardHeader = ({ title, action, className }: { title: React.ReactNode; action?: React.ReactNode; className?: string }) => (
  <div className={cn('flex items-center justify-between gap-3 border-b border-line px-4 py-3', className)}><h2 className="text-[15px] font-semibold">{title}</h2>{action}</div>
);

const tones = {
  neutral: 'bg-muted-surface text-muted', brand: 'bg-brand-soft text-brand', success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning', danger: 'bg-danger-soft text-danger', info: 'bg-info-soft text-info',
};
export type Tone = keyof typeof tones;
export const Badge = ({ tone = 'neutral', className, ...p }: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) => (
  <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-medium', tones[tone], className)} {...p} />
);

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cn('h-10 w-full rounded-control border border-control bg-surface px-3 text-[13.5px] placeholder:text-faint md:h-9', className)} {...p} />
));
Input.displayName = 'Input';
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => (
  <textarea ref={ref} className={cn('min-h-24 w-full rounded-control border border-control bg-surface px-3 py-2 text-[13.5px] placeholder:text-faint', className)} {...p} />
));
Textarea.displayName = 'Textarea';

export const Skeleton = ({ className }: { className?: string }) => <div aria-hidden className={cn('skeleton h-4', className)} />;
export const SkeletonRows = ({ rows = 5 }: { rows?: number }) => (
  <div role="status" aria-label="Loading" className="space-y-3 p-4">{Array.from({ length: rows }, (_, i) => <div key={i} className="flex gap-3"><Skeleton className="h-9 w-9 shrink-0" /><div className="flex-1 space-y-2"><Skeleton className="w-2/3" /><Skeleton className="h-3 w-1/3" /></div></div>)}</div>
);

export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: React.ReactNode; icon?: React.ReactNode }) {
  return <div className="flex flex-col items-center gap-2 px-6 py-12 text-center"><div className="text-faint">{icon ?? <Inbox size={28} aria-hidden />}</div><h3 className="text-[15px] font-semibold">{title}</h3>{description && <p className="max-w-sm text-muted">{description}</p>}{action}</div>;
}
export function ErrorState({ error, onRetry }: { error?: unknown; onRetry?: () => void }) {
  return <div role="alert" className="flex flex-col items-center gap-2 px-6 py-12 text-center"><AlertTriangle className="text-danger" size={28} aria-hidden /><h3 className="text-[15px] font-semibold">Something went wrong</h3><p className="max-w-sm text-muted">{(error as Error)?.message || 'Daymark could not load this.'}</p>{onRetry && <Button size="sm" onClick={onRetry}>Try again</Button>}</div>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-[26px] font-semibold leading-tight tracking-tight">{title}</h1>{description && <p className="mt-0.5 text-muted">{description}</p>}</div>{actions && <div className="flex flex-wrap gap-2">{actions}</div>}</div>;
}

export const Stat = ({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) => (
  <Card className="p-4"><div className="text-[12px] font-medium text-muted">{label}</div><div className="mt-1 text-[28px] font-semibold leading-none tracking-tight text-brand">{value}</div>{hint && <div className="mt-1.5 text-[11.5px] text-faint">{hint}</div>}</Card>
);

/** Renders loading / error / empty / content for a query result. */
export function QueryBoundary({ q, empty, children, skeleton }: { q: { isLoading: boolean; isError: boolean; error: unknown; refetch: () => void }; empty?: React.ReactNode; children: React.ReactNode; skeleton?: React.ReactNode }) {
  if (q.isLoading) return <>{skeleton ?? <SkeletonRows />}</>;
  if (q.isError) return <ErrorState error={q.error} onRetry={q.refetch} />;
  return <>{empty ?? children}</>;
}
