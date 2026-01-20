package com.chessanalysis.api.controller;

import com.chessanalysis.api.dto.AnalysisJobRequest;
import com.chessanalysis.api.dto.AnalysisJobResponse;
import com.chessanalysis.api.service.AnalysisJobService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/analyze")
@CrossOrigin(origins = "*")
public class AnalysisJobController {
    
    private static final Logger logger = LoggerFactory.getLogger(AnalysisJobController.class);
    
    @Autowired
    private AnalysisJobService analysisJobService;
    
    @PostMapping("")
    public ResponseEntity<?> createAnalysisJob(@RequestBody AnalysisJobRequest request) {
        try {
            // Validate request
            if (request.platform == null || request.username == null) {
                return ResponseEntity.badRequest()
                    .body(Map.of("error", "Platform and username are required"));
            }
            
            if (!"chesscom".equals(request.platform) && !"lichess".equals(request.platform)) {
                return ResponseEntity.badRequest()
                    .body(Map.of("error", "Unsupported platform: " + request.platform));
            }
            
            if (request.n <= 0 || request.n > 50) {
                return ResponseEntity.badRequest()
                    .body(Map.of("error", "Number of games must be between 1 and 50"));
            }
            
            if (!"fast".equals(request.priority) && !"precise".equals(request.priority)) {
                request.priority = "fast"; // default
            }
            
            logger.info("Creating analysis job for {}/{} (n={}, priority={})", 
                request.platform, request.username, request.n, request.priority);
            
            AnalysisJobResponse response = analysisJobService.createAnalysisJob(request);
            return ResponseEntity.ok(response);
            
        } catch (Exception e) {
            logger.error("Failed to create analysis job: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", "Failed to create analysis job", "details", e.getMessage()));
        }
    }
    
    @GetMapping("/{jobId}/status")
    public ResponseEntity<Map<String, Object>> getJobStatus(@PathVariable String jobId) {
        try {
            Map<String, Object> status = analysisJobService.getJobStatus(jobId);
            
            if (status.containsKey("error")) {
                return ResponseEntity.notFound().build();
            }
            
            return ResponseEntity.ok(status);
            
        } catch (Exception e) {
            logger.error("Failed to get job status for {}: {}", jobId, e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", "Failed to get job status", "details", e.getMessage()));
        }
    }
    
    @DeleteMapping("/{jobId}")
    public ResponseEntity<?> cancelJob(@PathVariable String jobId) {
        // TODO: Implement job cancellation
        return ResponseEntity.ok(Map.of("message", "Job cancellation not yet implemented"));
    }
}