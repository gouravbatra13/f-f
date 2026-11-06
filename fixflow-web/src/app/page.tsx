
const issues = [
  {
    title: 'OrderService: Failed to create order',
    endpoint: 'POST /api/v1/orders',
    type: 'Internal Server Error',
    count: 128,
    level: 'Critical',
    time: '2 min ago',
  },
  {
    title: 'Database connection timeout',
    endpoint: 'GET /api/v1/products',
    type: 'Connection Timeout',
    count: 76,
    level: 'High',
    time: '8 min ago',
  },
  {
    title: 'Invalid user session token',
    endpoint: 'POST /api/v1/auth/refresh',
    type: 'Unauthorized',
    count: 43,
    level: 'Medium',
    time: '15 min ago',
  },
  {
    title: 'Payment gateway request failed',
    endpoint: 'POST /api/v1/payments',
    type: 'External Service Error',
    count: 19,
    level: 'High',
    time: '24 min ago',
  },
];

const metrics = [
  { label: 'Total error events', value: '1,284', change: '+12.8%', icon: '↗' },
  { label: 'Unresolved issues', value: '24', change: '6 critical', icon: '!' },
  { label: 'Affected endpoints', value: '18', change: '+3 today', icon: '⌘' },
  { label: 'Resolved this week', value: '96', change: '+18.4%', icon: '✓' },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#080b12] text-slate-100">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 border-r border-white/[0.08] bg-[#0b0f18] p-5 lg:flex lg:flex-col">
          <a href="#" className="mb-10 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400 font-black text-slate-950">
              F
            </div>
            <div>
              <div className="text-lg font-bold tracking-tight">FixFlow<span className="text-cyan-400"> AI</span></div>
              <div className="text-xs text-slate-500">Incident Intelligence</div>
            </div>
          </a>

          <div className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
            Workspace
          </div>

          <nav className="space-y-1 text-sm">
            {[
              ['▦', 'Overview', true],
              ['◉', 'Issues', false],
              ['◷', 'Incidents', false],
              ['⇧', 'Deployments', false],
              ['⌁', 'Alerts', false],
            ].map(([icon, label, active]) => (
              <a
                key={label as string}
                href="#"
                className={`flex items-center gap-3 rounded-xl px-3 py-3 transition ${
                  active
                    ? 'border border-cyan-400/20 bg-cyan-400/10 text-cyan-300'
                    : 'text-slate-400 hover:bg-white/[0.04] hover:text-white'
                }`}
              >
                <span className="text-base">{icon}</span>
                {label}
                {label === 'Issues' && (
                  <span className="ml-auto rounded-md bg-white/[0.07] px-2 py-0.5 text-xs">24</span>
                )}
              </a>
            ))}
          </nav>

          <div className="mb-3 mt-9 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
            Manage
          </div>

          <nav className="space-y-1 text-sm">
            {['Projects', 'Team members', 'Settings'].map((label) => (
              <a
                key={label}
                href="#"
                className="flex items-center gap-3 rounded-xl px-3 py-3 text-slate-400 transition hover:bg-white/[0.04] hover:text-white"
              >
                <span className="text-slate-500">◇</span>
                {label}
              </a>
            ))}
          </nav>

          <div className="mt-auto rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.05] p-4">
            <div className="mb-2 text-sm font-semibold text-cyan-200">AI investigation</div>
            <p className="text-xs leading-5 text-slate-400">
              Find likely root causes using error evidence and previous incidents.
            </p>
            <div className="mt-3 text-xs text-cyan-300">Coming soon →</div>
          </div>

          <div className="mt-5 flex items-center gap-3 border-t border-white/[0.08] pt-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-700 text-sm font-semibold">
              GB
            </div>
            <div>
              <div className="text-sm font-medium">Workspace owner</div>
              <div className="text-xs text-slate-500">Developer account</div>
            </div>
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] px-5 py-4 md:px-8">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-400 font-black text-slate-950 lg:hidden">
                F
              </div>
              <div>
                <div className="text-sm text-slate-500">Workspace / Overview</div>
                <h1 className="mt-1 text-xl font-semibold tracking-tight md:text-2xl">System overview</h1>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-400 sm:block">
                ◉ Production
              </div>
              <button className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-300 hover:bg-white/[0.08]">
                Last 24 hours⌄
              </button>
              <button className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300">
                + New project
              </button>
            </div>
          </header>

          <div className="mx-auto max-w-[1600px] space-y-7 p-5 md:p-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-sm text-slate-400">Saturday, October 31, 2026</div>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">
                  Good afternoon, <span className="text-cyan-300">Developer</span>
                </h2>
                <p className="mt-2 text-sm text-slate-400">
                  Here is what is happening across your applications.
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-2 text-xs text-emerald-300">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                Demo dashboard
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {metrics.map((metric, index) => (
                <div key={metric.label} className="rounded-2xl border border-white/[0.08] bg-[#101621] p-5 transition hover:border-cyan-400/20">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-400">{metric.label}</span>
                    <span className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm ${
                      index === 1
                        ? 'bg-rose-400/10 text-rose-300'
                        : 'bg-cyan-400/10 text-cyan-300'
                    }`}>
                      {metric.icon}
                    </span>
                  </div>
                  <div className="mt-4 text-3xl font-semibold tracking-tight">{metric.value}</div>
                  <div className={`mt-2 text-xs ${index === 1 ? 'text-rose-300' : 'text-emerald-300'}`}>
                    {metric.change}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
              <div className="rounded-2xl border border-white/[0.08] bg-[#101621] p-5 md:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">Error activity</h3>
                    <p className="mt-1 text-xs text-slate-500">Illustrative activity over the last 24 hours</p>
                  </div>
                  <span className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-400">
                    All services⌄
                  </span>
                </div>

                <div className="mt-8 flex h-48 items-end gap-1.5 sm:gap-3">
                  {[22, 29, 25, 38, 32, 28, 43, 35, 51, 42, 36, 59, 46, 39, 67, 49, 57, 43, 72, 61, 53, 84, 68, 91].map((height, index) => (
                    <div key={index} className="group relative flex h-full flex-1 items-end">
                      <div
                        className={`w-full rounded-t-sm transition hover:opacity-100 ${
                          index > 19 ? 'bg-rose-400/80' : 'bg-cyan-400/60'
                        }`}
                        style={{ height: `${height}%` }}
                        title={`Illustrative activity: ${height}`}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex justify-between border-t border-white/[0.06] pt-3 text-[11px] text-slate-500">
                  <span>24 hours ago</span>
                  <span>18 hours ago</span>
                  <span>12 hours ago</span>
                  <span>6 hours ago</span>
                  <span>Now</span>
                </div>
                <div className="mt-4 flex items-center gap-5 text-xs text-slate-400">
                  <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-cyan-400" />Normal activity</span>
                  <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-rose-400" />Elevated activity</span>
                </div>
              </div>

              <div className="rounded-2xl border border-rose-400/15 bg-[#101621] p-5 md:p-6">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Attention required</h3>
                  <span className="rounded-md bg-rose-400/10 px-2 py-1 text-xs text-rose-300">3 alerts</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">Sample alerts for the dashboard preview</p>

                <div className="mt-5 space-y-4">
                  {[
                    ['Critical', 'Order creation failures', 'Error count increased significantly'],
                    ['High', 'Database response delays', 'Connection timeout detected'],
                    ['High', 'Payment API failures', 'External service errors reported'],
                  ].map(([level, title, description]) => (
                    <div key={title} className="flex gap-3 border-b border-white/[0.06] pb-4 last:border-0 last:pb-0">
                      <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${level === 'Critical' ? 'bg-rose-400' : 'bg-amber-300'}`} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{title}</div>
                        <div className="mt-1 text-xs leading-5 text-slate-500">{description}</div>
                      </div>
                      <span className={`text-[10px] ${level === 'Critical' ? 'text-rose-300' : 'text-amber-300'}`}>{level}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#101621]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] p-5 md:px-6">
                <div>
                  <h3 className="font-semibold">Recent issues</h3>
                  <p className="mt-1 text-xs text-slate-500">Example errors grouped by type and endpoint</p>
                </div>
                <button className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/[0.04]">
                  View all issues →
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-white/[0.02] text-xs text-slate-500">
                    <tr>
                      <th className="px-6 py-4 font-medium">Issue</th>
                      <th className="px-4 py-4 font-medium">Severity</th>
                      <th className="px-4 py-4 font-medium">Events</th>
                      <th className="px-4 py-4 font-medium">Last seen</th>
                      <th className="px-6 py-4 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {issues.map((issue) => (
                      <tr key={issue.title} className="transition hover:bg-white/[0.025]">
                        <td className="px-6 py-4">
                          <div className="font-medium text-slate-200">{issue.title}</div>
                          <div className="mt-1 text-xs text-slate-500">{issue.endpoint}</div>
                        </td>
                        <td className="px-4 py-4">
                          <span className={`rounded-md px-2 py-1 text-xs ${
                            issue.level === 'Critical'
                              ? 'bg-rose-400/10 text-rose-300'
                              : issue.level === 'High'
                                ? 'bg-amber-400/10 text-amber-300'
                                : 'bg-sky-400/10 text-sky-300'
                          }`}>
                            {issue.level}
                          </span>
                        </td>
                        <td className="px-4 py-4 tabular-nums text-slate-300">{issue.count}</td>
                        <td className="px-4 py-4 text-xs text-slate-400">{issue.time}</td>
                        <td className="px-6 py-4">
                          <span className="flex items-center gap-2 text-xs text-amber-300">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
                            Unresolved
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-white/[0.06] px-6 py-3 text-xs text-slate-500">
                Sample data only · No production services connected
              </div>
            </div>

            <footer className="flex flex-wrap justify-between gap-2 pb-4 text-xs text-slate-600">
              <span>FixFlow AI · Software Reliability Platform</span>
              <span>Dashboard preview · API integration pending</span>
            </footer>
          </div>
        </section>
      </div>
    </main>
  );
}