import { PropsWithChildren } from 'react';

export function ChartFrame({ title, actions, height = 240, children }: PropsWithChildren<{ title: string; actions?: React.ReactNode; height?: number }>) {
  return (
    <section className="bg-surface rounded-lg border border-border p-3 shadow-sm">
      <div className="flex items-center mb-2">
        <div className="text-sm text-muted">{title}</div>
        {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
      </div>
      <div className="w-full" style={{ height }}>{children}</div>
    </section>
  );
}

export function ChartSkeleton() {
  return <div className="w-full h-full animate-pulse bg-surfaceAlt rounded-md" />;
}

export function downsample<T>(data: T[], step = 2) {
  if (data.length <= 100) return data;
  const sampled: T[] = [];
  for (let i = 0; i < data.length; i += step) sampled.push(data[i]);
  return sampled;
}
