package com.chessanalysis.api.service;

import com.chessanalysis.api.config.JwtProperties;
import com.chessanalysis.api.dto.auth.AuthResponse;
import com.chessanalysis.api.dto.auth.LoginRequest;
import com.chessanalysis.api.dto.auth.SignupRequest;
import com.chessanalysis.api.entity.User;
import com.chessanalysis.api.repository.UserRepository;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
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
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AuthServiceTest {

    @Mock UserRepository userRepository;
    @Mock JwtService jwtService;
    @Mock PasswordEncoder passwordEncoder;
    @Mock LoginAttemptService loginAttemptService;
    @Mock JwtProperties jwtProperties;
    @Mock EmailService emailService;
    @Mock SignupRateLimitService signupRateLimitService;
    @Mock HttpServletResponse response;
    @Mock HttpServletRequest request;

    @InjectMocks
    AuthService authService;

    private final UUID userId = UUID.randomUUID();
    private User activeUser;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(authService, "cookieSecure", false);
        when(jwtProperties.getExpirationSeconds()).thenReturn(604800L);

        activeUser = User.builder()
                .email("user@example.com")
                .passwordHash("$2a$12$hashedpassword")
                .name("테스터")
                .build();
        ReflectionTestUtils.setField(activeUser, "id", userId);
        ReflectionTestUtils.setField(activeUser, "active", true);
        ReflectionTestUtils.setField(activeUser, "emailVerified", true);
        ReflectionTestUtils.setField(activeUser, "createdAt", LocalDateTime.now());
        ReflectionTestUtils.setField(activeUser, "subscriptionTier", "free");
    }

    // ── 회원가입 ─────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("회원가입")
    class Signup {

        @Test
        @DisplayName("정상 요청 시 유저 저장 + 인증 메일 발송 (JWT 쿠키 미발급)")
        void success() {
            SignupRequest req = new SignupRequest();
            req.setEmail("NEW@EXAMPLE.COM");
            req.setPassword("password123");
            req.setName("신규유저");

            when(passwordEncoder.encode("password123")).thenReturn("hashed");
            when(userRepository.saveAndFlush(any(User.class))).thenAnswer(inv -> {
                User u = inv.getArgument(0);
                ReflectionTestUtils.setField(u, "id", userId);
                ReflectionTestUtils.setField(u, "createdAt", LocalDateTime.now());
                return u;
            });

            authService.signup(req, "127.0.0.1");

            verify(userRepository).saveAndFlush(argThat(u ->
                    "new@example.com".equals(u.getEmail()) && "hashed".equals(u.getPasswordHash())
            ));
            verify(emailService).sendVerificationEmail(eq("new@example.com"), anyString());
            verify(jwtService, never()).generateToken(any());
        }

        @Test
        @DisplayName("중복 이메일 — DataIntegrityViolation → 409 Conflict")
        void duplicateEmail_throwsConflict() {
            SignupRequest req = new SignupRequest();
            req.setEmail("dup@example.com");
            req.setPassword("password123");
            req.setName("중복유저");

            when(passwordEncoder.encode(any())).thenReturn("hashed");
            when(userRepository.saveAndFlush(any())).thenThrow(DataIntegrityViolationException.class);

            assertThatThrownBy(() -> authService.signup(req, "127.0.0.1"))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode())
                            .isEqualTo(HttpStatus.CONFLICT));
        }
    }

    // ── 로그인 ──────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("로그인")
    class Login {

        private LoginRequest loginReq(String email, String password) {
            LoginRequest req = new LoginRequest();
            req.setEmail(email);
            req.setPassword(password);
            return req;
        }

        @Test
        @DisplayName("정상 로그인 → JWT 쿠키 설정")
        void success() {
            when(loginAttemptService.isBlocked("user@example.com")).thenReturn(false);
            when(userRepository.findByEmail("user@example.com")).thenReturn(Optional.of(activeUser));
            when(passwordEncoder.matches("correctpw", activeUser.getPasswordHash())).thenReturn(true);
            when(jwtService.generateToken(userId)).thenReturn("jwt-token");
            when(userRepository.save(any())).thenReturn(activeUser);

            AuthResponse result = authService.login(loginReq("user@example.com", "correctpw"), response);

            assertThat(result.getEmail()).isEqualTo("user@example.com");
            verify(loginAttemptService).clearFailures("user@example.com");
            verify(response).addHeader(eq("Set-Cookie"), contains("auth_token=jwt-token"));
        }

        @Test
        @DisplayName("잘못된 비밀번호 → 401, 실패 카운트 증가")
        void wrongPassword_throwsUnauthorized() {
            when(loginAttemptService.isBlocked(any())).thenReturn(false);
            when(userRepository.findByEmail("user@example.com")).thenReturn(Optional.of(activeUser));
            when(passwordEncoder.matches("wrongpw", activeUser.getPasswordHash())).thenReturn(false);

            assertThatThrownBy(() -> authService.login(loginReq("user@example.com", "wrongpw"), response))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode())
                            .isEqualTo(HttpStatus.UNAUTHORIZED));

            verify(loginAttemptService).recordFailure("user@example.com");
            verify(jwtService, never()).generateToken(any());
        }

        @Test
        @DisplayName("없는 이메일 → 401, 타이밍 공격 방어: DUMMY_HASH로 BCrypt 실행")
        void emailNotFound_throwsUnauthorized_andRunsBCrypt() {
            when(loginAttemptService.isBlocked(any())).thenReturn(false);
            when(userRepository.findByEmail("ghost@example.com")).thenReturn(Optional.empty());

            assertThatThrownBy(() -> authService.login(loginReq("ghost@example.com", "anypw"), response))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode())
                            .isEqualTo(HttpStatus.UNAUTHORIZED));

            // 타이밍 공격 방어: 이메일이 없어도 반드시 BCrypt 한 번 실행해야 함
            verify(passwordEncoder).matches(eq("anypw"), anyString());
            verify(loginAttemptService).recordFailure("ghost@example.com");
        }

        @Test
        @DisplayName("차단된 IP/이메일 → 429 Too Many Requests")
        void blockedEmail_throwsTooManyRequests() {
            when(loginAttemptService.isBlocked("blocked@example.com")).thenReturn(true);

            assertThatThrownBy(() -> authService.login(loginReq("blocked@example.com", "anypw"), response))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode())
                            .isEqualTo(HttpStatus.TOO_MANY_REQUESTS));

            // 차단 시 DB 조회, BCrypt 실행 안 함
            verify(userRepository, never()).findByEmail(any());
            verify(passwordEncoder, never()).matches(any(), any());
        }

        @Test
        @DisplayName("비활성화 계정 → 403 Forbidden")
        void inactiveUser_throwsForbidden() {
            ReflectionTestUtils.setField(activeUser, "active", false);
            when(loginAttemptService.isBlocked(any())).thenReturn(false);
            when(userRepository.findByEmail("user@example.com")).thenReturn(Optional.of(activeUser));
            when(passwordEncoder.matches(any(), any())).thenReturn(true);

            assertThatThrownBy(() -> authService.login(loginReq("user@example.com", "correctpw"), response))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode())
                            .isEqualTo(HttpStatus.FORBIDDEN));
        }

        @Test
        @DisplayName("이메일 대소문자 정규화 — USER@EXAMPLE.COM → user@example.com으로 조회")
        void emailNormalization() {
            when(loginAttemptService.isBlocked("user@example.com")).thenReturn(false);
            when(userRepository.findByEmail("user@example.com")).thenReturn(Optional.of(activeUser));
            when(passwordEncoder.matches(any(), any())).thenReturn(true);
            when(jwtService.generateToken(any())).thenReturn("token");
            when(userRepository.save(any())).thenReturn(activeUser);

            authService.login(loginReq("USER@EXAMPLE.COM", "pw"), response);

            verify(userRepository).findByEmail("user@example.com");
            verify(loginAttemptService).isBlocked("user@example.com");
        }
    }

    // ── 로그아웃 ────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("로그아웃")
    class Logout {

        @Test
        @DisplayName("쿠키 만료(maxAge=0) 헤더 설정")
        void clearsAuthCookie() {
            authService.logout(response);

            ArgumentCaptor<String> headerCaptor = ArgumentCaptor.forClass(String.class);
            verify(response).addHeader(eq("Set-Cookie"), headerCaptor.capture());

            String cookieHeader = headerCaptor.getValue();
            assertThat(cookieHeader).contains("auth_token=");
            assertThat(cookieHeader).contains("Max-Age=0");
            assertThat(cookieHeader).contains("HttpOnly");
        }
    }

    // ── 내 정보 조회 ─────────────────────────────────────────────────────────

    @Nested
    @DisplayName("getCurrentUser")
    class GetCurrentUser {

        @Test
        @DisplayName("유효한 토큰 → 유저 정보 반환")
        void validToken_returnsUser() {
            Cookie cookie = new Cookie(AuthService.COOKIE_NAME, "valid-token");
            when(request.getCookies()).thenReturn(new Cookie[]{cookie});
            when(jwtService.isValid("valid-token")).thenReturn(true);
            when(jwtService.extractUserId("valid-token")).thenReturn(userId);
            when(userRepository.findById(userId)).thenReturn(Optional.of(activeUser));

            AuthResponse result = authService.getCurrentUser(request);

            assertThat(result.getId()).isEqualTo(userId);
            assertThat(result.getEmail()).isEqualTo("user@example.com");
        }

        @Test
        @DisplayName("쿠키 없음 → 401")
        void noCookie_throwsUnauthorized() {
            when(request.getCookies()).thenReturn(null);

            assertThatThrownBy(() -> authService.getCurrentUser(request))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode())
                            .isEqualTo(HttpStatus.UNAUTHORIZED));
        }

        @Test
        @DisplayName("만료/위조 토큰 → 401")
        void invalidToken_throwsUnauthorized() {
            Cookie cookie = new Cookie(AuthService.COOKIE_NAME, "bad-token");
            when(request.getCookies()).thenReturn(new Cookie[]{cookie});
            when(jwtService.isValid("bad-token")).thenReturn(false);

            assertThatThrownBy(() -> authService.getCurrentUser(request))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode())
                            .isEqualTo(HttpStatus.UNAUTHORIZED));
        }

        @Test
        @DisplayName("토큰 유효하지만 DB에 유저 없음 → 401")
        void tokenValidButUserDeleted_throwsUnauthorized() {
            Cookie cookie = new Cookie(AuthService.COOKIE_NAME, "orphan-token");
            when(request.getCookies()).thenReturn(new Cookie[]{cookie});
            when(jwtService.isValid("orphan-token")).thenReturn(true);
            when(jwtService.extractUserId("orphan-token")).thenReturn(userId);
            when(userRepository.findById(userId)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> authService.getCurrentUser(request))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode())
                            .isEqualTo(HttpStatus.UNAUTHORIZED));
        }
    }

    // ── 쿠키 보안 속성 ────────────────────────────────────────────────────────

    @Nested
    @DisplayName("쿠키 보안 속성")
    class CookieSecurity {

        @Test
        @DisplayName("로그인 성공 시 Set-Cookie 헤더에 HttpOnly, SameSite=Lax 포함")
        void loginCookieHasSecurityAttributes() {
            when(loginAttemptService.isBlocked(any())).thenReturn(false);
            when(userRepository.findByEmail("user@example.com")).thenReturn(Optional.of(activeUser));
            when(passwordEncoder.matches(any(), any())).thenReturn(true);
            when(jwtService.generateToken(userId)).thenReturn("tok");
            when(userRepository.save(any())).thenReturn(activeUser);

            LoginRequest req = new LoginRequest();
            req.setEmail("user@example.com");
            req.setPassword("pw");
            authService.login(req, response);

            ArgumentCaptor<String> captor = ArgumentCaptor.forClass(String.class);
            verify(response).addHeader(eq("Set-Cookie"), captor.capture());
            String header = captor.getValue();

            assertThat(header).contains("HttpOnly");
            assertThat(header).contains("SameSite=Lax");
            assertThat(header).contains("auth_token=tok");
        }
    }
}
