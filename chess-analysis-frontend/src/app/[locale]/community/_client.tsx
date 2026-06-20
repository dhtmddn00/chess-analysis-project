'use client';

import { FormEvent, useEffect, useRef, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/hooks/useAuth';
import { MessageSquare, Send, PenLine, X, Loader2, Trash2, ChevronLeft, ChevronRight, Pin, PinOff, Eye } from 'lucide-react';
import { parseApiDate } from '@/lib/date';

const CATEGORIES = ['free', 'suggestion', 'analysis'] as const;
type Category = typeof CATEGORIES[number];

interface Post {
  id: number;
  user_id: string | null;
  author_name: string;
  title: string;
  preview: string;
  content?: string;
  created_at: string;
  category: Category;
  is_pinned: boolean;
  view_count: number;
}

interface Comment {
  id: number;
  post_id: number;
  user_id: string | null;
  author_name: string;
  content: string;
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
  const [category, setCategory] = useState<Category>('free');
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [openPost, setOpenPost] = useState<Post | null>(null);
  const [writing, setWriting] = useState(false);
  const [draft, setDraft] = useState({ title: '', content: '' });
  const [posting, setPosting] = useState(false);

  const categoryLabel = (c: Category) =>
    ({ free: t('categoryFree'), suggestion: t('categorySuggestion'), analysis: t('categoryAnalysis') }[c]);

  // ── 댓글 상태 ───────────────────────────────────────────────────────────
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentPosting, setCommentPosting] = useState(false);

  // ── 채팅 상태 ───────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const lastIdRef = useRef(0);
  const chatBoxRef = useRef<HTMLDivElement>(null);

  const canModify = (ownerId: string | null) =>
    !!user && (user.admin || (ownerId !== null && ownerId === user.id));

  const loadPosts = useCallback((targetPage: number, targetCategory: Category = category) => {
    fetch(`/api/v1/community/posts?page=${targetPage}&category=${targetCategory}`)
      .then(r => (r.ok ? r.json() : { items: [], total: 0, page: 1, pageSize: 20 }))
      .then((data: { items: Post[]; total: number; page: number; pageSize: number }) => {
        setPosts(data.items);
        setPage(data.page);
        setTotalPages(Math.max(1, Math.ceil(data.total / data.pageSize)));
      })
      .catch(() => setPosts([]));
  }, [category]);

  const selectCategory = (c: Category) => {
    setCategory(c);
    setOpenPost(null);
    setComments(null);
    loadPosts(1, c);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => loadPosts(1, 'free'), []);

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
        body: JSON.stringify({ ...draft, category }),
      });
      if (res.ok) {
        setDraft({ title: '', content: '' });
        setWriting(false);
        loadPosts(1);
      }
    } finally {
      setPosting(false);
    }
  };

  const loadComments = async (postId: number) => {
    const res = await fetch(`/api/v1/community/posts/${postId}/comments`);
    setComments(res.ok ? await res.json() : []);
  };

  const viewPost = async (id: number) => {
    const res = await fetch(`/api/v1/community/posts/${id}`);
    if (res.ok) {
      setOpenPost(await res.json());
      setCommentDraft('');
      loadComments(id);
    }
  };

  const closePost = () => {
    setOpenPost(null);
    setComments(null);
  };

  const deletePost = async (id: number) => {
    if (!confirm(t('deleteConfirm'))) return;
    const res = await fetch(`/api/v1/community/posts/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (res.ok) {
      if (openPost?.id === id) closePost();
      loadPosts(page);
    }
  };

  const submitComment = async (e: FormEvent) => {
    e.preventDefault();
    if (!openPost || commentPosting) return;
    const content = commentDraft.trim();
    if (!content) return;
    setCommentPosting(true);
    try {
      const res = await fetch(`/api/v1/community/posts/${openPost.id}/comments`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (res.ok) {
        setCommentDraft('');
        loadComments(openPost.id);
      }
    } finally {
      setCommentPosting(false);
    }
  };

  const togglePin = async (id: number) => {
    const res = await fetch(`/api/v1/community/posts/${id}/pin`, {
      method: 'PATCH',
      credentials: 'include',
    });
    if (!res.ok) return;
    const { isPinned } = await res.json();
    setOpenPost(prev => (prev && prev.id === id ? { ...prev, is_pinned: isPinned } : prev));
    loadPosts(page);
  };

  const deleteComment = async (postId: number, commentId: number) => {
    if (!confirm(t('deleteConfirm'))) return;
    const res = await fetch(`/api/v1/community/posts/${postId}/comments/${commentId}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (res.ok) loadComments(postId);
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

  const deleteChatMessage = async (id: number) => {
    if (!confirm(t('deleteConfirm'))) return;
    const res = await fetch(`/api/v1/chat/messages/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (res.ok) setMessages(prev => prev.filter(m => m.id !== id));
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

        <div className="mb-4 flex gap-1 border-b border-zinc-200">
          {CATEGORIES.map(c => (
            <button key={c} onClick={() => selectCategory(c)}
              className={`px-3 py-2 text-sm font-semibold ${c === category ? 'border-b-2 border-zinc-950 text-zinc-900' : 'text-zinc-400 hover:text-zinc-700'}`}>
              {categoryLabel(c)}
            </button>
          ))}
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
              <h2 className="text-base font-bold text-zinc-900">
                {openPost.is_pinned && <span className="mr-1.5 text-emerald-600">{t('pinned')}</span>}
                {openPost.title}
              </h2>
              <div className="flex shrink-0 items-center gap-2">
                {!!user?.admin && (
                  <button onClick={() => togglePin(openPost.id)} title={openPost.is_pinned ? t('unpin') : t('pin')}
                    className="text-zinc-400 hover:text-emerald-600">
                    {openPost.is_pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                  </button>
                )}
                {canModify(openPost.user_id) && (
                  <button onClick={() => deletePost(openPost.id)} title={t('deletePost')}
                    className="text-zinc-400 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
                <button onClick={closePost} className="text-zinc-400 hover:text-zinc-700">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <p className="mb-3 flex items-center gap-1 text-xs text-zinc-400">
              <span>{openPost.author_name} · {parseApiDate(openPost.created_at).toLocaleString()}</span>
              <span className="ml-auto inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5" />{openPost.view_count}</span>
            </p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">{openPost.content}</p>

            {/* ── 댓글 ── */}
            <div className="mt-5 border-t border-zinc-100 pt-4">
              <h3 className="mb-2 text-sm font-bold text-zinc-900">{t('commentsTitle')}</h3>
              {comments === null ? (
                <Loader2 className="my-4 h-4 w-4 animate-spin text-zinc-300" />
              ) : comments.length === 0 ? (
                <p className="py-2 text-xs text-zinc-400">{t('noComments')}</p>
              ) : (
                <ul className="space-y-2">
                  {comments.map(c => (
                    <li key={c.id} className="flex items-start justify-between gap-2 rounded-lg bg-zinc-50 px-3 py-2">
                      <div>
                        <p className="text-xs text-zinc-400">
                          {c.author_name} · {parseApiDate(c.created_at).toLocaleString()}
                        </p>
                        <p className="whitespace-pre-wrap text-sm text-zinc-700">{c.content}</p>
                      </div>
                      {canModify(c.user_id) && (
                        <button onClick={() => deleteComment(openPost.id, c.id)} title={t('deleteComment')}
                          className="shrink-0 text-zinc-400 hover:text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {isAuthenticated ? (
                <form onSubmit={submitComment} className="mt-3 flex gap-2">
                  <input type="text" maxLength={1000} placeholder={t('commentPlaceholder')}
                    value={commentDraft} onChange={e => setCommentDraft(e.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none" />
                  <button type="submit" disabled={commentPosting}
                    className="shrink-0 rounded-lg bg-zinc-950 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50">
                    {t('submit')}
                  </button>
                </form>
              ) : (
                <p className="mt-3 text-xs text-zinc-400">
                  {t('loginToWrite')}{' '}
                  <Link href="/auth/login" className="font-semibold text-zinc-900 underline">{t('login')}</Link>
                </p>
              )}
            </div>
          </div>
        )}

        {posts === null ? (
          <Loader2 className="mx-auto my-12 h-6 w-6 animate-spin text-zinc-300" />
        ) : posts.length === 0 ? (
          <p className="py-12 text-center text-sm text-zinc-400">{t('noPosts')}</p>
        ) : (
          <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
            {posts.map(p => (
              <li key={p.id} className="flex items-center">
                <button onClick={() => viewPost(p.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left hover:bg-zinc-50">
                  {p.is_pinned && (
                    <span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-semibold text-emerald-600">
                      {t('pinned')}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-zinc-900">{p.title}</p>
                    <p className="mt-0.5 truncate text-xs text-zinc-400">
                      {p.author_name} · {parseApiDate(p.created_at).toLocaleString()}
                    </p>
                  </div>
                  <span className="shrink-0 inline-flex items-center gap-1 text-xs text-zinc-400">
                    <Eye className="h-3.5 w-3.5" />{p.view_count}
                  </span>
                </button>
                {canModify(p.user_id) && (
                  <button onClick={() => deletePost(p.id)} title={t('deletePost')}
                    className="shrink-0 px-3 text-zinc-400 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {posts !== null && posts.length > 0 && totalPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-1">
            <button onClick={() => loadPosts(page - 1)} disabled={page <= 1}
              className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30">
              <ChevronLeft className="h-4 w-4" />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
              <button key={n} onClick={() => loadPosts(n)}
                className={`min-w-[28px] rounded-lg px-2 py-1 text-sm ${n === page ? 'bg-zinc-950 text-white' : 'text-zinc-500 hover:bg-zinc-100'}`}>
                {n}
              </button>
            ))}
            <button onClick={() => loadPosts(page + 1)} disabled={page >= totalPages}
              className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
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
            <div key={m.id} className="group flex items-start justify-between gap-2 text-sm">
              <div className="min-w-0">
                <p className="text-xs text-zinc-400">
                  {parseApiDate(m.created_at).toLocaleTimeString()}
                </p>
                <span className={`font-semibold ${m.author_name === user?.name ? 'text-emerald-600' : 'text-zinc-900'}`}>
                  {m.author_name}
                </span>{' '}
                <span className="break-words text-zinc-700">{m.content}</span>
              </div>
              {!!user?.admin && (
                <button onClick={() => deleteChatMessage(m.id)} title={t('deleteMessage')}
                  className="shrink-0 text-zinc-300 hover:text-red-600">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
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
