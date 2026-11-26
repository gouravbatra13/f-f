'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { WorkspaceShell } from '@/components/workspace-shell';
import { useWorkspace } from '@/components/workspace-context';
import { apiFetch } from '@/lib/api';
import {
  EmptyState,
  ErrorState,
  formatDate,
  LoadingState,
  Panel,
  StatusBadge,
} from '@/components/ui';

interface AlertRule {
  id: string;
  name: string;
  type: 'CRITICAL_ERROR' | 'ERROR_SPIKE';
  projectId: string | null;
  environment: string | null;
  thresholdCount: number | null;
  windowMinutes: number | null;
  cooldownMinutes: number;
  isEnabled: boolean;
  lastTriggeredAt: string | null;
}

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  readAt: string | null;
  mockEmailStatus: 'simulated';
}

interface NotificationResponse {
  data: NotificationItem[];
  pagination: { page: number; total: number; totalPages: number };
}

function AlertsContent() {
  const { organization, project } = useWorkspace();
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [notifications, setNotifications] = useState<NotificationResponse | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<AlertRule['type']>('CRITICAL_ERROR');
  const [environment, setEnvironment] = useState('');
  const [thresholdCount, setThresholdCount] = useState(10);
  const [windowMinutes, setWindowMinutes] = useState(5);
  const [cooldownMinutes, setCooldownMinutes] = useState(15);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!organization) return;
    setLoading(true);
    setError(null);
    try {
      const [ruleData, notificationData] = await Promise.all([
        apiFetch<AlertRule[]>(
          `organizations/${organization.id}/alert-rules`,
        ),
        apiFetch<NotificationResponse>(
          `organizations/${organization.id}/notifications?page=1&limit=25`,
        ),
      ]);
      setRules(ruleData);
      setNotifications(notificationData);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load alerts');
    } finally {
      setLoading(false);
    }
  }, [organization]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const createRule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!organization) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`organizations/${organization.id}/alert-rules`, {
        method: 'POST',
        body: JSON.stringify({
          name,
          type,
          projectId: project?.id ?? null,
          environment: environment || null,
          cooldownMinutes,
          ...(type === 'ERROR_SPIKE' ? { thresholdCount, windowMinutes } : {}),
        }),
      });
      setName('');
      setShowForm(false);
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to create alert rule');
    } finally {
      setBusy(false);
    }
  };

  const toggleRule = async (rule: AlertRule) => {
    if (!organization) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(
        `organizations/${organization.id}/alert-rules/${rule.id}`,
        { method: 'PATCH', body: JSON.stringify({ isEnabled: !rule.isEnabled }) },
      );
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to update alert rule');
    } finally {
      setBusy(false);
    }
  };

  const deleteRule = async (rule: AlertRule) => {
    if (!organization || !window.confirm(`Archive alert rule “${rule.name}”?`)) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(
        `organizations/${organization.id}/alert-rules/${rule.id}`,
        { method: 'DELETE' },
      );
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to archive alert rule');
    } finally {
      setBusy(false);
    }
  };

  const markRead = async (item: NotificationItem) => {
    if (!organization || item.readAt) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(
        `organizations/${organization.id}/notifications/${item.id}/read`,
        { method: 'PATCH' },
      );
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to mark notification read');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {error && <ErrorState message={error} onRetry={() => void load()} />}
      <Panel title="Alert rules" subtitle="In-app alerts and development-only simulated email status. No email is actually delivered.">
        <div className="mb-5 flex justify-end">
          <button onClick={() => setShowForm((value) => !value)} className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950">
            {showForm ? 'Cancel' : '+ Create alert rule'}
          </button>
        </div>
        {showForm && (
          <form onSubmit={createRule} className="mb-5 grid gap-3 rounded-xl border border-white/[0.08] p-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-xs text-slate-400">Rule name
              <input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b0f18] px-3 py-2 text-sm text-slate-100" />
            </label>
            <label className="text-xs text-slate-400">Condition
              <select value={type} onChange={(event) => setType(event.target.value as AlertRule['type'])} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b0f18] px-3 py-2 text-sm text-slate-100">
                <option value="CRITICAL_ERROR">Critical error occurs</option>
                <option value="ERROR_SPIKE">Error count exceeds threshold</option>
              </select>
            </label>
            <label className="text-xs text-slate-400">Environment
              <select value={environment} onChange={(event) => setEnvironment(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b0f18] px-3 py-2 text-sm text-slate-100">
                <option value="">All environments</option>
                {['production', 'staging', 'development'].map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            {type === 'ERROR_SPIKE' && (
              <>
                <label className="text-xs text-slate-400">Event threshold
                  <input type="number" required min={1} max={100000} value={thresholdCount} onChange={(event) => setThresholdCount(Number(event.target.value))} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b0f18] px-3 py-2 text-sm text-slate-100" />
                </label>
                <label className="text-xs text-slate-400">Window in minutes
                  <input type="number" required min={1} max={1440} value={windowMinutes} onChange={(event) => setWindowMinutes(Number(event.target.value))} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b0f18] px-3 py-2 text-sm text-slate-100" />
                </label>
              </>
            )}
            <label className="text-xs text-slate-400">Cooldown in minutes
              <input type="number" min={0} max={1440} value={cooldownMinutes} onChange={(event) => setCooldownMinutes(Number(event.target.value))} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b0f18] px-3 py-2 text-sm text-slate-100" />
            </label>
            <div className="flex items-end">
              <button disabled={busy} className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">Save rule</button>
            </div>
          </form>
        )}
        {loading && !rules.length ? <LoadingState label="Loading alert rules…" /> : rules.length ? (
          <div className="space-y-3">
            {rules.map((rule) => (
              <div key={rule.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/[0.06] p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{rule.name}</span>
                    <StatusBadge value={rule.type} />
                    <StatusBadge value={rule.isEnabled ? 'enabled' : 'disabled'} />
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    {rule.environment ?? 'All environments'} · {rule.projectId ? 'Selected project' : 'Organization scope'} · {rule.type === 'ERROR_SPIKE' ? `${rule.thresholdCount} events / ${rule.windowMinutes} min · ` : ''}cooldown {rule.cooldownMinutes} min
                    {rule.lastTriggeredAt ? ` · Last triggered ${formatDate(rule.lastTriggeredAt)}` : ''}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button disabled={busy} onClick={() => void toggleRule(rule)} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 disabled:opacity-50">{rule.isEnabled ? 'Disable' : 'Enable'}</button>
                  <button disabled={busy} onClick={() => void deleteRule(rule)} className="rounded-lg border border-rose-400/20 px-3 py-2 text-xs text-rose-300 disabled:opacity-50">Archive</button>
                </div>
              </div>
            ))}
          </div>
        ) : <EmptyState title="No alert rules configured" description="Create a critical-error or error-spike rule for this organization." />}
      </Panel>

      <Panel title="Notification history" subtitle="Per-user in-app notification history. Email delivery is simulated only.">
        {notifications?.data.length ? (
          <div className="space-y-2">
            {notifications.data.map((item) => (
              <div key={item.id} className={`flex flex-wrap items-start justify-between gap-3 rounded-xl border p-4 ${item.readAt ? 'border-white/[0.05]' : 'border-cyan-400/15 bg-cyan-400/[0.025]'}`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {!item.readAt && <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />}
                    {item.title}
                  </div>
                  <p className="mt-1 text-sm text-slate-400">{item.message}</p>
                  <div className="mt-2 text-[11px] text-slate-500">{formatDate(item.createdAt)} · mock email: {item.mockEmailStatus}</div>
                </div>
                {!item.readAt && <button disabled={busy} onClick={() => void markRead(item)} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 disabled:opacity-50">Mark read</button>}
              </div>
            ))}
          </div>
        ) : <EmptyState title="No notifications" description="Notifications will appear after a matching alert rule triggers." />}
      </Panel>
    </div>
  );
}

export default function AlertsPage() {
  return <WorkspaceShell title="Alerts"><AlertsContent /></WorkspaceShell>;
}
