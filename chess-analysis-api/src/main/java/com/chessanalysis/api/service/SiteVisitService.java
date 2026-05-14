package com.chessanalysis.api.service;

import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class SiteVisitService {
    private static final String TIME_ZONE = "Asia/Seoul";
    private static final String TOTAL_VIEWS_KEY = "site:views:total";
    private static final String DAILY_UNIQUE_PREFIX = "site:views:unique:";
    private static final String DAILY_TOTAL_PREFIX = "site:views:daily:";

    private final StringRedisTemplate redisTemplate;

    public Map<String, Object> recordVisit(String visitorId, String clientIp, String userAgent) {
        String date = currentDate();
        String visitorHash = hashVisitor(visitorId, clientIp, userAgent);
        String uniqueKey = DAILY_UNIQUE_PREFIX + date + ":" + visitorHash;

        Boolean firstVisitToday = redisTemplate.opsForValue()
            .setIfAbsent(uniqueKey, "1", ttlUntilTomorrow());

        boolean counted = Boolean.TRUE.equals(firstVisitToday);
        if (counted) {
            redisTemplate.opsForValue().increment(TOTAL_VIEWS_KEY);
            Long dailyCount = redisTemplate.opsForValue().increment(DAILY_TOTAL_PREFIX + date);
            if (dailyCount != null && dailyCount == 1L) {
                redisTemplate.expire(DAILY_TOTAL_PREFIX + date, Duration.ofDays(35));
            }
        }

        return buildStats(counted);
    }

    public Map<String, Object> getStats() {
        return buildStats(false);
    }

    private Map<String, Object> buildStats(boolean counted) {
        String date = currentDate();
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("totalViews", parseLong(redisTemplate.opsForValue().get(TOTAL_VIEWS_KEY)));
        stats.put("todayUniqueViews", parseLong(redisTemplate.opsForValue().get(DAILY_TOTAL_PREFIX + date)));
        stats.put("counted", counted);
        stats.put("date", date);
        return stats;
    }

    private String hashVisitor(String visitorId, String clientIp, String userAgent) {
        if (visitorId != null && !visitorId.isBlank()) {
            return sha256("visitor|" + visitorId.trim());
        }

        String networkHint = clientIp == null || clientIp.isBlank()
            ? "unknown-ip"
            : clientIp.trim();
        String agentHint = userAgent == null || userAgent.isBlank()
            ? "unknown-agent"
            : userAgent.trim();

        return sha256("fallback|" + networkHint + "|" + agentHint);
    }

    private String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (Exception e) {
            return Integer.toHexString(value.hashCode());
        }
    }

    private String currentDate() {
        return LocalDate.now(ZoneId.of(TIME_ZONE)).format(DateTimeFormatter.ISO_DATE);
    }

    private Duration ttlUntilTomorrow() {
        ZonedDateTime now = ZonedDateTime.now(ZoneId.of(TIME_ZONE));
        ZonedDateTime tomorrow = now.toLocalDate().plusDays(1).atStartOfDay(now.getZone());
        return Duration.between(now, tomorrow);
    }

    private long parseLong(String value) {
        if (value == null || value.isBlank()) {
            return 0L;
        }
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException e) {
            return 0L;
        }
    }
}
