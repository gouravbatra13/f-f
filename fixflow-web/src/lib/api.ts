const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api/v1'
).replace(/\/+$/, '');

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface AuthSession {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: AuthUser;
}

let accessToken: string | null = null;
let refreshInFlight: Promise<AuthSession | null> | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

async function refreshSession(): Promise<AuthSession | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });
        if (!response.ok) {
          setAccessToken(null);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('fixflow:auth-expired'));
          }
          return null;
        }
        const session = (await response.json()) as AuthSession;
        setAccessToken(session.accessToken);
        return session;
      } catch (error) {
        setAccessToken(null);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('fixflow:auth-expired'));
        }
        throw error;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

export async function restoreSession(): Promise<AuthSession | null> {
  return refreshSession();
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  options: { skipAuthRefresh?: boolean } = {},
): Promise<T> {
  const normalizedPath = path.replace(/^\/+/, '');
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  let response = await fetch(`${API_BASE_URL}/${normalizedPath}`, {
    ...init,
    headers,
    credentials: init.credentials ?? 'include',
  });

  if (
    response.status === 401 &&
    accessToken &&
    !options.skipAuthRefresh &&
    !normalizedPath.startsWith('auth/')
  ) {
    const refreshed = await refreshSession();
    if (refreshed) {
      headers.set('Authorization', `Bearer ${refreshed.accessToken}`);
      response = await fetch(`${API_BASE_URL}/${normalizedPath}`, {
        ...init,
        headers,
        credentials: init.credentials ?? 'include',
      });
    }
  }

  const responseText = await response.text();
  let payload: unknown = null;
  if (responseText) {
    try {
      payload = JSON.parse(responseText) as unknown;
    } catch {
      throw new ApiClientError('The server returned an invalid response', response.status);
    }
  }

  if (!response.ok) {
    const apiMessage =
      typeof payload === 'object' &&
      payload !== null &&
      'message' in payload &&
      (typeof payload.message === 'string' ||
        (Array.isArray(payload.message) &&
          payload.message.every(
            (item): item is string => typeof item === 'string',
          )))
        ? payload.message
        : undefined;
    const message =
      typeof apiMessage === 'string'
        ? apiMessage
        : apiMessage?.join('; ') ??
          `API request failed with status ${response.status}`;
    throw new ApiClientError(message, response.status);
  }

  return payload as T;
}
