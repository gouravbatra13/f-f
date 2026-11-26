'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
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

interface IssueRow {
  id: string;
  title: string;
  status: string;
  severity: string;
  eventCount: number;
  lastSeenAt: string;
  environments: string[];
  assigneeUserId: string | null;
}

interface IssueResponse {
  data: IssueRow[];
  pagination: { page: number; total: number; totalPages: number };
}

function IssuesContent() {
  const { organization, project } = useWorkspace();
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [severity, setSeverity] = useState('');
  const [environment, setEnvironment] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<IssueResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!organization) {
      setResult(null);
      return;
    }
    const params = new URLSearchParams({
      organizationId: organization.id,
      page: String(page),
      limit: '25',
      sort: 'lastSeenAt',
      order: 'desc',
    });
    if (project) params.set('projectId', project.id);
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    if (severity) params.set('severity', severity);
    if (environment) params.set('environment', environment);
    setLoading(true);
    setError(null);
    try {
      setResult(await apiFetch<IssueResponse>(`issues?${params}`));
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to load issues',
      );
    } finally {
      setLoading(false);
    }
  }, [organization, project, search, status, severity, environment, page]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return (
    <Panel
      title="Issue management"
      subtitle="Search grouped errors, filter by status and environment, and open an issue to inspect event evidence."
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setSearch(query.trim());
        }}
        className="mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(180px,1fr)_160px_160px_160px_auto]"
      >
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search title or fingerprint"
          className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none focus:border-cyan-300/50"
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
          <option value="open">Open</option>
          <option value="resolved">Resolved</option>
          <option value="ignored">Ignored</option>
        </select>
        <select
          value={severity}
          onChange={(event) => {
            setSeverity(event.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-white/10 bg-[#0b0f18] px-3 py-2 text-sm"
        >
          <option value="">All severities</option>
          <option value="critical">Critical</option>
          <option value="error">Error</option>
          <option value="warning">Warning</option>
          <option value="info">Info</option>
        </select>
        <select
          value={environment}
          onChange={(event) => {
            setEnvironment(event.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-white/10 bg-[#0b0f18] px-3 py-2 text-sm"
        >
          <option value="">All environments</option>
          <option value="production">Production</option>
          <option value="staging">Staging</option>
          <option value="development">Development</option>
        </select>
        <button className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950">
          Search
        </button>
      </form>

      {error && <ErrorState message={error} onRetry={() => void load()} />}
      {loading && !result ? (
        <LoadingState label="Loading issues…" />
      ) : result?.data.length ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[740px] text-left text-sm">
              <thead className="text-xs text-slate-500">
                <tr>
                  <th className="pb-3 font-medium">Issue</th>
                  <th className="pb-3 font-medium">Severity</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Events</th>
                  <th className="pb-3 font-medium">Environment</th>
                  <th className="pb-3 font-medium">Last seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {result.data.map((issue) => (
                  <tr key={issue.id} className="hover:bg-white/[0.02]">
                    <td className="max-w-sm py-4 pr-4">
                      <Link
                        href={`/issues/${issue.id}`}
                        className="block truncate font-medium text-slate-200 hover:text-cyan-300"
                      >
                        {issue.title}
                      </Link>
                      <span className="mt-1 block text-xs text-slate-500">
                        {issue.assigneeUserId ? 'Assigned' : 'Unassigned'}
                      </span>
                    </td>
                    <td className="py-4">
                      <StatusBadge value={issue.severity} />
                    </td>
                    <td className="py-4">
                      <StatusBadge value={issue.status} />
                    </td>
                    <td className="py-4 tabular-nums">{issue.eventCount}</td>
                    <td className="py-4 text-xs text-slate-400">
                      {issue.environments?.join(', ') || '—'}
                    </td>
                    <td className="py-4 text-xs text-slate-500">
                      {formatDate(issue.lastSeenAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-5 flex items-center justify-between border-t border-white/[0.06] pt-4 text-xs text-slate-500">
            <span>
              Page {result.pagination.page} of {Math.max(1, result.pagination.totalPages)} · {result.pagination.total} issues
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
                className="rounded-lg border border-white/10 px-3 py-1.5 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                disabled={page >= result.pagination.totalPages}
                onClick={() => setPage((current) => current + 1)}
                className="rounded-lg border border-white/10 px-3 py-1.5 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </>
      ) : loading ? (
        <LoadingState label="Loading issues…" />
      ) : (
        <EmptyState
          title="No issues match these filters"
          description="Try clearing filters or send an error event to the selected project."
        />
      )}
    </Panel>
  );
}

export default function IssuesPage() {
  return (
    <WorkspaceShell title="Issues">
      <IssuesContent />
    </WorkspaceShell>
  );
}
