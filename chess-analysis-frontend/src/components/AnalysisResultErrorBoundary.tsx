'use client';

import React from 'react';
import { useTranslations } from 'next-intl';

interface ClassProps {
  children: React.ReactNode;
  errorTitle: string;
  errorMessage: string;
  retryLabel: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * 분석 결과 렌더링 중 발생하는 런타임 오류를 포착해
 * 페이지 전체 충돌 대신 인라인 복구 UI를 보여준다.
 *
 * 주요 원인: 백엔드가 null을 보냈을 때 중첩된 optional chaining 없이
 * 프로퍼티를 읽으면 발생하는 TypeError.
 */
class AnalysisResultErrorBoundaryClass extends React.Component<ClassProps, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[AnalysisResult] render error:', error.message, info.componentStack);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { errorTitle, errorMessage, retryLabel } = this.props;

    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-2xl">
          ⚠
        </div>
        <h3 className="mb-2 text-base font-black text-zinc-800">
          {errorTitle}
        </h3>
        <p className="mb-1 text-sm text-zinc-500">
          {errorMessage}
        </p>
        {this.state.error && (
          <p className="mb-4 text-xs text-zinc-400 font-mono">
            {this.state.error.message}
          </p>
        )}
        <button
          type="button"
          onClick={this.handleRetry}
          className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-bold text-white hover:bg-zinc-700 transition"
        >
          {retryLabel}
        </button>
      </div>
    );
  }
}

/** Functional wrapper that provides translated strings to the class component */
export function AnalysisResultErrorBoundary({ children }: { children: React.ReactNode }) {
  const t = useTranslations('AnalysisResultErrorBoundary');
  return (
    <AnalysisResultErrorBoundaryClass
      errorTitle={t('title')}
      errorMessage={t('message')}
      retryLabel={t('retry')}
    >
      {children}
    </AnalysisResultErrorBoundaryClass>
  );
}
