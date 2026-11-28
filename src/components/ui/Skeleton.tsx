import { cn } from '@/utils/cn';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'skeleton-shimmer rounded-lg bg-slate-200/75 dark:bg-white/[0.06]',
        className,
      )}
    />
  );
}
