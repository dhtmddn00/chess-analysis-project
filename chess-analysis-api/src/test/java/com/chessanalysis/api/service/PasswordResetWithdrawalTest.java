package com.chessanalysis.api.service;

import com.chessanalysis.api.config.JwtProperties;
import com.chessanalysis.api.entity.User;
import com.chessanalysis.api.repository.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
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
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PasswordResetWithdrawalTest {

    @Mock UserRepository userRepository;
    @Mock JwtService jwtService;
    @Mock PasswordEncoder passwordEncoder;
    @Mock LoginAttemptService loginAttemptService;
    @Mock SignupRateLimitService signupRateLimitService;
    @Mock JwtProperties jwtProperties;
    @Mock EmailService emailService;
    @Mock HttpServletRequest request;
    @Mock HttpServletResponse response;

    @InjectMocks
    AuthService authService;

    private final UUID userId = UUID.randomUUID();
    private User user;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(authService, "cookieSecure", false);
        when(jwtProperties.getExpirationSeconds()).thenReturn(604800L);

        user = User.builder()
                .email("user@example.com")
                .passwordHash("$2a$12$old")
                .name("테스터")
                .emailVerified(true)
                .build();
        ReflectionTestUtils.setField(user, "id", userId);
        ReflectionTestUtils.setField(user, "active", true);
        ReflectionTestUtils.setField(user, "createdAt", LocalDateTime.now());
        ReflectionTestUtils.setField(user, "subscriptionTier", "free");
    }

    // ── 비밀번호 재설정 요청 ───────────────────────────────────────────────────

    @Nested
    @DisplayName("requestPasswordReset")
    class RequestReset {

        @Test
        @DisplayName("인증된 계정 → 토큰 생성 후 메일 발송")
        void verifiedUser_sendsResetMail() {
            when(userRepository.findByEmail("user@example.com")).thenReturn(Optional.of(user));
            when(userRepository.save(any())).thenReturn(user);

            authService.requestPasswordReset("user@example.com");

            assertThat(user.getPasswordResetToken()).hasSize(64);
            assertThat(user.getPasswordResetExpiresAt()).isAfter(LocalDateTime.now());
            verify(emailService).sendPasswordResetEmail(eq("user@example.com"), anyString());
        }

        @Test
        @DisplayName("미인증 계정 → 메일 발송 안 함 (열거 방어)")
        void unverifiedUser_silentlyIgnored() {
            ReflectionTestUtils.setField(user, "emailVerified", false);
            when(userRepository.findByEmail("user@example.com")).thenReturn(Optional.of(user));

            assertThatCode(() -> authService.requestPasswordReset("user@example.com"))
                    .doesNotThrowAnyException();
            verify(emailService, never()).sendPasswordResetEmail(any(), any());
        }

        @Test
        @DisplayName("없는 이메일 → 메일 발송 안 함, 에러 없음 (열거 방어)")
        void unknownEmail_silentlyIgnored() {
            when(userRepository.findByEmail("ghost@example.com")).thenReturn(Optional.empty());

            assertThatCode(() -> authService.requestPasswordReset("ghost@example.com"))
                    .doesNotThrowAnyException();
            verify(emailService, never()).sendPasswordResetEmail(any(), any());
        }

        @Test
        @DisplayName("메일 발송 실패해도 토큰은 저장됨 (롤백 안 함)")
        void emailFailure_tokenStillSaved() {
            when(userRepository.findByEmail("user@example.com")).thenReturn(Optional.of(user));
            when(userRepository.save(any())).thenReturn(user);
            doThrow(new RuntimeException("메일 실패"))
                    .when(emailService).sendPasswordResetEmail(any(), any());

            assertThatCode(() -> authService.requestPasswordReset("user@example.com"))
                    .doesNotThrowAnyException();
            assertThat(user.getPasswordResetToken()).isNotNull();
        }
    }

    // ── 비밀번호 재설정 확정 ───────────────────────────────────────────────────

    @Nested
    @DisplayName("confirmPasswordReset")
    class ConfirmReset {

        @Test
        @DisplayName("유효한 토큰 → 비밀번호 변경, 토큰 제거, 실패카운트 정리")
        void validToken_changesPassword() {
            user.setPasswordResetToken("validtoken");
            user.setPasswordResetExpiresAt(LocalDateTime.now().plusMinutes(30));
            when(userRepository.findByPasswordResetToken("validtoken")).thenReturn(Optional.of(user));
            when(passwordEncoder.encode("NewPass123!")).thenReturn("$2a$12$new");
            when(userRepository.save(any())).thenReturn(user);

            authService.confirmPasswordReset("validtoken", "NewPass123!");

            assertThat(user.getPasswordHash()).isEqualTo("$2a$12$new");
            assertThat(user.getPasswordResetToken()).isNull();
            assertThat(user.getPasswordResetExpiresAt()).isNull();
            verify(loginAttemptService).clearFailures("user@example.com");
        }

        @Test
        @DisplayName("없는 토큰 → 400")
        void invalidToken_throws400() {
            when(userRepository.findByPasswordResetToken("bad")).thenReturn(Optional.empty());

            assertThatThrownBy(() -> authService.confirmPasswordReset("bad", "NewPass123!"))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode())
                            .isEqualTo(HttpStatus.BAD_REQUEST));
        }

        @Test
        @DisplayName("만료된 토큰 → 410")
        void expiredToken_throws410() {
            user.setPasswordResetToken("expired");
            user.setPasswordResetExpiresAt(LocalDateTime.now().minusMinutes(1));
            when(userRepository.findByPasswordResetToken("expired")).thenReturn(Optional.of(user));

            assertThatThrownBy(() -> authService.confirmPasswordReset("expired", "NewPass123!"))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode())
                            .isEqualTo(HttpStatus.GONE));
        }
    }

    // ── 회원 탈퇴 ──────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("withdraw")
    class Withdraw {

        @Test
        @DisplayName("정상 탈퇴 → 개인정보 익명화, 비활성화, 쿠키 제거")
        void success_anonymizesAndDeactivates() {
            when(request.getCookies()).thenReturn(new jakarta.servlet.http.Cookie[]{
                    new jakarta.servlet.http.Cookie("auth_token", "validtoken")
            });
            when(jwtService.isValid("validtoken")).thenReturn(true);
            when(jwtService.extractUserId("validtoken")).thenReturn(userId);
            when(userRepository.findById(userId)).thenReturn(Optional.of(user));
            when(userRepository.save(any())).thenReturn(user);

            authService.withdraw(request, response);

            assertThat(user.getEmail()).isEqualTo("deleted_" + userId + "@deleted.local");
            assertThat(user.getName()).isEqualTo("deleted_" + userId);
            assertThat(user.getPasswordHash()).isEmpty();
            assertThat(user.isActive()).isFalse();
            assertThat(user.getDeletedAt()).isNotNull();
            // 로그아웃 쿠키 제거
            verify(response).addHeader(eq("Set-Cookie"), contains("auth_token="));
        }

        @Test
        @DisplayName("토큰 없음 → 401")
        void noToken_throws401() {
            when(request.getCookies()).thenReturn(null);

            assertThatThrownBy(() -> authService.withdraw(request, response))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode())
                            .isEqualTo(HttpStatus.UNAUTHORIZED));
        }
    }
}
