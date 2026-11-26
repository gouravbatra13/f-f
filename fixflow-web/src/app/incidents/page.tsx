'use client';

import Link from 'next/link';
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

interface IncidentRow {
  id: string;
  title: string;
  severity: string;
  status: string;
  projectId: string | null;
  ownerUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface IncidentListResponse {
  data: IncidentRow[];
  pagination: { page: number; total: number; totalPages: number };
}

function IncidentsContent() {
  const { organization, project } = useWorkspace();
  const [result, setResult] = useState<IncidentListResponse | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('SEV3');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!organization) return;
    const params = new URLSearchParams({ page: String(page), limit: '25' });
    if (project) params.set('projectId', project.id);
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    setLoading(true);
    setError(null);
    try {
      setResult(
        await apiFetch<IncidentListResponse>(
          `organizations/${organization.id}/incidents?${params}`,
        ),
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load incidents');
    } finally {
      setLoading(false);
    }
  }, [organization, project, search, status, page]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const createIncident = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!organization) return;
    setLoading(true);
    setError(null);
    try {
      await apiFetch(`organizations/${organization.id}/incidents`, {
        method: 'POST',
        body: JSON.stringify({
          title,
          description: description || undefined,
          severity,
          projectId: project?.id,
        }),
      });
      setTitle('');
      setDescription('');
      setSeverity('SEV3');
      setShowCreate(false);
      setPage(1);
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to create incident');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Panel
      title="Incident management"
      subtitle="Track service-impacting events, owners, status, related issues, and resolution history."
    >
      {error && <div className="mb-4"><ErrorState message={error} onRetry={() => void load()} /></div>}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search incidents"
            className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
          />
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-white/10 bg-[#0b0f18] px-3 py-2 text-sm"
          >
            <option value="">All statuses</option>
            {['OPEN', 'INVESTIGATING', 'IDENTIFIED', 'MONITORING', 'RESOLVED'].map((value) => (
              <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>
            ))}
          </select>
        </div>
        <button
          onClick={() => setShowCreate((current) => !current)}
          className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950"
        >
          {showCreate ? 'Cancel' : '+ New incident'}
        </button>
      </div>
      {showCreate && (
        <form onSubmit={createIncident} className="mb-5 grid gap-3 rounded-xl border border-white/[0.08] bg-black/10 p-4 md:grid-cols-2">
          <label className="text-xs text-slate-400">
            Title
            <input required maxLength={255} value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b0f18] px-3 py-2 text-sm text-slate-100" />
          </label>
          <label className="text-xs text-slate-400">
            Severity
            <select value={severity} onChange={(event) => setSeverity(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b0f18] px-3 py-2 text-sm text-slate-100">
              {['SEV1', 'SEV2', 'SEV3', 'SEV4'].map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-400 md:col-span-2">
            Description
            <textarea maxLength={10000} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b0f18] px-3 py-2 text-sm text-slate-100" />
          </label>
          <button disabled={loading} className="w-fit rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">
            Create incident
          </button>
        </form>
      )}
      {loading && !result ? <LoadingState label="Loading incidents…" /> : result?.data.length ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-left text-sm">
              <thead className="text-xs text-slate-500">
                <tr>
                  <th className="pb-3 font-medium">Incident</th>
                  <th className="pb-3 font-medium">Severity</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Owner</th>
                  <th className="pb-3 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {result.data.map((incident) => (
                  <tr key={incident.id}>
                    <td className="py-4">
                      <Link href={`/incidents/${incident.id}`} className="font-medium hover:text-cyan-300">{incident.title}</Link>
                      <div className="mt-1 text-xs text-slate-500">Created {formatDate(incident.createdAt)}</div>
                    </td>
                    <td className="py-4"><StatusBadge value={incident.severity} /></td>
                    <td className="py-4"><StatusBadge value={incident.status} /></td>
                    <td className="py-4 text-xs text-slate-400">{incident.ownerUserId ?? 'Unassigned'}</td>
                    <td className="py-4 text-xs text-slate-500">{formatDate(incident.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-5 flex items-center justify-between border-t border-white/[0.06] pt-4 text-xs text-slate-500">
            <span>Page {result.pagination.page} of {Math.max(1, result.pagination.totalPages)} · {result.pagination.total} incidents</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-white/10 px-3 py-1.5 disabled:opacity-40">Previous</button>
              <button disabled={page >= result.pagination.totalPages} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-white/10 px-3 py-1.5 disabled:opacity-40">Next</button>
            </div>
          </div>
        </>
      ) : loading ? <LoadingState label="Loading incidents…" /> : (
        <EmptyState title="No incidents found" description="Create an incident when an issue requires coordinated response, or broaden your filters." />
      )}
    </Panel>
  );
}

export default function IncidentsPage() {
  return <WorkspaceShell title="Incidents"><IncidentsContent /></WorkspaceShell>;
}
