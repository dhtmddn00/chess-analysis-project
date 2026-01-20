package com.chessanalysis.api.queue;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class AnalysisQueueService {
    
    private final RedisTemplate<String, Object> redisTemplate;
    private final ObjectMapper objectMapper;
    
    private static final String QUEUE_NAME = "chess-analysis-queue";
    private static final String PROGRESS_KEY_PREFIX = "analysis:progress:";
    
    public void enqueueAnalysisJob(AnalysisJobDto job) {
        try {
            log.info("Enqueuing analysis job for user: {} (ID: {})", job.getUsername(), job.getAnalysisId());
            redisTemplate.opsForList().leftPush(QUEUE_NAME, job);
            log.info("Analysis job enqueued successfully");
        } catch (Exception e) {
            log.error("Failed to enqueue analysis job: {}", e.getMessage(), e);
            throw new RuntimeException("Failed to enqueue analysis job", e);
        }
    }
    
    public void updateProgress(UUID analysisId, int progress, String currentStep) {
        try {
            String key = PROGRESS_KEY_PREFIX + analysisId.toString();
            ProgressUpdateDto update = ProgressUpdateDto.builder()
                    .analysisId(analysisId)
                    .progress(progress)
                    .currentStep(currentStep)
                    .timestamp(System.currentTimeMillis())
                    .build();
                    
            redisTemplate.opsForValue().set(key, update);
            redisTemplate.expire(key, java.time.Duration.ofHours(24));
            
            log.debug("Progress updated for analysis {}: {}% - {}", analysisId, progress, currentStep);
        } catch (Exception e) {
            log.error("Failed to update progress for analysis {}: {}", analysisId, e.getMessage(), e);
        }
    }
    
    public ProgressUpdateDto getProgress(UUID analysisId) {
        try {
            String key = PROGRESS_KEY_PREFIX + analysisId.toString();
            Object result = redisTemplate.opsForValue().get(key);
            return result != null ? (ProgressUpdateDto) result : null;
        } catch (Exception e) {
            log.error("Failed to get progress for analysis {}: {}", analysisId, e.getMessage(), e);
            return null;
        }
    }
    
    public Long getQueueSize() {
        try {
            return redisTemplate.opsForList().size(QUEUE_NAME);
        } catch (Exception e) {
            log.error("Failed to get queue size: {}", e.getMessage());
            return 0L;
        }
    }
}