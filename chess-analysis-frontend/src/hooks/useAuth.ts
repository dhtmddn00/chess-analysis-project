'use client';

import useSWR, { mutate as globalMutate } from 'swr';
import { authApi, AuthUser } from '@/lib/authApi';

const ME_KEY = '/api/v1/auth/me';

export function useAuth() {
  const { data: user, isLoading, error } = useSWR<AuthUser | null>(
    ME_KEY,
    () => authApi.me().catch((e) => {
      if (e.status === 401) return null;
      throw e;
    }),
    { revalidateOnFocus: false }
  );

  const login = async (email: string, password: string) => {
    const u = await authApi.login(email, password);
    await globalMutate(ME_KEY, u, false);
    return u;
  };

  const logout = async () => {
    await authApi.logout();
    await globalMutate(ME_KEY, null, false);
  };

  return {
    user: user ?? null,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
  };
}
