import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Chess Lab';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#0a0a0a',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'sans-serif',
          position: 'relative',
        }}
      >
        {/* Subtle grid lines */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />

        {/* Top-left label */}
        <div
          style={{
            position: 'absolute',
            top: 48,
            left: 56,
            color: 'rgba(255,255,255,0.25)',
            fontSize: 18,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            display: 'flex',
          }}
        >
          chesslab.kr
        </div>

        {/* Knight */}
        <div
          style={{
            fontSize: 120,
            lineHeight: 1,
            marginBottom: 36,
            filter: 'grayscale(1) brightness(2)',
            display: 'flex',
          }}
        >
          ♞
        </div>

        {/* Title */}
        <div
          style={{
            color: '#ffffff',
            fontSize: 80,
            fontWeight: 700,
            letterSpacing: '-2px',
            textAlign: 'center',
            marginBottom: 20,
            display: 'flex',
          }}
        >
          Chess Lab
        </div>

        {/* Divider */}
        <div
          style={{
            width: 48,
            height: 2,
            background: 'rgba(255,255,255,0.2)',
            marginBottom: 20,
            display: 'flex',
          }}
        />

        {/* Subtitle */}
        <div
          style={{
            color: 'rgba(255,255,255,0.45)',
            fontSize: 28,
            letterSpacing: '0.05em',
            textAlign: 'center',
            display: 'flex',
          }}
        >
          Stockfish-Powered Chess Analysis
        </div>
      </div>
    ),
    { ...size },
  );
}
