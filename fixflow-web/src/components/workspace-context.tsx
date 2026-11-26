'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/components/auth-provider';

export interface OrganizationOption {
  id: string;
  name: string;
  slug: string;
  currentUserRole: string;
}

export interface ProjectOption {
  id: string;
  organizationId: string;
  name: string;
  identifier: string;
  description?: string | null;
}

interface WorkspaceContextValue {
  organizations: OrganizationOption[];
  organization: OrganizationOption | null;
  projects: ProjectOption[];
  project: ProjectOption | null;
  loading: boolean;
  error: string | null;
  selectOrganization: (id: string) => void;
  selectProject: (id: string) => void;
  refresh: () => Promise<void>;
  refreshProjects: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [organizations, setOrganizations] = useState<OrganizationOption[]>([]);
  const [organizationId, setOrganizationId] = useState('');
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectId, setProjectId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setOrganizations([]);
      setProjects([]);
      setOrganizationId('');
      setProjectId('');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result =
        await apiFetch<OrganizationOption[]>('organizations');
      setOrganizations(result);
      setOrganizationId((current) =>
        result.some((item) => item.id === current)
          ? current
          : result[0]?.id ?? '',
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to load organizations',
      );
    } finally {
      setLoading(false);
    }
  }, [user]);

  const refreshProjects = useCallback(async () => {
    if (!organizationId) {
      setProjects([]);
      setProjectId('');
      return;
    }
    setError(null);
    try {
      const result = await apiFetch<ProjectOption[]>(
        `organizations/${organizationId}/projects`,
      );
      setProjects(result);
      setProjectId((current) =>
        result.some((item) => item.id === current) ? current : '',
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to load projects',
      );
      throw requestError;
    }
  }, [organizationId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void refreshProjects().catch(() => {
        if (active) setProjects([]);
      });
    }, 0);
    return () => {
      window.clearTimeout(timer);
      active = false;
    };
  }, [organizationId, refreshProjects]);

  const value = useMemo(
    () => ({
      organizations,
      organization:
        organizations.find((item) => item.id === organizationId) ?? null,
      projects,
      project: projects.find((item) => item.id === projectId) ?? null,
      loading,
      error,
      selectOrganization: (id: string) => {
        setOrganizationId(id);
        setProjectId('');
      },
      selectProject: setProjectId,
      refresh,
      refreshProjects,
    }),
    [
      organizations,
      organizationId,
      projects,
      projectId,
      loading,
      error,
      refresh,
      refreshProjects,
    ],
  );
  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within WorkspaceProvider');
  }
  return context;
}
