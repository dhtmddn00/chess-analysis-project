package com.chessanalysis.api.service;

import com.chessanalysis.api.dto.AnalysisRequestDto;
import com.chessanalysis.api.queue.AnalysisQueueService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDate;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class AnalysisRateLimitService {
    private static final int USERNAME_FAST_DAILY_LIMIT = 3;
    private static final int USERNAME_PRECISE_DAILY_LIMIT = 1;
    private static final int IP_DAILY_LIMIT = 10;
    private static final int GLOBAL_DAILY_LIMIT = 200;
    private static final int MAX_QUEUE_SIZE = 30;
    private static final String TIME_ZONE = "Asia/Seoul";

    private final StringRedisTemplate redisTemplate;
    private final AnalysisQueueService queueService;

    public void enforceLimits(AnalysisRequestDto request, String clientIp) {
        long queueSize = queueService.getQueueSize();
        if (queueSize >= MAX_QUEUE_SIZE) {
            throw limitExceeded(
                "현재 분석 대기열이 많습니다. 잠시 후 다시 시도해주세요.",
                "queue",
                MAX_QUEUE_SIZE,
                queueSize,
                null
            );
        }

        String priority = normalizePriority(request.getPriority());
        int usernameLimit = priority.equals("precise")
            ? USERNAME_PRECISE_DAILY_LIMIT
            : USERNAME_FAST_DAILY_LIMIT;

        String date = LocalDate.now(java.time.ZoneId.of(TIME_ZONE)).format(DateTimeFormatter.ISO_DATE);
        String normalizedUsername = normalizeToken(request.getUsername());
        String normalizedPlatform = normalizeToken(request.getPlatform());
        String normalizedIp = normalizeToken(clientIp);

        String usernameKey = String.format(
            "rate:analysis:username:%s:%s:%s:%s",
            normalizedPlatform,
            normalizedUsername,
            priority,
            date
        );
        String ipKey = String.format("rate:analysis:ip:%s:%s", normalizedIp, date);
        String globalKey = "rate:analysis:global:" + date;
        String resetAt = nextResetAt();

        checkCurrentCount(usernameKey, usernameLimit, "username", resetAt);
        checkCurrentCount(ipKey, IP_DAILY_LIMIT, "ip", resetAt);
        checkCurrentCount(globalKey, GLOBAL_DAILY_LIMIT, "global", resetAt);

        increment(usernameKey);
        increment(ipKey);
        increment(globalKey);
    }

    private void checkCurrentCount(String key, int limit, String scope, String resetAt) {
        int current = currentCount(key);
        if (current >= limit) {
            throw limitExceeded(
                "오늘 가능한 상세 분석 횟수를 모두 사용했습니다.",
                scope,
                limit,
                current,
                resetAt
            );
        }
    }

    private void increment(String key) {
        Long count = redisTemplate.opsForValue().increment(key);
        if (count != null && count == 1L) {
            redisTemplate.expire(key, ttlUntilReset());
        }
    }

    private int currentCount(String key) {
        String value = redisTemplate.opsForValue().get(key);
        if (value == null || value.isBlank()) {
            return 0;
        }
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private AnalysisRateLimitException limitExceeded(
        String message,
        String scope,
        int limit,
        long current,
        String resetAt
    ) {
        return new AnalysisRateLimitException(message, Map.of(
            "error", message,
            "scope", scope,
            "limit", limit,
            "current", current,
            "remaining", 0,
            "resetAt", resetAt == null ? "" : resetAt
        ));
    }

    private Duration ttlUntilReset() {
        ZonedDateTime now = ZonedDateTime.now(java.time.ZoneId.of(TIME_ZONE));
        ZonedDateTime nextMidnight = now.toLocalDate().plusDays(1).atStartOfDay(now.getZone());
        return Duration.between(now, nextMidnight);
    }

    private String nextResetAt() {
        ZonedDateTime now = ZonedDateTime.now(java.time.ZoneId.of(TIME_ZONE));
        return now.toLocalDate().plusDays(1).atStartOfDay(now.getZone()).toString();
    }

    private String normalizePriority(String priority) {
        return priority == null || priority.isBlank()
            ? "fast"
            : priority.toLowerCase(Locale.ROOT).trim();
    }

    private String normalizeToken(String value) {
        if (value == null || value.isBlank()) {
            return "unknown";
        }
        return value.toLowerCase(Locale.ROOT).trim().replaceAll("[^a-z0-9._:-]", "_");
    }
}
