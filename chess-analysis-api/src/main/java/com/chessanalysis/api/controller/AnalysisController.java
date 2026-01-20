package com.chessanalysis.api.controller;

import com.chessanalysis.api.dto.AnalysisRequestDto;
import com.chessanalysis.api.dto.AnalysisResponseDto;
import com.chessanalysis.api.service.AnalysisService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/analysis")
@RequiredArgsConstructor
@Slf4j
@CrossOrigin(origins = {"http://localhost:3000", "http://localhost:3005"})
public class AnalysisController {
    
    private final AnalysisService analysisService;
    
    @PostMapping
    public ResponseEntity<AnalysisResponseDto> createAnalysis(@Valid @RequestBody AnalysisRequestDto request) {
        try {
            log.info("Creating analysis for user: {} on platform: {}", 
                    request.getUsername(), request.getPlatform());
            
            AnalysisResponseDto response = analysisService.createAnalysis(request);
            return ResponseEntity.ok(response);
            
        } catch (IllegalStateException e) {
            log.warn("Analysis creation failed: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(null);
        } catch (Exception e) {
            log.error("Failed to create analysis: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(null);
        }
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
            return ResponseEntity.notFound().build();
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
            return ResponseEntity.notFound().build();
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