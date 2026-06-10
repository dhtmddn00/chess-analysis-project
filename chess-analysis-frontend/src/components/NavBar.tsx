'use client';

import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { LogIn, LogOut, User, UserX, ChevronDown, BarChart2, ArrowLeftRight, Search } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { LanguageSwitcher } from './LanguageSwitcher';

export function NavBar() {
  const t = useTranslations('Nav');
  const tAuth = useTranslations('Auth');
  const router = useRouter();
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await logout();
    setMenuOpen(false);
    router.push('/');
  };

  const handleWithdraw = async () => {
    if (!window.confirm(tAuth('withdrawConfirm'))) return;
    await fetch('/api/v1/auth/me', { method: 'DELETE', credentials: 'include' }).catch(() => {});
    await logout();
    setMenuOpen(false);
    router.push('/');
  };

  return (
    <nav className="sticky top-0 z-40 border-b border-zinc-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-bold text-zinc-900">
            ♟ ChessLab
          </Link>

          {/* Page links */}
          <div className="hidden sm:flex items-center gap-1">
            <Link
              href="/history"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
            >
              <BarChart2 className="h-3.5 w-3.5" />
              {t('history')}
            </Link>
            <Link
              href="/compare"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
              {t('compare')}
            </Link>
            <Link
              href="/analyze"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
            >
              <Search className="h-3.5 w-3.5" />
              {t('analyzeScreen')}
            </Link>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <LanguageSwitcher />

          {!isLoading && (
            isAuthenticated && user ? (
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                >
                  <User className="h-4 w-4 text-zinc-500" />
                  <span className="max-w-[120px] truncate">{user.name}</span>
                  <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
                </button>

                {menuOpen && (
                  <div className="absolute right-0 mt-1 w-48 rounded-xl border border-zinc-200 bg-white py-1 shadow-lg">
                    <div className="border-b border-zinc-100 px-4 py-2">
                      <p className="truncate text-xs font-semibold text-zinc-900">{user.name}</p>
                      <p className="truncate text-xs text-zinc-400">{user.email}</p>
                    </div>
                    <button
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
                    >
                      <LogOut className="h-4 w-4" />
                      {tAuth('logout')}
                    </button>
                    <button
                      onClick={handleWithdraw}
                      className="flex w-full items-center gap-2 border-t border-zinc-100 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      <UserX className="h-4 w-4" />
                      {tAuth('withdraw')}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link
                href="/auth/login"
                className="flex items-center gap-1.5 rounded-lg bg-zinc-950 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-800"
              >
                <LogIn className="h-4 w-4" />
                {tAuth('login')}
              </Link>
            )
          )}
        </div>
      </div>
    </nav>
  );
}

