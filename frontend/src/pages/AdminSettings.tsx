import { FormEvent, useEffect, useMemo, useState } from 'react';
import apiRequest, { adminApi } from '../services/api';
import { useAuth } from '../store/auth';
import {
  ResponsiveContainer,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Bar,
  Line,
} from 'recharts';

type AdminUsage = {
  alertsAssigned: number;
  alertsReported: number;
  casesOwned: number;
  auditEvents: number;
};

type AdminUser = {
  id: number;
  email: string;
  fullName: string | null;
  isAdmin: boolean;
  createdAt: string | null;
  subscriptionPlan: string | null;
  subscriptionStatus: string;
  subscriptionEndsAt: string | null;
  allowedModels: string[];
  featureFlags: string[];
  seatLimit: number;
  monthlyRate: number;
  billingCurrency: string;
  lastLoginAt: string | null;
  metadata: Record<string, unknown>;
  customerNotes: string | null;
  billingReference: string | null;
  updatedAt: string | null;
  usage: AdminUsage;
  tenants: Array<{ id: number; slug: string | null; name: string | null; role: string | null }>;
};

type AdminOverview = {
  users: AdminUser[];
  totals: {
    totalUsers: number;
    activeSubscriptions: number;
    trialUsers: number;
    expiringSoon: number;
    activeLast30: number;
    seatsProvisioned: number;
    seatsInUse: number;
    monthlyRecurringRevenue: number;
    monthlyRecurringCurrency: string;
  };
  revenue: {
    primaryCurrency: string;
    primaryAmount: number;
    breakdown: Array<{ currency: string; amount: number }>;
  };
  planBreakdown: Array<{
    plan: string;
    customers: number;
    activeCustomers: number;
    revenue: Array<{ currency: string; amount: number }>;
  }>;
  statusBreakdown: Array<{ status: string; count: number }>;
  featureUsage: Array<{ feature: string; count: number }>;
  modelUsage: Array<{ model: string; count: number }>;
  trend: Array<{
    month: string;
    label: string;
    active: number;
    newSignups: number;
    churned: number;
    mrrBreakdown: Array<{ currency: string; amount: number }>;
    mrrPrimary: number;
  }>;
};

const FEATURE_OPTIONS = [
  { key: 'alerts', label: 'Alert triage' },
  { key: 'investigations', label: 'Investigations workspace' },
  { key: 'hunt', label: 'Threat hunting' },
  { key: 'automation', label: 'Automation & orchestration' },
  { key: 'reporting', label: 'Executive reporting' },
  { key: 'cases', label: 'Case management' },
  { key: 'audit', label: 'Audit exports' },
];

const PLAN_OPTIONS = ['Unassigned', 'Trial', 'Starter', 'Growth', 'Pro', 'Enterprise', 'MSSP'];

const STATUS_OPTIONS = [
  { value: 'trialing', label: 'Trialing' },
  { value: 'active', label: 'Active' },
  { value: 'past_due', label: 'Past due' },
  { value: 'paused', label: 'Paused' },
  { value: 'canceled', label: 'Canceled' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'unknown', label: 'Unknown' },
];

const DEFAULT_MODELS = ['deepseek-chat', 'gpt-4o-mini', 'claude-3-haiku', 'claude-3-opus', 'local-securityllm'];

