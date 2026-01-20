package com.chessanalysis.api.queue;

import lombok.Data;
import lombok.Builder;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;

import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AnalysisJobDto {
    
    private UUID analysisId;
    private String username;
    private String platform;
    private Integer gameCount;
    private String timeControl;
    private String priority;
    private Long timestamp;
    
    public static AnalysisJobDto create(UUID analysisId, String username, String platform, Integer gameCount, String timeControl, String priority) {
        return AnalysisJobDto.builder()
                .analysisId(analysisId)
                .username(username)
                .platform(platform)
                .gameCount(gameCount)
                .timeControl(timeControl)
                .priority(priority)
                .timestamp(System.currentTimeMillis())
                .build();
    }
    
    // Backwards compatibility overload
    public static AnalysisJobDto create(UUID analysisId, String username, String platform, Integer gameCount, String timeControl) {
        return create(analysisId, username, platform, gameCount, timeControl, "fast");
    }
    
    // Backwards compatibility overload
    public static AnalysisJobDto create(UUID analysisId, String username, String platform, Integer gameCount) {
        return create(analysisId, username, platform, gameCount, "all", "fast");
    }
}