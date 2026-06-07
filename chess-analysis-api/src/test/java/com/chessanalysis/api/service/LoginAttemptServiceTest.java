package com.chessanalysis.api.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class LoginAttemptServiceTest {

    @Mock StringRedisTemplate redisTemplate;
    @Mock ValueOperations<String, String> valueOps;

    @InjectMocks
    LoginAttemptService service;

    private static final String EMAIL = "user@example.com";
    private static final String KEY = "login:attempt:" + EMAIL;

    @BeforeEach
    void setUp() {
        when(redisTemplate.opsForValue()).thenReturn(valueOps);
    }

    @Nested
    @DisplayName("recordFailure")
    class RecordFailure {

        @Test
        @DisplayName("첫 번째 실패 — 카운터 증가 및 TTL(15분) 설정")
        void firstFailure_incrementsAndSetsTtl() {
            when(valueOps.increment(KEY)).thenReturn(1L);

            service.recordFailure(EMAIL);

            verify(valueOps).increment(KEY);
            verify(redisTemplate).expire(KEY, Duration.ofMinutes(15));
        }

        @Test
        @DisplayName("두 번째 실패 — 카운터만 증가, TTL 재설정 없음")
        void subsequentFailure_doesNotResetTtl() {
            when(valueOps.increment(KEY)).thenReturn(2L);

            service.recordFailure(EMAIL);

            verify(valueOps).increment(KEY);
            verify(redisTemplate, never()).expire(any(), any(Duration.class));
        }

        @Test
        @DisplayName("이메일 대소문자 구분 없이 동일 키 사용")
        void caseInsensitive_usesLowercaseKey() {
            when(valueOps.increment(anyString())).thenReturn(1L);

            service.recordFailure("USER@EXAMPLE.COM");

            verify(valueOps).increment(KEY);
        }
    }

    @Nested
    @DisplayName("isBlocked")
    class IsBlocked {

        @Test
        @DisplayName("Redis 키 없음 → false")
        void noKey_returnsFalse() {
            when(valueOps.get(KEY)).thenReturn(null);

            assertThat(service.isBlocked(EMAIL)).isFalse();
        }

        @Test
        @DisplayName("시도 횟수 4회(임계값 미만) → false")
        void underThreshold_returnsFalse() {
            when(valueOps.get(KEY)).thenReturn("4");

            assertThat(service.isBlocked(EMAIL)).isFalse();
        }

        @Test
        @DisplayName("시도 횟수 5회(임계값) → true")
        void atThreshold_returnsTrue() {
            when(valueOps.get(KEY)).thenReturn("5");

            assertThat(service.isBlocked(EMAIL)).isTrue();
        }

        @Test
        @DisplayName("시도 횟수 5회 초과 → true")
        void overThreshold_returnsTrue() {
            when(valueOps.get(KEY)).thenReturn("99");

            assertThat(service.isBlocked(EMAIL)).isTrue();
        }
    }

    @Nested
    @DisplayName("clearFailures")
    class ClearFailures {

        @Test
        @DisplayName("Redis 키 삭제")
        void deletesKey() {
            service.clearFailures(EMAIL);

            verify(redisTemplate).delete(KEY);
        }

        @Test
        @DisplayName("이메일 대소문자 무관하게 동일 키 삭제")
        void caseInsensitive_deletesLowercaseKey() {
            service.clearFailures("USER@EXAMPLE.COM");

            verify(redisTemplate).delete(KEY);
        }
    }
}
