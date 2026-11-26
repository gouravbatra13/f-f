'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { ApiClientError } from '@/lib/api';

export default function LoginPage() {
  const { user, loading, login, register, sessionError } = useAuth();
  const router = useRouter();
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!loading && user) router.replace('/');
  }, [loading, user, router]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (isRegister) await register(name, email, password);
      else await login(email, password);
      router.replace('/');
    } catch (requestError) {
      setError(
        requestError instanceof ApiClientError
          ? requestError.message
          : 'Unable to authenticate. Check your connection and try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#080b12] px-5 py-10 text-slate-100">
      <section className="w-full max-w-md rounded-3xl border border-white/[0.08] bg-[#101621] p-7 shadow-2xl sm:p-9">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400 font-black text-slate-950">
            F
          </div>
          <div className="text-lg font-bold">
            FixFlow<span className="text-cyan-400"> AI</span>
          </div>
        </Link>
        <h1 className="mt-8 text-2xl font-semibold">
          {isRegister ? 'Create your account' : 'Welcome back'}
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Secure access to your reliability workspace.
        </p>
        <form onSubmit={submit} className="mt-7 space-y-4">
          {isRegister && (
            <label className="block text-sm text-slate-300">
              Name
              <input
                required
                minLength={1}
                maxLength={120}
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm outline-none focus:border-cyan-300/50"
              />
            </label>
          )}
          <label className="block text-sm text-slate-300">
            Email
            <input
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm outline-none focus:border-cyan-300/50"
            />
          </label>
          <label className="block text-sm text-slate-300">
            Password
            <input
              required
              type="password"
              minLength={12}
              maxLength={128}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm outline-none focus:border-cyan-300/50"
            />
            {isRegister && (
              <span className="mt-1 block text-xs text-slate-500">
                Use at least 12 characters.
              </span>
            )}
          </label>
          {(error || sessionError) && (
            <p role="alert" className="rounded-lg bg-rose-400/10 p-3 text-sm text-rose-200">
              {error || sessionError}
            </p>
          )}
          <button
            disabled={busy}
            className="w-full rounded-xl bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-50"
          >
            {busy
              ? 'Please wait…'
              : isRegister
                ? 'Create account'
                : 'Sign in'}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-500">
          {isRegister ? 'Already have an account?' : 'New to FixFlow AI?'}{' '}
          <button
            onClick={() => {
              setIsRegister((value) => !value);
              setError('');
            }}
            className="font-medium text-cyan-300 hover:text-cyan-200"
          >
            {isRegister ? 'Sign in' : 'Create account'}
          </button>
        </p>
        <p className="mt-5 text-center text-xs leading-5 text-slate-600">
          Refresh credentials are held in a secure HttpOnly cookie. Access tokens stay in memory.
        </p>
      </section>
    </main>
  );
}
