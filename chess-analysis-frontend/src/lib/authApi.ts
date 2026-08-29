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
  admin?: boolean;
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
    // 서버가 사유를 body.code로 내려주면(예: EMAIL_NOT_VERIFIED) 그대로 노출한다.
    // server.error.include-message=never로 message가 지워져도 code는 보존되기 때문.
    const err = new Error(message) as Error & { status: number; code?: string };
    err.status = res.status;
    if (body?.code) err.code = body.code;
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
