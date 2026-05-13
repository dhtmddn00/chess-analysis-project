# Chess Analysis Platform

Stockfish 엔진과 Apple 디자인을 결합한 현대적인 체스 분석 플랫폼

## 📁 레포지토리 구조

이 프로젝트는 프론트엔드, Spring Boot API, Python 분석 워커를 Docker Compose로 묶어 실행하는 통합 레포지토리입니다.

### 🎨 [chess-analysis-frontend](./chess-analysis-frontend/)
**Apple 스타일 프론트엔드 웹 애플리케이션**

```bash
# 레포지토리로 이동
cd chess-analysis-frontend

# 의존성 설치 및 실행
npm install
npm run dev
```

**주요 특징:**
- 🍎 Apple Design Language 기반 UI/UX
- 📱 완전 반응형 디자인 (모바일/태블릿/데스크톱)
- 🌍 한국어/영어 실시간 언어 전환
- ⚡ Next.js + TypeScript

**기술 스택:**
- Next.js with TypeScript
- Tailwind CSS + Apple Design System
- Lucide React icons

---

### 🚀 [chess-analysis-api](./chess-analysis-api/)
**분석 요청, DB/Redis 연동, 결과 조회를 담당하는 Spring Boot API 서버**

### ♟️ [chess-analysis-worker](./chess-analysis-worker/)
**Chess.com 게임 수집, Stockfish 분석, 12차원 프로파일링을 담당하는 Python 워커**

### 🗄️ 인프라
PostgreSQL은 분석 결과 저장, Redis는 분석 작업 큐와 진행 상태 저장에 사용됩니다.

## 🎯 12차원 체스 스타일 분석

우리의 독특한 분석 시스템은 플레이어의 체스 스타일을 12개 차원으로 분석합니다:

1. **공격성 (Aggression)** - 공격적 플레이 성향
2. **전술 의존도 (Tactical Dependency)** - 전술적 기회 활용 능력
3. **위험 감수 (Risk Taking)** - 위험한 수 선택 성향
4. **포지셔널 지향 (Positional Orientation)** - 포지션 우위 추구
5. **교환 선호도 (Exchange Preference)** - 말 교환 성향
6. **오프닝 다양성 (Opening Variety)** - 오프닝 레퍼토리 다양성
7. **정석 이탈 (Book Deviation)** - 이론에서 벗어나는 정도
8. **우위 전환 (Lead Conversion)** - 유리한 포지션 활용 능력
9. **엔드게임 기술 (Endgame Technique)** - 엔드게임 처리 능력
10. **시간 관리 (Time Management)** - 시간 사용 패턴
11. **일관성 (Consistency)** - 플레이 품질의 일관성
12. **역전 저항력 (Swindle Resistance)** - 불리한 상황 대처 능력

## 🚀 전체 시스템 실행

### Docker Compose를 사용한 실행 (권장)

현재 통합 개발 환경은 루트 디렉토리의 Docker Compose 구성을 기준으로 합니다.

```bash
# 전체 개발 환경 실행
./dev.sh start

# 상태 확인
./dev.sh status

# 로그 확인
./dev.sh logs

# Smoke test
./dev.sh test
```

### 개별 실행

```bash
# 터미널 1: DB/Redis 실행
./local-dev.sh start

# 터미널 2: API 실행
cd chess-analysis-api
./gradlew bootRun

# 터미널 3: 프론트엔드 실행
cd chess-analysis-frontend
npm install
npm run dev

# 터미널 4: Worker 실행
cd chess-analysis-worker
pip install -r requirements.txt
python -m worker.main
```

## 🌐 서비스 접속

- **프론트엔드**: http://localhost:3000 (또는 3005)
- **백엔드 API**: http://localhost:8080/api/v1
- **헬스체크**: http://localhost:8080/api/v1/actuator/health

## 📊 사용 방법

1. **웹 애플리케이션 접속** - 프론트엔드 URL로 접속
2. **Chess.com 사용자명 입력** - 분석하고 싶은 계정 입력
3. **분석 설정** - 게임 수, 플랫폼 선택
4. **분석 실행** - 실시간으로 진행 상황 확인
5. **결과 확인** - 12차원 스타일 분석 및 개선 방안 확인

## 🔧 시스템 요구사항

### Stockfish 엔진 설치

```bash
# macOS (Homebrew)
brew install stockfish

# Ubuntu/Debian
sudo apt-get install stockfish

# 또는 공식 사이트에서 다운로드
# https://stockfishchess.org/download/
```

### 환경 변수 설정

**Frontend (.env.local, 선택):**
```env
NEXT_PUBLIC_API_URL=http://localhost:8080
```

**Worker (.env, 로컬 실행 시):**
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=chess_analysis
DB_USER=chess_user
DB_PASSWORD=chess_password
REDIS_HOST=localhost
REDIS_PORT=6379
STOCKFISH_PATH=/opt/homebrew/bin/stockfish
```

## 🎨 UI/UX 특징

### Apple Design Language
- **SF Pro Display** 폰트 사용
- **둥근 모서리와 부드러운 그림자** 
- **Apple 브랜드 컬러** (#007AFF, #5856D6)
- **Glassmorphism 효과**
- **부드러운 애니메이션** (cubic-bezier)

### 반응형 디자인
- **모바일 퍼스트** 접근
- **터치 친화적** 44px+ 터치 타겟
- **적응형 레이아웃** 모든 화면 크기 지원

## 🤝 기여 방법

1. 원하는 레포지토리를 Fork
2. Feature 브랜치 생성 (`git checkout -b feature/amazing-feature`)
3. 변경사항 커밋 (`git commit -m 'Add amazing feature'`)
4. 브랜치에 Push (`git push origin feature/amazing-feature`)
5. Pull Request 생성

## 📄 라이선스

MIT License - 자세한 내용은 각 레포지토리의 LICENSE 파일을 참조하세요.

## 🙏 감사

- **Stockfish** - 강력한 오픈소스 체스 엔진
- **Chess.com** - 게임 데이터 API 제공
- **Apple** - 아름다운 디자인 언어 영감
- **Next.js & Spring Boot** - 현대적인 웹 개발 프레임워크

---

**🤖 Generated with Claude Code**  
**Co-Authored-By: Claude <noreply@anthropic.com>**
