package com.chessanalysis.api.controller;

import com.chessanalysis.api.dto.PlayerSummaryResponse;
import com.chessanalysis.api.service.PlayerSummaryService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/player")
@RequiredArgsConstructor
@Slf4j
public class PlayerController {
    
    private final PlayerSummaryService playerSummaryService;
    
    @GetMapping("/summary")
    public ResponseEntity<?> getPlayerSummary(
            @RequestParam String platform,
            @RequestParam String username) {
        
        try {
            // Normalize platform name
            String normalizedPlatform = normalizePlatform(platform);
            log.info("Fetching player summary for {} on {} (normalized: {})", username, platform, normalizedPlatform);

            if (!"chesscom".equals(normalizedPlatform)) {
                return ResponseEntity.badRequest().body(Map.of("error", "Only chess.com is currently supported"));
            }

            if (username == null || username.trim().isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Username is required"));
            }
            
            PlayerSummaryResponse summary = playerSummaryService.getPlayerSummary(normalizedPlatform, username.trim());
            
            if (summary == null) {
                return ResponseEntity.notFound().build();
            }
            
            return ResponseEntity.ok(summary);
            
        } catch (Exception e) {
            log.error("Failed to fetch player summary for {} on {}: {}", username, platform, e.getMessage());
            // 내부 Chess.com API URL 등 서비스 상세 정보가 클라이언트에 노출되지 않도록
            // e.getMessage()를 응답 바디에 포함하지 않는다.
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to fetch player summary"));
        }
    }
    
    private String normalizePlatform(String platform) {
        if ("chess.com".equals(platform) || "chesscom".equals(platform)) {
            return "chesscom";
        }
        return platform;
    }
}
