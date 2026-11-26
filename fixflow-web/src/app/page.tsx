import { Dashboard } from '@/components/dashboard';
import { WorkspaceShell } from '@/components/workspace-shell';

export default function Home() {
  return (
    <WorkspaceShell title="System overview">
      <Dashboard />
    </WorkspaceShell>
  );
}
