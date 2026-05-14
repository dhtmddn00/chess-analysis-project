package com.chessanalysis.api.service;

import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class SiteVisitService {
    private static final String TIME_ZONE = "Asia/Seoul";
    private static final int TOTAL_ROW_ID = 1;
    private static final String TOTAL_VIEWS_KEY = "site:views:total";
    private static final String DAILY_TOTAL_PREFIX = "site:views:daily:";

    private final JdbcTemplate jdbcTemplate;
    private final StringRedisTemplate redisTemplate;

    @Transactional
    public Map<String, Object> recordVisit(String visitorId, String clientIp, String userAgent) {
        ensureSeededFromRedis();

        String date = currentDate();
        String visitorHash = hashVisitor(visitorId, clientIp, userAgent);
        int inserted = jdbcTemplate.update("""
            INSERT INTO site_visit_days (visit_date, visitor_hash)
            VALUES (?::date, ?)
            ON CONFLICT (visit_date, visitor_hash) DO NOTHING
            """, date, visitorHash);

        boolean counted = inserted > 0;
        if (counted) {
            jdbcTemplate.update("""
                INSERT INTO site_view_totals (id, total_views, updated_at)
                VALUES (?, 1, NOW())
                ON CONFLICT (id) DO UPDATE SET
                    total_views = site_view_totals.total_views + 1,
                    updated_at = NOW()
                """, TOTAL_ROW_ID);
        }

        return buildStats(counted);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getStats() {
        return buildStats(false);
    }

    private Map<String, Object> buildStats(boolean counted) {
        String date = currentDate();
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("totalViews", totalViews());
        stats.put("todayUniqueViews", todayUniqueViews(date));
        stats.put("counted", counted);
        stats.put("date", date);
        return stats;
    }

    private long totalViews() {
        List<Long> totals = jdbcTemplate.query(
            "SELECT total_views FROM site_view_totals WHERE id = ?",
            (rs, rowNum) -> rs.getLong("total_views"),
            TOTAL_ROW_ID
        );
        if (!totals.isEmpty()) {
            return totals.get(0);
        }

        Long fallback = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM site_visit_days", Long.class);
        return fallback == null ? 0L : fallback;
    }

    private long todayUniqueViews(String date) {
        Long today = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM site_visit_days WHERE visit_date = ?::date",
            Long.class,
            date
        );
        return today == null ? 0L : today;
    }

    private void ensureSeededFromRedis() {
        List<Long> existing = jdbcTemplate.query(
            "SELECT total_views FROM site_view_totals WHERE id = ?",
            (rs, rowNum) -> rs.getLong("total_views"),
            TOTAL_ROW_ID
        );
        if (!existing.isEmpty()) {
            return;
        }

        long redisTotal = safeRedisLong(TOTAL_VIEWS_KEY);
        jdbcTemplate.update("""
            INSERT INTO site_view_totals (id, total_views, updated_at)
            VALUES (?, ?, NOW())
            ON CONFLICT (id) DO NOTHING
            """, TOTAL_ROW_ID, redisTotal);
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

    private long safeRedisLong(String key) {
        try {
            String value = redisTemplate.opsForValue().get(key);
            if (value == null || value.isBlank()) {
                return 0L;
            }
            return Long.parseLong(value);
        } catch (DataAccessException | NumberFormatException e) {
            return 0L;
        }
    }
}
