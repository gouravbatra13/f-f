import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { WorkspaceShell } from './workspace-shell';
import { AuthProvider } from './auth-provider';
import { WorkspaceProvider } from './workspace-context';
import { apiFetch, setAccessToken, restoreSession } from '@/lib/api';

const mockApiFetch = vi.mocked(apiFetch);
const mockSetAccessToken = vi.mocked(setAccessToken);
const mockRestoreSession = vi.mocked(restoreSession);
const mockUseRouter = vi.mocked(useRouter);

const mockOrganizations = [
  { id: 'org-1', name: 'Org One', slug: 'org-one', currentUserRole: 'owner' },
  { id: 'org-2', name: 'Org Two', slug: 'org-two', currentUserRole: 'developer' },
];

const mockProjectsByOrg: Record<
  string,
  { id: string; organizationId: string; name: string; identifier: string; description: null }[]
> = {
  'org-1': [
    { id: 'proj-1', organizationId: 'org-1', name: 'Project One', identifier: 'prj_one', description: null },
  ],
  'org-2': [
    { id: 'proj-2', organizationId: 'org-2', name: 'Project Two', identifier: 'prj_two', description: null },
  ],
};

function setupDefaultApiMock(options?: {
  organizations?: typeof mockOrganizations;
  unreadCount?: number;
  notifications?: {
    id: string;
    title: string;
    message: string;
    createdAt: string;
    readAt: string | null;
    mockEmailStatus: 'simulated';
  }[];
}) {
  const orgs = options?.organizations ?? mockOrganizations;
  const unreadCount = options?.unreadCount ?? 0;
  const notifications = options?.notifications ?? [];

  mockApiFetch.mockImplementation(async (path: string) => {
    if (path === 'organizations') return orgs;
    if (path === 'organizations/org-1/projects') return mockProjectsByOrg['org-1'];
    if (path === 'organizations/org-2/projects') return mockProjectsByOrg['org-2'];
    if (path.endsWith('/notifications/unread-count')) return { unreadCount };
    if (path.includes('/notifications?limit=5')) return { data: notifications };
    if (path.endsWith('/read')) return { ok: true };
    if (path === 'auth/logout') return undefined;
    return [];
  });
}

function renderShell(children: React.ReactNode) {
  return render(
    <AuthProvider>
      <WorkspaceProvider>
        <WorkspaceShell title="Test Page">{children}</WorkspaceShell>
      </WorkspaceProvider>
    </AuthProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSetAccessToken.mockClear();
  mockRestoreSession.mockClear();
  mockApiFetch.mockClear();

  mockRestoreSession.mockResolvedValue({
    accessToken: 'test-token',
    tokenType: 'Bearer',
    expiresIn: 900,
    user: { id: 'user-1', email: 'test@example.com', name: 'Test User', role: 'developer' },
  });

  setupDefaultApiMock();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('WorkspaceShell', () => {
  describe('navigation', () => {
    it('renders all navigation links', async () => {
      renderShell(<div>Test content</div>);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Test Page' })).toBeInTheDocument();
      });

      const nav = screen.getByRole('navigation', { name: 'Workspace navigation' });
      expect(within(nav).getByText('Overview')).toBeInTheDocument();
      expect(within(nav).getByText('Issues')).toBeInTheDocument();
      expect(within(nav).getByText('Incidents')).toBeInTheDocument();
      expect(within(nav).getByText('Deployments')).toBeInTheDocument();
      expect(within(nav).getByText('Analytics')).toBeInTheDocument();
      expect(within(nav).getByText('Alerts')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Projects' })).toBeInTheDocument();
    });

    it('renders title in header', async () => {
      renderShell(<div>Test content</div>);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Test Page' })).toBeInTheDocument();
      });
    });
  });

  describe('workspace states', () => {
    it('renders children when organizations are loaded', async () => {
      renderShell(<div>Dashboard content</div>);

      await waitFor(() => {
        expect(screen.getByText('Dashboard content')).toBeInTheDocument();
      });
    });

    it('allows switching organization and project filters', async () => {
      renderShell(<div>Dashboard content</div>);

      const orgSelect = await screen.findByLabelText('Organization');
      await waitFor(() => {
        expect(orgSelect).toHaveValue('org-1');
      });

      const projectSelect = screen.getByLabelText('Project');
      await waitFor(() => {
        expect(within(projectSelect).getByText('Project One')).toBeInTheDocument();
      });

      fireEvent.change(projectSelect, { target: { value: 'proj-1' } });
      expect(projectSelect).toHaveValue('proj-1');

      fireEvent.change(orgSelect, { target: { value: 'org-2' } });
      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith('organizations/org-2/projects');
      });
      await waitFor(() => {
        expect(within(projectSelect).getByText('Project Two')).toBeInTheDocument();
      });
      expect(projectSelect).toHaveValue('');
    });

    it('renders empty organization setup state when user has no organizations', async () => {
      setupDefaultApiMock({ organizations: [] });

      renderShell(<div>Dashboard content</div>);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Set up your workspace' })).toBeInTheDocument();
      });

      expect(screen.queryByText('Dashboard content')).not.toBeInTheDocument();
      expect(screen.getByPlaceholderText('Organization name')).toBeInTheDocument();
    });
  });

  describe('authenticated user and logout', () => {
    it('displays current user and signs out on logout click', async () => {
      const replace = vi.fn();
      mockUseRouter.mockReturnValue({
        push: vi.fn(),
        replace,
        back: vi.fn(),
        prefetch: vi.fn(),
      } as unknown as ReturnType<typeof useRouter>);

      renderShell(<div>Dashboard content</div>);

      await waitFor(() => {
        expect(screen.getByText('Test User')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Log out' }));

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith('auth/logout', { method: 'POST' });
      });
      await waitFor(() => {
        expect(replace).toHaveBeenCalledWith('/login');
      });
    });
  });

  describe('notifications', () => {
    it('loads notifications when organization is selected and marks them read', async () => {
      setupDefaultApiMock({
        unreadCount: 1,
        notifications: [
          {
            id: 'notif-1',
            title: 'Critical error detected',
            message: 'Checkout failed in production',
            createdAt: '2026-11-20T10:00:00.000Z',
            readAt: null,
            mockEmailStatus: 'simulated',
          },
        ],
      });

      renderShell(<div>Test content</div>);

      const bellButton = await screen.findByRole('button', {
        name: 'Notifications, 1 unread',
      });
      expect(bellButton).toBeInTheDocument();

      fireEvent.click(bellButton);
      expect(screen.getByText('Critical error detected')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Critical error detected'));

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith(
          'organizations/org-1/notifications/notif-1/read',
          { method: 'PATCH' },
        );
      });
      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: 'Notifications, 0 unread' }),
        ).toBeInTheDocument();
      });
    });
  });
});