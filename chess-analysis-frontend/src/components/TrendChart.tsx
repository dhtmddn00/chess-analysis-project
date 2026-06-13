'use client';

/**
 * 의존성 없는 경량 SVG 라인 차트 — 마이페이지 분석 지표 추이용.
 * 시리즈 여러 개를 같은 X축(분석 순서)에 겹쳐 그린다.
 */

export interface TrendSeries {
  label: string;
  color: string;          // stroke 색 (hex)
  values: (number | null)[];
}

interface Props {
  series: TrendSeries[];
  xLabels: string[];      // 각 포인트의 날짜 라벨
  height?: number;
  yMin?: number;
  yMax?: number;
  unit?: string;
}

export function TrendChart({ series, xLabels, height = 180, yMin, yMax, unit = '' }: Props) {
  const W = 640;
  const H = height;
  const PAD = { top: 14, right: 16, bottom: 26, left: 40 };
  const n = xLabels.length;

  const allValues = series.flatMap(s => s.values.filter((v): v is number => v != null));
  if (n === 0 || allValues.length === 0) return null;

  const lo = yMin ?? Math.floor(Math.min(...allValues) * 0.95);
  const hi = yMax ?? Math.ceil(Math.max(...allValues) * 1.05);
  const range = hi - lo || 1;

  const x = (i: number) => n === 1
    ? (PAD.left + W - PAD.right) / 2
    : PAD.left + (i / (n - 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - lo) / range) * (H - PAD.top - PAD.bottom);

  // 그리드 라인 4개
  const gridYs = [0, 1, 2, 3].map(i => lo + (range * i) / 3);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
        {/* 그리드 */}
        {gridYs.map((gv, i) => (
          <g key={i}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(gv)} y2={y(gv)}
              stroke="#e4e4e7" strokeWidth="1" strokeDasharray={i === 0 ? '' : '3 4'} />
            <text x={PAD.left - 6} y={y(gv) + 4} textAnchor="end"
              fontSize="13" fill="#a1a1aa">{Math.round(gv)}{unit}</text>
          </g>
        ))}

        {/* X 라벨: 처음·중간·끝만 */}
        {[0, Math.floor((n - 1) / 2), n - 1]
          .filter((v, i, arr) => arr.indexOf(v) === i)
          .map(i => (
            <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="13" fill="#a1a1aa">
              {xLabels[i]}
            </text>
          ))}

        {/* 시리즈 */}
        {series.map(s => {
          const pts = s.values
            .map((v, i) => (v == null ? null : `${x(i)},${y(v)}`))
            .filter((p): p is string => p !== null);
          if (pts.length === 0) return null;
          return (
            <g key={s.label}>
              <polyline points={pts.join(' ')} fill="none"
                stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              {s.values.map((v, i) => v == null ? null : (
                <circle key={i} cx={x(i)} cy={y(v)} r="3" fill={s.color} />
              ))}
            </g>
          );
        })}
      </svg>

      {/* 범례 */}
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
        {series.map(s => (
          <span key={s.label} className="inline-flex items-center gap-1.5 text-xs text-zinc-600">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
