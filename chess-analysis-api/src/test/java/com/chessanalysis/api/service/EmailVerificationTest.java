package com.chessanalysis.api.service;

import com.chessanalysis.api.config.JwtProperties;
import com.chessanalysis.api.dto.auth.AuthResponse;
import com.chessanalysis.api.dto.auth.PendingSignup;
import com.chessanalysis.api.dto.auth.SignupRequest;
import com.chessanalysis.api.entity.User;
import com.chessanalysis.api.repository.UserRepository;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
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

/**
 * 새 가입 흐름 검증: signup은 Redis(PendingSignup)에 임시 저장만 하고,
 * verifyEmail 시점에 DB에 User를 생성한다.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class EmailVerificationTest {

    @Mock UserRepository userRepository;
    @Mock JwtService jwtService;
    @Mock PasswordEncoder passwordEncoder;
    @Mock LoginAttemptService loginAttemptService;
    @Mock SignupRateLimitService signupRateLimitService;
    @Mock PendingSignupService pendingSignupService;
    @Mock JwtProperties jwtProperties;
    @Mock EmailService emailService;
    @Mock HttpServletResponse response;

    @InjectMocks
    AuthService authService;

    private final UUID userId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(authService, "cookieSecure", false);
        when(jwtProperties.getExpirationSeconds()).thenReturn(604800L);
    }

    private SignupRequest signupReq() {
        SignupRequest req = new SignupRequest();
        req.setEmail("new@example.com");
        req.setPassword("Password123!");
        req.setName("신규유저");
        req.setTermsAgreed(true);
        req.setPrivacyAgreed(true);
        return req;
    }

    // ── 회원가입: Redis 임시 저장 ──────────────────────────────────────────────

    @Nested
    @DisplayName("회원가입 (signup)")
    class Signup {

        @Test
        @DisplayName("가입 시 DB 저장 없이 Redis pending 저장 + 메일 발송")
        void storesPendingAndSendsEmail() {
            when(userRepository.existsByEmail("new@example.com")).thenReturn(false);
            when(userRepository.existsByNameIgnoreCase("신규유저")).thenReturn(false);
            when(passwordEncoder.encode("Password123!")).thenReturn("hashed");

            authService.signup(signupReq(), "1.2.3.4");

            // DB 저장 안 함
            verify(userRepository, never()).saveAndFlush(any());
            verify(userRepository, never()).save(any());

            // Redis pending 저장 + 메일 발송
            ArgumentCaptor<String> tokenCaptor = ArgumentCaptor.forClass(String.class);
            ArgumentCaptor<PendingSignup> pendingCaptor = ArgumentCaptor.forClass(PendingSignup.class);
            verify(pendingSignupService).store(tokenCaptor.capture(), pendingCaptor.capture());
            assertThat(tokenCaptor.getValue()).hasSize(64);
            assertThat(pendingCaptor.getValue().email()).isEqualTo("new@example.com");
            assertThat(pendingCaptor.getValue().passwordHash()).isEqualTo("hashed");
            verify(emailService).sendVerificationEmail(eq("new@example.com"), eq(tokenCaptor.getValue()));
        }

        @Test
        @DisplayName("이미 가입된 이메일 → 409, pending 저장 안 함")
        void existingEmail_throws409() {
            when(userRepository.existsByEmail("new@example.com")).thenReturn(true);

            assertThatThrownBy(() -> authService.signup(signupReq(), "1.2.3.4"))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode())
                            .isEqualTo(HttpStatus.CONFLICT));
            verify(pendingSignupService, never()).store(any(), any());
        }

        @Test
        @DisplayName("이미 가입된 이름 → 409")
        void existingName_throws409() {
            when(userRepository.existsByEmail("new@example.com")).thenReturn(false);
            when(userRepository.existsByNameIgnoreCase("신규유저")).thenReturn(true);

            assertThatThrownBy(() -> authService.signup(signupReq(), "1.2.3.4"))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode())
                            .isEqualTo(HttpStatus.CONFLICT));
        }

        @Test
        @DisplayName("메일 발송 실패해도 pending은 저장됨 (예외 전파 안 함)")
        void emailFailure_pendingStillStored() {
            when(userRepository.existsByEmail(any())).thenReturn(false);
            when(userRepository.existsByNameIgnoreCase(any())).thenReturn(false);
            when(passwordEncoder.encode(any())).thenReturn("hashed");
            doThrow(new RuntimeException("메일 실패"))
                    .when(emailService).sendVerificationEmail(any(), any());

            assertThatCode(() -> authService.signup(signupReq(), "1.2.3.4"))
                    .doesNotThrowAnyException();
            verify(pendingSignupService).store(any(), any());
        }
    }

    // ── 이메일 인증: DB User 생성 ──────────────────────────────────────────────

    @Nested
    @DisplayName("이메일 인증 (verifyEmail)")
    class VerifyEmail {

        private PendingSignup pending() {
            return new PendingSignup("new@example.com", "hashed", "신규유저", "KR",
                    LocalDateTime.now().toString());
        }

        @Test
        @DisplayName("유효한 토큰 → DB에 User 생성(emailVerified=true), JWT 쿠키, pending 삭제")
        void validToken_createsUser() {
            when(pendingSignupService.findByToken("tok")).thenReturn(Optional.of(pending()));
            when(userRepository.existsByEmail("new@example.com")).thenReturn(false);
            when(userRepository.existsByNameIgnoreCase("신규유저")).thenReturn(false);
            when(userRepository.saveAndFlush(any(User.class))).thenAnswer(inv -> {
                User u = inv.getArgument(0);
                ReflectionTestUtils.setField(u, "id", userId);
                ReflectionTestUtils.setField(u, "createdAt", LocalDateTime.now());
                return u;
            });
            when(jwtService.generateToken(userId)).thenReturn("jwt");

            AuthResponse result = authService.verifyEmail("tok", response);

            assertThat(result.getEmail()).isEqualTo("new@example.com");
            assertThat(result.getCountry()).isEqualTo("KR");
            ArgumentCaptor<User> userCaptor = ArgumentCaptor.forClass(User.class);
            verify(userRepository).saveAndFlush(userCaptor.capture());
            assertThat(userCaptor.getValue().isEmailVerified()).isTrue();
            verify(pendingSignupService).delete("tok", "new@example.com");
            verify(response).addHeader(eq("Set-Cookie"), contains("auth_token=jwt"));
        }

        @Test
        @DisplayName("없거나 만료된 토큰 → 400")
        void missingToken_throws400() {
            when(pendingSignupService.findByToken("bad")).thenReturn(Optional.empty());

            assertThatThrownBy(() -> authService.verifyEmail("bad", response))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode())
                            .isEqualTo(HttpStatus.BAD_REQUEST));
            verify(userRepository, never()).saveAndFlush(any());
        }

        @Test
        @DisplayName("대기 중 이메일 선점됨 → 409, pending 삭제")
        void emailTakenDuringWait_throws409() {
            when(pendingSignupService.findByToken("tok")).thenReturn(Optional.of(pending()));
            when(userRepository.existsByEmail("new@example.com")).thenReturn(true);

            assertThatThrownBy(() -> authService.verifyEmail("tok", response))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode())
                            .isEqualTo(HttpStatus.CONFLICT));
            verify(pendingSignupService).delete("tok", "new@example.com");
            verify(userRepository, never()).saveAndFlush(any());
        }
    }

    // ── 인증 메일 재발송 ─────────────────────────────────────────────────────

    @Nested
    @DisplayName("인증 메일 재발송 (resendVerification)")
    class ResendVerification {

        @Test
        @DisplayName("대기 중 가입 존재 → 동일 토큰으로 재발송")
        void pendingExists_resends() {
            when(pendingSignupService.findTokenByEmail("user@example.com")).thenReturn(Optional.of("tok123"));

            authService.resendVerification("user@example.com");

            verify(emailService).sendVerificationEmail("user@example.com", "tok123");
        }

        @Test
        @DisplayName("대기 중 가입 없음 → 메일 발송 안 함 (열거 방어)")
        void noPending_silentlyIgnored() {
            when(pendingSignupService.findTokenByEmail("ghost@example.com")).thenReturn(Optional.empty());

            assertThatCode(() -> authService.resendVerification("ghost@example.com"))
                    .doesNotThrowAnyException();
            verify(emailService, never()).sendVerificationEmail(any(), any());
        }
    }
}
