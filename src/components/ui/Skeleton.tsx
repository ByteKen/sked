import { cn } from '@/utils/cn';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'animate-pulse rounded-lg bg-slate-200/80 dark:bg-white/[0.06]',
        className,
      )}
    />
  );
}
