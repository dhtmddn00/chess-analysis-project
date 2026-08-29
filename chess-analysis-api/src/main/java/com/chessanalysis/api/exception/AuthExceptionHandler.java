package com.chessanalysis.api.exception;

import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * 인증 관련 예외를 구조화된 JSON body로 변환한다.
 *
 * server.error.include-message=never는 기본 에러 응답의 message를 지우므로,
 * 프론트가 사유별 분기를 하려면 body의 code 필드가 필요하다. 여기서는 오직
 * EmailNotVerifiedException만 처리하고, 나머지 예외는 기존 기본 처리(메시지 숨김)를
 * 그대로 둔다 — 내부 예외 메시지 노출 방지 정책은 유지된다.
 */
@RestControllerAdvice
public class AuthExceptionHandler {

    @ExceptionHandler(EmailNotVerifiedException.class)
    public ResponseEntity<Map<String, String>> handleEmailNotVerified(EmailNotVerifiedException ex) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of(
            "code", "EMAIL_NOT_VERIFIED",
            "message", "이메일 인증이 필요합니다. 메일함에서 인증 링크를 확인해주세요."
        ));
    }
}
