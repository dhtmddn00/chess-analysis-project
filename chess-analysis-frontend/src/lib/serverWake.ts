/**
 * "서버 깨우는 중" 감지 스토어.
 *
 * Fly.io는 여분 API 머신을 auto_stop하고 요청 시 auto_start한다(min 1대는 항상 warm).
 * 드물게 머신이 콜드스타트하면 첫 요청이 수초간 지연될 수 있는데, 그동안 사용자에게
 * '죽은 사이트'가 아니라 '깨우는 중'임을 알려주기 위한 전역 신호.
 *
 * 홈 검색·분석 등 주요 호출이 모두 fetch('/api/v1/...')를 쓰므로(axios 아님),
 * window.fetch를 감싸 /api/v1 요청이 임계 시간을 넘기면 배너를 띄운다.
 * 응답 내용은 절대 변형하지 않는다 — 타이밍 관찰만 한다.
 */

let waking = false;
let slowInFlight = 0;
const listeners = new Set<(w: boolean) => void>();

function emit() {
  for (const l of listeners) l(waking);
}

function setWaking(next: boolean) {
  if (waking !== next) {
    waking = next;
    emit();
  }
}

export function subscribeServerWake(cb: (w: boolean) => void): () => void {
  listeners.add(cb);
  cb(waking);
  return () => {
    listeners.delete(cb);
  };
}

/** 이 시간을 넘겨도 응답이 없으면 콜드스타트로 간주하고 배너를 띄운다. */
const SLOW_THRESHOLD_MS = 4000;

let installed = false;

export function installServerWakeInterceptor(): void {
  if (installed || typeof window === 'undefined' || typeof window.fetch !== 'function') {
    return;
  }
  installed = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let url = '';
    try {
      url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
    } catch {
      url = '';
    }

    // 우리 백엔드 API 호출만 관찰. 그 외(Next 내부 fetch 등)는 그대로 통과.
    if (!url.includes('/api/v1/')) {
      return originalFetch(input as RequestInfo, init);
    }

    let firedSlow = false;
    let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      timer = null;
      firedSlow = true;
      slowInFlight += 1;
      setWaking(true);
    }, SLOW_THRESHOLD_MS);

    const settle = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (firedSlow) {
        slowInFlight = Math.max(0, slowInFlight - 1);
        if (slowInFlight === 0) setWaking(false);
      }
    };

    return originalFetch(input as RequestInfo, init).then(
      (res) => {
        settle();
        return res;
      },
      (err) => {
        settle();
        throw err;
      },
    );
  };
}
