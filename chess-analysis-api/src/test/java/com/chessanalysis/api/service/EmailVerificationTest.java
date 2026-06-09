package com.chessanalysis.api.service;

import com.chessanalysis.api.config.JwtProperties;
import com.chessanalysis.api.dto.auth.AuthResponse;
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

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class EmailVerificationTest {

    @Mock UserRepository userRepository;
    @Mock JwtService jwtService;
    @Mock PasswordEncoder passwordEncoder;
    @Mock LoginAttemptService loginAttemptService;
    @Mock JwtProperties jwtProperties;
    @Mock EmailService emailService;
    @Mock SignupRateLimitService signupRateLimitService;
    @Mock HttpServletResponse response;

    @InjectMocks
    AuthService authService;

    private final UUID userId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(authService, "cookieSecure", false);
        when(jwtProperties.getExpirationSeconds()).thenReturn(604800L);
    }

    private User makeUser(boolean verified, String token, LocalDateTime expiresAt) {
        User u = User.builder()
                .email("user@example.com")
                .passwordHash("hash")
                .name("테스터")
                .emailVerified(verified)
                .verificationToken(token)
                .verificationTokenExpiresAt(expiresAt)
                .build();
        ReflectionTestUtils.setField(u, "id", userId);
        ReflectionTestUtils.setField(u, "createdAt", LocalDateTime.now());
        ReflectionTestUtils.setField(u, "subscriptionTier", "free");
        return u;
    }

    // ── 회원가입 ─────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("회원가입")
    class Signup {

        @Test
        @DisplayName("가입 시 인증 토큰 생성 후 메일 발송, JWT 쿠키 미발급")
        void signup_sendsEmailAndNoJwt() {
            SignupRequest req = new SignupRequest();
            req.setEmail("new@example.com");
            req.setPassword("password123");
            req.setName("신규");

            when(passwordEncoder.encode(any())).thenReturn("hashed");
            when(userRepository.saveAndFlush(any(User.class))).thenAnswer(inv -> {
                User u = inv.getArgument(0);
                ReflectionTestUtils.setField(u, "id", userId);
                ReflectionTestUtils.setField(u, "createdAt", LocalDateTime.now());
                return u;
            });

            authService.signup(req, "127.0.0.1");

            // 인증 메일 발송됨
            ArgumentCaptor<String> emailCaptor = ArgumentCaptor.forClass(String.class);
            ArgumentCaptor<String> tokenCaptor = ArgumentCaptor.forClass(String.class);
            verify(emailService).sendVerificationEmail(emailCaptor.capture(), tokenCaptor.capture());
            assertThat(emailCaptor.getValue()).isEqualTo("new@example.com");
            assertThat(tokenCaptor.getValue()).hasSize(64);  // 32바이트 hex

            // JWT 쿠키 미발급
            verify(response, never()).addHeader(any(), any());
            verify(jwtService, never()).generateToken(any());
        }

        @Test
        @DisplayName("저장되는 유저는 email_verified=false, 토큰 만료 24시간 후")
        void signup_userSavedWithVerificationFields() {
            SignupRequest req = new SignupRequest();
            req.setEmail("new@example.com");
            req.setPassword("password123");
            req.setName("신규");

            when(passwordEncoder.encode(any())).thenReturn("hashed");
            ArgumentCaptor<User> userCaptor = ArgumentCaptor.forClass(User.class);
            when(userRepository.saveAndFlush(userCaptor.capture())).thenAnswer(inv -> {
                User u = inv.getArgument(0);
                ReflectionTestUtils.setField(u, "id", userId);
                ReflectionTestUtils.setField(u, "createdAt", LocalDateTime.now());
                return u;
            });

            authService.signup(req, "127.0.0.1");

            User saved = userCaptor.getValue();
            assertThat(saved.isEmailVerified()).isFalse();
            assertThat(saved.getVerificationToken()).isNotBlank();
            assertThat(saved.getVerificationTokenExpiresAt())
                    .isAfter(LocalDateTime.now().plusHours(23))
                    .isBefore(LocalDateTime.now().plusHours(25));
        }
    }

    // ── 이메일 인증 ──────────────────────────────────────────────────────────

    @Nested
    @DisplayName("이메일 인증 (verifyEmail)")
    class VerifyEmail {

        @Test
        @DisplayName("유효한 토큰 → 인증 완료, JWT 쿠키 발급, 토큰 삭제")
        void validToken_verifiesAndIssuesJwt() {
            User user = makeUser(false, "validtoken123", LocalDateTime.now().plusHours(1));
            when(userRepository.findByVerificationToken("validtoken123")).thenReturn(Optional.of(user));
            when(userRepository.save(any())).thenReturn(user);
            when(jwtService.generateToken(userId)).thenReturn("jwt");

            AuthResponse result = authService.verifyEmail("validtoken123", response);

            assertThat(result.getEmail()).isEqualTo("user@example.com");
            assertThat(user.isEmailVerified()).isTrue();
            assertThat(user.getVerificationToken()).isNull();
            assertThat(user.getVerificationTokenExpiresAt()).isNull();
            verify(response).addHeader(eq("Set-Cookie"), contains("auth_token=jwt"));
        }

        @Test
        @DisplayName("없는 토큰 → 400 Bad Request")
        void invalidToken_throws400() {
            when(userRepository.findByVerificationToken("badtoken")).thenReturn(Optional.empty());

            assertThatThrownBy(() -> authService.verifyEmail("badtoken", response))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode())
                            .isEqualTo(HttpStatus.BAD_REQUEST));
        }

        @Test
        @DisplayName("만료된 토큰 → 410 Gone")
        void expiredToken_throws410() {
            User user = makeUser(false, "expiredtoken", LocalDateTime.now().minusMinutes(1));
            when(userRepository.findByVerificationToken("expiredtoken")).thenReturn(Optional.of(user));

            assertThatThrownBy(() -> authService.verifyEmail("expiredtoken", response))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode())
                            .isEqualTo(HttpStatus.GONE));

            assertThat(user.isEmailVerified()).isFalse();
        }
    }

    // ── 로그인 미인증 차단 ────────────────────────────────────────────────────

    @Nested
    @DisplayName("미인증 계정 로그인 차단")
    class UnverifiedLogin {

        @Test
        @DisplayName("이메일 미인증 계정 로그인 시도 → 403 EMAIL_NOT_VERIFIED")
        void unverifiedUser_cannotLogin() {
            User user = makeUser(false, "token", LocalDateTime.now().plusHours(1));
            when(loginAttemptService.isBlocked(any())).thenReturn(false);
            when(userRepository.findByEmail("user@example.com")).thenReturn(Optional.of(user));
            when(passwordEncoder.matches(any(), any())).thenReturn(true);

            var req = new com.chessanalysis.api.dto.auth.LoginRequest();
            req.setEmail("user@example.com");
            req.setPassword("pw");

            assertThatThrownBy(() -> authService.login(req, response))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(e -> {
                        assertThat(((ResponseStatusException) e).getStatusCode())
                                .isEqualTo(HttpStatus.FORBIDDEN);
                        assertThat(e.getMessage()).contains("EMAIL_NOT_VERIFIED");
                    });

            verify(jwtService, never()).generateToken(any());
        }

        @Test
        @DisplayName("이메일 인증 완료 계정 → 정상 로그인")
        void verifiedUser_canLogin() {
            User user = makeUser(true, null, null);
            ReflectionTestUtils.setField(user, "active", true);
            when(loginAttemptService.isBlocked(any())).thenReturn(false);
            when(userRepository.findByEmail("user@example.com")).thenReturn(Optional.of(user));
            when(passwordEncoder.matches(any(), any())).thenReturn(true);
            when(jwtService.generateToken(userId)).thenReturn("jwt");
            when(userRepository.save(any())).thenReturn(user);

            var req = new com.chessanalysis.api.dto.auth.LoginRequest();
            req.setEmail("user@example.com");
            req.setPassword("pw");

            assertThatCode(() -> authService.login(req, response)).doesNotThrowAnyException();
            verify(jwtService).generateToken(userId);
        }
    }

    // ── 인증 메일 재발송 ─────────────────────────────────────────────────────

    @Nested
    @DisplayName("인증 메일 재발송 (resendVerification)")
    class ResendVerification {

        @Test
        @DisplayName("미인증 계정 → 새 토큰 생성 후 메일 재발송")
        void resend_refreshesTokenAndSendsMail() {
            User user = makeUser(false, "oldtoken", LocalDateTime.now().plusHours(1));
            when(userRepository.findByEmail("user@example.com")).thenReturn(Optional.of(user));
            when(userRepository.save(any())).thenReturn(user);

            authService.resendVerification("user@example.com");

            assertThat(user.getVerificationToken()).isNotEqualTo("oldtoken");
            assertThat(user.getVerificationToken()).hasSize(64);
            verify(emailService).sendVerificationEmail(eq("user@example.com"), anyString());
        }

        @Test
        @DisplayName("이미 인증된 계정 → 메일 발송 안 함 (이메일 열거 공격 방어: 에러 노출 안 함)")
        void alreadyVerified_silentlyIgnored() {
            User user = makeUser(true, null, null);
            when(userRepository.findByEmail("user@example.com")).thenReturn(Optional.of(user));

            assertThatCode(() -> authService.resendVerification("user@example.com"))
                    .doesNotThrowAnyException();
            verify(emailService, never()).sendVerificationEmail(any(), any());
        }

        @Test
        @DisplayName("없는 이메일 → 메일 발송 안 함 (이메일 열거 공격 방어: 에러 노출 안 함)")
        void unknownEmail_silentlyIgnored() {
            when(userRepository.findByEmail("ghost@example.com")).thenReturn(Optional.empty());

            assertThatCode(() -> authService.resendVerification("ghost@example.com"))
                    .doesNotThrowAnyException();
            verify(emailService, never()).sendVerificationEmail(any(), any());
        }
    }
}
