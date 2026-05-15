package com.chessanalysis.api.queue;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class AnalysisQueueService {
    
    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;
    
    private static final String QUEUE_NAME = "chess-analysis-queue";
    private static final String PROGRESS_KEY_PREFIX = "analysis:progress:";
    
    public void enqueueAnalysisJob(AnalysisJobDto job) {
        try {
            log.info("Enqueuing analysis job for user: {} (ID: {})", job.getUsername(), job.getAnalysisId());
            redisTemplate.opsForList().leftPush(QUEUE_NAME, objectMapper.writeValueAsString(job));
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
                    
            redisTemplate.opsForValue().set(key, objectMapper.writeValueAsString(update));
            redisTemplate.expire(key, java.time.Duration.ofHours(24));
            
            log.debug("Progress updated for analysis {}: {}% - {}", analysisId, progress, currentStep);
        } catch (Exception e) {
            log.error("Failed to update progress for analysis {}: {}", analysisId, e.getMessage(), e);
        }
    }
    
    public ProgressUpdateDto getProgress(UUID analysisId) {
        try {
            String key = PROGRESS_KEY_PREFIX + analysisId.toString();
            String result = redisTemplate.opsForValue().get(key);
            return result != null ? objectMapper.readValue(result, ProgressUpdateDto.class) : null;
        } catch (IOException e) {
            log.error("Failed to parse progress for analysis {}: {}", analysisId, e.getMessage(), e);
            return null;
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

    public Long getQueuePosition(UUID analysisId) {
        try {
            List<String> queuedJobs = redisTemplate.opsForList().range(QUEUE_NAME, 0, -1);
            if (queuedJobs == null || queuedJobs.isEmpty()) {
                return null;
            }

            for (int indexFromLeft = 0; indexFromLeft < queuedJobs.size(); indexFromLeft++) {
                String rawJob = queuedJobs.get(indexFromLeft);
                AnalysisJobDto job = objectMapper.readValue(rawJob, AnalysisJobDto.class);
                if (analysisId.equals(job.getAnalysisId())) {
                    return (long) queuedJobs.size() - indexFromLeft;
                }
            }

            return null;
        } catch (Exception e) {
            log.warn("Failed to calculate queue position for {}: {}", analysisId, e.getMessage());
            return null;
        }
    }
}
