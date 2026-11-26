import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { Dashboard } from './dashboard';
import { apiFetch, setAccessToken, restoreSession } from '@/lib/api';
import { AuthProvider } from './auth-provider';
import { WorkspaceProvider } from './workspace-context';

const mockApiFetch = vi.mocked(apiFetch);
const mockSetAccessToken = vi.mocked(setAccessToken);
const mockRestoreSession = vi.mocked(restoreSession);

const mockOrganizations = [
  { id: 'org-1', name: 'Test Org', slug: 'test-org', currentUserRole: 'owner' },
];

const mockDashboardData = {
  metrics: {
    totalErrorEvents: 42,
    unresolvedIssues: 17,
    resolvedIssues: 9,
    criticalIssues: 4,
    openIncidents: 2,
    criticalIncidents: 1,
    affectedEndpoints: 6,
  },
  resolutionTime: { averageMinutes: 120, resolvedIssueCount: 9 },
  incidentTrend: [
    { bucket: '2026-01-01', incidentCount: 1, resolvedCount: 0 },
  ],
  errorActivity: [
    { bucket: '2026-01-01 10:00:00', eventCount: 5 },
  ],
  errorDistribution: [
    { severity: 'critical', eventCount: 4 },
    { severity: 'error', eventCount: 5 },
    { severity: 'warning', eventCount: 3 },
  ],
  topEndpoints: [
    { endpoint: '/api/checkout', eventCount: 5 },
    { endpoint: '/api/login', eventCount: 3 },
  ],
  mostFrequentIssues: [
    {
      id: 'issue-1',
      title: 'Database timeout',
      status: 'open',
      severity: 'critical',
      eventCount: 5,
      lastSeenAt: '2026-01-01T10:00:00Z',
    },
  ],
  recentErrorEvents: [
    {
      id: 'event-1',
      issueId: 'issue-1',
      issueTitle: 'Database timeout',
      severity: 'critical',
      environment: 'production',
      endpoint: '/api/orders',
      occurredAt: '2026-01-01T10:00:00Z',
      errorMessage: 'Connection timed out',
    },
  ],
  recentIncidentActivity: [],
  recentDeployments: [],
};

function setupDashboardApiMock(
  dashboardHandler: () => Promise<unknown> = async () => mockDashboardData,
  organizations: typeof mockOrganizations = mockOrganizations,
) {
  mockApiFetch.mockImplementation(async (path: string) => {
    if (path === 'organizations') return organizations;
    if (path === 'organizations/org-1/projects') return [];
    if (path.startsWith('organizations/org-1/analytics/dashboard')) {
      return dashboardHandler();
    }
    return [];
  });
}

function renderDashboard() {
  return render(
    <AuthProvider>
      <WorkspaceProvider>
        <Dashboard analyticsOnly={false} />
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

  setupDashboardApiMock();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Dashboard', () => {
  describe('rendering', () => {
    it('renders dashboard panels with metrics when data loads', async () => {
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Total error events')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Error activity' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Severity distribution' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Recent error events' })).toBeInTheDocument();
      });
    });

    it('shows loading state while fetching data', async () => {
      let resolveDashboard!: (value: unknown) => void;
      setupDashboardApiMock(
        () =>
          new Promise((resolve) => {
            resolveDashboard = resolve;
          }),
      );

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Loading organization metrics…')).toBeInTheDocument();
      });

      resolveDashboard(mockDashboardData);

      await waitFor(() => {
        expect(screen.queryByText('Loading organization metrics…')).not.toBeInTheDocument();
      });
      expect(screen.getByText('Total error events')).toBeInTheDocument();
    });

    it('shows error state when API fails', async () => {
      setupDashboardApiMock(() => Promise.reject(new Error('Failed to load dashboard')));

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Failed to load dashboard')).toBeInTheDocument();
      });
    });
  });

  describe('data rendering', () => {
    it('displays error metrics cards', async () => {
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('42')).toBeInTheDocument();
        expect(screen.getByText('17')).toBeInTheDocument();
        expect(screen.getByText('9')).toBeInTheDocument();
      });
    });

    it('displays error distribution chart data', async () => {
      renderDashboard();

      const severityHeading = await screen.findByRole('heading', {
        name: 'Severity distribution',
      });
      const severityPanel = severityHeading.closest('section');
      expect(severityPanel).not.toBeNull();

      await waitFor(() => {
        expect(within(severityPanel as HTMLElement).getByText('critical')).toBeInTheDocument();
        expect(within(severityPanel as HTMLElement).getByText('error')).toBeInTheDocument();
        expect(within(severityPanel as HTMLElement).getByText('warning')).toBeInTheDocument();
      });
    });

    it('displays top endpoints', async () => {
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('/api/checkout')).toBeInTheDocument();
        expect(screen.getByText('/api/login')).toBeInTheDocument();
      });
    });

    it('displays recent error events table', async () => {
      renderDashboard();

      const recentHeading = await screen.findByRole('heading', {
        name: 'Recent error events',
      });
      const recentPanel = recentHeading.closest('section');
      expect(recentPanel).not.toBeNull();

      await waitFor(() => {
        expect(within(recentPanel as HTMLElement).getByText('Database timeout')).toBeInTheDocument();
        expect(within(recentPanel as HTMLElement).getByText('/api/orders')).toBeInTheDocument();
      });
    });
  });

  describe('empty states', () => {
    it('shows empty state when no error events', async () => {
      setupDashboardApiMock(async () => ({
        ...mockDashboardData,
        recentErrorEvents: [],
      }));

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('No recent events')).toBeInTheDocument();
      });
    });

    it('shows no-organization empty state when no organizations exist', async () => {
      setupDashboardApiMock(async () => mockDashboardData, []);

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('No dashboard data')).toBeInTheDocument();
      });
      expect(
        screen.getByText('Select an organization or retry when the API is available.'),
      ).toBeInTheDocument();
    });
  });
});