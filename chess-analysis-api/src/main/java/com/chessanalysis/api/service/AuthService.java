package com.chessanalysis.api.service;

import com.chessanalysis.api.config.JwtProperties;
import com.chessanalysis.api.dto.auth.AuthResponse;
import com.chessanalysis.api.dto.auth.LoginRequest;
import com.chessanalysis.api.dto.auth.PendingSignup;
import com.chessanalysis.api.dto.auth.SignupRequest;
import com.chessanalysis.api.entity.User;
import com.chessanalysis.api.repository.UserRepository;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.HexFormat;

@Service
@RequiredArgsConstructor
@Slf4j
public class AuthService {

    static final String COOKIE_NAME = "auth_token";

    // BCrypt dummy — 타이밍 공격 방어용 (로그인 실패 시 일관된 응답 시간 유지)
    private static final String DUMMY_HASH = "$2a$12$hBjBEqRmXCLB6nD/6ZP4OOKiCE3yW6K8mHaLBiKKp5nQesMayfTKa";

    private final UserRepository userRepository;
    private final JwtService jwtService;
    private final PasswordEncoder passwordEncoder;
    private final LoginAttemptService loginAttemptService;
    private final SignupRateLimitService signupRateLimitService;
    private final PendingSignupService pendingSignupService;
    private final JwtProperties jwtProperties;
    private final EmailService emailService;
    private final SecureRandom secureRandom = new SecureRandom();

    @Value("${cookie.secure:true}")
    private boolean cookieSecure;

    // ── 회원가입 ─────────────────────────────────────────────────────────────

    // 가입 정보를 DB에 바로 저장하지 않고 Redis에 임시 보관 → 이메일 인증 완료 시 DB 생성.
    // 미인증 유령 계정이 DB에 쌓이지 않게 한다.
    public void signup(SignupRequest req, String clientIp) {
        signupRateLimitService.checkSignupLimit(clientIp);

        String email = req.getEmail().toLowerCase().strip();
        String name = req.getName().strip();

        // 이미 가입 완료된 계정과의 충돌만 사전 차단 (최종 확정은 인증 시점에 재확인)
        if (userRepository.existsByEmail(email)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 사용 중인 이메일입니다.");
        }
        if (userRepository.existsByNameIgnoreCase(name)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 사용 중인 이름입니다.");
        }

        String token = generateVerificationToken();
        PendingSignup pending = new PendingSignup(
                email,
                passwordEncoder.encode(req.getPassword()),
                name,
                normalizeCountry(req.getCountry()),
                LocalDateTime.now().toString()   // 동의 시각 (PIPA)
        );
        pendingSignupService.store(token, pending);

        try {
            emailService.sendVerificationEmail(email, token);
        } catch (Exception emailEx) {
            // 발송 실패해도 pending은 유지 — 사용자가 재발송 요청 가능
            log.warn("[Signup] 인증 메일 발송 실패 (가입 정보는 임시 저장됨): {}", emailEx.getMessage());
        }
    }

    // 이메일 중복 확인 (실시간 검사용)
    public boolean isEmailAvailable(String email, String clientIp) {
        signupRateLimitService.checkEmailCheckLimit(clientIp);
        return !userRepository.existsByEmail(email.toLowerCase().strip());
    }

    // 이름 중복 확인 (실시간 검사용, 대소문자 무관)
    public boolean isNameAvailable(String name, String clientIp) {
        signupRateLimitService.checkNameCheckLimit(clientIp);
        return !userRepository.existsByNameIgnoreCase(name.strip());
    }

    // ── 이메일 인증 ──────────────────────────────────────────────────────────

