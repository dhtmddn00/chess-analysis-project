package com.chessanalysis.api.service;

import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.util.List;

@Service
@RequiredArgsConstructor
public class SignupRateLimitService {

    // 회원가입: IP당 1시간에 10회
    private static final int MAX_SIGNUPS_PER_IP = 10;
    private static final Duration SIGNUP_WINDOW = Duration.ofHours(1);

    // 재발송: 이메일당 1시간에 5회
    private static final int MAX_RESEND_PER_EMAIL = 5;
    private static final Duration RESEND_WINDOW = Duration.ofHours(1);

    // 이메일 중복 확인: IP당 1분에 30회
    private static final int MAX_CHECK_PER_IP = 30;
    private static final Duration CHECK_WINDOW = Duration.ofMinutes(1);

    // INCR + EXPIRE 원자적 처리 (AnalysisRateLimitService와 동일 패턴)
    // EXPIRE가 INCR과 별도로 실행되면 Redis 장애 시 TTL 없는 영구 키가 생성될 수 있음
    private static final RedisScript<Long> INCREMENT_SCRIPT = RedisScript.of(
        "local c = redis.call('INCR', KEYS[1])\n" +
        "if c == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end\n" +
        "return c",
        Long.class
    );

    private final StringRedisTemplate redisTemplate;

    public void checkSignupLimit(String ip) {
        enforce("signup:ip:" + ip, MAX_SIGNUPS_PER_IP, SIGNUP_WINDOW);
    }

    public void checkResendLimit(String email) {
        enforce("resend:email:" + email.toLowerCase(), MAX_RESEND_PER_EMAIL, RESEND_WINDOW);
    }

    public void checkEmailCheckLimit(String ip) {
        enforce("emailcheck:ip:" + ip, MAX_CHECK_PER_IP, CHECK_WINDOW);
    }

    public void checkNameCheckLimit(String ip) {
        enforce("namecheck:ip:" + ip, MAX_CHECK_PER_IP, CHECK_WINDOW);
    }

    private void enforce(String key, int max, Duration window) {
        Long count = redisTemplate.execute(
            INCREMENT_SCRIPT,
            List.of(key),
            String.valueOf(window.getSeconds())
        );
        if (count != null && count > max) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "잠시 후 다시 시도해주세요.");
        }
    }
}
