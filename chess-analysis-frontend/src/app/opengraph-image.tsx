import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Chess Analysis Pro';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #1e3a5f 0%, #2d1b69 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '60px',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            fontSize: 96,
            lineHeight: 1,
            marginBottom: 32,
          }}
        >
          ♟
        </div>
        <div
          style={{
            color: 'white',
            fontSize: 72,
            fontWeight: 'bold',
            textAlign: 'center',
            marginBottom: 24,
            letterSpacing: '-1px',
          }}
        >
          Chess Analysis Pro
        </div>
        <div
          style={{
            color: '#93c5fd',
            fontSize: 36,
            textAlign: 'center',
          }}
        >
          Advanced Chess Analysis · Powered by Stockfish
        </div>
      </div>
    ),
    { ...size }
  );
}