    // 인증 링크 클릭 시점에 비로소 DB에 User를 생성한다.
    @Transactional
    public AuthResponse verifyEmail(String token, HttpServletResponse response) {
        PendingSignup pending = pendingSignupService.findByToken(token)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "유효하지 않거나 만료된 인증 링크입니다."));

        // 대기 중 다른 사용자가 같은 이메일/이름으로 먼저 가입했을 수 있어 재확인
        if (userRepository.existsByEmail(pending.email())) {
            pendingSignupService.delete(token, pending.email());
            throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 사용 중인 이메일입니다.");
        }
        if (userRepository.existsByNameIgnoreCase(pending.name())) {
            pendingSignupService.delete(token, pending.email());
            throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 사용 중인 이름입니다.");
        }

        LocalDateTime agreedAt = LocalDateTime.parse(pending.agreedAt());
        LocalDateTime now = LocalDateTime.now();
        User user = User.builder()
                .email(pending.email())
                .passwordHash(pending.passwordHash())
                .name(pending.name())
                .country(pending.country())
                .emailVerified(true)
                .termsAgreedAt(agreedAt)
                .privacyAgreedAt(agreedAt)
                .lastLoginAt(now)
                .build();

        try {
            userRepository.saveAndFlush(user);
        } catch (org.springframework.dao.DataIntegrityViolationException e) {
            // 동시 인증으로 인한 unique 충돌
            pendingSignupService.delete(token, pending.email());
            throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 사용 중인 계정 정보입니다.");
        }

        pendingSignupService.delete(token, pending.email());
        setAuthCookie(response, jwtService.generateToken(user.getId()));
        return toResponse(user);
    }

    // ── 인증 메일 재발송 ─────────────────────────────────────────────────────

    public void resendVerification(String email) {
        String normalized = email.toLowerCase().strip();
        signupRateLimitService.checkResendLimit(normalized);

        // Redis의 대기 중 가입 정보를 찾아 동일 토큰으로 재발송 (열거 방어: 없어도 조용히 무시)
        pendingSignupService.findTokenByEmail(normalized).ifPresent(token -> {
            try {
                emailService.sendVerificationEmail(normalized, token);
            } catch (Exception emailEx) {
                log.warn("[Resend] 인증 메일 발송 실패: {}", emailEx.getMessage());
            }
        });
    }

    // ── 비밀번호 재설정 ──────────────────────────────────────────────────────

    private static final int RESET_TOKEN_EXPIRY_MINUTES = 60;

    @Transactional
    public void requestPasswordReset(String email) {
        signupRateLimitService.checkPasswordResetLimit(email);

        // 이메일 열거 공격 방어: 존재 여부와 무관하게 항상 동일 응답
        userRepository.findByEmail(email.toLowerCase().strip())
                .filter(User::isEmailVerified)   // 미인증 계정은 재설정 불가
                .ifPresent(user -> {
                    user.setPasswordResetToken(generateVerificationToken());
                    user.setPasswordResetExpiresAt(LocalDateTime.now().plusMinutes(RESET_TOKEN_EXPIRY_MINUTES));
                    userRepository.save(user);
                    try {
                        emailService.sendPasswordResetEmail(user.getEmail(), user.getPasswordResetToken());
                    } catch (Exception emailEx) {
                        log.warn("[PasswordReset] 메일 발송 실패 (토큰은 저장됨): {}", emailEx.getMessage());
                    }
                });
    }

    @Transactional
    public void confirmPasswordReset(String token, String newPassword) {
        User user = userRepository.findByPasswordResetToken(token)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "유효하지 않은 재설정 링크입니다."));

        if (user.getPasswordResetExpiresAt() == null
                || user.getPasswordResetExpiresAt().isBefore(LocalDateTime.now())) {
            throw new ResponseStatusException(HttpStatus.GONE, "재설정 링크가 만료되었습니다. 다시 요청해주세요.");
        }

        user.setPasswordHash(passwordEncoder.encode(newPassword));
        user.setPasswordResetToken(null);
        user.setPasswordResetExpiresAt(null);
        userRepository.save(user);

        // 비밀번호 변경 후 기존 로그인 실패 카운트 정리
        loginAttemptService.clearFailures(user.getEmail());
    }

    // ── 회원 탈퇴 (soft delete + 개인정보 익명화) ──────────────────────────────

    @Transactional
    public void withdraw(HttpServletRequest request, HttpServletResponse response) {
        String token = extractToken(request);
        if (token == null || !jwtService.isValid(token)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다.");
        }

        User user = userRepository.findById(jwtService.extractUserId(token))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "사용자를 찾을 수 없습니다."));

        LocalDateTime now = LocalDateTime.now();
        // 개인정보 익명화 — 이메일/이름을 식별 불가 값으로 치환, 비밀번호 무효화
        // 이름은 LOWER(name) 유니크 인덱스가 있으므로 UUID를 포함해 충돌 방지
        user.setEmail("deleted_" + user.getId() + "@deleted.local");
        user.setName("deleted_" + user.getId());
        user.setPasswordHash("");
        user.setCountry(null);
        user.setChessComUsername(null);
        user.setLichessUsername(null);
        user.setVerificationToken(null);
        user.setVerificationTokenExpiresAt(null);
        user.setPasswordResetToken(null);
        user.setPasswordResetExpiresAt(null);
        user.setActive(false);
        user.setDeletedAt(now);
        userRepository.save(user);

        logout(response);
    }

    // ── 로그인 ──────────────────────────────────────────────────────────────

    public AuthResponse login(LoginRequest req, HttpServletResponse response) {
        String email = req.getEmail().toLowerCase();

        if (loginAttemptService.isBlocked(email)) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "로그인 시도가 너무 많습니다. 15분 후 다시 시도해주세요.");
        }

        // 이메일이 없어도 BCrypt를 실행해서 응답 시간을 균일하게 유지 (타이밍 공격 방어)
        User user = userRepository.findByEmail(email).orElse(null);
        String hashToCheck = (user != null) ? user.getPasswordHash() : DUMMY_HASH;
        boolean passwordMatches = passwordEncoder.matches(req.getPassword(), hashToCheck);

        if (user == null || !passwordMatches) {
            loginAttemptService.recordFailure(email);
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "이메일 또는 비밀번호가 올바르지 않습니다.");
        }

        // 비밀번호가 올바르면 실패 카운트 정리 (이후 상태 체크에서 막혀도 잠금 누적 방지)
        loginAttemptService.clearFailures(email);

        if (!user.isActive()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "비활성화된 계정입니다.");
        }

        if (!user.isEmailVerified()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "EMAIL_NOT_VERIFIED");
        }

        user.setLastLoginAt(LocalDateTime.now());
        userRepository.save(user);

        setAuthCookie(response, jwtService.generateToken(user.getId()));
        return toResponse(user);
    }

    // ── 로그아웃 ────────────────────────────────────────────────────────────

    public void logout(HttpServletResponse response) {
        ResponseCookie cookie = ResponseCookie.from(COOKIE_NAME, "")
                .httpOnly(true)
                .secure(cookieSecure)
                .sameSite("Lax")
                .path("/")
                .maxAge(0)
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

    // ── 내 정보 ─────────────────────────────────────────────────────────────

    public AuthResponse getCurrentUser(HttpServletRequest request) {
        String token = extractToken(request);
        if (token == null || !jwtService.isValid(token)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다.");
        }

        User user = userRepository.findById(jwtService.extractUserId(token))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "사용자를 찾을 수 없습니다."));

        return toResponse(user);
    }

    // ── 내부 유틸 ────────────────────────────────────────────────────────────

    // 빈 문자열·공백은 null로 정규화 (선택 입력이므로 미입력 허용)
    private String normalizeCountry(String country) {
        if (country == null || country.isBlank()) return null;
        return country.strip().toUpperCase();
    }

    private String generateVerificationToken() {
        byte[] bytes = new byte[32];
        secureRandom.nextBytes(bytes);
        return HexFormat.of().formatHex(bytes);
    }

    private void setAuthCookie(HttpServletResponse response, String token) {
        ResponseCookie cookie = ResponseCookie.from(COOKIE_NAME, token)
                .httpOnly(true)
                .secure(cookieSecure)
                .sameSite("Lax")
                .path("/")
                .maxAge(jwtProperties.getExpirationSeconds())
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

    public String extractToken(HttpServletRequest request) {
        if (request.getCookies() == null) return null;
        return Arrays.stream(request.getCookies())
                .filter(c -> COOKIE_NAME.equals(c.getName()))
                .map(Cookie::getValue)
                .findFirst()
                .orElse(null);
    }

    private AuthResponse toResponse(User user) {
        return AuthResponse.builder()
                .id(user.getId())
                .email(user.getEmail())
                .name(user.getName())
                .country(user.getCountry())
                .chessComUsername(user.getChessComUsername())
                .lichessUsername(user.getLichessUsername())
                .subscriptionTier(user.getSubscriptionTier())
                .createdAt(user.getCreatedAt())
                .build();
    }
}
