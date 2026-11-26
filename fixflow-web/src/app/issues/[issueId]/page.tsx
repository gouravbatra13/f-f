'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
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

interface IssueDetailData {
  id: string;
  projectId: string;
  title: string;
  status: string;
  severity: string;
  eventCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  assigneeUserId: string | null;
  events: {
    id: string;
    errorMessage: string;
    stackTrace: string | null;
    severity: string;
    environment: string;
    release: string | null;
    endpoint: string | null;
    occurredAt: string;
  }[];
  comments: { id: string; authorUserId: string; body: string; createdAt: string }[];
  activity: { id: string; action: string; createdAt: string }[];
}

interface MemberOption {
  userId: string;
  name: string;
  email: string;
}

function IssueDetailContent() {
  const { issueId } = useParams<{ issueId: string }>();
  const { organization } = useWorkspace();
  const [issue, setIssue] = useState<IssueDetailData | null>(null);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [issueResult, memberResult] = await Promise.all([
        apiFetch<IssueDetailData>(`issues/${issueId}`),
        organization
          ? apiFetch<MemberOption[]>(
              `organizations/${organization.id}/members`,
            )
          : Promise.resolve([]),
      ]);
      setIssue(issueResult);
      setMembers(memberResult);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to load issue details',
      );
    } finally {
      setLoading(false);
    }
  }, [issueId, organization]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const changeStatus = async (status: string) => {
    if (!issue) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`issues/${issue.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setIssue({ ...issue, status });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to update status');
    } finally {
      setBusy(false);
    }
  };

  const changeAssignee = async (assigneeUserId: string) => {
    if (!issue) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`issues/${issue.id}/assignment`, {
        method: 'PATCH',
        body: JSON.stringify({ assigneeUserId: assigneeUserId || null }),
      });
      setIssue({ ...issue, assigneeUserId: assigneeUserId || null });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to assign issue');
    } finally {
      setBusy(false);
    }
  };

  const addComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!issue || !comment.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`issues/${issue.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body: comment.trim() }),
      });
      setComment('');
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to add comment');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingState label="Loading issue details…" />;
  if (error && !issue) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!issue) {
    return (
      <EmptyState title="Issue unavailable" description="This issue may have been removed or you may not have access." />
    );
  }

  return (
    <div className="space-y-5">
      <Link href="/issues" className="text-xs text-cyan-300 hover:text-cyan-200">
        ← All issues
      </Link>
      {error && <ErrorState message={error} />}
      <Panel
        title={issue.title}
        subtitle={`First seen ${formatDate(issue.firstSeenAt)} · Last seen ${formatDate(issue.lastSeenAt)} · ${issue.eventCount} total events`}
      >
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge value={issue.severity} />
          <StatusBadge value={issue.status} />
          <label className="sr-only" htmlFor="issue-status">Issue status</label>
          <select
            id="issue-status"
            value={issue.status}
            disabled={busy}
            onChange={(event) => void changeStatus(event.target.value)}
            className="rounded-lg border border-white/10 bg-[#0b0f18] px-3 py-2 text-xs"
          >
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
            <option value="ignored">Ignored</option>
          </select>
          <label className="sr-only" htmlFor="issue-assignee">Assignee</label>
          <select
            id="issue-assignee"
            value={issue.assigneeUserId ?? ''}
            disabled={busy}
            onChange={(event) => void changeAssignee(event.target.value)}
            className="max-w-56 rounded-lg border border-white/10 bg-[#0b0f18] px-3 py-2 text-xs"
          >
            <option value="">Unassigned</option>
            {members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.name} · {member.email}
              </option>
            ))}
          </select>
        </div>
      </Panel>

      <AiInvestigationPanel sourceType="issue" sourceId={issue.id} />

      <Panel title="Error event history" subtitle="Most recent captured occurrences, including sanitized stack trace evidence.">
        {issue.events.length ? (
          <div className="space-y-4">
            {issue.events.map((event) => (
              <details key={event.id} className="rounded-xl border border-white/[0.07] p-4">
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{event.errorMessage}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {event.environment} · {event.release ?? 'no release'} · {event.endpoint ?? 'no endpoint'} · {formatDate(event.occurredAt)}
                      </div>
                    </div>
                    <StatusBadge value={event.severity} />
                  </div>
                </summary>
                <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-black/30 p-4 text-xs leading-5 text-slate-300">
                  {event.stackTrace || 'No stack trace was provided.'}
                </pre>
              </details>
            ))}
          </div>
        ) : (
          <EmptyState title="No event details" description="This grouped issue has no event records available." />
        )}
      </Panel>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Comments">
          <form onSubmit={addComment} className="mb-5 space-y-2">
            <label htmlFor="issue-comment" className="sr-only">Add a comment</label>
            <textarea
              id="issue-comment"
              required
              maxLength={4000}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Share investigation notes with your team"
              rows={3}
              className="w-full rounded-lg border border-white/10 bg-black/20 p-3 text-sm outline-none focus:border-cyan-300/50"
            />
            <button disabled={busy} className="rounded-lg bg-cyan-400 px-4 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50">
              Add comment
            </button>
          </form>
          {issue.comments.length ? (
            <div className="space-y-3">
              {issue.comments.map((item) => (
                <div key={item.id} className="border-t border-white/[0.06] pt-3">
                  <p className="whitespace-pre-wrap text-sm text-slate-300">{item.body}</p>
                  <p className="mt-2 text-[11px] text-slate-500">{item.authorUserId} · {formatDate(item.createdAt)}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">No comments yet.</p>
          )}
        </Panel>
        <Panel title="Issue activity">
          {issue.activity.length ? (
            <div className="space-y-3">
              {issue.activity.map((item) => (
                <div key={item.id} className="flex justify-between gap-3 border-b border-white/[0.06] pb-3 last:border-0">
                  <span className="text-sm text-slate-300">{item.action.replaceAll('_', ' ')}</span>
                  <span className="text-xs text-slate-500">{formatDate(item.createdAt)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">No activity recorded yet.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}

export default function IssueDetailPage() {
  return (
    <WorkspaceShell title="Issue details">
      <IssueDetailContent />
    </WorkspaceShell>
  );
}
