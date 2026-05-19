import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { GoogleAnalytics } from '@next/third-parties/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '../../i18n/routing';
import '../globals.css';
import { ToastProvider } from '@/components/Toast';
import { SiteFooter } from '@/components/SiteFooter';
import { ErrorBoundary } from '@/components/ErrorBoundary';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

const gaMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

export const metadata: Metadata = {
  metadataBase: new URL('https://chesslab.kr'),
  title: 'Chess Analysis Pro',
  description: 'Stockfish 기반 체스 게임 심층 분석. 플레이 스타일을 파악하고 약점을 발견해 실력을 향상시키세요.',
  keywords: 'chess, analysis, stockfish, chess.com, game analysis, chess improvement, tactics, strategy',
  authors: [{ name: 'Chess Analysis Pro Team' }],
  creator: 'Chess Analysis Pro',
  publisher: 'Chess Analysis Pro',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Chess Analysis Pro',
  },
  openGraph: {
    type: 'website',
    siteName: 'Chess Analysis Pro',
    title: 'Chess Analysis Pro - Stockfish 기반 체스 분석',
    description: 'Stockfish 엔진으로 체스 게임을 분석하세요. 플레이 스타일, 약점, 전술 기회를 한눈에 확인.',
    url: 'https://chesslab.kr',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Chess Analysis Pro',
    description: 'Stockfish 기반 체스 게임 심층 분석',
  },
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
  },
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!(routing.locales as readonly string[]).includes(locale)) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className={`${inter.variable} antialiased`}>
        <NextIntlClientProvider messages={messages}>
          <ErrorBoundary>
            <ToastProvider>
              {children}
              <SiteFooter />
            </ToastProvider>
          </ErrorBoundary>
        </NextIntlClientProvider>
        {gaMeasurementId && <GoogleAnalytics gaId={gaMeasurementId} />}
      </body>
    </html>
  );
}
