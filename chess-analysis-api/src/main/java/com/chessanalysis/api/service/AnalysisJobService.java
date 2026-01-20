package com.chessanalysis.api.service;

import com.chessanalysis.api.dto.AnalysisJobRequest;
import com.chessanalysis.api.dto.AnalysisJobResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

@Service
public class AnalysisJobService {
    
    private static final Logger logger = LoggerFactory.getLogger(AnalysisJobService.class);
    private static final String JOB_QUEUE = "analysis:queue";
    private static final String JOB_STATUS_PREFIX = "job:";
    private static final String JOB_PARTIALS_PREFIX = "job:partials:";
    
    @Autowired
    private RedisTemplate<String, String> redisTemplate;
    
    private final ObjectMapper objectMapper = new ObjectMapper();
    
    public AnalysisJobResponse createAnalysisJob(AnalysisJobRequest request) {
        String jobId = "job_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        
        try {
            // Create job metadata
            Map<String, Object> jobMeta = new HashMap<>();
            jobMeta.put("jobId", jobId);
            jobMeta.put("platform", request.platform);
            jobMeta.put("username", request.username);
            jobMeta.put("n", request.n);
            jobMeta.put("priority", request.priority);
            jobMeta.put("timeControl", request.timeControl);
            jobMeta.put("status", "queued");
            jobMeta.put("createdAt", Instant.now().toString());
            jobMeta.put("progress", 0.0);
            
            // Store job status
            String jobStatusKey = JOB_STATUS_PREFIX + jobId;
            redisTemplate.opsForValue().set(jobStatusKey, 
                objectMapper.writeValueAsString(jobMeta), 
                Duration.ofHours(2));
            
            // Initialize partials
            Map<String, Object> partials = new HashMap<>();
            partials.put("tactics", Map.of("ready", false));
            partials.put("swing_moments", Map.of("ready", false));
            partials.put("endgame", Map.of("ready", false));
            partials.put("time_mgmt", Map.of("ready", false));
            
            String partialsKey = JOB_PARTIALS_PREFIX + jobId;
            redisTemplate.opsForValue().set(partialsKey,
                objectMapper.writeValueAsString(partials),
                Duration.ofHours(2));
            
            // Add to queue
            String queueItem = objectMapper.writeValueAsString(jobMeta);
            redisTemplate.opsForList().rightPush(JOB_QUEUE, queueItem);
            
            // Calculate ETA based on queue size and priority
            Long queueSize = redisTemplate.opsForList().size(JOB_QUEUE);
            int etaSec = calculateEta(queueSize != null ? queueSize.intValue() : 0, request.priority);
            
            logger.info("Created analysis job {} for {}/{} (n={}, priority={}, eta={}s)", 
                jobId, request.platform, request.username, request.n, request.priority, etaSec);
            
            AnalysisJobResponse response = new AnalysisJobResponse();
            response.jobId = jobId;
            response.status = "queued";
            response.etaSec = etaSec;
            
            return response;
            
        } catch (Exception e) {
            logger.error("Failed to create analysis job: {}", e.getMessage(), e);
            throw new RuntimeException("Failed to create analysis job", e);
        }
    }
    
    public Map<String, Object> getJobStatus(String jobId) {
        try {
            String jobStatusKey = JOB_STATUS_PREFIX + jobId;
            String jobStatusJson = redisTemplate.opsForValue().get(jobStatusKey);
            
            if (jobStatusJson == null) {
                return Map.of("error", "Job not found", "jobId", jobId);
            }
            
            Map<String, Object> status = objectMapper.readValue(jobStatusJson, Map.class);
            
            // Add partials if available
            String partialsKey = JOB_PARTIALS_PREFIX + jobId;
            String partialsJson = redisTemplate.opsForValue().get(partialsKey);
            if (partialsJson != null) {
                Map<String, Object> partials = objectMapper.readValue(partialsJson, Map.class);
                status.put("partials", partials);
            }
            
            // Calculate remaining ETA if still running
            if ("running".equals(status.get("status"))) {
                double progress = ((Number) status.get("progress")).doubleValue();
                if (progress > 0) {
                    // Estimate remaining time based on progress
                    Instant createdAt = Instant.parse(status.get("createdAt").toString());
                    long elapsedSec = Duration.between(createdAt, Instant.now()).getSeconds();
                    int remainingSec = (int) (elapsedSec * (1.0 - progress) / progress);
                    status.put("etaRemainingSec", Math.max(5, remainingSec));
                }
            }
            
            return status;
            
        } catch (Exception e) {
            logger.error("Failed to get job status for {}: {}", jobId, e.getMessage());
            return Map.of("error", "Failed to get job status", "details", e.getMessage());
        }
    }
    
