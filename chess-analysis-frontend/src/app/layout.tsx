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
  keywords: "chess, analysis, stockfish, chess.com, lichess, game analysis, chess improvement, tactics, strategy",
  authors: [{ name: "Chess Analysis Pro Team" }],
  creator: "Chess Analysis Pro",
  publisher: "Chess Analysis Pro",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Chess Analysis Pro",
    startupImage: [
      {
        media: "(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2)",
        url: "/splash-640x1136.png"
      },
      {
        media: "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)",
        url: "/splash-750x1334.png"
      }
    ]
  },
  openGraph: {
    type: "website",
    siteName: "Chess Analysis Pro",
    title: "Chess Analysis Pro - Advanced Chess Game Analysis",
    description: "Analyze your chess games with Stockfish engine. Get insights, identify weaknesses, and improve your playing style.",
    url: "https://chessanalysis.pro",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Chess Analysis Pro"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "Chess Analysis Pro",
    description: "Advanced chess game analysis powered by Stockfish engine",
    images: ["/twitter-image.png"]
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" }
    ]
  },
  other: {
    "msapplication-TileColor": "#2563eb",
    "msapplication-config": "/browserconfig.xml"
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
