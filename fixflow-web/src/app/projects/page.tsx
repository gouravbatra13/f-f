'use client';

import { FormEvent, useState } from 'react';
import { WorkspaceShell } from '@/components/workspace-shell';
import { useWorkspace } from '@/components/workspace-context';
import { apiFetch } from '@/lib/api';
import {
  EmptyState,
  ErrorState,
  Panel,
} from '@/components/ui';

interface ProjectData {
  id: string;
  organizationId: string;
  name: string;
  identifier: string;
  description?: string | null;
  createdAt?: string;
}

function ProjectsContent() {
  const {
    organization,
    projects,
    project,
    selectProject,
    refreshProjects,
  } = useWorkspace();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!organization) return;
    setBusy(true);
    setError(null);
    try {
      const created = await apiFetch<ProjectData>(
        `organizations/${organization.id}/projects`,
        {
          method: 'POST',
          body: JSON.stringify({ name, description: description || undefined }),
        },
      );
      setName('');
      setDescription('');
      selectProject(created.id);
      await refreshProjects();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to create project');
    } finally {
      setBusy(false);
    }
  };

  const archive = async (item: ProjectData) => {
    if (!window.confirm(`Archive project “${item.name}”?`)) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`projects/${item.id}`, { method: 'DELETE' });
      if (project?.id === item.id) selectProject('');
      await refreshProjects();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to archive project');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {error && <ErrorState message={error} onRetry={() => void refreshProjects()} />}
      <Panel title="Projects" subtitle="Projects are isolated within the selected organization. Select a project to scope dashboard and deployment data.">
        <form onSubmit={createProject} className="mb-6 grid gap-3 rounded-xl border border-white/[0.08] p-4 md:grid-cols-[1fr_1.5fr_auto]">
          <label className="text-xs text-slate-400">Project name
            <input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b0f18] px-3 py-2 text-sm text-slate-100" />
          </label>
          <label className="text-xs text-slate-400">Description
            <input maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b0f18] px-3 py-2 text-sm text-slate-100" />
          </label>
          <button disabled={busy || !organization} className="self-end rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">Create project</button>
        </form>
        {projects.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((item) => (
              <article key={item.id} className={`rounded-xl border p-4 ${project?.id === item.id ? 'border-cyan-400/25 bg-cyan-400/[0.035]' : 'border-white/[0.06]'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-medium">{item.name}</h3>
                    <code className="mt-1 block text-xs text-cyan-300">{item.identifier}</code>
                  </div>
                  {project?.id === item.id && <span className="text-[10px] text-emerald-300">Selected</span>}
                </div>
                <p className="mt-3 min-h-10 text-xs leading-5 text-slate-500">{item.description || 'No description provided.'}</p>
                <div className="mt-4 flex gap-2">
                  <button onClick={() => selectProject(item.id)} className="rounded-lg border border-cyan-300/20 px-3 py-1.5 text-xs text-cyan-200">Select project</button>
                  <button disabled={busy} onClick={() => void archive(item)} className="rounded-lg border border-rose-400/20 px-3 py-1.5 text-xs text-rose-300 disabled:opacity-50">Archive</button>
                </div>
              </article>
            ))}
          </div>
        ) : <EmptyState title="No projects yet" description="Create your first project to start ingesting and grouping application errors." />}
      </Panel>
    </div>
  );
}

export default function ProjectsPage() {
  return <WorkspaceShell title="Projects"><ProjectsContent /></WorkspaceShell>;
}
