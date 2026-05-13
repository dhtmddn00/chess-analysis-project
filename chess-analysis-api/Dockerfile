# Chess Analysis API Dockerfile
FROM gradle:8.5-jdk21-jammy AS build

USER root

# 작업 디렉토리 설정
WORKDIR /app

# Gradle 파일 복사
COPY build.gradle settings.gradle ./

# 의존성 다운로드 (캐시 최적화)
RUN gradle dependencies --no-daemon

# 소스 코드 복사
COPY src ./src

# 애플리케이션 빌드
RUN gradle clean build -x test --no-daemon

FROM eclipse-temurin:21-jre-jammy

RUN apt-get update && apt-get install -y curl && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=build /app/build/libs/app.jar app.jar

# 실행 포트 노출
EXPOSE 8080

# 헬스체크 설정
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8080/api/v1/actuator/health || exit 1

# Java 애플리케이션 실행
ENTRYPOINT ["java", "-jar", "app.jar"]
