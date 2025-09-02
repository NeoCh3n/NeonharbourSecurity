export function toCSV<T extends Record<string, any>>(rows: T[], headers?: string[]): string {
  if (!rows.length) return '';
  const cols = headers ?? Object.keys(rows[0]);
  const escape = (v: any) => {
    const s = String(v ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const head = cols.join(',');
  const body = rows.map(r => cols.map(c => escape(r[c])).join(',')).join('\n');
  return head + '\n' + body;
}

export function downloadCSV(csv: string, filename = 'export.csv') {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

