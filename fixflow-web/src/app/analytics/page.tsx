import { Dashboard } from '@/components/dashboard';
import { WorkspaceShell } from '@/components/workspace-shell';

export default function AnalyticsPage() {
  return (
    <WorkspaceShell title="Analytics">
      <Dashboard analyticsOnly />
    </WorkspaceShell>
  );
}
