package com.chessanalysis.api.controller;

import com.chessanalysis.api.dto.PlayerSummaryResponse;
import com.chessanalysis.api.service.PlayerSummaryService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/player")
@CrossOrigin(origins = "*")
public class PlayerSummaryController {
    
    private static final Logger logger = LoggerFactory.getLogger(PlayerSummaryController.class);
    
    @Autowired
    private PlayerSummaryService playerSummaryService;
    
    @GetMapping("/summary")
    public ResponseEntity<?> getPlayerSummary(
            @RequestParam String platform,
            @RequestParam String username) {
        
        try {
            logger.info("Fetching summary for {}/{}", platform, username);
            
            // Validate platform
            if (!"chesscom".equals(platform) && !"lichess".equals(platform)) {
                return ResponseEntity.badRequest()
                    .body(Map.of("error", "Unsupported platform: " + platform + ". Use 'chesscom' or 'lichess'"));
            }
            
            // Validate username
            if (username == null || username.trim().isEmpty()) {
                return ResponseEntity.badRequest()
                    .body(Map.of("error", "Username is required"));
            }
            
            long startTime = System.currentTimeMillis();
            PlayerSummaryResponse summary = playerSummaryService.getPlayerSummary(platform, username.trim());
            long duration = System.currentTimeMillis() - startTime;
            
            logger.info("Summary for {}/{} completed in {}ms ({})", 
                platform, username, duration, summary.cacheStatus);
            
            return ResponseEntity.ok(summary);
            
        } catch (IllegalArgumentException e) {
            logger.warn("Invalid request for {}/{}: {}", platform, username, e.getMessage());
            return ResponseEntity.badRequest()
                .body(Map.of("error", e.getMessage()));
                
        } catch (Exception e) {
            logger.error("Failed to fetch summary for {}/{}: {}", platform, username, e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of(
                    "error", "Failed to fetch player summary",
                    "details", e.getMessage(),
                    "platform", platform,
                    "username", username
                ));
        }
    }
    
    @GetMapping("/summary/health")
    public ResponseEntity<Map<String, Object>> healthCheck() {
        return ResponseEntity.ok(Map.of(
            "status", "healthy",
            "service", "PlayerSummary",
            "timestamp", System.currentTimeMillis(),
            "version", "1.0.0"
        ));
    }
}