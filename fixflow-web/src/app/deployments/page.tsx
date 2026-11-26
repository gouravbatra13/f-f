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
} from '@/components/ui';

interface DeploymentRow {
  id: string;
  projectId: string;
  environment: string;
  release: string;
  status: string;
  deployedAt: string;
  commitHash: string | null;
}

interface DeploymentListResponse {
  data: DeploymentRow[];
  pagination: { page: number; total: number; totalPages: number };
}

interface ImpactResult {
  deployment: { id: string; release: string; deployedAt: string };
  windowMinutes: number;
  afterWindowStatus: string;
  before: { eventCount: number; issueCount: number };
  after: { eventCount: number; issueCount: number };
  percentageChange: number | null;
  newlyIntroducedFingerprints: { fingerprint: string; title: string; eventCount: number }[];
  interpretation: string;
}

function DeploymentsContent() {
  const { project } = useWorkspace();
  const [result, setResult] = useState<DeploymentListResponse | null>(null);
  const [selected, setSelected] = useState<DeploymentRow | null>(null);
  const [impact, setImpact] = useState<ImpactResult | null>(null);
  const [environment, setEnvironment] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newEnvironment, setNewEnvironment] = useState('PRODUCTION');
  const [release, setRelease] = useState('');
  const [commitHash, setCommitHash] = useState('');
  const [deployStatus, setDeployStatus] = useState('SUCCESS');
  const [deployedAt, setDeployedAt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!project) {
      setResult(null);
      setSelected(null);
      setImpact(null);
      return;
    }
    const params = new URLSearchParams({ page: '1', limit: '50' });
    if (environment) params.set('environment', environment);
    if (status) params.set('status', status);
    if (search) params.set('search', search);
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<DeploymentListResponse>(
        `projects/${project.id}/deployments?${params}`,
      );
      setResult(data);
      setSelected((current) =>
        data.data.find((item) => item.id === current?.id) ?? null,
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load deployments');
    } finally {
      setLoading(false);
    }
  }, [project, environment, status, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const createDeployment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!project) return;
    setLoading(true);
    setError(null);
    try {
      await apiFetch(`projects/${project.id}/deployments`, {
        method: 'POST',
        body: JSON.stringify({
          environment: newEnvironment,
          release,
          status: deployStatus,
          deployedAt: deployedAt ? new Date(deployedAt).toISOString() : undefined,
          commitHash: commitHash || undefined,
        }),
      });
      setRelease('');
      setCommitHash('');
      setDeployedAt('');
      setShowCreate(false);
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to create deployment');
    } finally {
      setLoading(false);
    }
  };

  const compareImpact = async (deployment: DeploymentRow) => {
    if (!project) return;
    setSelected(deployment);
    setImpact(null);
    setError(null);
    try {
      setImpact(
        await apiFetch<ImpactResult>(
          `projects/${project.id}/deployments/${deployment.id}/impact?windowMinutes=60`,
        ),
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to compare deployment impact');
    }
  };

  const updateStatus = async (deployment: DeploymentRow, nextStatus: string) => {
    if (!project) return;
    try {
      await apiFetch(`projects/${project.id}/deployments/${deployment.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to update deployment');
    }
  };

  return (
    <div className="space-y-5">
      {!project ? (
        <EmptyState title="Select a project" description="Deployment records are project-scoped. Choose a project from the workspace selector above." />
      ) : (
        <>
          <Panel title="Deployment monitoring" subtitle={`Release history for ${project.name}. Comparison findings are possible correlations, not proof of causation.`}>
            {error && <div className="mb-4"><ErrorState message={error} onRetry={() => void load()} /></div>}
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter release" className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm" />
                <select value={environment} onChange={(event) => setEnvironment(event.target.value)} className="rounded-lg border border-white/10 bg-[#0b0f18] px-3 py-2 text-sm">
                  <option value="">All environments</option>
                  {['PRODUCTION', 'STAGING', 'DEVELOPMENT'].map((item) => <option key={item}>{item}</option>)}
                </select>
                <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-lg border border-white/10 bg-[#0b0f18] px-3 py-2 text-sm">
                  <option value="">All statuses</option>
                  {['PENDING', 'IN_PROGRESS', 'SUCCESS', 'FAILED', 'ROLLED_BACK'].map((item) => <option key={item}>{item}</option>)}
                </select>
              </div>
              <button onClick={() => setShowCreate((value) => !value)} className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950">
                {showCreate ? 'Cancel' : '+ Record deployment'}
              </button>
            </div>
            {showCreate && (
              <form onSubmit={createDeployment} className="mb-5 grid gap-3 rounded-xl border border-white/[0.08] p-4 sm:grid-cols-2 lg:grid-cols-3">
                <label className="text-xs text-slate-400">Environment
                  <select value={newEnvironment} onChange={(event) => setNewEnvironment(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b0f18] px-3 py-2 text-sm text-slate-100">{['PRODUCTION', 'STAGING', 'DEVELOPMENT'].map((item) => <option key={item}>{item}</option>)}</select>
                </label>
                <label className="text-xs text-slate-400">Release / version
                  <input required maxLength={150} value={release} onChange={(event) => setRelease(event.target.value)} placeholder="v1.4.2" className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b0f18] px-3 py-2 text-sm text-slate-100" />
                </label>
                <label className="text-xs text-slate-400">Status
                  <select value={deployStatus} onChange={(event) => setDeployStatus(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b0f18] px-3 py-2 text-sm text-slate-100">{['PENDING', 'IN_PROGRESS', 'SUCCESS', 'FAILED', 'ROLLED_BACK'].map((item) => <option key={item}>{item}</option>)}</select>
                </label>
                <label className="text-xs text-slate-400">Commit hash (optional)
                  <input value={commitHash} onChange={(event) => setCommitHash(event.target.value)} pattern="[a-fA-F0-9]{7,64}" placeholder="7-64 hexadecimal characters" className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b0f18] px-3 py-2 text-sm text-slate-100" />
                </label>
                <label className="text-xs text-slate-400">Deployment time (optional)
                  <input type="datetime-local" value={deployedAt} onChange={(event) => setDeployedAt(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b0f18] px-3 py-2 text-sm text-slate-100" />
                </label>
                <button disabled={loading} className="self-end rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">Save deployment</button>
              </form>
            )}
            {loading && !result ? <LoadingState label="Loading deployment history…" /> : result?.data.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-left text-sm">
                  <thead className="text-xs text-slate-500"><tr><th className="pb-3 font-medium">Release</th><th className="pb-3 font-medium">Environment</th><th className="pb-3 font-medium">Status</th><th className="pb-3 font-medium">Deployed</th><th className="pb-3 font-medium">Impact</th></tr></thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {result.data.map((deployment) => (
                      <tr key={deployment.id} className={selected?.id === deployment.id ? 'bg-cyan-400/[0.035]' : ''}>
                        <td className="py-4">
                          <button onClick={() => setSelected(deployment)} className="font-medium hover:text-cyan-300">{deployment.release}</button>
                          {deployment.commitHash && <div className="mt-1 font-mono text-[10px] text-slate-500">{deployment.commitHash}</div>}
                        </td>
                        <td className="py-4 text-xs text-slate-400">{deployment.environment}</td>
                        <td className="py-4"><select aria-label={`Status for ${deployment.release}`} value={deployment.status} onChange={(event) => void updateStatus(deployment, event.target.value)} className="rounded-lg border border-white/10 bg-[#0b0f18] px-2 py-1 text-xs">{['PENDING', 'IN_PROGRESS', 'SUCCESS', 'FAILED', 'ROLLED_BACK'].map((item) => <option key={item}>{item}</option>)}</select></td>
                        <td className="py-4 text-xs text-slate-500">{formatDate(deployment.deployedAt)}</td>
                        <td className="py-4"><button onClick={() => void compareImpact(deployment)} className="rounded-lg border border-cyan-300/20 px-3 py-1.5 text-xs text-cyan-200">Compare</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : loading ? <LoadingState label="Loading deployment history…" /> : <EmptyState title="No deployments recorded" description="Record an application release to compare error activity before and after deployment." />}
          </Panel>
          {selected && impact && (
            <Panel title={`Possible impact · ${impact.deployment.release}`} subtitle={impact.interpretation}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-white/[0.06] p-4"><div className="text-xs text-slate-500">Errors before</div><div className="mt-2 text-2xl font-semibold">{impact.before.eventCount}</div></div>
                <div className="rounded-xl border border-white/[0.06] p-4"><div className="text-xs text-slate-500">Errors after</div><div className="mt-2 text-2xl font-semibold">{impact.after.eventCount}</div></div>
                <div className="rounded-xl border border-white/[0.06] p-4"><div className="text-xs text-slate-500">Rate change</div><div className="mt-2 text-2xl font-semibold">{impact.percentageChange === null ? '—' : `${impact.percentageChange}%`}</div></div>
                <div className="rounded-xl border border-white/[0.06] p-4"><div className="text-xs text-slate-500">New fingerprints</div><div className="mt-2 text-2xl font-semibold">{impact.newlyIntroducedFingerprints.length}</div></div>
              </div>
              <p className="mt-4 text-xs text-slate-500">Comparison window: {impact.windowMinutes} minutes · after window {impact.afterWindowStatus}. A post-deployment increase is a correlation signal; it does not establish that the deployment caused the errors.</p>
              {!!impact.newlyIntroducedFingerprints.length && (
                <div className="mt-4 space-y-2">{impact.newlyIntroducedFingerprints.map((item) => <div key={item.fingerprint} className="rounded-lg border border-amber-300/10 p-3 text-sm"><div>{item.title}</div><div className="mt-1 text-xs text-slate-500">{item.eventCount} after-window events · {item.fingerprint.slice(0, 12)}…</div></div>)}</div>
              )}
            </Panel>
          )}
        </>
      )}
    </div>
  );
}

export default function DeploymentsPage() {
  return <WorkspaceShell title="Deployments"><DeploymentsContent /></WorkspaceShell>;
}
