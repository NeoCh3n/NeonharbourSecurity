import { useMemo, useRef } from 'react';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useUI } from '../../store/ui';

export interface DataTableProps<T> {
  columns: ColumnDef<T, any>[];
  data: T[];
  height?: number;
}

export function DataTable<T extends { id?: string | number }>({ columns, data, height = 520 }: DataTableProps<T>) {
  const density = useUI(s => s.tableDensity);
  const scrollRef = useRef<HTMLDivElement>(null);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel()
  });

  const rowVirtualizer = useVirtualizer({
    count: table.getRowModel().rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => (density === 'compact' ? 28 : density === 'cozy' ? 40 : 36),
    measureElement: (el) => (el as HTMLElement).getBoundingClientRect().height,
    overscan: 8,
  });

  const totalSize = rowVirtualizer.getTotalSize();
  const virtualRows = rowVirtualizer.getVirtualItems();

  const thead = (
    <thead className="sticky top-0 bg-surfaceAlt">
      {table.getHeaderGroups().map(hg => (
        <tr key={hg.id}>
          {hg.headers.map(h => (
            <th key={h.id} className="text-left text-xs text-muted font-normal px-3 py-2 border-b border-border">
              {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
            </th>
          ))}
        </tr>
      ))}
    </thead>
  );

  return (
    <div className="bg-surface rounded-lg border border-border overflow-hidden">
      <div ref={scrollRef} style={{ height, overflow: 'auto' }}>
        <table className="w-full">
          {thead}
          <tbody style={{ position: 'relative' }}>
            <tr>
              <td style={{ height: virtualRows[0]?.start ?? 0 }} />
            </tr>
            {virtualRows.map(vr => {
              const row = table.getRowModel().rows[vr.index];
              return (
                <tr
                  key={row.id}
                  ref={rowVirtualizer.measureElement as any}
                  className="border-b border-border"
                  style={{ transform: `translateY(${vr.start}px)`, willChange: 'transform' }}
                >
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="px-3 py-2 text-sm">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
            <tr>
              <td style={{ height: totalSize - (virtualRows[virtualRows.length - 1]?.end ?? 0) }} />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