function formatCurrency(amount: number, currency: string) {
  if (!Number.isFinite(amount)) return '-';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function formatDateInput(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function parseDateInput(value: string) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function formatRelativeTime(value: string | null) {
  if (!value) return 'Never';
  const date = new Date(value);
  const ts = date.getTime();
  if (Number.isNaN(ts)) return 'Unknown';
  const diffMs = Date.now() - ts;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diffMs < minute) return 'Just now';
  if (diffMs < hour) return `${Math.round(diffMs / minute)}m ago`;
  if (diffMs < day) return `${Math.round(diffMs / hour)}h ago`;
  if (diffMs < 30 * day) return `${Math.round(diffMs / day)}d ago`;
  return date.toLocaleDateString();
}

function dedupe(list: string[]) {
  return Array.from(new Set(list.map(item => item.trim()).filter(Boolean)));
}

function statusLabel(value: string) {
  const found = STATUS_OPTIONS.find(opt => opt.value === value);
  if (found) return found.label;
  if (!value) return 'Unknown';
  return value
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function planTitle(plan: string | null) {
  if (!plan) return 'Unassigned';
  if (plan.toLowerCase() === 'unassigned') return 'Unassigned';
  return plan;
}

function featureLabel(key: string) {
  const found = FEATURE_OPTIONS.find(opt => opt.key === key);
  if (found) return found.label;
  return key.replace(/_/g, ' ');
}

export default function AdminSettingsPage() {
  const { me, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<'users' | 'platform'>('users');

  const [adminData, setAdminData] = useState<AdminOverview | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [savingUser, setSavingUser] = useState(false);
  const [userSaveMsg, setUserSaveMsg] = useState('');
  const [userError, setUserError] = useState('');
  const [search, setSearch] = useState('');
  const [refreshNotice, setRefreshNotice] = useState('');

  const [provider, setProvider] = useState<'deepseek' | 'local'>('deepseek');
  const [allowSelfRegister, setAllowSelfRegister] = useState(true);
  const [settingsError, setSettingsError] = useState('');
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsSaveMsg, setSettingsSaveMsg] = useState('');
  const [settingsRefreshBusy, setSettingsRefreshBusy] = useState(false);
  const [settingsRefreshMsg, setSettingsRefreshMsg] = useState('');
  const [validateBusy, setValidateBusy] = useState(false);
  const [validateMsg, setValidateMsg] = useState('');
  const [triageBusy, setTriageBusy] = useState(false);
  const [triageMsg, setTriageMsg] = useState('');
  const [dsApiKey, setDsApiKey] = useState('');
  const [dsBase, setDsBase] = useState('https://api.deepseek.com/v1');
  const [dsModel, setDsModel] = useState('deepseek-chat');
  const [localBase, setLocalBase] = useState('http://127.0.0.1:1234/v1');
  const [localModel, setLocalModel] = useState('zysec-ai_-_securityllm');

  async function loadAdminData(showNotice = false) {
    if (!me?.isAdmin) return;
    setAdminError('');
    setAdminLoading(true);
    try {
      const data = await adminApi.getUsers();
      setAdminData(data);
      if (showNotice) {
        setRefreshNotice('Refreshed');
        setTimeout(() => setRefreshNotice(''), 2500);
      }
    } catch (e: any) {
      setAdminError(e?.message || 'Failed to load admin data');
    } finally {
      setAdminLoading(false);
    }
  }

  async function loadSettings() {
    if (!me?.isAdmin) return;
    let message = '';
    try {
      const settings = await apiRequest('/admin/settings/llm');
      setProvider((settings?.provider as 'deepseek' | 'local') || 'deepseek');
    } catch (e: any) {
      message = e?.message || 'Failed to load LLM provider setting';
    }
    try {
      const register = await apiRequest('/admin/settings/register');
      setAllowSelfRegister(!!register?.allowSelfRegister);
    } catch (e: any) {
      const text = e?.message || 'Failed to load registration setting';
      message = message ? `${message}; ${text}` : text;
    }
    setSettingsError(message);
  }

  useEffect(() => {
    if (!me?.isAdmin) return;
    void Promise.all([loadAdminData(), loadSettings()]);
  }, [me?.id, me?.isAdmin]);

  useEffect(() => {
    if (!adminData) {
      setEditUser(null);
      return;
    }
    if (adminData.users.length === 0) {
      setSelectedUserId(null);
      setEditUser(null);
      return;
    }
    const match = adminData.users.find(u => u.id === selectedUserId);
    if (match) {
      setEditUser({ ...match, allowedModels: [...match.allowedModels], featureFlags: [...match.featureFlags] });
    } else {
      const first = adminData.users[0];
      setSelectedUserId(first.id);
      setEditUser({ ...first, allowedModels: [...first.allowedModels], featureFlags: [...first.featureFlags] });
    }
  }, [adminData, selectedUserId]);

  const filteredUsers = useMemo(() => {
    if (!adminData) return [];
    const q = search.trim().toLowerCase();
    if (!q) return adminData.users;
    return adminData.users.filter(user => {
      const plan = user.subscriptionPlan ? user.subscriptionPlan.toLowerCase() : '';
      const status = user.subscriptionStatus ? user.subscriptionStatus.toLowerCase() : '';
      const name = user.fullName ? user.fullName.toLowerCase() : '';
      const tenantNames = user.tenants.map(t => (t.name || '').toLowerCase());
      return (
        user.email.toLowerCase().includes(q) ||
        plan.includes(q) ||
        status.includes(q) ||
        name.includes(q) ||
        tenantNames.some(n => n.includes(q))
      );
    });
  }, [adminData, search]);

  function toggleFeature(flag: string) {
    setEditUser(prev => {
      if (!prev) return prev;
      const next = new Set(prev.featureFlags);
      if (next.has(flag)) next.delete(flag); else next.add(flag);
      return { ...prev, featureFlags: Array.from(next) };
    });
  }

  function toggleModel(model: string) {
    setEditUser(prev => {
      if (!prev) return prev;
      const next = new Set(prev.allowedModels);
      if (next.has(model)) next.delete(model); else next.add(model);
      return { ...prev, allowedModels: Array.from(next) };
    });
  }

  function updateAllowedModelsFromInput(value: string) {
    const models = dedupe(value.split(/[\n,]/g));
    setEditUser(prev => (prev ? { ...prev, allowedModels: models } : prev));
  }

  function resetEditUser() {
    if (!adminData || !selectedUserId) return;
    const match = adminData.users.find(u => u.id === selectedUserId);
    if (match) {
      setEditUser({ ...match, allowedModels: [...match.allowedModels], featureFlags: [...match.featureFlags] });
      setUserError('');
      setUserSaveMsg('');
    }
  }

  async function saveUserChanges() {
    if (!editUser) return;
    setSavingUser(true);
    setUserError('');
    setUserSaveMsg('');
    try {
      const payload = {
        fullName: editUser.fullName,
        subscriptionPlan: editUser.subscriptionPlan,
        subscriptionStatus: editUser.subscriptionStatus,
        subscriptionEndsAt: editUser.subscriptionEndsAt,
        allowedModels: editUser.allowedModels,
        featureFlags: editUser.featureFlags,
        seatLimit: editUser.seatLimit,
        monthlyRate: editUser.monthlyRate,
        billingCurrency: editUser.billingCurrency,
        customerNotes: editUser.customerNotes,
        billingReference: editUser.billingReference,
        isAdmin: editUser.isAdmin,
      };
      const response = await adminApi.updateUser(editUser.id, payload);
      if (response?.user) {
        setUserSaveMsg('Saved');
        setTimeout(() => setUserSaveMsg(''), 2500);
        setEditUser({ ...response.user, allowedModels: [...response.user.allowedModels], featureFlags: [...response.user.featureFlags] });
        await loadAdminData();
      } else {
        await loadAdminData();
      }
    } catch (e: any) {
      setUserError(e?.message || 'Failed to update user');
    } finally {
      setSavingUser(false);
    }
  }

  async function refreshCustomers() {
    await loadAdminData(true);
  }

  async function saveSettings() {
    if (!me?.isAdmin) return;
    setSettingsBusy(true);
    setSettingsSaveMsg('');
    setSettingsError('');
    try {
      await apiRequest('/admin/settings/llm', { method: 'POST', body: JSON.stringify({ provider }) });
      await apiRequest('/admin/settings/register', { method: 'POST', body: JSON.stringify({ allowSelfRegister }) });
      setSettingsSaveMsg('Saved');
      setTimeout(() => setSettingsSaveMsg(''), 2500);
    } catch (e: any) {
      setSettingsError(e?.message || 'Failed to save settings');
    } finally {
      setSettingsBusy(false);
    }
  }

  async function validateLLM() {
    if (!me?.isAdmin) return;
    setValidateBusy(true);
    setValidateMsg('');
    try {
      const body = provider === 'deepseek'
        ? {
            provider,
            apiKey: dsApiKey || undefined,
            baseUrl: dsBase || undefined,
            model: dsModel || undefined,
          }
        : {
            provider,
            baseUrl: localBase || undefined,
            model: localModel || undefined,
          };
      const result = await apiRequest('/admin/settings/llm/validate', { method: 'POST', body: JSON.stringify(body) });
      if (result?.ok) {
        setValidateMsg(`Validation succeeded for ${result.provider} (${result.model})`);
      } else {
        setValidateMsg('Validation failed');
      }
    } catch (e: any) {
      setValidateMsg(e?.message || 'Validation failed');
    } finally {
      setValidateBusy(false);
    }
  }

  async function refreshSettings() {
    if (!me?.isAdmin) return;
    setSettingsRefreshBusy(true);
    try {
      await loadSettings();
      setSettingsRefreshMsg('Refreshed');
      setTimeout(() => setSettingsRefreshMsg(''), 2500);
    } finally {
      setSettingsRefreshBusy(false);
    }
  }

  async function refreshAll() {
    await Promise.all([loadAdminData(true), loadSettings()]);
  }

  async function autoTriageOpen(limit = 500) {
    setTriageBusy(true);
    setTriageMsg('');
    try {
      const response = await apiRequest('/alerts/auto-triage', { method: 'POST', body: JSON.stringify({ limit }) });
      if (response?.success) setTriageMsg(`Auto-triaged ${response.updated} alerts`);
      else setTriageMsg('Auto-triage failed');
    } catch (e: any) {
      setTriageMsg(e?.message || 'Auto-triage failed');
    } finally {
      setTriageBusy(false);
    }
  }

  function renderUsersTab() {
    if (authLoading && !me) {
      return (
        <div className="bg-surface border border-border rounded-lg p-4 text-sm text-muted">
          Loading account…
        </div>
      );
    }
    if (me && !me.isAdmin) {
      return (
        <div className="bg-surface border border-border rounded-lg p-6 text-sm text-muted">
          You are signed in but do not have administrator privileges. Please contact an administrator to obtain access to the console.
        </div>
      );
    }
    if (adminError) {
      return (
        <div className="bg-surface border border-border rounded-lg p-4 text-sm text-danger">
          {adminError}
        </div>
      );
    }
    if (adminLoading && !adminData) {
      return (
        <div className="bg-surface border border-border rounded-lg p-4 text-sm text-muted">
          Loading customer data…
        </div>
      );
    }
    if (!adminData || adminData.users.length === 0) {
      return (
        <div className="bg-surface border border-border rounded-lg p-6 text-sm text-muted">
          No users found yet. Once customers sign up, billing and usage insights will appear here.
        </div>
      );
    }

    const totals = adminData.totals;
    const trendData = adminData.trend;
    const featureUsage = adminData.featureUsage;
    const modelUsage = adminData.modelUsage;
    const planBreakdown = adminData.planBreakdown;
    const statusBreakdown = adminData.statusBreakdown;
    const maxFeature = featureUsage.reduce((acc, item) => Math.max(acc, item.count), 0) || 1;
    const maxModel = modelUsage.reduce((acc, item) => Math.max(acc, item.count), 0) || 1;
    const chartCurrency = adminData.revenue.primaryCurrency;

    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <div className="bg-surface border border-border rounded-lg p-4">
            <div className="text-xs text-muted uppercase tracking-wide">Customers</div>
            <div className="text-2xl font-semibold mt-1">{totals.totalUsers}</div>
            <div className="text-xs text-muted mt-1">Active: {totals.activeSubscriptions}</div>
          </div>
          <div className="bg-surface border border-border rounded-lg p-4">
            <div className="text-xs text-muted uppercase tracking-wide">Active last 30d</div>
            <div className="text-2xl font-semibold mt-1">{totals.activeLast30}</div>
            <div className="text-xs text-muted mt-1">Trials: {totals.trialUsers}</div>
          </div>
          <div className="bg-surface border border-border rounded-lg p-4">
            <div className="text-xs text-muted uppercase tracking-wide">Monthly recurring</div>
            <div className="text-2xl font-semibold mt-1">{formatCurrency(totals.monthlyRecurringRevenue, totals.monthlyRecurringCurrency)}</div>
            <div className="text-xs text-muted mt-1">Primary currency</div>
          </div>
          <div className="bg-surface border border-border rounded-lg p-4">
            <div className="text-xs text-muted uppercase tracking-wide">Expiring & trials</div>
            <div className="text-2xl font-semibold mt-1">{totals.expiringSoon}</div>
            <div className="text-xs text-muted mt-1">Within 30 days</div>
          </div>
          <div className="bg-surface border border-border rounded-lg p-4">
            <div className="text-xs text-muted uppercase tracking-wide">Seats provisioned</div>
            <div className="text-2xl font-semibold mt-1">{totals.seatsProvisioned}</div>
            <div className="text-xs text-muted mt-1">In use: {totals.seatsInUse}</div>
          </div>
          <div className="bg-surface border border-border rounded-lg p-4">
            <div className="text-xs text-muted uppercase tracking-wide">Revenue mix</div>
            <div className="text-2xl font-semibold mt-1">{adminData.revenue.breakdown.map(r => formatCurrency(r.amount, r.currency)).join(' / ') || '-'}</div>
            <div className="text-xs text-muted mt-1">Primary: {adminData.revenue.primaryCurrency}</div>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold text-sm">Growth momentum</div>
            <div className="text-xs text-muted">MRR shown in {chartCurrency}</div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trendData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2f2f2f" />
                <XAxis dataKey="label" />
                <YAxis yAxisId="left" allowDecimals={false} />
                <YAxis yAxisId="right" orientation="right" allowDecimals />
                <Tooltip
                  formatter={(value: any, name: any) => {
                    if (typeof value === 'number' && String(name).startsWith('MRR')) {
                      return [formatCurrency(value, chartCurrency), name];
                    }
                    return [value, name];
                  }}
                />
                <Legend />
                <Bar yAxisId="left" dataKey="newSignups" name="New signups" fill="#6366f1" opacity={0.7} radius={[4, 4, 0, 0]} />
                <Line yAxisId="left" type="monotone" dataKey="active" name="Active customers" stroke="#22c55e" strokeWidth={2} dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="mrrPrimary" name={`MRR (${chartCurrency})`} stroke="#f97316" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <div className="bg-surface border border-border rounded-lg p-4">
            <div className="font-semibold text-sm mb-2">Plan mix</div>
            <table className="w-full text-xs">
              <thead className="text-muted">
                <tr>
                  <th className="text-left pb-1">Plan</th>
                  <th className="text-right pb-1">Customers</th>
                  <th className="text-right pb-1">Active</th>
                  <th className="text-right pb-1">MRR</th>
                </tr>
              </thead>
              <tbody>
                {planBreakdown.slice(0, 8).map(row => (
                  <tr key={row.plan} className="border-t border-border/60">
                    <td className="py-1">{planTitle(row.plan)}</td>
                    <td className="py-1 text-right">{row.customers}</td>
                    <td className="py-1 text-right">{row.activeCustomers}</td>
                    <td className="py-1 text-right">{row.revenue.length ? row.revenue.map(r => formatCurrency(r.amount, r.currency)).join(', ') : '-'}</td>
                  </tr>
                ))}
                {planBreakdown.length === 0 && (
                  <tr>
                    <td className="py-2 text-muted" colSpan={4}>No plan data yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="bg-surface border border-border rounded-lg p-4">
            <div className="font-semibold text-sm mb-2">Status distribution</div>
            <ul className="space-y-1 text-xs">
              {statusBreakdown.map(item => (
                <li key={item.status} className="flex items-center justify-between">
                  <span>{statusLabel(item.status)}</span>
                  <span className="text-muted">{item.count}</span>
                </li>
              ))}
              {statusBreakdown.length === 0 && <li className="text-muted">No status data.</li>}
            </ul>
          </div>
          <div className="bg-surface border border-border rounded-lg p-4 space-y-3">
            <div className="font-semibold text-sm">Feature adoption</div>
            {featureUsage.length === 0 && <div className="text-xs text-muted">No feature flags assigned.</div>}
            {featureUsage.slice(0, 6).map(item => (
              <div key={item.feature}>
                <div className="flex items-center justify-between text-xs">
                  <span>{featureLabel(item.feature)}</span>
                  <span className="text-muted">{item.count}</span>
                </div>
                <div className="mt-1 h-2 bg-surfaceAlt rounded">
                  <div
                    className="h-full rounded bg-primary"
                    style={{ width: `${Math.max(8, (item.count / maxFeature) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
          <div className="bg-surface border border-border rounded-lg p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between mb-3">
              <div>
                <div className="font-semibold text-sm">Customers</div>
                <div className="text-xs text-muted">Filter and inspect per-user entitlements</div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="search"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search email, plan, status"
                  className="w-full sm:w-64 px-2 py-1 text-sm border border-border rounded bg-surfaceAlt focus:outline-none focus:ring-2 focus:ring-primary/60"
                />
                <button
                  className="px-2 py-1 border border-border rounded text-xs hover:bg-surfaceAlt"
                  onClick={() => setSearch('')}
                  type="button"
                >
                  Clear
                </button>
                <button
                  className="px-2 py-1 border border-border rounded text-xs hover:bg-surfaceAlt"
                  onClick={() => { void refreshCustomers(); }}
                  type="button"
                  disabled={adminLoading}
                >
                  {adminLoading ? 'Refreshing…' : 'Reload'}
                </button>
              </div>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted border-b border-border/60">
                  <tr>
                    <th className="text-left px-3 py-2">Customer</th>
                    <th className="text-left px-3 py-2">Plan</th>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="text-right px-3 py-2">MRR</th>
                    <th className="text-right px-3 py-2">Seats</th>
                    <th className="text-left px-3 py-2">Renewal</th>
                    <th className="text-left px-3 py-2">Last activity</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map(user => {
                    const isSelected = user.id === selectedUserId;
                    return (
                      <tr
                        key={user.id}
                        className={`border-b border-border/40 cursor-pointer transition-colors ${isSelected ? 'bg-surfaceAlt' : 'hover:bg-surfaceAlt/80'}`}
                        onClick={() => setSelectedUserId(user.id)}
                      >
                        <td className="px-3 py-3 align-top">
                          <div className="font-medium text-sm">{user.email}</div>
                          <div className="text-xs text-muted">
                            {user.fullName ? `${user.fullName} · ` : ''}
                            {user.tenants.length ? (user.tenants[0].name || user.tenants[0].slug || '-') : 'Default tenant'}
                          </div>
                        </td>
                        <td className="px-3 py-3 align-top text-sm">{planTitle(user.subscriptionPlan)}</td>
                        <td className="px-3 py-3 align-top text-sm">{statusLabel(user.subscriptionStatus)}</td>
                        <td className="px-3 py-3 align-top text-right text-sm">{formatCurrency(user.monthlyRate, user.billingCurrency)}</td>
                        <td className="px-3 py-3 align-top text-right text-sm">{user.seatLimit || '-'}</td>
                        <td className="px-3 py-3 align-top text-sm">{user.subscriptionEndsAt ? formatDateInput(user.subscriptionEndsAt) : 'Rolling'}</td>
                        <td className="px-3 py-3 align-top text-sm">{formatRelativeTime(user.lastLoginAt)}</td>
                      </tr>
                    );
                  })}
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td className="px-3 py-4 text-sm text-muted" colSpan={7}>No customers matched that filter.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-surface border border-border rounded-lg p-4 space-y-3">
            <div className="font-semibold text-sm">Customer details</div>
            {!editUser && <div className="text-xs text-muted">Select a customer from the table to view and edit their configuration.</div>}
            {editUser && (
              <form className="space-y-3" onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); void saveUserChanges(); }}>
                <div className="grid gap-2">
                  <label className="text-xs text-muted">Full name</label>
                  <input
                    type="text"
                    value={editUser.fullName || ''}
                    onChange={e => setEditUser(prev => (prev ? { ...prev, fullName: e.target.value || null } : prev))}
                    className="w-full px-2 py-1 text-sm border border-border rounded bg-surfaceAlt focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-xs text-muted">Email</label>
                  <input value={editUser.email} disabled className="w-full px-2 py-1 text-sm border border-border rounded bg-surfaceAlt/60 text-muted" />
                </div>
                <div className="grid gap-2">
                  <label className="text-xs text-muted">Plan</label>
                  <select
                    value={editUser.subscriptionPlan || 'Unassigned'}
                    onChange={e => setEditUser(prev => (prev ? { ...prev, subscriptionPlan: e.target.value === 'Unassigned' ? null : e.target.value } : prev))}
                    className="w-full px-2 py-1 text-sm border border-border rounded bg-surfaceAlt focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    {PLAN_OPTIONS.map(plan => (
                      <option value={plan} key={plan}>{plan}</option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-2">
                  <label className="text-xs text-muted">Subscription status</label>
                  <select
                    value={editUser.subscriptionStatus || 'unknown'}
                    onChange={e => setEditUser(prev => (prev ? { ...prev, subscriptionStatus: e.target.value } : prev))}
                    className="w-full px-2 py-1 text-sm border border-border rounded bg-surfaceAlt focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    {STATUS_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-2">
                  <label className="text-xs text-muted">Subscription end date</label>
                  <input
                    type="date"
                    value={formatDateInput(editUser.subscriptionEndsAt)}
                    onChange={e => setEditUser(prev => (prev ? { ...prev, subscriptionEndsAt: parseDateInput(e.target.value) } : prev))}
                    className="w-full px-2 py-1 text-sm border border-border rounded bg-surfaceAlt focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-xs text-muted">Seats / Monthly rate</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      value={editUser.seatLimit}
                      onChange={e => setEditUser(prev => (prev ? { ...prev, seatLimit: Math.max(0, parseInt(e.target.value, 10) || 0) } : prev))}
                      className="w-1/2 px-2 py-1 text-sm border border-border rounded bg-surfaceAlt focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={editUser.monthlyRate}
                      onChange={e => setEditUser(prev => (prev ? { ...prev, monthlyRate: Math.max(0, parseFloat(e.target.value) || 0) } : prev))}
                      className="w-1/2 px-2 py-1 text-sm border border-border rounded bg-surfaceAlt focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                  <select
                    value={editUser.billingCurrency}
                    onChange={e => setEditUser(prev => (prev ? { ...prev, billingCurrency: e.target.value.toUpperCase() } : prev))}
                    className="w-28 px-2 py-1 text-sm border border-border rounded bg-surfaceAlt focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                    <option value="SGD">SGD</option>
                    <option value="AUD">AUD</option>
                  </select>
                </div>
                <div className="grid gap-2">
                  <label className="text-xs text-muted">Feature flags</label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {FEATURE_OPTIONS.map(opt => (
                      <label key={opt.key} className="flex items-center gap-2 text-xs border border-border rounded px-2 py-1 bg-surfaceAlt">
                        <input
                          type="checkbox"
                          checked={!!editUser.featureFlags.includes(opt.key)}
                          onChange={() => toggleFeature(opt.key)}
                        />
                        <span>{opt.label}</span>
                      </label>
                    ))}
                  </div>
                  {editUser.featureFlags.filter(f => !FEATURE_OPTIONS.some(opt => opt.key === f)).length > 0 && (
                    <div className="text-xs text-muted">
                      Custom: {editUser.featureFlags.filter(f => !FEATURE_OPTIONS.some(opt => opt.key === f)).join(', ')}
                    </div>
                  )}
                </div>
                <div className="grid gap-2">
                  <label className="text-xs text-muted">Allowed models</label>
                  <input
                    type="text"
                    value={editUser.allowedModels.join(', ')}
                    onChange={e => updateAllowedModelsFromInput(e.target.value)}
                    placeholder="deepseek-chat, claude-3-haiku"
                    className="w-full px-2 py-1 text-sm border border-border rounded bg-surfaceAlt focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <div className="flex flex-wrap gap-2">
                    {DEFAULT_MODELS.map(model => {
                      const active = editUser.allowedModels.includes(model);
                      return (
                        <button
                          key={model}
                          type="button"
                          onClick={() => toggleModel(model)}
                          className={`px-2 py-1 text-xs border rounded ${active ? 'bg-primary text-primaryFg border-transparent' : 'border-border bg-surfaceAlt hover:bg-surfaceAlt/70'}`}
                        >
                          {model}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="grid gap-2">
                  <label className="text-xs text-muted">Customer notes</label>
                  <textarea
                    value={editUser.customerNotes || ''}
                    onChange={e => setEditUser(prev => (prev ? { ...prev, customerNotes: e.target.value || null } : prev))}
                    className="w-full min-h-[80px] px-2 py-1 text-sm border border-border rounded bg-surfaceAlt focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-xs text-muted">Billing reference</label>
                  <input
                    type="text"
                    value={editUser.billingReference || ''}
                    onChange={e => setEditUser(prev => (prev ? { ...prev, billingReference: e.target.value || null } : prev))}
                    className="w-full px-2 py-1 text-sm border border-border rounded bg-surfaceAlt focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={editUser.isAdmin}
                    onChange={e => setEditUser(prev => (prev ? { ...prev, isAdmin: e.target.checked } : prev))}
                  />
                  Grant platform admin access
                </label>
                <div className="border-t border-border/60 pt-3 text-xs text-muted">
                  Usage last 30 days: {editUser.usage.alertsAssigned} alerts, {editUser.usage.casesOwned} cases, {editUser.usage.auditEvents} audit events.
                </div>
                {userError && <div className="text-xs text-danger" role="alert">{userError}</div>}
                {userSaveMsg && <div className="text-xs text-muted">{userSaveMsg}</div>}
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    className="px-3 py-1.5 text-sm rounded bg-primary text-primaryFg hover:bg-primary/90 disabled:opacity-60"
                    disabled={savingUser}
                  >
                    {savingUser ? 'Saving…' : 'Save changes'}
                  </button>
                  <button
                    type="button"
                    className="px-3 py-1.5 text-sm border border-border rounded hover:bg-surfaceAlt"
                    onClick={resetEditUser}
                    disabled={savingUser}
                  >
                    Reset
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  function renderPlatformTab() {
    if (authLoading && !me) {
      return (
        <div className="bg-surface border border-border rounded-lg p-4 text-sm text-muted">
          Loading account…
        </div>
      );
    }
    if (me && !me.isAdmin) {
      return (
        <div className="bg-surface border border-border rounded-lg p-6 text-sm text-muted">
          Platform settings are restricted to administrators.
        </div>
      );
    }
    return (
      <div className="space-y-3">
        <div className="bg-surface rounded-lg border border-border p-3 flex items-center justify-between">
          <div>
            <div className="font-semibold">Platform configuration</div>
            <div className="text-xs text-muted">Control LLM routing, registration, and operational tooling.</div>
          </div>
          <div className="flex items-center gap-2">
            {(settingsRefreshMsg || refreshNotice) && (
              <div className="text-xs text-muted" aria-live="polite">{settingsRefreshMsg || refreshNotice}</div>
            )}
            <button
              className="px-2 py-1 border border-border rounded"
              onClick={() => { void Promise.all([refreshSettings(), refreshCustomers()]); }}
              disabled={settingsRefreshBusy || adminLoading}
            >
              {settingsRefreshBusy || adminLoading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>
        {settingsError && <div className="text-danger text-sm" role="alert">{settingsError}</div>}
        <div className="bg-surface rounded-lg border border-border p-3 space-y-2">
          <div className="font-semibold">LLM provider</div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="llm" value="deepseek" checked={provider === 'deepseek'} onChange={() => setProvider('deepseek')} />
              DeepSeek (hosted)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="llm" value="local" checked={provider === 'local'} onChange={() => setProvider('local')} />
              Local inference (http://127.0.0.1:1234)
            </label>
            <button className="px-2 py-1 border border-border rounded" onClick={() => { void saveSettings(); }} disabled={settingsBusy}>
              {settingsBusy ? 'Saving…' : 'Save'}
            </button>
            {settingsSaveMsg && <div className="text-xs text-muted" aria-live="polite">{settingsSaveMsg}</div>}
          </div>
          <div className="text-xs text-muted">Toggle between production DeepSeek and a local model endpoint without redeploying the stack.</div>
          {provider === 'deepseek' ? (
            <div className="mt-2 space-y-2">
              <div className="text-sm font-medium">Validate DeepSeek connectivity</div>
              <div className="flex flex-col gap-2 max-w-xl">
                <label className="flex items-center gap-2 text-sm">
                  <span className="w-32 text-muted">API key</span>
                  <input type="password" value={dsApiKey} onChange={e => setDsApiKey(e.target.value)} className="flex-1 px-2 py-1 border border-border rounded bg-surfaceAlt" placeholder="sk-…" />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <span className="w-32 text-muted">Base URL</span>
                  <input type="text" value={dsBase} onChange={e => setDsBase(e.target.value)} className="flex-1 px-2 py-1 border border-border rounded bg-surfaceAlt" />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <span className="w-32 text-muted">Model</span>
                  <input type="text" value={dsModel} onChange={e => setDsModel(e.target.value)} className="flex-1 px-2 py-1 border border-border rounded bg-surfaceAlt" />
                </label>
              </div>
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              <div className="text-sm font-medium">Validate local API</div>
              <div className="flex flex-col gap-2 max-w-xl">
                <label className="flex items-center gap-2 text-sm">
                  <span className="w-32 text-muted">Base URL</span>
                  <input type="text" value={localBase} onChange={e => setLocalBase(e.target.value)} className="flex-1 px-2 py-1 border border-border rounded bg-surfaceAlt" />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <span className="w-32 text-muted">Model</span>
                  <input type="text" value={localModel} onChange={e => setLocalModel(e.target.value)} className="flex-1 px-2 py-1 border border-border rounded bg-surfaceAlt" />
                </label>
              </div>
            </div>
          )}
          <div className="flex items-center gap-2 mt-2">
            <button className="px-2 py-1 border border-border rounded" onClick={() => { void validateLLM(); }} disabled={validateBusy}>
              {validateBusy ? 'Validating…' : 'Validate'}
            </button>
            {validateMsg && <div className="text-xs" aria-live="polite">{validateMsg}</div>}
          </div>
        </div>
        <div className="bg-surface rounded-lg border border-border p-3">
          <div className="font-semibold mb-2">Registration</div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={allowSelfRegister} onChange={e => setAllowSelfRegister(e.target.checked)} />
            Allow self-service registration (POST /auth/register)
          </label>
          <div className="text-xs text-muted mt-2">When disabled, new sign-ups are blocked until re-enabled here.</div>
        </div>
        <div className="bg-surface rounded-lg border border-border p-3">
          <div className="font-semibold mb-2">Operations</div>
          <div className="flex items-center gap-2">
            <button className="px-2 py-1 border border-border rounded" onClick={() => { void autoTriageOpen(500); }} disabled={triageBusy}>
              {triageBusy ? 'Auto-triaging…' : 'Auto-triage open alerts'}
            </button>
            {triageMsg && <div className="text-xs text-muted" aria-live="polite">{triageMsg}</div>}
          </div>
          <div className="text-xs text-muted mt-2">Re-apply triage rules to all non-closed alerts. Logs the action to the audit trail.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xl font-semibold">Admin console</div>
          <div className="text-sm text-muted">Manage customers, billing entitlements, and platform configuration.</div>
        </div>
        <div className="flex items-center gap-2">
          {(refreshNotice || settingsRefreshMsg) && <span className="text-xs text-muted">{refreshNotice || settingsRefreshMsg}</span>}
          <button
            className="px-3 py-1 border border-border rounded-md text-sm hover:bg-surfaceAlt"
            onClick={() => { void refreshAll(); }}
            disabled={adminLoading || settingsRefreshBusy}
          >
            {adminLoading || settingsRefreshBusy ? 'Refreshing…' : 'Refresh all'}
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('users')}
          className={`px-3 py-1.5 rounded-md border text-sm ${activeTab === 'users' ? 'bg-primary text-primaryFg border-transparent' : 'border-border bg-surfaceAlt hover:bg-surfaceAlt/80'}`}
        >
          Customers & billing
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('platform')}
          className={`px-3 py-1.5 rounded-md border text-sm ${activeTab === 'platform' ? 'bg-primary text-primaryFg border-transparent' : 'border-border bg-surfaceAlt hover:bg-surfaceAlt/80'}`}
        >
          Platform settings
        </button>
      </div>
      {activeTab === 'users' ? renderUsersTab() : renderPlatformTab()}
    </div>
  );
}
