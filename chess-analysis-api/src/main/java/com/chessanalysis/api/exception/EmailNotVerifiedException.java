package com.chessanalysis.api.exception;

/**
 * 이메일 미인증 상태에서 로그인을 시도한 경우.
 *
 * ResponseStatusException(403, "EMAIL_NOT_VERIFIED")로 던지면 application.yml의
 * server.error.include-message=never 설정이 message를 지워 프론트가 사유를 알 수 없다.
 * 이 예외는 AuthExceptionHandler에서 응답 body의 code 필드로 변환되어,
 * include-message 설정과 무관하게 프론트가 "이메일 인증 필요"를 구분할 수 있게 한다.
 */
public class EmailNotVerifiedException extends RuntimeException {
    public EmailNotVerifiedException() {
        super("EMAIL_NOT_VERIFIED");
    }
}
