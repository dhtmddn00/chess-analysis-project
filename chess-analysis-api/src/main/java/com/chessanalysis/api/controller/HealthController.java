package com.chessanalysis.api.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.sql.DataSource;
import java.sql.Connection;
import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/health")
@RequiredArgsConstructor
public class HealthController {
    
    private final DataSource dataSource;
    private final RedisTemplate<String, Object> redisTemplate;
    
    @GetMapping
    public ResponseEntity<Map<String, String>> health() {
        Map<String, String> health = new HashMap<>();
        health.put("status", "UP");
        health.put("service", "chess-analysis-api");
        health.put("timestamp", String.valueOf(System.currentTimeMillis()));
        return ResponseEntity.ok(health);
    }
    
    @GetMapping("/actuator/health")
    public ResponseEntity<Map<String, Object>> detailedHealth() {
        Map<String, Object> health = new HashMap<>();
        Map<String, Object> components = new HashMap<>();
        
        // Check database connection
        try (Connection connection = dataSource.getConnection()) {
            if (!connection.isClosed()) {
                components.put("db", Map.of("status", "UP"));
            } else {
                components.put("db", Map.of("status", "DOWN"));
            }
        } catch (Exception e) {
            components.put("db", Map.of("status", "DOWN", "error", e.getMessage()));
        }
        
        // Check Redis connection
        try {
            redisTemplate.opsForValue().set("health:check", "ping");
            String result = (String) redisTemplate.opsForValue().get("health:check");
            if ("ping".equals(result)) {
                components.put("redis", Map.of("status", "UP"));
            } else {
                components.put("redis", Map.of("status", "DOWN"));
            }
        } catch (Exception e) {
            components.put("redis", Map.of("status", "DOWN", "error", e.getMessage()));
        }
        
        boolean allUp = components.values().stream()
                .allMatch(component -> "UP".equals(((Map<?, ?>) component).get("status")));
        
        health.put("status", allUp ? "UP" : "DOWN");
        health.put("components", components);
        health.put("timestamp", System.currentTimeMillis());
        
        return ResponseEntity.ok(health);
    }
}