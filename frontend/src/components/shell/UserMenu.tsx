import { useEffect, useState } from 'react';
import { useAuth } from '../../store/auth';

type Me = {
  id: number;
  email: string;
  isAdmin: boolean;
  currentTenantId?: number | null;
  currentTenantRole?: string | null;
  tenants?: { id: number; name: string; slug: string; role: string }[];
};

function initials(email: string) {
  const name = email?.split('@')[0] || '';
  if (!name) return 'U';
  return name.slice(0, 2).toUpperCase();
}

export function UserMenu() {
  const { me, refresh, logout } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => { void refresh(); }, [refresh]);

  const tenant = me?.tenants?.find(t => t.id === me?.currentTenantId);

  return (
    <div className="relative">
      <button aria-label="User menu" className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-surface" onClick={() => setOpen(o => !o)}>
        <div className="w-8 h-8 rounded-full bg-[#334155] text-white flex items-center justify-center text-sm font-semibold">
          {me ? initials(me.email) : '…'}
        </div>
        <div className="hidden md:block text-left">
          <div className="text-sm leading-tight">{me?.email || '—'}</div>
          <div className="text-xs text-muted leading-tight">{tenant?.name || 'Tenant'} · {me?.currentTenantRole || (me?.isAdmin ? 'admin' : 'member')}</div>
        </div>
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-[260px] bg-surface border border-border rounded-md shadow p-2 z-10">
          <div className="px-2 py-1">
            <div className="text-sm font-medium">Signed in</div>
            <div className="text-xs text-muted break-all">{me?.email}</div>
            <div className="text-xs text-muted">Role: {me?.currentTenantRole || (me?.isAdmin ? 'admin' : 'member')}</div>
            {tenant && <div className="text-xs text-muted">Tenant: {tenant.name} ({tenant.slug})</div>}
          </div>
          <div className="my-2 h-px bg-border" />
          <div className="px-2 py-1 text-xs text-muted">Tenants</div>
          <div className="max-h-[160px] overflow-auto">
            {(me?.tenants || []).map((t) => (
              <div key={t.id} className="px-2 py-1 text-sm flex items-center justify-between">
                <div>{t.name}</div>
                {t.id === me?.currentTenantId ? (
                  <span className="text-xs text-success">current</span>
                ) : (
                  <button className="text-xs underline" onClick={() => {
                    // Switch tenant by reloading with header in subsequent calls (advanced). For now, instruct backend via localStorage flag for API client (optional future).
                    // Minimal: just show list.
                    alert('Tenant switcher coming soon');
                  }}>switch</button>
                )}
              </div>
            ))}
          </div>
          <div className="my-2 h-px bg-border" />
          <button className="w-full px-3 py-1.5 text-left rounded-md hover:bg-surfaceAlt text-sm" onClick={() => { logout(); window.location.href = '/login'; }}>Sign out</button>
        </div>
      )}
    </div>
  );
}
