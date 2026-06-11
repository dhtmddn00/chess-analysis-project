package com.chessanalysis.api.controller;

import com.chessanalysis.api.dto.auth.AuthResponse;
import com.chessanalysis.api.dto.mypage.AnalysisHistoryItem;
import com.chessanalysis.api.entity.User;
import com.chessanalysis.api.service.MyPageService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/me")
@RequiredArgsConstructor
public class MyPageController {

    private final MyPageService myPageService;

    @GetMapping("/analyses")
    public ResponseEntity<List<AnalysisHistoryItem>> myAnalyses() {
        return ResponseEntity.ok(myPageService.getAnalysisHistory(requireUserId()));
    }

    @PatchMapping("/profile")
    public ResponseEntity<AuthResponse> updateProfile(@RequestBody Map<String, String> body) {
        User user = myPageService.updateProfile(requireUserId(), body.get("name"), body.get("country"));
        return ResponseEntity.ok(AuthResponse.builder()
                .id(user.getId())
                .email(user.getEmail())
                .name(user.getName())
                .country(user.getCountry())
                .chessComUsername(user.getChessComUsername())
                .lichessUsername(user.getLichessUsername())
                .subscriptionTier(user.getSubscriptionTier())
                .createdAt(user.getCreatedAt())
                .build());
    }

    @PostMapping("/password")
    public ResponseEntity<Map<String, String>> changePassword(@RequestBody Map<String, String> body) {
        String current = body.get("currentPassword");
        String next = body.get("newPassword");
        if (current == null || next == null || next.length() < 8 || next.length() > 72) {
            return ResponseEntity.badRequest().body(Map.of("message", "비밀번호는 8~72자여야 합니다."));
        }
        myPageService.changePassword(requireUserId(), current, next);
        return ResponseEntity.ok(Map.of("message", "비밀번호가 변경되었습니다."));
    }

    // JwtAuthFilter가 SecurityContext에 넣어준 인증 유저 — 없으면 401
    private UUID requireUserId() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof User user) {
            return user.getId();
        }
        throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다.");
    }
}
