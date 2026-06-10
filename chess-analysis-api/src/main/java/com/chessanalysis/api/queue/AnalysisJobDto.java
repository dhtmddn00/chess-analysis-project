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
    /** User locale (ko / en) — controls language of AI coaching narrative. */
    private String locale;
    /** Authenticated user id — null for guest analyses. */
    private UUID userId;
    /**
     * Admin flag — determined SERVER-SIDE only (never from client input).
     * Set true when the authenticated user's email is in the admin whitelist.
     * Admins bypass the daily AI-narrative limit. Trusted because this DTO
     * lives only inside the internal Redis queue (no client write path).
     */
    @Builder.Default
    private boolean admin = false;

    public static AnalysisJobDto create(UUID analysisId, String username, String platform,
                                        Integer gameCount, String timeControl, String priority,
                                        String locale, UUID userId, boolean admin) {
        return AnalysisJobDto.builder()
                .analysisId(analysisId)
                .username(username)
                .platform(platform)
                .gameCount(gameCount)
                .timeControl(timeControl)
                .priority(priority)
                .timestamp(System.currentTimeMillis())
                .locale(locale != null ? locale : "ko")
                .userId(userId)
                .admin(admin)
                .build();
    }

    public static AnalysisJobDto create(UUID analysisId, String username, String platform,
                                        Integer gameCount, String timeControl, String priority,
                                        String locale, UUID userId) {
        return create(analysisId, username, platform, gameCount, timeControl, priority, locale, userId, false);
    }

    public static AnalysisJobDto create(UUID analysisId, String username, String platform, Integer gameCount, String timeControl, String priority) {
        return create(analysisId, username, platform, gameCount, timeControl, priority, "ko", null, false);
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