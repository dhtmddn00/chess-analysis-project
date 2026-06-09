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
import lombok.RequiredArgsConstructor;
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
public class AuthService {

    static final String COOKIE_NAME = "auth_token";

    // BCrypt dummy — 타이밍 공격 방어용 (로그인 실패 시 일관된 응답 시간 유지)
    private static final String DUMMY_HASH = "$2a$12$hBjBEqRmXCLB6nD/6ZP4OOKiCE3yW6K8mHaLBiKKp5nQesMayfTKa";
    private static final int TOKEN_EXPIRY_HOURS = 24;

    private final UserRepository userRepository;
    private final JwtService jwtService;
    private final PasswordEncoder passwordEncoder;
    private final LoginAttemptService loginAttemptService;
    private final SignupRateLimitService signupRateLimitService;
    private final JwtProperties jwtProperties;
    private final EmailService emailService;
    private final SecureRandom secureRandom = new SecureRandom();

    @Value("${cookie.secure:true}")
    private boolean cookieSecure;

    // ── 회원가입 ─────────────────────────────────────────────────────────────

    @Transactional
    public void signup(SignupRequest req, String clientIp) {
        signupRateLimitService.checkSignupLimit(clientIp);

        try {
            String token = generateVerificationToken();
            LocalDateTime now = LocalDateTime.now();
            User user = User.builder()
                    .email(req.getEmail().toLowerCase().strip())
                    .passwordHash(passwordEncoder.encode(req.getPassword()))
                    .name(req.getName().strip())   // 앞뒤 공백 제거
                    .verificationToken(token)
                    .verificationTokenExpiresAt(now.plusHours(TOKEN_EXPIRY_HOURS))
                    .termsAgreedAt(now)            // 약관 동의 시간 기록 (PIPA)
                    .privacyAgreedAt(now)          // 개인정보 동의 시간 기록 (PIPA)
                    .build();
            userRepository.saveAndFlush(user);
            emailService.sendVerificationEmail(user.getEmail(), token);
        } catch (org.springframework.dao.DataIntegrityViolationException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 사용 중인 이메일입니다.");
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

    @Transactional
    public AuthResponse verifyEmail(String token, HttpServletResponse response) {
        User user = userRepository.findByVerificationToken(token)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "유효하지 않은 인증 링크입니다."));

        if (user.getVerificationTokenExpiresAt().isBefore(LocalDateTime.now())) {
            throw new ResponseStatusException(HttpStatus.GONE, "인증 링크가 만료되었습니다. 재발송을 요청해주세요.");
        }

        user.setEmailVerified(true);
        user.setVerificationToken(null);
        user.setVerificationTokenExpiresAt(null);
        user.setLastLoginAt(LocalDateTime.now());
        userRepository.save(user);

        setAuthCookie(response, jwtService.generateToken(user.getId()));
        return toResponse(user);
    }

    // ── 인증 메일 재발송 ─────────────────────────────────────────────────────

    @Transactional
    public void resendVerification(String email) {
        signupRateLimitService.checkResendLimit(email);

        // 이메일 열거 공격 방어: 존재하지 않는 이메일도 200 반환 (에러 노출 안 함)
        userRepository.findByEmail(email.toLowerCase().strip())
                .filter(u -> !u.isEmailVerified())
                .ifPresent(user -> {
                    user.setVerificationToken(generateVerificationToken());
                    user.setVerificationTokenExpiresAt(LocalDateTime.now().plusHours(TOKEN_EXPIRY_HOURS));
                    userRepository.save(user);
                    emailService.sendVerificationEmail(user.getEmail(), user.getVerificationToken());
                });
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

        if (!user.isActive()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "비활성화된 계정입니다.");
        }

        if (!user.isEmailVerified()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "EMAIL_NOT_VERIFIED");
        }

        loginAttemptService.clearFailures(email);
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
                .chessComUsername(user.getChessComUsername())
                .lichessUsername(user.getLichessUsername())
                .subscriptionTier(user.getSubscriptionTier())
                .createdAt(user.getCreatedAt())
                .build();
    }
}
