package com.chessanalysis.api.service;

import com.chessanalysis.api.dto.auth.PendingSignup;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.Optional;

/**
 * 이메일 인증 완료 전 가입 정보를 Redis에 임시 보관한다 (TTL 24h).
 * 미인증 계정이 DB에 쌓이지 않도록, 인증 시점에만 User를 생성한다.
 *
 * <p>키 구조:
 * <ul>
 *   <li>{@code signup:pending:token:<token>} → 가입 정보 JSON (인증 링크 조회용)</li>
 *   <li>{@code signup:pending:email:<email>} → token (재발송 시 역조회용)</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class PendingSignupService {

    private static final Duration TTL = Duration.ofHours(24);
    private static final String TOKEN_PREFIX = "signup:pending:token:";
    private static final String EMAIL_PREFIX = "signup:pending:email:";

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;

    public void store(String token, PendingSignup pending) {
        try {
            String json = objectMapper.writeValueAsString(pending);
            redisTemplate.opsForValue().set(TOKEN_PREFIX + token, json, TTL);
            redisTemplate.opsForValue().set(EMAIL_PREFIX + pending.email(), token, TTL);
        } catch (Exception e) {
            throw new RuntimeException("가입 정보 임시 저장에 실패했습니다.", e);
        }
    }

    public Optional<PendingSignup> findByToken(String token) {
        String json = redisTemplate.opsForValue().get(TOKEN_PREFIX + token);
        if (json == null) return Optional.empty();
        try {
            return Optional.of(objectMapper.readValue(json, PendingSignup.class));
        } catch (Exception e) {
            log.warn("[PendingSignup] 역직렬화 실패: {}", e.getMessage());
            return Optional.empty();
        }
    }

    public Optional<String> findTokenByEmail(String email) {
        return Optional.ofNullable(redisTemplate.opsForValue().get(EMAIL_PREFIX + email));
    }

    public void delete(String token, String email) {
        redisTemplate.delete(TOKEN_PREFIX + token);
        redisTemplate.delete(EMAIL_PREFIX + email);
    }
}
