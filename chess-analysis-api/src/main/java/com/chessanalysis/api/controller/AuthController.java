package com.chessanalysis.api.controller;

import com.chessanalysis.api.dto.auth.AuthResponse;
import com.chessanalysis.api.dto.auth.LoginRequest;
import com.chessanalysis.api.dto.auth.SignupRequest;
import com.chessanalysis.api.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    @PostMapping("/signup")
    public ResponseEntity<Map<String, String>> signup(
            @Valid @RequestBody SignupRequest req,
            HttpServletRequest request) {
        authService.signup(req, getClientIp(request));
        return ResponseEntity.accepted()
                .body(Map.of("message", "인증 메일을 발송했습니다. 메일함을 확인해주세요."));
    }

    @GetMapping("/check-email")
    public ResponseEntity<Map<String, Boolean>> checkEmail(
            @RequestParam String email,
            HttpServletRequest request) {
        boolean available = authService.isEmailAvailable(email, getClientIp(request));
        return ResponseEntity.ok(Map.of("available", available));
    }

    @GetMapping("/check-name")
    public ResponseEntity<Map<String, Boolean>> checkName(
            @RequestParam String name,
            HttpServletRequest request) {
        boolean available = authService.isNameAvailable(name, getClientIp(request));
        return ResponseEntity.ok(Map.of("available", available));
    }

    @GetMapping("/verify-email")
    public ResponseEntity<AuthResponse> verifyEmail(
            @RequestParam String token,
            HttpServletResponse response) {
        return ResponseEntity.ok(authService.verifyEmail(token, response));
    }

    @PostMapping("/resend-verification")
    public ResponseEntity<Map<String, String>> resendVerification(
            @RequestBody Map<String, String> body) {
        String email = body.get("email");
        if (email == null || email.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("message", "이메일을 입력해주세요."));
        }
        authService.resendVerification(email);
        // 이메일 열거 공격 방어: 존재 여부와 무관하게 동일 메시지 반환
        return ResponseEntity.ok(Map.of("message", "입력하신 이메일로 인증 메일을 발송했습니다."));
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(
            @Valid @RequestBody LoginRequest req,
            HttpServletResponse response) {
        return ResponseEntity.ok(authService.login(req, response));
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletResponse response) {
        authService.logout(response);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/me")
    public ResponseEntity<AuthResponse> me(HttpServletRequest request) {
        return ResponseEntity.ok(authService.getCurrentUser(request));
    }

    // 클라이언트 실제 IP 추출
    // X-Forwarded-For는 클라이언트가 임의 값을 주입할 수 있어 사용하지 않음 (기존 컨트롤러와 동일 정책)
    // Fly.io 환경: Fly-Client-IP 헤더가 인프라에서 설정되므로 신뢰 가능
    // 로컬/기타: RemoteAddr 사용
    private String getClientIp(HttpServletRequest request) {
        String flyClientIp = request.getHeader("Fly-Client-IP");
        if (flyClientIp != null && !flyClientIp.isBlank()) {
            return flyClientIp.strip();
        }
        return request.getRemoteAddr();
    }
}
