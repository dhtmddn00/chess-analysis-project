# Chess Analysis API Dockerfile
FROM eclipse-temurin:21-jdk-jammy AS build

# 작업 디렉토리 설정
WORKDIR /app

# Gradle Wrapper 먼저 복사해 캐시 레이어 최적화
COPY gradlew settings.gradle build.gradle ./
COPY gradle ./gradle

# 의존성 다운로드 (캐시 최적화)
# gradle 시스템 바이너리 대신 프로젝트 래퍼를 사용해 버전 일관성을 보장한다.
RUN ./gradlew dependencies --no-daemon

# 소스 코드 복사
COPY src ./src

# 애플리케이션 빌드
RUN ./gradlew clean build -x test --no-daemon

FROM eclipse-temurin:21-jre-jammy

RUN apt-get update && apt-get install -y curl && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=build /app/build/libs/app.jar app.jar

# root로 실행하면 컨테이너 탈출 시 호스트 권한을 그대로 획득할 수 있다.
# 전용 비권한 유저로 프로세스를 실행해 공격 표면을 줄인다.
RUN groupadd --system appgroup && useradd --system --gid appgroup appuser
RUN chown appuser:appgroup app.jar
USER appuser

# 실행 포트 노출
EXPOSE 8080

# 헬스체크 설정
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8080/api/v1/actuator/health || exit 1

# Java 애플리케이션 실행
ENTRYPOINT ["java", "-jar", "app.jar"]
