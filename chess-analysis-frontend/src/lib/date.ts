/**
 * 백엔드는 엔드포인트마다 날짜를 서로 다른 형태로 직렬화한다:
 *  - 문자열 ISO (LocalDateTime, write-dates-as-timestamps=false)
 *  - 숫자 epoch millis (예: 커뮤니티 created_at → 1781338386266)
 *  - 배열 [year, month(1-12), day, hour, min, sec, nano] (일부 DTO)
 * 어떤 형태가 와도 안전하게 Date 객체로 변환한다.
 *
 * 문자열의 경우 Safari/iOS Date 파서가 밀리초 4자리 이상을 Invalid Date로
 * 처리하므로 소수점 이하를 3자리로 잘라준다.
 */
export function parseApiDate(
  value: string | number | number[] | Date | null | undefined,
): Date {
  if (value instanceof Date) return value;
  if (value == null) return new Date(NaN);

  // epoch millis
  if (typeof value === 'number') return new Date(value);

  // Java LocalDateTime 배열: [year, month(1-12), day, hour, min, sec, nano]
  if (Array.isArray(value)) {
    const [y, mo = 1, d = 1, h = 0, mi = 0, s = 0, ns = 0] = value;
    return new Date(y, mo - 1, d, h, mi, s, Math.floor(ns / 1_000_000));
  }

  // 문자열 ISO — 마이크로/나노초를 밀리초 3자리로 절단
  return new Date(value.replace(/(\.\d{3})\d+/, '$1'));
}
