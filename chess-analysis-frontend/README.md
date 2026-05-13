# Chess Analysis Frontend

Apple 스타일의 모던한 체스 분석 웹 애플리케이션 프론트엔드

## 🚀 특징

- **Apple Design Language**: 애플의 디자인 시스템을 기반으로 한 모던한 UI/UX
- **반응형 디자인**: 모바일, 태블릿, 데스크톱 모든 화면 크기 지원
- **다국어 지원**: 한국어/영어 실시간 언어 전환
- **실시간 분석**: Chess.com 계정 연동을 통한 실시간 게임 분석

## 🛠 기술 스택

- **Framework**: Next.js 15.5.0 with TypeScript
- **Styling**: Tailwind CSS + Apple Design System
- **Icons**: Lucide React
- **Language**: TypeScript
- **Package Manager**: npm

## 📦 설치 및 실행

```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev

# 프로덕션 빌드
npm run build

# 프로덕션 서버 실행
npm start
```

## 🌐 환경 변수

기본 개발 환경에서는 Next.js rewrite가 `/api/v1` 요청을 `http://localhost:8080`으로 프록시하므로 별도 설정이 없어도 됩니다. 다른 API 서버를 사용할 때만 다음 값을 설정하세요:

```env
NEXT_PUBLIC_API_URL=http://localhost:8080
```

## 📱 주요 기능

### 🎨 Apple 스타일 UI 컴포넌트
- **apple-button**: Apple 스타일 버튼 (hover 효과, 그림자)
- **apple-card**: 카드 컴포넌트 (둥근 모서리, 부드러운 그림자)
- **apple-input**: 입력 필드 (포커스 효과, 부드러운 테두리)
- **apple-glass**: 글래스모피즘 효과
- **apple-gradient-text**: 그라데이션 텍스트

### 🎯 핵심 컴포넌트
- **PlayerSummaryCard**: 플레이어 요약 표시
- **JobProgress**: 분석 진행 상태 표시
- **Toast**: 사용자 피드백 알림

### 📊 분석 결과 시각화
- **스타일 점수 패널**: 12차원 플레이 스타일 분석
- **진행률 표시**: 실시간 분석 진행 상황
- **성능 지표**: ACPL, 승률, 시간 관리 등

## 🔧 개발 도구

- **ESLint**: 코드 품질 관리
- **TypeScript**: 타입 안정성
- **Tailwind CSS**: 유틸리티 기반 스타일링
- **PostCSS**: CSS 후처리

## 📂 프로젝트 구조

```
src/
├── app/                    # Next.js App Router
│   ├── globals.css        # 글로벌 스타일 (Apple Design System)
│   ├── layout.tsx         # 루트 레이아웃
│   └── page.tsx           # 메인 페이지
├── components/            # 재사용 가능한 컴포넌트
│   ├── PlayerSummaryCard.tsx
│   ├── JobProgress.tsx
│   ├── Toast.tsx
│   └── ...
├── hooks/                 # 커스텀 훅
│   └── useTranslation.ts  # 다국어 지원 훅
└── lib/                   # 유틸리티 라이브러리
    └── api.ts             # API 클라이언트
```

## 🎨 디자인 시스템

### 색상 팔레트
- **Primary**: #007AFF (Apple Blue)
- **Secondary**: #5856D6 (Apple Purple)
- **Success**: #10b981
- **Warning**: #f59e0b
- **Error**: #ef4444

### 타이포그래피
- **Font Family**: SF Pro Display, -apple-system, BlinkMacSystemFont
- **Large Text**: 48px/1.0834 (웹제목)
- **Medium Text**: 32px/1.125 (섹션 제목)
- **Body Text**: 17px/1.47059 (본문)

### 애니메이션
- **Fade In**: appleFadeIn (0.6s cubic-bezier)
- **Slide Up**: appleSlideUp (0.8s cubic-bezier)
- **Bounce**: appleBounce (2s infinite)

## 🔗 API 연동

백엔드 API와의 통신을 위한 주요 엔드포인트:

- `POST /api/v1/analysis` - 분석 요청
- `GET /api/v1/analysis/{id}/status` - 분석 상태 확인
- `GET /api/v1/analysis/{id}` - 분석 결과 조회
- `GET /api/v1/analysis/stats` - 시스템 통계
- `GET /health/actuator/health` - 헬스체크

## 🌍 다국어 지원

`src/hooks/useTranslation.ts`에서 한국어/영어 번역을 관리:

```typescript
const { t, language, toggleLanguage } = useTranslation();
```

## 📱 모바일 최적화

- **터치 친화적**: 44px 이상의 터치 타겟
- **반응형 레이아웃**: 모든 화면 크기 지원
- **성능 최적화**: 이미지 지연 로딩, 코드 분할

## 🚀 배포

### Vercel 배포
```bash
npm run build
# Vercel에 배포
```

### Docker 배포
```bash
docker build -t chess-analysis-frontend .
docker run -p 3000:3000 chess-analysis-frontend
```

## 🤝 기여

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 라이선스

MIT License

## 📞 지원

이슈나 질문이 있으시면 GitHub Issues를 통해 문의해주세요.