    public void updateJobProgress(String jobId, double progress, String status, Map<String, Object> partialUpdates) {
        try {
            // Update main status
            String jobStatusKey = JOB_STATUS_PREFIX + jobId;
            String currentJson = redisTemplate.opsForValue().get(jobStatusKey);
            
            if (currentJson != null) {
                Map<String, Object> currentStatus = objectMapper.readValue(currentJson, Map.class);
                currentStatus.put("progress", progress);
                currentStatus.put("status", status);
                currentStatus.put("updatedAt", Instant.now().toString());
                
                redisTemplate.opsForValue().set(jobStatusKey,
                    objectMapper.writeValueAsString(currentStatus),
                    Duration.ofHours(2));
            }
            
            // Update partials if provided
            if (partialUpdates != null && !partialUpdates.isEmpty()) {
                String partialsKey = JOB_PARTIALS_PREFIX + jobId;
                String currentPartialsJson = redisTemplate.opsForValue().get(partialsKey);
                
                Map<String, Object> partials = new HashMap<>();
                if (currentPartialsJson != null) {
                    partials = objectMapper.readValue(currentPartialsJson, Map.class);
                }
                
                partials.putAll(partialUpdates);
                
                redisTemplate.opsForValue().set(partialsKey,
                    objectMapper.writeValueAsString(partials),
                    Duration.ofHours(2));
            }
            
            logger.debug("Updated job {} progress: {}, status: {}", jobId, progress, status);
            
        } catch (Exception e) {
            logger.error("Failed to update job progress for {}: {}", jobId, e.getMessage());
        }
    }
    
    public void completeJob(String jobId, Map<String, Object> results) {
        try {
            String jobStatusKey = JOB_STATUS_PREFIX + jobId;
            String currentJson = redisTemplate.opsForValue().get(jobStatusKey);
            
            if (currentJson != null) {
                Map<String, Object> status = objectMapper.readValue(currentJson, Map.class);
                status.put("status", "done");
                status.put("progress", 1.0);
                status.put("completedAt", Instant.now().toString());
                status.putAll(results); // Add summary, profile, plan
                status.put("analysisVersion", "2025.08.elite");
                
                // Extend TTL for completed jobs
                redisTemplate.opsForValue().set(jobStatusKey,
                    objectMapper.writeValueAsString(status),
                    Duration.ofDays(1));
                
                logger.info("Completed analysis job {}", jobId);
            }
            
        } catch (Exception e) {
            logger.error("Failed to complete job {}: {}", jobId, e.getMessage());
        }
    }
    
    public void failJob(String jobId, String error) {
        try {
            String jobStatusKey = JOB_STATUS_PREFIX + jobId;
            String currentJson = redisTemplate.opsForValue().get(jobStatusKey);
            
            if (currentJson != null) {
                Map<String, Object> status = objectMapper.readValue(currentJson, Map.class);
                status.put("status", "failed");
                status.put("error", error);
                status.put("failedAt", Instant.now().toString());
                
                redisTemplate.opsForValue().set(jobStatusKey,
                    objectMapper.writeValueAsString(status),
                    Duration.ofHours(6));
                
                logger.error("Failed analysis job {}: {}", jobId, error);
            }
            
        } catch (Exception e) {
            logger.error("Failed to mark job {} as failed: {}", jobId, e.getMessage());
        }
    }
    
    private int calculateEta(int queueSize, String priority) {
        // Base time per job
        int baseTimePerJob = "fast".equals(priority) ? 30 : 60; // seconds
        
        // Add some randomness and queue factor
        int eta = baseTimePerJob + (queueSize * 15);
        
        // Cap between reasonable bounds
        return Math.max(10, Math.min(eta, 300));
    }
}