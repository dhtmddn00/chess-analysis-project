import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/Toast";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Chess Analysis Pro",
  description: "Advanced chess game analysis powered by Stockfish engine. Discover your playing style, identify weaknesses, and improve your game.",
  keywords: "chess, analysis, stockfish, chess.com, game analysis, chess improvement, tactics, strategy",
  authors: [{ name: "Chess Analysis Pro Team" }],
  creator: "Chess Analysis Pro",
  publisher: "Chess Analysis Pro",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Chess Analysis Pro"
  },
  openGraph: {
    type: "website",
    siteName: "Chess Analysis Pro",
    title: "Chess Analysis Pro - Advanced Chess Game Analysis",
    description: "Analyze your chess games with Stockfish engine. Get insights, identify weaknesses, and improve your playing style.",
    url: "https://chessanalysis.pro",
    images: []
  },
  twitter: {
    card: "summary",
    title: "Chess Analysis Pro",
    description: "Advanced chess game analysis powered by Stockfish engine"
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" }
    ]
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} antialiased`}
      >
        <ToastProvider>
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
