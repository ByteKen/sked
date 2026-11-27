import { cn } from '@/utils/cn';

export interface BrandLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  glow?: boolean;
  className?: string;
  alt?: string;
}

const SIZE_MAP: Record<NonNullable<BrandLogoProps['size']>, { px: number; cls: string }> = {
  xs: { px: 28, cls: 'w-7 h-7 rounded-lg' },
  sm: { px: 34, cls: 'w-[34px] h-[34px] rounded-[9px]' },
  md: { px: 40, cls: 'w-10 h-10 rounded-xl' },
  lg: { px: 56, cls: 'w-14 h-14 rounded-2xl' },
  xl: { px: 84, cls: 'w-[84px] h-[84px] rounded-[22px]' },
};

export function BrandLogo({
  size = 'sm',
  glow = false,
  className,
  alt = 'Sked logo',
}: BrandLogoProps) {
  const { px, cls } = SIZE_MAP[size];
  const src = px <= 40 ? '/logo-128.png' : px <= 96 ? '/logo-256.png' : '/logo-512.png';

  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      {glow && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -inset-3.5 rounded-3xl bg-brand-500/30 dark:bg-brand-500/35 blur-xl"
        />
      )}
      <img
        src={src}
        srcSet="/logo-64.png 64w, /logo-128.png 128w, /logo-256.png 256w, /logo-512.png 512w"
        sizes={`${px}px`}
        width={px}
        height={px}
        alt={alt}
        decoding="async"
        draggable={false}
        className={cn(
          'relative object-contain select-none ring-1 ring-slate-900/10 dark:ring-white/15 shadow-md',
          cls,
        )}
      />
    </span>
  );
}
