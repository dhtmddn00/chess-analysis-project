'use client';

import { FormEvent, useEffect, useRef, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/hooks/useAuth';
import { MessageSquare, Send, PenLine, X, Loader2 } from 'lucide-react';

interface Post {
  id: number;
  author_name: string;
  title: string;
  preview: string;
  content?: string;
  created_at: string;
}

interface ChatMsg {
  id: number;
  author_name: string;
  content: string;
  created_at: string;
}

const CHAT_POLL_MS = 5000;

export default function CommunityPage() {
  const t = useTranslations('Community');
  const { user, isAuthenticated } = useAuth();

  // ── 게시판 상태 ─────────────────────────────────────────────────────────
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [openPost, setOpenPost] = useState<Post | null>(null);
  const [writing, setWriting] = useState(false);
  const [draft, setDraft] = useState({ title: '', content: '' });
  const [posting, setPosting] = useState(false);

  // ── 채팅 상태 ───────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const lastIdRef = useRef(0);
  const chatBoxRef = useRef<HTMLDivElement>(null);

  const loadPosts = useCallback(() => {
    fetch('/api/v1/community/posts')
      .then(r => (r.ok ? r.json() : []))
      .then(setPosts)
      .catch(() => setPosts([]));
  }, []);

  useEffect(loadPosts, [loadPosts]);

  // 채팅 폴링 — 첫 로드는 최근 50개, 이후 증분
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetch(`/api/v1/chat/messages?afterId=${lastIdRef.current}`);
        if (!res.ok || !alive) return;
        const rows: ChatMsg[] = await res.json();
        if (rows.length > 0) {
          lastIdRef.current = rows[rows.length - 1].id;
          setMessages(prev => [...prev, ...rows].slice(-200));
        }
      } catch { /* 폴링 실패는 조용히 무시 */ }
    };
    poll();
    const timer = setInterval(poll, CHAT_POLL_MS);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  // 새 메시지 시 채팅창 맨 아래로
  useEffect(() => {
    chatBoxRef.current?.scrollTo({ top: chatBoxRef.current.scrollHeight });
  }, [messages]);

  const submitPost = async (e: FormEvent) => {
    e.preventDefault();
    if (posting) return;
    setPosting(true);
    try {
      const res = await fetch('/api/v1/community/posts', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      if (res.ok) {
        setDraft({ title: '', content: '' });
        setWriting(false);
        loadPosts();
      }
    } finally {
      setPosting(false);
    }
  };

  const viewPost = async (id: number) => {
    const res = await fetch(`/api/v1/community/posts/${id}`);
    if (res.ok) setOpenPost(await res.json());
  };

  const sendChat = async (e: FormEvent) => {
    e.preventDefault();
    const content = chatInput.trim();
    if (!content) return;
    setChatInput('');
    await fetch('/api/v1/chat/messages', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    }).catch(() => {});
    // 즉시 폴링해 본인 메시지 반영
    const res = await fetch(`/api/v1/chat/messages?afterId=${lastIdRef.current}`).catch(() => null);
    if (res?.ok) {
      const rows: ChatMsg[] = await res.json();
      if (rows.length > 0) {
        lastIdRef.current = rows[rows.length - 1].id;
        setMessages(prev => [...prev, ...rows].slice(-200));
      }
    }
  };

  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_340px]">
      {/* ── 게시판 ── */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-bold text-zinc-900">{t('boardTitle')}</h1>
          {isAuthenticated && (
            <button onClick={() => setWriting(w => !w)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-950 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-800">
              {writing ? <X className="h-4 w-4" /> : <PenLine className="h-4 w-4" />}
              {writing ? t('cancel') : t('write')}
            </button>
          )}
        </div>

        {!isAuthenticated && (
          <p className="mb-4 rounded-lg bg-zinc-50 px-4 py-3 text-sm text-zinc-500">
            {t('loginToWrite')}{' '}
            <Link href="/auth/login" className="font-semibold text-zinc-900 underline">{t('login')}</Link>
          </p>
        )}

        {writing && (
          <form onSubmit={submitPost} className="mb-4 space-y-2 rounded-xl border border-zinc-200 bg-white p-4">
            <input type="text" required maxLength={120} placeholder={t('titlePlaceholder')}
              value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none" />
            <textarea required maxLength={5000} rows={5} placeholder={t('contentPlaceholder')}
              value={draft.content} onChange={e => setDraft(d => ({ ...d, content: e.target.value }))}
              className="w-full resize-y rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none" />
            <button type="submit" disabled={posting}
              className="rounded-lg bg-zinc-950 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50">
              {t('submit')}
            </button>
          </form>
        )}

        {/* 글 상세 모달(인라인) */}
        {openPost && (
          <div className="mb-4 rounded-xl border border-zinc-300 bg-white p-5">
            <div className="mb-2 flex items-start justify-between gap-3">
              <h2 className="text-base font-bold text-zinc-900">{openPost.title}</h2>
              <button onClick={() => setOpenPost(null)} className="text-zinc-400 hover:text-zinc-700">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-3 text-xs text-zinc-400">
              {openPost.author_name} · {new Date(openPost.created_at).toLocaleString()}
            </p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">{openPost.content}</p>
          </div>
        )}

        {posts === null ? (
          <Loader2 className="mx-auto my-12 h-6 w-6 animate-spin text-zinc-300" />
        ) : posts.length === 0 ? (
          <p className="py-12 text-center text-sm text-zinc-400">{t('noPosts')}</p>
        ) : (
          <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
            {posts.map(p => (
              <li key={p.id}>
                <button onClick={() => viewPost(p.id)}
                  className="block w-full px-4 py-3 text-left hover:bg-zinc-50">
                  <p className="truncate text-sm font-semibold text-zinc-900">{p.title}</p>
                  <p className="mt-0.5 truncate text-xs text-zinc-400">
                    {p.author_name} · {new Date(p.created_at).toLocaleDateString()}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── 글로벌 채팅 ── */}
      <aside className="flex h-[480px] flex-col rounded-xl border border-zinc-200 bg-white lg:sticky lg:top-20">
        <div className="flex items-center gap-2 border-b border-zinc-100 px-4 py-3">
          <MessageSquare className="h-4 w-4 text-zinc-500" />
          <h2 className="text-sm font-bold text-zinc-900">{t('chatTitle')}</h2>
        </div>

        <div ref={chatBoxRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
          {messages.length === 0 ? (
            <p className="py-8 text-center text-xs text-zinc-400">{t('noMessages')}</p>
          ) : messages.map(m => (
            <div key={m.id} className="text-sm">
              <span className={`font-semibold ${m.author_name === user?.name ? 'text-emerald-600' : 'text-zinc-900'}`}>
                {m.author_name}
              </span>{' '}
              <span className="break-words text-zinc-700">{m.content}</span>
            </div>
          ))}
        </div>

        {isAuthenticated ? (
          <form onSubmit={sendChat} className="flex gap-2 border-t border-zinc-100 p-3">
            <input type="text" maxLength={500} placeholder={t('chatPlaceholder')}
              value={chatInput} onChange={e => setChatInput(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none" />
            <button type="submit"
              className="shrink-0 rounded-lg bg-zinc-950 px-3 py-2 text-white hover:bg-zinc-800">
              <Send className="h-4 w-4" />
            </button>
          </form>
        ) : (
          <p className="border-t border-zinc-100 px-4 py-3 text-center text-xs text-zinc-400">
            {t('loginToChat')}
          </p>
        )}
      </aside>
    </div>
  );
}
