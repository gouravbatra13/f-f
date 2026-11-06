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

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const normalizedPath = path.replace(/^\/+/, '');
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE_URL}/${normalizedPath}`, {
    ...init,
    headers,
    credentials: init.credentials ?? 'include',
  });
  const payload: unknown = await response.json();

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
