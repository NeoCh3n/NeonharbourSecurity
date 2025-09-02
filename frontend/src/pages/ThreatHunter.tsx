import { useMemo, useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '../components/datatable/DataTable';
import { downloadCSV, toCSV } from '../components/datatable/csv';

type AlertRow = {
  id: string;
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  title: string;
  source: string;
  asset: string;
  tactic: string;
  firstSeen: string;
  lastSeen: string;
  status: 'Open' | 'In Progress' | 'Resolved';
  owner: string;
  confidence: number;
  risk: number;
};

function genData(n = 1000): AlertRow[] {
  const severities = ['Low', 'Medium', 'High', 'Critical'] as const;
  const statuses = ['Open', 'In Progress', 'Resolved'] as const;
  const arr: AlertRow[] = [];
  for (let i = 0; i < n; i++) {
    arr.push({
      id: 'AL-' + (100000 + i),
      severity: severities[i % 4],
      title: `Suspicious activity ${i}`,
      source: ['Sentinel', 'Splunk', 'Defender'][i % 3],
      asset: 'host-' + (i % 200),
      tactic: ['TA0001', 'TA0002', 'TA0003'][i % 3],
      firstSeen: new Date(Date.now() - i * 3600_000).toISOString(),
      lastSeen: new Date(Date.now() - i * 1800_000).toISOString(),
      status: statuses[i % 3],
      owner: ['alice', 'bob', 'carol'][i % 3],
      confidence: Math.round((50 + (i % 50)) / 10) * 10,
      risk: Math.min(100, (i % 100))
    });
  }
  return arr;
}

export default function ThreatHunterPage() {
  const [rows] = useState(() => genData(5000));
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const columns = useMemo<ColumnDef<AlertRow>[]>(() => [
    {
      id: 'select',
      header: () => <input aria-label="Select all" type="checkbox" onChange={(e) => {
        if (e.target.checked) setSelected(new Set(rows.map(r => r.id)));
        else setSelected(new Set());
      }} />,
      cell: ({ row }) => <input aria-label="Select row" type="checkbox" checked={selected.has(row.original.id)} onChange={(e) => {
        const cp = new Set(selected);
        if (e.target.checked) cp.add(row.original.id); else cp.delete(row.original.id);
        setSelected(cp);
      }} />,
      size: 40
    },
    {
      id: 'severity',
      header: 'Severity',
      cell: ({ row }) => {
        const color = row.original.severity === 'Critical' ? 'bg-danger' : row.original.severity === 'High' ? 'bg-warning' : row.original.severity === 'Medium' ? 'bg-info' : 'bg-success';
        return <div className="flex items-center gap-2"><div className={`w-1.5 h-5 rounded-sm ${color}`}></div>{row.original.severity}</div>;
      }
    },
    { id: 'id', header: 'Alert ID', cell: ({ row }) => row.original.id },
    { id: 'title', header: 'Title', cell: ({ row }) => row.original.title },
    { id: 'source', header: 'Source', cell: ({ row }) => row.original.source },
    { id: 'asset', header: 'Asset/User', cell: ({ row }) => row.original.asset },
    { id: 'tactic', header: 'Tactic/Technique', cell: ({ row }) => row.original.tactic },
    { id: 'firstSeen', header: 'First Seen', cell: ({ row }) => new Date(row.original.firstSeen).toLocaleString() },
    { id: 'lastSeen', header: 'Last Seen', cell: ({ row }) => new Date(row.original.lastSeen).toLocaleString() },
    { id: 'status', header: 'Status', cell: ({ row }) => row.original.status },
    { id: 'owner', header: 'Owner', cell: ({ row }) => row.original.owner },
    { id: 'confidence', header: 'Confidence', cell: ({ row }) => row.original.confidence },
    { id: 'risk', header: 'Risk Score', cell: ({ row }) => row.original.risk }
  ], [rows, selected]);

  const selectedRows = rows.filter(r => selected.has(r.id));

  return (
    <div className="space-y-3">
      <section className="bg-surface rounded-lg border border-border p-3 shadow-sm flex flex-wrap items-center gap-2">
        <input className="px-3 py-1.5 rounded-md border border-border bg-surface text-text w-[360px]" placeholder="搜索 / Search" />
        <select className="px-2 py-1.5 rounded-md border border-border"><option>Severity</option></select>
        <select className="px-2 py-1.5 rounded-md border border-border"><option>Status</option></select>
        <select className="px-2 py-1.5 rounded-md border border-border"><option>Source</option></select>
        <select className="px-2 py-1.5 rounded-md border border-border"><option>Asset</option></select>
        <select className="px-2 py-1.5 rounded-md border border-border"><option>Tactic/Technique</option></select>
        <select className="px-2 py-1.5 rounded-md border border-border"><option>Playbook Tag</option></select>
        <div className="ml-auto flex items-center gap-2 text-sm">
          <span className="text-muted">已选 {selected.size} 条</span>
          <button className="px-3 py-1.5 border border-border rounded-md" onClick={() => alert('批量指派 / Bulk Assign')}>指派</button>
          <button className="px-3 py-1.5 border border-border rounded-md" onClick={() => alert('更改状态')}>改状态</button>
          <button className="px-3 py-1.5 border border-border rounded-md" onClick={() => downloadCSV(toCSV(selectedRows), 'alerts.csv')}>导出 CSV</button>
        </div>
      </section>

      <DataTable columns={columns} data={rows} height={560} />
    </div>
  );
}
