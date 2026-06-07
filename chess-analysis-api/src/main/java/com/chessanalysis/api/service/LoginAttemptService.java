package com.chessanalysis.api.service;

import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;

@Service
@RequiredArgsConstructor
public class LoginAttemptService {

    private static final int MAX_ATTEMPTS = 5;
    private static final Duration BLOCK_DURATION = Duration.ofMinutes(15);
    private static final String KEY_PREFIX = "login:attempt:";

    private final StringRedisTemplate redisTemplate;

    public void recordFailure(String email) {
        String key = KEY_PREFIX + email.toLowerCase();
        Long count = redisTemplate.opsForValue().increment(key);
        if (count != null && count == 1) {
            redisTemplate.expire(key, BLOCK_DURATION);
        }
    }

    public boolean isBlocked(String email) {
        String value = redisTemplate.opsForValue().get(KEY_PREFIX + email.toLowerCase());
        if (value == null) return false;
        return Integer.parseInt(value) >= MAX_ATTEMPTS;
    }

    public void clearFailures(String email) {
        redisTemplate.delete(KEY_PREFIX + email.toLowerCase());
    }
}
