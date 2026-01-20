# 개발 환경 가이드

## 빠른 시작

### 개발 모드 시작
```bash
./dev.sh start
```

### 서비스 접속
- **프론트엔드**: http://localhost:3000 (Hot Reload 지원)
- **API**: http://localhost:8080 
- **API 디버그**: http://localhost:5005
- **데이터베이스**: localhost:5432
- **Redis**: localhost:6379

## 개발 환경 특징

### 🔥 Hot Reload 지원
- **Frontend**: 코드 변경시 자동 새로고침
- **Worker**: Python 코드 변경시 자동 재시작  
- **API**: Gradle continuous build로 자동 컴파일

### 📂 볼륨 마운트
- **Frontend**: `./chess-analysis-frontend` → `/app` (실시간 동기화)
- **Worker**: `./chess-analysis-worker/src` → `/app/src` (실시간 동기화)
- **API**: 소스 코드와 빌드 출력 디렉토리 마운트

### 🐛 디버깅
- **API**: 포트 5005로 원격 디버깅 가능
- **로그**: `./dev.sh logs [service]`로 실시간 로그 확인

## 개발 명령어

```bash
# 전체 환경 시작
./dev.sh start

# 특정 서비스 로그 보기
./dev.sh logs chess-frontend
./dev.sh logs chess-worker-1

# 상태 확인
./dev.sh status

# 재시작
./dev.sh restart

# 이미지 다시 빌드
./dev.sh build

# 환경 정리
./dev.sh clean

# API 테스트
./dev.sh test
```

## 프로덕션 vs 개발

| 구분 | 프로덕션 | 개발 |
|------|---------|------|
| **실행** | `docker-compose up` | `./dev.sh start` |
| **프론트엔드** | 정적 빌드 | Hot Reload |
| **API** | JAR 실행 | Gradle continuous |
| **Worker** | 컨테이너 독립 | 소스 마운트 |
| **재빌드 시간** | 5-10분 | 즉시 |

## 개발 팁

### Frontend 수정시
1. `./chess-analysis-frontend/src` 파일 수정
2. 브라우저가 자동으로 새로고침됨
3. 별도 재시작 불필요

### Worker 수정시  
1. `./chess-analysis-worker/src` 파일 수정
2. 컨테이너가 자동으로 재시작됨
3. 새 코드가 즉시 적용됨

### API 수정시
1. Java 파일 수정
2. Gradle이 자동으로 컴파일
3. Spring Boot DevTools로 자동 재시작

## 문제 해결

### 포트 충돌
```bash
# 실행중인 서비스 확인
lsof -ti:3000
lsof -ti:8080

# 개발환경 종료 후 재시작
./dev.sh stop
./dev.sh start
```

### 캐시 문제
```bash
# Docker 캐시 정리
./dev.sh clean

# 이미지 다시 빌드
./dev.sh build
```

### 로그 확인
```bash
# 전체 로그
./dev.sh logs

# 특정 서비스
./dev.sh logs chess-frontend
./dev.sh logs chess-api-dev
./dev.sh logs chess-worker-1
```