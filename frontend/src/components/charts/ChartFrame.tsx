import { PropsWithChildren } from 'react';

export function ChartFrame({ title, children }: PropsWithChildren<{ title: string }>) {
  return (
    <section className="bg-surface rounded-lg border border-border p-3 shadow-sm">
      <div className="text-sm text-muted mb-2">{title}</div>
      <div className="w-full h-[240px]">{children}</div>
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

