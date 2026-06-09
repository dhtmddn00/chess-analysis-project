package com.chessanalysis.api.service;

import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;

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
        Long count = redisTemplate.opsForValue().increment(key);
        if (count != null && count == 1) {
            redisTemplate.expire(key, window);
        }
        if (count != null && count > max) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "잠시 후 다시 시도해주세요.");
        }
    }
}
