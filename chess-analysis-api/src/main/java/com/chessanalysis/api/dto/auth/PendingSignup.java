package com.chessanalysis.api.dto.auth;

/**
 * 이메일 인증 완료 전까지 Redis에 임시 보관되는 가입 정보.
 * 인증 링크 클릭 시 이 정보로 실제 User를 DB에 생성한다.
 */
public record PendingSignup(
        String email,
        String passwordHash,
        String name,
        String country,
        String agreedAt   // ISO-8601 문자열 (약관·개인정보 동의 시각)
) {}
