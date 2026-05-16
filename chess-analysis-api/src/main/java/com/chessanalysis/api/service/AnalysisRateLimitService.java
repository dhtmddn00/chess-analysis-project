package com.chessanalysis.api.service;

import com.chessanalysis.api.dto.AnalysisRequestDto;
import com.chessanalysis.api.queue.AnalysisQueueService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDate;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class AnalysisRateLimitService {
    private static final int USERNAME_FAST_DAILY_LIMIT = 3;
    private static final int USERNAME_PRECISE_DAILY_LIMIT = 1;
    private static final int IP_DAILY_LIMIT = 10;
    private static final int GLOBAL_DAILY_LIMIT = 200;
    private static final int MAX_QUEUE_SIZE = 30;
    private static final String TIME_ZONE = "Asia/Seoul";

    // Redis 카운터 확인과 증가가 분리되면 동시 요청에서 제한을 초과할 수 있다.
    // Lua 스크립트로 check-and-increment를 단일 원자 연산으로 처리한다.
    private static final RedisScript<Long> CHECK_AND_INCREMENT_SCRIPT = RedisScript.of("""
            local current = tonumber(redis.call('GET', KEYS[1])) or 0
            if current >= tonumber(ARGV[1]) then
                return -1
            end
            local next = redis.call('INCR', KEYS[1])
            if next == 1 then
                redis.call('EXPIREAT', KEYS[1], tonumber(ARGV[2]))
            end
            return next
            """, Long.class);

    private final StringRedisTemplate redisTemplate;
    private final AnalysisQueueService queueService;

    @Value("${chess-analysis.rate-limit.whitelist.usernames:}")
    private String whitelistUsernames;

    @Value("${chess-analysis.rate-limit.whitelist.ips:}")
    private String whitelistIps;

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

        if (isWhitelisted(request.getUsername(), clientIp)) {
            return;
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
        long resetEpoch = nextResetEpochSeconds();

        atomicCheckAndIncrement(usernameKey, usernameLimit, "username", resetAt, resetEpoch);
        atomicCheckAndIncrement(ipKey, IP_DAILY_LIMIT, "ip", resetAt, resetEpoch);
        atomicCheckAndIncrement(globalKey, GLOBAL_DAILY_LIMIT, "global", resetAt, resetEpoch);
    }

    private void atomicCheckAndIncrement(String key, int limit, String scope, String resetAt, long resetEpoch) {
        List<String> keys = Collections.singletonList(key);
        Long result = redisTemplate.execute(
            CHECK_AND_INCREMENT_SCRIPT,
            keys,
            String.valueOf(limit),
            String.valueOf(resetEpoch)
        );
        if (result == null || result == -1L) {
            throw limitExceeded(
                "오늘 가능한 상세 분석 횟수를 모두 사용했습니다.",
                scope,
                limit,
                limit,
                resetAt
            );
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

    private String nextResetAt() {
        ZonedDateTime now = ZonedDateTime.now(java.time.ZoneId.of(TIME_ZONE));
        return now.toLocalDate().plusDays(1).atStartOfDay(now.getZone()).toString();
    }

    private long nextResetEpochSeconds() {
        ZonedDateTime now = ZonedDateTime.now(java.time.ZoneId.of(TIME_ZONE));
        return now.toLocalDate().plusDays(1).atStartOfDay(now.getZone()).toEpochSecond();
    }

    private String normalizePriority(String priority) {
        return priority == null || priority.isBlank()
            ? "fast"
            : priority.toLowerCase(Locale.ROOT).trim();
    }

    private boolean isWhitelisted(String username, String clientIp) {
        return normalizedCsvSet(whitelistUsernames).contains(normalizeToken(username))
            || normalizedCsvSet(whitelistIps).contains(normalizeToken(clientIp));
    }

    private Set<String> normalizedCsvSet(String csv) {
        if (csv == null || csv.isBlank()) {
            return Set.of();
        }
        return Arrays.stream(csv.split(","))
            .map(this::normalizeToken)
            .filter(value -> !"unknown".equals(value))
            .collect(Collectors.toSet());
    }

    private String normalizeToken(String value) {
        if (value == null || value.isBlank()) {
            return "unknown";
        }
        return value.toLowerCase(Locale.ROOT).trim().replaceAll("[^a-z0-9._:-]", "_");
    }
}
