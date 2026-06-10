const BASE = '/api/v1/auth';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  country?: string;
  chessComUsername?: string;
  lichessUsername?: string;
  subscriptionTier: 'free' | 'premium';
  createdAt: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = body?.detail || body?.message || res.statusText;
    const err = new Error(message) as Error & { status: number };
    err.status = res.status;
    throw err;
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const authApi = {
  login: (email: string, password: string) =>
    request<AuthUser>('/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  logout: () =>
    request<void>('/logout', { method: 'POST' }),

  me: () =>
    request<AuthUser>('/me'),
};
