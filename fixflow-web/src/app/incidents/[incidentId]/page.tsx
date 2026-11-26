'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { WorkspaceShell } from '@/components/workspace-shell';
import { useWorkspace } from '@/components/workspace-context';
import { apiFetch } from '@/lib/api';
import { AiInvestigationPanel } from '@/components/ai-investigation';
import {
  EmptyState,
  ErrorState,
  formatDate,
  LoadingState,
  Panel,
  StatusBadge,
} from '@/components/ui';

interface IncidentDetailData {
  id: string;
  title: string;
  description: string | null;
  projectId: string | null;
  severity: string;
  status: string;
  ownerUserId: string | null;
  resolutionNotes: string | null;
  linkedIssues: { id: string; title: string; severity: string; status: string }[];
}

interface MemberOption {
  userId: string;
  name: string;
  email: string;
}

interface TimelineItem {
  id: string;
  action: string;
  details: Record<string, unknown> | null;
  actorUserId: string | null;
  createdAt: string;
}

function IncidentDetailContent() {
  const { incidentId } = useParams<{ incidentId: string }>();
  const { organization } = useWorkspace();
  const router = useRouter();
  const [incident, setIncident] = useState<IncidentDetailData | null>(null);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [issueId, setIssueId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!organization) return;
    setLoading(true);
    setError(null);
    try {
      const [data, memberRows, timelineResult] = await Promise.all([
        apiFetch<IncidentDetailData>(
          `organizations/${organization.id}/incidents/${incidentId}`,
        ),
        apiFetch<MemberOption[]>(`organizations/${organization.id}/members`),
        apiFetch<{ data: TimelineItem[] }>(
          `organizations/${organization.id}/incidents/${incidentId}/timeline?limit=100`,
        ),
      ]);
      setIncident(data);
      setTitle(data.title);
      setDescription(data.description ?? '');
      setResolutionNotes(data.resolutionNotes ?? '');
      setMembers(memberRows);
      setTimeline(timelineResult.data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load incident');
    } finally {
      setLoading(false);
    }
  }, [organization, incidentId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const patchIncident = async (patch: Record<string, string | null>) => {
    if (!organization || !incident) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(
        `organizations/${organization.id}/incidents/${incident.id}`,
        { method: 'PATCH', body: JSON.stringify(patch) },
      );
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to update incident');
    } finally {
      setBusy(false);
    }
  };

  const saveDetails = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await patchIncident({
      title,
      description: description || null,
      resolutionNotes: resolutionNotes || null,
    });
  };

  const linkIssue = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!organization || !incident || !issueId.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(
        `organizations/${organization.id}/incidents/${incident.id}/issues`,
        { method: 'POST', body: JSON.stringify({ issueId: issueId.trim() }) },
      );
      setIssueId('');
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to link issue');
    } finally {
      setBusy(false);
    }
  };

  const unlinkIssue = async (id: string) => {
    if (!organization || !incident) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(
        `organizations/${organization.id}/incidents/${incident.id}/issues/${id}`,
        { method: 'DELETE' },
      );
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to unlink issue');
    } finally {
      setBusy(false);
    }
  };

  const archive = async () => {
    if (!organization || !incident || !window.confirm('Archive this incident?')) return;
    setBusy(true);
    try {
      await apiFetch(
        `organizations/${organization.id}/incidents/${incident.id}`,
        { method: 'DELETE' },
      );
      router.replace('/incidents');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to archive incident');
      setBusy(false);
    }
  };

  if (loading) return <LoadingState label="Loading incident…" />;
  if (error && !incident) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!incident) return <EmptyState title="Incident unavailable" description="This incident may have been removed or access may have changed." />;

  return (
    <div className="space-y-5">
      <Link href="/incidents" className="text-xs text-cyan-300 hover:text-cyan-200">← All incidents</Link>
      {error && <ErrorState message={error} />}
      <Panel title={incident.title} subtitle="Status, ownership, and related-issue changes are recorded in the incident timeline.">
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <StatusBadge value={incident.severity} />
          <StatusBadge value={incident.status} />
          <select
            aria-label="Incident status"
            disabled={busy}
            value={incident.status}
            onChange={(event) => void patchIncident({ status: event.target.value })}
            className="rounded-lg border border-white/10 bg-[#0b0f18] px-3 py-2 text-xs"
          >
            {['OPEN', 'INVESTIGATING', 'IDENTIFIED', 'MONITORING', 'RESOLVED'].map((value) => <option key={value}>{value}</option>)}
          </select>
          <select
            aria-label="Incident severity"
            disabled={busy}
            value={incident.severity}
            onChange={(event) => void patchIncident({ severity: event.target.value })}
            className="rounded-lg border border-white/10 bg-[#0b0f18] px-3 py-2 text-xs"
          >
            {['SEV1', 'SEV2', 'SEV3', 'SEV4'].map((value) => <option key={value}>{value}</option>)}
          </select>
          <select
            aria-label="Incident owner"
            disabled={busy}
            value={incident.ownerUserId ?? ''}
            onChange={(event) => void patchIncident({ ownerUserId: event.target.value || null })}
            className="max-w-60 rounded-lg border border-white/10 bg-[#0b0f18] px-3 py-2 text-xs"
          >
            <option value="">Unassigned owner</option>
            {members.map((member) => <option key={member.userId} value={member.userId}>{member.name} · {member.email}</option>)}
          </select>
          <button onClick={() => void archive()} disabled={busy} className="ml-auto rounded-lg border border-rose-400/20 px-3 py-2 text-xs text-rose-300 disabled:opacity-50">Archive</button>
        </div>
        <form onSubmit={saveDetails} className="grid gap-3 md:grid-cols-2">
          <label className="text-xs text-slate-400">
            Title
            <input required maxLength={255} value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100" />
          </label>
          <label className="text-xs text-slate-400 md:col-span-2">
            Description
            <textarea maxLength={10000} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100" />
          </label>
          <label className="text-xs text-slate-400 md:col-span-2">
            Resolution notes
            <textarea maxLength={10000} rows={3} value={resolutionNotes} onChange={(event) => setResolutionNotes(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100" />
          </label>
          <button disabled={busy} className="w-fit rounded-lg bg-cyan-400 px-4 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50">Save incident details</button>
        </form>
      </Panel>

      <AiInvestigationPanel sourceType="incident" sourceId={incident.id} />

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Linked issues" subtitle="Issues must belong to this incident's organization and project scope.">
          <form onSubmit={linkIssue} className="mb-4 flex gap-2">
            <input required value={issueId} onChange={(event) => setIssueId(event.target.value)} placeholder="Issue UUID" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs" />
            <button disabled={busy} className="rounded-lg border border-cyan-300/20 px-3 py-2 text-xs text-cyan-200 disabled:opacity-50">Link issue</button>
          </form>
          {incident.linkedIssues.length ? (
            <div className="space-y-3">
              {incident.linkedIssues.map((issue) => (
                <div key={issue.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] p-3">
                  <Link href={`/issues/${issue.id}`} className="min-w-0 truncate text-sm hover:text-cyan-300">{issue.title}</Link>
                  <StatusBadge value={issue.severity} />
                  <button disabled={busy} onClick={() => void unlinkIssue(issue.id)} className="text-xs text-rose-300 disabled:opacity-50">Unlink</button>
                </div>
              ))}
            </div>
          ) : <EmptyState title="No linked issues" description="Link an issue UUID to connect technical errors to the incident." />}
        </Panel>
        <Panel title="Incident timeline">
          {timeline.length ? (
            <div className="space-y-4">
              {timeline.map((item) => (
                <div key={item.id} className="border-l border-cyan-400/20 pl-4">
                  <div className="text-sm text-slate-200">{item.action.replaceAll('_', ' ')}</div>
                  <div className="mt-1 text-xs text-slate-500">{formatDate(item.createdAt)} · {item.actorUserId ?? 'System'}</div>
                  {item.details && <pre className="mt-2 overflow-auto text-[11px] text-slate-500">{JSON.stringify(item.details, null, 2)}</pre>}
                </div>
              ))}
            </div>
          ) : <EmptyState title="No timeline entries" description="Incident creation and future changes are recorded automatically." />}
        </Panel>
      </div>
    </div>
  );
}

export default function IncidentDetailPage() {
  return <WorkspaceShell title="Incident details"><IncidentDetailContent /></WorkspaceShell>;
}
