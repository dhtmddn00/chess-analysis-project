/**
 * 백엔드(LocalDateTime)는 마이크로/나노초(소수점 4자리 이상)까지 포함된 타임스탬프를
 * 반환할 수 있는데, Safari/iOS의 Date 파서는 밀리초가 3자리를 넘으면 Invalid Date를
 * 반환한다. 소수점 이하를 3자리로 잘라 안전하게 Date 객체를 생성한다.
 */
export function parseApiDate(value: string): Date {
  return new Date(value.replace(/(\.\d{3})\d+/, '$1'));
}
