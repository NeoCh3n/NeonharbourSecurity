import { ButtonHTMLAttributes } from 'react';
import { clsx } from 'clsx';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' };

export function Button({ className, variant = 'primary', ...props }: Props) {
  const base = 'inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm focus-ring disabled:opacity-50 disabled:cursor-not-allowed';
  const variants = {
    primary: 'bg-primary text-primaryFg hover:opacity-90',
    secondary: 'border border-border bg-surface text-text hover:bg-surfaceAlt',
    ghost: 'text-text hover:bg-surfaceAlt'
  } as const;
  return <button className={clsx(base, variants[variant], className)} {...props} />;
}

