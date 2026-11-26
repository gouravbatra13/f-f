'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  CircleAlert,
  CheckCheck,
  MapPin,
  Siren,
} from 'lucide-react';
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiFetch } from '@/lib/api';
import { useWorkspace } from '@/components/workspace-context';
import {
  EmptyState,
  ErrorState,
  formatDate,
  LoadingState,
  Panel,
  StatusBadge,
} from '@/components/ui';

interface DashboardResponse {
  metrics: {
    totalErrorEvents: number;
    unresolvedIssues: number;
    resolvedIssues: number;
    criticalIssues: number;
    openIncidents: number;
    criticalIncidents: number;
    affectedEndpoints: number;
  };
  resolutionTime: {
    averageMinutes: number | null;
    resolvedIssueCount: number;
  };
  incidentTrend: {
    bucket: string;
    incidentCount: number;
    resolvedCount: number;
  }[];
  errorActivity: { bucket: string; eventCount: number }[];
  errorDistribution: { severity: string; eventCount: number }[];
  topEndpoints: { endpoint: string; eventCount: number }[];
  mostFrequentIssues: {
    id: string;
    title: string;
    status: string;
    severity: string;
    eventCount: number;
    lastSeenAt: string;
  }[];
  recentErrorEvents: {
    id: string;
    issueId: string;
    issueTitle: string;
    severity: string;
    environment: string;
    endpoint: string | null;
    occurredAt: string;
    errorMessage: string;
  }[];
  recentIncidentActivity: {
    id: string;
    incidentId: string;
    incidentTitle: string;
    action: string;
    createdAt: string;
  }[];
  recentDeployments: {
    id: string;
    projectId: string;
    environment: string;
    release: string;
    status: string;
    deployedAt: string;
  }[];
}

const colors = ['#fb7185', '#fbbf24', '#38bdf8', '#34d399'];
const rangeOptions = [
  { label: '24 hours', hours: 24 },
  { label: '7 days', hours: 24 * 7 },
  { label: '30 days', hours: 24 * 30 },
];

