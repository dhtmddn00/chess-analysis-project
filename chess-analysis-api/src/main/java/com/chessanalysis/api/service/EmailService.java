package com.chessanalysis.api.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.Map;

@Service
@Slf4j
public class EmailService {

    private final RestClient restClient;
    private final String from;
    private final String frontendUrl;
    private final boolean enabled;

    public EmailService(
            @Value("${resend.api-key:}") String apiKey,
            @Value("${resend.from:onboarding@resend.dev}") String from,
            @Value("${app.frontend-url:http://localhost:3000}") String frontendUrl) {
        this.from = from;
        this.frontendUrl = frontendUrl;
        this.enabled = apiKey != null && !apiKey.isBlank();

        this.restClient = RestClient.builder()
                .baseUrl("https://api.resend.com")
                .defaultHeader("Authorization", "Bearer " + (enabled ? apiKey : ""))
                .build();
    }

    // 프론트는 next-intl locale-prefixed 라우팅(/ko, /en) 사용.
    // locale 없는 경로는 미들웨어 리다이렉트에 의존하게 되므로 명시적으로 기본 로케일을 붙인다.
    private static final String DEFAULT_LOCALE = "/ko";

    public void sendVerificationEmail(String toEmail, String token) {
        String verifyUrl = frontendUrl + DEFAULT_LOCALE + "/auth/verify-email?token=" + token;

        String html = """
                <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
                  <h2 style="color:#18181b">♟ ChessLab 이메일 인증</h2>
                  <p style="color:#52525b">아래 버튼을 클릭해서 이메일 인증을 완료해주세요.<br>링크는 24시간 동안 유효합니다.</p>
                  <a href="%s"
                     style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;
                            padding:12px 24px;border-radius:8px;font-weight:600;margin:16px 0">
                    이메일 인증하기
                  </a>
                  <p style="color:#a1a1aa;font-size:13px">버튼이 작동하지 않으면 아래 URL을 복사해서 브라우저에 붙여넣으세요.<br>%s</p>
                </div>
                """.formatted(verifyUrl, verifyUrl);

        if (!enabled) {
            log.warn("[EmailService] RESEND_API_KEY 미설정 — 이메일 발송 건너뜀. 인증 URL: {}", verifyUrl);
            return;
        }

        send(toEmail, "[ChessLab] 이메일 인증을 완료해주세요", html);
        log.info("[EmailService] 인증 메일 발송 완료: {}", toEmail);
    }

    public void sendPasswordResetEmail(String toEmail, String token) {
        String resetUrl = frontendUrl + DEFAULT_LOCALE + "/auth/reset-password?token=" + token;

        String html = """
                <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
                  <h2 style="color:#18181b">♟ ChessLab 비밀번호 재설정</h2>
                  <p style="color:#52525b">아래 버튼을 클릭해서 비밀번호를 재설정해주세요.<br>링크는 1시간 동안 유효합니다.</p>
                  <a href="%s"
                     style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;
                            padding:12px 24px;border-radius:8px;font-weight:600;margin:16px 0">
                    비밀번호 재설정
                  </a>
                  <p style="color:#a1a1aa;font-size:13px">본인이 요청하지 않았다면 이 메일을 무시하세요.<br>%s</p>
                </div>
                """.formatted(resetUrl, resetUrl);

        if (!enabled) {
            log.warn("[EmailService] RESEND_API_KEY 미설정 — 발송 건너뜀. 재설정 URL: {}", resetUrl);
            return;
        }

        send(toEmail, "[ChessLab] 비밀번호 재설정 안내", html);
        log.info("[EmailService] 비밀번호 재설정 메일 발송 완료: {}", toEmail);
    }

    private void send(String toEmail, String subject, String html) {
        try {
            restClient.post()
                    .uri("/emails")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of(
                            "from", from,
                            "to", new String[]{toEmail},
                            "subject", subject,
                            "html", html
                    ))
                    .retrieve()
                    .toBodilessEntity();
        } catch (Exception e) {
            log.error("[EmailService] 메일 발송 실패: {}", e.getMessage());
            throw new RuntimeException("이메일 발송에 실패했습니다. 잠시 후 다시 시도해주세요.");
        }
    }
}
