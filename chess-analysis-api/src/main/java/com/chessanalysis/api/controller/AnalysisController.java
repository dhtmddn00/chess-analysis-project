package com.chessanalysis.api.controller;

import com.chessanalysis.api.dto.AnalysisRequestDto;
import com.chessanalysis.api.dto.AnalysisResponseDto;
import com.chessanalysis.api.service.AnalysisRateLimitException;
import com.chessanalysis.api.service.AnalysisService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

@RestController
@RequestMapping("/analysis")
@RequiredArgsConstructor
@Slf4j
public class AnalysisController {

    private static final Pattern IP_PATTERN = Pattern.compile(
        "^(([0-9]{1,3}\\.){3}[0-9]{1,3}|[0-9a-fA-F:]{2,39})$"
    );

    private final AnalysisService analysisService;
    
    @PostMapping
    public ResponseEntity<?> createAnalysis(@Valid @RequestBody AnalysisRequestDto request, HttpServletRequest httpRequest) {
        try {
            log.info("Creating analysis for user: {} on platform: {}", 
                    request.getUsername(), request.getPlatform());
            
            AnalysisResponseDto response = analysisService.createAnalysis(request, resolveClientIp(httpRequest));
            return ResponseEntity.ok(response);
            
        } catch (AnalysisRateLimitException e) {
            log.warn("Analysis rate limit exceeded: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body(e.getDetails());
        } catch (IllegalStateException e) {
            log.warn("Analysis creation failed: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of(
                            "error", e.getMessage(),
                            "status", "conflict"
                    ));
        } catch (Exception e) {
            log.error("Failed to create analysis: {}", e.getMessage(), e);
            // 내부 예외 메시지를 클라이언트에 그대로 노출하면 DB 스키마·설정 정보가 유출될 수 있다.
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of(
                            "error", "분석 요청을 생성하지 못했습니다. 잠시 후 다시 시도해주세요."
                    ));
        }
    }

    private String resolveClientIp(HttpServletRequest request) {
        // X-Forwarded-For는 클라이언트가 임의로 위조할 수 있으므로 신뢰된 프록시(Fly.io 등)를
        // 거친 경우에만 사용해야 한다. 현재는 헤더 존재 여부만 확인하며 검증 없이 사용 중이므로
        // IP 기반 rate limit이 우회될 수 있다. 신뢰 프록시 IP 범위 검증을 권장한다.
        String forwardedFor = request.getHeader("X-Forwarded-For");
        if (forwardedFor != null && !forwardedFor.isBlank()) {
            String candidate = forwardedFor.split(",")[0].trim();
            if (IP_PATTERN.matcher(candidate).matches()) {
                return candidate;
            }
            log.debug("Ignoring invalid X-Forwarded-For value: {}", candidate);
        }

        String realIp = request.getHeader("X-Real-IP");
        if (realIp != null && !realIp.isBlank()) {
            String candidate = realIp.trim();
            if (IP_PATTERN.matcher(candidate).matches()) {
                return candidate;
            }
            log.debug("Ignoring invalid X-Real-IP value: {}", candidate);
        }

        return request.getRemoteAddr();
    }
    
    @GetMapping("/{analysisId}")
    public ResponseEntity<AnalysisResponseDto> getAnalysis(@PathVariable UUID analysisId) {
        return analysisService.getAnalysis(analysisId)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }
    
    @GetMapping("/{analysisId}/status")
    public ResponseEntity<Map<String, Object>> getAnalysisStatus(@PathVariable UUID analysisId) {
        try {
            Map<String, Object> status = analysisService.getAnalysisStatus(analysisId);
            return ResponseEntity.ok(status);
        } catch (Exception e) {
            log.error("Failed to get analysis status for {}: {}", analysisId, e.getMessage());
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "Analysis not found", "id", analysisId.toString()));
        }
    }
    
    @GetMapping("/user/{username}")
    public ResponseEntity<List<AnalysisResponseDto>> getUserAnalyses(
            @PathVariable String username,
            @RequestParam(defaultValue = "chess.com") String platform) {
        
        List<AnalysisResponseDto> analyses = analysisService.getUserAnalyses(username, platform);
        return ResponseEntity.ok(analyses);
    }
    
    @GetMapping("/stats")
    public ResponseEntity<Map<String, Object>> getStats() {
        Map<String, Object> stats = Map.of(
                "total_analyses", analysisService.getTotalAnalyses(),
                "completed_analyses", analysisService.getCompletedAnalyses(),
                "active_analyses", analysisService.getActiveAnalyses(),
                "queue_size", analysisService.getQueueSize()
        );
        return ResponseEntity.ok(stats);
    }
    
    @GetMapping("/{analysisId}/result")
    public ResponseEntity<Map<String, Object>> getAnalysisResult(@PathVariable UUID analysisId) {
        try {
            Map<String, Object> result = analysisService.getAnalysisResult(analysisId);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.error("Failed to get analysis result for {}: {}", analysisId, e.getMessage());
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "Analysis result not found", "id", analysisId.toString()));
        }
    }
    
    @GetMapping("/{analysisId}/games")
    public ResponseEntity<List<Map<String, Object>>> getAnalysisGames(@PathVariable UUID analysisId) {
        try {
            List<Map<String, Object>> games = analysisService.getAnalysisGames(analysisId);
            return ResponseEntity.ok(games);
        } catch (Exception e) {
            log.error("Failed to get games for analysis {}: {}", analysisId, e.getMessage());
            return ResponseEntity.notFound().build();
        }
    }
}