export function Dashboard({ analyticsOnly = false }: { analyticsOnly?: boolean }) {
  const { organization, project } = useWorkspace();
  const [rangeHours, setRangeHours] = useState(24);
  const [environment, setEnvironment] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (rangeEnd) {
      const endTime = Date.parse(rangeEnd);
      params.set(
        'from',
        new Date(endTime - rangeHours * 60 * 60 * 1000).toISOString(),
      );
      params.set('to', rangeEnd);
    }
    if (project) params.set('projectId', project.id);
    if (environment) params.set('environment', environment);
    return params.toString();
  }, [project, environment, rangeHours, rangeEnd]);

  const load = useCallback(async () => {
    if (!organization) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<DashboardResponse>(
        `organizations/${organization.id}/analytics/dashboard?${query}`,
      );
      setData(result);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to load dashboard data',
      );
    } finally {
      setLoading(false);
    }
  }, [organization, query]);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setRangeEnd(new Date().toISOString()),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [rangeHours]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const metrics = data?.metrics;
  const cards = analyticsOnly
    ? [
        ['Error events', metrics?.totalErrorEvents ?? 0],
        ['Unresolved issues', metrics?.unresolvedIssues ?? 0],
        ['Resolved issues', metrics?.resolvedIssues ?? 0],
        ['Critical issues', metrics?.criticalIssues ?? 0],
        ['Open incidents', metrics?.openIncidents ?? 0],
        ['Critical incidents', metrics?.criticalIncidents ?? 0],
        ['Affected endpoints', metrics?.affectedEndpoints ?? 0],
        [
          'Avg resolution (min)',
          data?.resolutionTime.averageMinutes ?? '—',
        ],
      ]
    : [
        ['Total error events', metrics?.totalErrorEvents ?? 0],
        ['Unresolved issues', metrics?.unresolvedIssues ?? 0],
        ['Critical issues', metrics?.criticalIssues ?? 0],
        ['Open incidents', metrics?.openIncidents ?? 0],
        ['Resolved issues', metrics?.resolvedIssues ?? 0],
        ['Affected endpoints', metrics?.affectedEndpoints ?? 0],
      ];
  const metricIcons: Record<string, typeof Activity> = {
    'Error events': Activity,
    'Total error events': Activity,
    'Unresolved issues': CircleAlert,
    'Resolved issues': CheckCheck,
    'Critical issues': CircleAlert,
    'Open incidents': Siren,
    'Critical incidents': Siren,
    'Affected endpoints': MapPin,
    'Avg resolution (min)': Activity,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-sm text-slate-400">
            {new Intl.DateTimeFormat(undefined, {
              dateStyle: 'full',
            }).format(new Date())}
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-100 md:text-3xl">
            {analyticsOnly ? 'Reliability analytics' : 'Reliability at a glance'}
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Live organization data · {project?.name ?? 'all active projects'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="environment-filter">
            Environment
          </label>
          <select
            id="environment-filter"
            value={environment}
            onChange={(event) => setEnvironment(event.target.value)}
            className="rounded-lg border border-white/10 bg-[#101621] px-3 py-2 text-xs text-slate-300"
          >
            <option value="">All environments</option>
            <option value="production">Production</option>
            <option value="staging">Staging</option>
            <option value="development">Development</option>
          </select>
          <label className="sr-only" htmlFor="date-range">
            Date range
          </label>
          <select
            id="date-range"
            value={rangeHours}
            onChange={(event) => setRangeHours(Number(event.target.value))}
            className="rounded-lg border border-white/10 bg-[#101621] px-3 py-2 text-xs text-slate-300"
          >
            {rangeOptions.map((option) => (
              <option key={option.hours} value={option.hours}>
                Last {option.label}
              </option>
            ))}
          </select>
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-300/[0.05] px-3 py-2 text-xs font-medium text-emerald-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,0.65)]" />
            Live data
          </span>
        </div>
      </div>

      {error && <ErrorState message={error} onRetry={() => void load()} />}
      {loading && !data ? (
        <LoadingState label="Loading organization metrics…" />
      ) : !data ? (
        <EmptyState
          title="No dashboard data"
          description="Select an organization or retry when the API is available."
        />
      ) : (
        <>
          <div className={`grid gap-4 sm:grid-cols-2 ${analyticsOnly ? 'xl:grid-cols-4' : 'xl:grid-cols-3'}`}>
            {cards.map(([label, value]) => (
              <div
                key={label}
            className={`group rounded-2xl border bg-gradient-to-br from-[#141c29] to-[#0e141e] p-5 shadow-[0_1px_0_rgba(255,255,255,0.025)_inset] transition duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/10 ${
              /critical/i.test(String(label))
                ? 'border-rose-300/10 hover:border-rose-300/20'
                : /resolved/i.test(String(label))
                  ? 'border-emerald-300/10 hover:border-emerald-300/20'
                  : 'border-white/[0.07] hover:border-cyan-300/20'
            }`}
              >
                <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-slate-400">{label}</span>
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-colors ${
                  /critical/i.test(String(label))
                    ? 'border-rose-300/10 bg-rose-300/[0.07] text-rose-300'
                    : /resolved/i.test(String(label))
                      ? 'border-emerald-300/10 bg-emerald-300/[0.07] text-emerald-300'
                      : 'border-cyan-300/10 bg-cyan-300/[0.06] text-cyan-200 group-hover:border-cyan-300/20'
                    }`}
                  >
                {(() => {
                  const Icon = metricIcons[String(label)] ?? Activity;
                  return <Icon size={16} strokeWidth={1.8} aria-hidden="true" />;
                })()}
                  </span>
                </div>
            <div className="mt-4 text-[32px] font-semibold tracking-[-0.035em] text-slate-100 tabular-nums">
                  {typeof value === 'number' ? value.toLocaleString() : value}
                </div>
            <div className="mt-2 text-[11px] text-slate-500">
                  {/resolution/i.test(String(label))
                    ? `${data.resolutionTime.resolvedIssueCount} resolved issues in range`
                    : 'In selected time range'}
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
            <Panel
              title="Error activity"
              subtitle="Occurrences grouped by hour or day for the selected range."
            >
              {data.errorActivity.length ? (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.errorActivity}>
                      <CartesianGrid stroke="#ffffff12" vertical={false} />
                      <XAxis
                        dataKey="bucket"
                        tick={{ fill: '#64748b', fontSize: 10 }}
                        tickLine={false}
                        axisLine={false}
                        minTickGap={24}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fill: '#64748b', fontSize: 10 }}
                        tickLine={false}
                        axisLine={false}
                        width={32}
                      />
                      <Tooltip
                        contentStyle={{
                          background: '#101621',
                          border: '1px solid #ffffff18',
                          borderRadius: 12,
                          color: '#e2e8f0',
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="eventCount"
                        name="Error events"
                        stroke="#22d3ee"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState
                  title="No errors in this period"
                  description="The chart will populate when matching error events are received."
                />
              )}
            </Panel>
            <Panel
              title="Severity distribution"
              subtitle="Actual error events in the selected time range."
            >
              {data.errorDistribution.length ? (
                <>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={data.errorDistribution}
                          dataKey="eventCount"
                          nameKey="severity"
                          innerRadius={48}
                          outerRadius={76}
                          paddingAngle={4}
                        >
                          {data.errorDistribution.map((item, index) => (
                            <Cell
                              key={item.severity}
                              fill={colors[index % colors.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            background: '#101621',
                            border: '1px solid #ffffff18',
                            borderRadius: 12,
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2">
                    {data.errorDistribution.map((item, index) => (
                      <div
                        key={item.severity}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="flex items-center gap-2 text-slate-400">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: colors[index % colors.length] }}
                          />
                          {item.severity}
                        </span>
                        <span className="tabular-nums text-slate-200">
                          {item.eventCount}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <EmptyState
                  title="No severity data"
                  description="There are no error events in this range."
                />
              )}
            </Panel>
          </div>

          {analyticsOnly && (
            <Panel
              title="Incident trend"
              subtitle="Incidents created and resolved over the selected range."
            >
              {data.incidentTrend.length ? (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.incidentTrend}>
                      <CartesianGrid stroke="#ffffff12" vertical={false} />
                      <XAxis
                        dataKey="bucket"
                        tick={{ fill: '#64748b', fontSize: 10 }}
                        tickLine={false}
                        axisLine={false}
                        minTickGap={24}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fill: '#64748b', fontSize: 10 }}
                        tickLine={false}
                        axisLine={false}
                        width={32}
                      />
                      <Tooltip
                        contentStyle={{
                          background: '#101621',
                          border: '1px solid #ffffff18',
                          borderRadius: 12,
                          color: '#e2e8f0',
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="incidentCount"
                        name="Created"
                        stroke="#a78bfa"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="resolvedCount"
                        name="Resolved"
                        stroke="#34d399"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState
                  title="No incident trend"
                  description="Incident counts will appear for periods containing incident activity."
                />
              )}
            </Panel>
          )}

          <div className="grid gap-5 xl:grid-cols-2">
            <Panel
              title="Most frequent issues"
              subtitle="Ranked by event count during the selected period."
            >
              {data.mostFrequentIssues.length ? (
                <div className="space-y-3">
                  {data.mostFrequentIssues.map((issue) => (
                    <Link
                      key={issue.id}
                      href={`/issues/${issue.id}`}
                      className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.06] p-3 hover:border-cyan-400/20"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {issue.title}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          Last seen {formatDate(issue.lastSeenAt)}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <StatusBadge value={issue.severity} />
                        <span className="text-sm tabular-nums text-slate-300">
                          {issue.eventCount}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No issues found"
                  description="Grouped issues will appear after error ingestion."
                />
              )}
            </Panel>
            <Panel
              title="Top affected endpoints"
              subtitle="Routes with the most captured errors."
            >
              {data.topEndpoints.length ? (
                <div className="space-y-3">
                  {data.topEndpoints.map((endpoint) => (
                    <div key={endpoint.endpoint} className="space-y-2">
                      <div className="flex justify-between gap-3 text-xs">
                        <code className="truncate text-slate-300">
                          {endpoint.endpoint}
                        </code>
                        <span className="text-slate-500">{endpoint.eventCount}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                        <div
                          className="h-full rounded-full bg-cyan-400"
                          style={{
                            width: `${Math.min(
                              100,
                              (endpoint.eventCount /
                                Math.max(1, data.topEndpoints[0].eventCount)) *
                                100,
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No endpoint data"
                  description="Ingest events with an endpoint field to see distribution."
                />
              )}
            </Panel>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <Panel title="Recent error events">
              {data.recentErrorEvents.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] text-left text-sm">
                    <thead className="text-xs text-slate-500">
                      <tr>
                        <th className="pb-3 font-medium">Issue</th>
                        <th className="pb-3 font-medium">Severity</th>
                        <th className="pb-3 font-medium">Environment</th>
                        <th className="pb-3 font-medium">Occurred</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06]">
                      {data.recentErrorEvents.map((event) => (
                        <tr key={event.id}>
                          <td className="max-w-56 py-3">
                            <Link
                              href={`/issues/${event.issueId}`}
                              className="block truncate font-medium hover:text-cyan-300"
                            >
                              {event.issueTitle || event.errorMessage}
                            </Link>
                            <span className="text-xs text-slate-500">
                              {event.endpoint ?? 'No endpoint'}
                            </span>
                          </td>
                          <td className="py-3">
                            <StatusBadge value={event.severity} />
                          </td>
                          <td className="py-3 text-xs text-slate-400">
                            {event.environment}
                          </td>
                          <td className="py-3 text-xs text-slate-500">
                            {formatDate(event.occurredAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  title="No recent events"
                  description="Error events appear here after your project sends them to the ingestion API."
                />
              )}
            </Panel>
            <Panel title="Recent incident activity">
              {data.recentIncidentActivity.length ? (
                <div className="space-y-3">
                  {data.recentIncidentActivity.map((item) => (
                    <Link
                      key={item.id}
                      href={`/incidents/${item.incidentId}`}
                      className="flex items-start justify-between gap-3 border-b border-white/[0.06] pb-3 last:border-0"
                    >
                      <div>
                        <div className="text-sm font-medium">{item.incidentTitle}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {item.action.replaceAll('_', ' ')}
                        </div>
                      </div>
                      <span className="shrink-0 text-xs text-slate-500">
                        {formatDate(item.createdAt)}
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No incident activity"
                  description="Incident timeline updates will appear here."
                />
              )}
            </Panel>
          </div>

          <Panel title="Recent deployments">
            {data.recentDeployments.length ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {data.recentDeployments.map((deployment) => (
                  <Link
                    key={deployment.id}
                    href={`/deployments?deploymentId=${deployment.id}`}
                    className="rounded-xl border border-white/[0.06] p-4 hover:border-cyan-400/20"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">{deployment.release}</span>
                      <StatusBadge value={deployment.status} />
                    </div>
                    <div className="mt-2 text-xs text-slate-500">
                      {deployment.environment} · {formatDate(deployment.deployedAt)}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No deployments in range"
                description="Deployment records from your selected project or organization will appear here."
              />
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
