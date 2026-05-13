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
@CrossOrigin(origins = {"http://localhost:3000", "http://localhost:3005"})
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
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to fetch player summary", "details", e.getMessage()));
        }
    }
    
    private String normalizePlatform(String platform) {
        if ("chess.com".equals(platform) || "chesscom".equals(platform)) {
            return "chesscom";
        }
        return platform;
    }
}
