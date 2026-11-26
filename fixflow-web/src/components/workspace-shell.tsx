'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity,
  BellRing,
  Bell,
  Box,
  ChartNoAxesCombined,
  CircleAlert,
  ClipboardList,
  LogOut,
  Siren,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { ProtectedPage, useAuth } from '@/components/auth-provider';
import { useWorkspace } from '@/components/workspace-context';

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  readAt: string | null;
  mockEmailStatus: 'simulated';
}

const navigation = [
  { label: 'Overview', href: '/', icon: Activity },
  { label: 'Issues', href: '/issues', icon: CircleAlert },
  { label: 'Incidents', href: '/incidents', icon: Siren },
  { label: 'Deployments', href: '/deployments', icon: Box },
  { label: 'Analytics', href: '/analytics', icon: ChartNoAxesCombined },
  { label: 'Alerts', href: '/alerts', icon: ClipboardList },
];

export function WorkspaceShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <ProtectedPage>
      <ShellFrame title={title}>{children}</ShellFrame>
    </ProtectedPage>
  );
}

function ShellFrame({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const { user, logout } = useAuth();
  const {
    organizations,
    organization,
    projects,
    project,
    loading,
    error,
    selectOrganization,
    selectProject,
    refresh,
  } = useWorkspace();
  const pathname = usePathname();
  const router = useRouter();
  const [unread, setUnread] = useState(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const activeSection =
    navigation.find(({ href }) =>
      href === '/' ? pathname === href : pathname.startsWith(href),
    ) ?? navigation[0];
  const ActiveIcon = activeSection.icon;

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setNotificationError(null);
      if (!organization) {
        setUnread(0);
        setNotifications([]);
        return;
      }
      void Promise.all([
        apiFetch<{ unreadCount: number }>(
          `organizations/${organization.id}/notifications/unread-count`,
        ),
        apiFetch<{ data: NotificationItem[] }>(
          `organizations/${organization.id}/notifications?limit=5`,
        ),
      ])
        .then(([count, result]) => {
          if (!active) return;
          setUnread(count.unreadCount);
          setNotifications(result.data);
        })
        .catch(() => {
          if (active) {
            setUnread(0);
            setNotifications([]);
            setNotificationError('Unable to load notifications');
          }
        });
    }, 0);
    return () => {
      window.clearTimeout(timer);
      active = false;
    };
  }, [organization]);

  const markRead = async (item: NotificationItem) => {
    if (!organization || item.readAt) return;
    setNotificationError(null);
    try {
      await apiFetch(
        `organizations/${organization.id}/notifications/${item.id}/read`,
        { method: 'PATCH' },
      );
      setNotifications((current) =>
        current.map((notification) =>
          notification.id === item.id
            ? { ...notification, readAt: new Date().toISOString() }
            : notification,
        ),
      );
      setUnread((current) => Math.max(0, current - 1));
    } catch (requestError) {
      setNotificationError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to mark notification as read',
      );
    }
  };

  const signOut = async () => {
    setLogoutError(null);
    try {
      await logout();
      router.replace('/login');
    } catch (requestError) {
      setLogoutError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to log out',
      );
    }
  };

  return (
    <main className="min-h-screen bg-[#080b12] text-slate-100">
      <div className="flex min-h-screen">
        <aside className="hidden w-[260px] shrink-0 border-r border-white/[0.07] bg-[#0a0e16]/90 p-5 lg:flex lg:flex-col">
          <Link href="/" className="mb-10 flex items-center gap-3 rounded-xl">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-300 to-cyan-500 font-black text-slate-950 shadow-[0_6px_24px_rgba(34,211,238,0.18)]">
              F
            </div>
            <div>
              <div className="text-[17px] font-bold tracking-tight">
                FixFlow<span className="text-cyan-400"> AI</span>
              </div>
              <div className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">Incident intelligence</div>
            </div>
          </Link>
          <div className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
            Workspace
          </div>
          <nav aria-label="Workspace navigation" className="space-y-1 text-sm">
            {navigation.map(({ label, href, icon: Icon }) => {
              const active =
                pathname === href ||
                (href !== '/' && pathname.startsWith(`${href}/`));
              const activeTone: Record<string, string> = {
                Overview: 'border-cyan-300/15 bg-cyan-300/[0.08] text-cyan-200',
                Issues: 'border-rose-300/15 bg-rose-300/[0.07] text-rose-200',
                Incidents: 'border-violet-300/15 bg-violet-300/[0.07] text-violet-200',
                Deployments: 'border-sky-300/15 bg-sky-300/[0.07] text-sky-200',
                Analytics: 'border-emerald-300/15 bg-emerald-300/[0.07] text-emerald-200',
                Alerts: 'border-amber-300/15 bg-amber-300/[0.07] text-amber-200',
              };
              return (
                <Link
                  key={href}
                  href={href}
                  className={`group flex items-center gap-3 rounded-xl border px-3 py-2.5 transition ${
                    active
                      ? activeTone[label]
                      : 'border-transparent text-slate-400 hover:bg-white/[0.035] hover:text-slate-100'
                  }`}
                >
                  <Icon size={16} strokeWidth={active ? 2.2 : 1.8} />
                  {label}
                </Link>
              );
            })}
          </nav>
          <div className="mb-3 mt-9 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
            Manage
          </div>
          <Link
            href="/projects"
            className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition ${pathname.startsWith('/projects') ? 'border-cyan-300/15 bg-cyan-300/[0.08] text-cyan-200' : 'border-transparent text-slate-400 hover:bg-white/[0.035] hover:text-slate-100'}`}
          >
            <Box size={16} /> Projects
          </Link>
          <div className="mt-auto rounded-2xl border border-cyan-300/10 bg-gradient-to-br from-cyan-300/[0.07] to-transparent p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-cyan-100">
              <BellRing size={14} className="text-cyan-300" />
              AI investigation
            </div>
            <p className="text-xs leading-5 text-slate-400">
              Recommendations are hypotheses based on error evidence, not guaranteed fixes.
            </p>
            <div className="mt-3 text-xs text-cyan-300">Local AI · optional</div>
          </div>
          <div className="mt-5 flex items-center gap-3 border-t border-white/[0.08] pt-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-700 text-sm font-semibold">
              {(user?.name ?? user?.email ?? 'U').slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">
                {user?.name ?? user?.email}
              </div>
              <div className="text-xs text-slate-500">{user?.role}</div>
            </div>
            <button
              onClick={() => void signOut()}
              aria-label="Log out"
              className="rounded-lg p-2 text-slate-500 hover:bg-white/[0.06] hover:text-white"
            >
              <LogOut size={15} />
            </button>
          </div>
          {logoutError && (
            <p className="mt-2 text-xs text-rose-300">{logoutError}</p>
          )}
        </aside>

        <section className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.07] bg-[#080b12]/90 px-5 py-4 backdrop-blur-xl md:px-8">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-300/10 bg-cyan-300/[0.07] text-cyan-200 lg:hidden">
                <ActiveIcon size={18} />
              </div>
              <div>
                <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">
                  FixFlow AI <span className="text-slate-700">/</span> {title}
                </div>
                <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-100 md:text-[26px]">
                  {title}
                </h1>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="organization-filter">
                Organization
              </label>
              <select
                id="organization-filter"
                value={organization?.id ?? ''}
                onChange={(event) => selectOrganization(event.target.value)}
                disabled={loading || organizations.length === 0}
                className="max-w-44 rounded-lg border border-white/10 bg-[#101621] px-3 py-2 text-xs text-slate-200"
              >
                {organizations.length === 0 ? (
                  <option value="">No organizations</option>
                ) : (
                  organizations.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))
                )}
              </select>
              <label className="sr-only" htmlFor="project-filter">
                Project
              </label>
              <select
                id="project-filter"
                value={project?.id ?? ''}
                onChange={(event) => selectProject(event.target.value)}
                disabled={!organization || projects.length === 0}
                className="max-w-44 rounded-lg border border-white/10 bg-[#101621] px-3 py-2 text-xs text-slate-200"
              >
                <option value="">All projects</option>
                {projects.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <div className="relative">
                <button
                  onClick={() => setShowNotifications((show) => !show)}
                  aria-label={`Notifications, ${unread} unread`}
                  className="relative rounded-xl border border-white/[0.09] bg-white/[0.025] p-2.5 text-slate-300 hover:border-cyan-300/20 hover:bg-cyan-300/[0.06] hover:text-cyan-100"
                >
                  <Bell size={16} />
                  {unread > 0 && (
                    <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-rose-400 px-1 text-[10px] text-slate-950">
                      {unread}
                    </span>
                  )}
                </button>
                {showNotifications && (
                  <div className="absolute right-0 top-12 z-30 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-[#111824] p-3 shadow-2xl shadow-black/40">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-semibold">Notifications</span>
                      <span className="text-[10px] text-slate-500">Email is simulated</span>
                    </div>
                    {notificationError && (
                      <p role="alert" className="mb-2 text-xs text-rose-300">
                        {notificationError}
                      </p>
                    )}
                    {notifications.length === 0 ? (
                      <p className="py-5 text-center text-xs text-slate-500">
                        No notifications yet
                      </p>
                    ) : (
                      notifications.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => void markRead(item)}
                          className="block w-full border-t border-white/[0.06] px-1 py-3 text-left hover:bg-white/[0.03]"
                        >
                          <span className="flex items-center justify-between gap-2 text-xs font-medium">
                            {item.title}
                            {!item.readAt && (
                              <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
                            )}
                          </span>
                          <span className="mt-1 block text-xs text-slate-500">
                            {item.message}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <button
                onClick={() => void refresh()}
                className="rounded-xl border border-white/[0.09] bg-white/[0.025] px-3.5 py-2.5 text-xs font-medium text-slate-300 hover:border-white/15 hover:bg-white/[0.06] hover:text-white"
              >
                Refresh
              </button>
            </div>
          </header>

          <div className="flex gap-1 overflow-x-auto border-b border-white/[0.07] px-5 py-2 lg:hidden">
            {navigation.map(({ label, href, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium ${
                  pathname === href
                    ? 'bg-white/[0.06] text-slate-100'
                    : 'text-slate-500 hover:bg-white/[0.03] hover:text-slate-200'
                }`}
              >
                <Icon size={14} />
                {label}
              </Link>
            ))}
          </div>
          <div className="mx-auto max-w-[1600px] space-y-6 p-4 sm:p-5 md:p-8">
            {error && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-4 text-sm text-rose-200">
                <span>{error}</span>
                <button
                  onClick={() => void refresh()}
                  className="rounded-lg border border-rose-300/20 px-3 py-1.5 text-xs"
                >
                  Retry
                </button>
              </div>
            )}
            {organizations.length === 0 && !loading && !error ? (
              <div className="panel-surface rounded-2xl border p-8 text-center">
                <h2 className="text-lg font-semibold">Set up your workspace</h2>
                <p className="mt-2 text-sm text-slate-400">
                  Create an organization before adding projects and monitoring errors.
                </p>
                <CreateOrganization onCreated={() => void refresh()} />
              </div>
            ) : (
              children
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function CreateOrganization({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="mx-auto mt-5 flex max-w-lg flex-col gap-3 sm:flex-row"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setMessage('');
        try {
          await apiFetch('organizations', {
            method: 'POST',
            body: JSON.stringify({ name }),
          });
          setName('');
          onCreated();
        } catch (requestError) {
          setMessage(
            requestError instanceof Error
              ? requestError.message
              : 'Unable to create organization',
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <input
        required
        maxLength={120}
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Organization name"
        className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
      />
      <button
        disabled={busy}
        className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
      >
        {busy ? 'Creating…' : 'Create organization'}
      </button>
      {message && <p className="text-xs text-rose-300">{message}</p>}
    </form>
  );
}
